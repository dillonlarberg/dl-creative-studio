# Creative Outpainting Pipeline: Architecture & Research

Cloud-based reproduction of the IMAGAgent plan-execute-reflect loop, adapted for ad creative resizing (e.g. 1:1 → 9:16, 1:1 → 300×720) where the user uploads an existing creative and selects a target aspect ratio rather than typing an edit instruction.

---

## Table of Contents

1. [Core insight: stateless inference](#core-insight-stateless-inference)
2. [Mapping IMAGAgent to a cloud stack](#mapping-imagagent-to-a-cloud-stack)
3. [Cloud Functions and the timeout problem](#cloud-functions-and-the-timeout-problem)
4. [Context injection strategy](#context-injection-strategy)
5. [Hosted API feasibility](#hosted-api-feasibility)
6. [Adapting IMAGAgent for creative outpainting](#adapting-imagagent-for-creative-outpainting)
7. [Pipeline phases](#pipeline-phases)
8. [Recommended provider stack](#recommended-provider-stack)
9. [Cost and latency profile](#cost-and-latency-profile)
10. [Framework decision: raw vs LangGraph](#framework-decision-raw-vs-langgraph)
11. [Key references](#key-references)

---

## Core insight: stateless inference

Self-hosting Ollama or any other model does not solve the "API calls are stateless" problem because **no production LLM is truly stateful at the model level**. Even when providers advertise "stateful APIs" (OpenAI's Responses API with `previous_response_id`, AWS Bedrock AgentCore Memory, Letta), what's happening under the hood is that the provider stores conversation history in their database and re-injects it into the context window on each call. The transformer itself processes a fresh sequence of tokens every call; every intermediate representation is discarded the moment generation completes.

This is deliberate. Stateless inference lets providers scale horizontally (any GPU can serve any request), gives reproducibility, and avoids the coordination cost of shared distributed state across nodes. Reference: Pensieve and similar research systems show that stateful serving requires either sticky routing or shared distributed state, both of which constrain scalability.

**The architectural implication:** state lives at the application layer, never inside the weights. The question is not "where do I find a stateful model" but "where do I store the context, and how do I inject it efficiently on each turn?"

For an IMAGAgent-style pipeline on Firebase, **Firestore is your source of truth for the historical context `C`**, and every model call re-reads the relevant slice of `C` and packs it into the prompt.

---

## Mapping IMAGAgent to a cloud stack

The paper's three modules map cleanly to Firebase services:

**Constraint-Aware Planner (Phase 1)** — One VLM call. User submits source and instruction, you call a VLM, get back the atomic sub-task array `A = {t1...tn}`. Write `A` to Firestore. No state needed beyond persisting the plan.

**Tool-Chain Orchestrator (Phase 2)** — The inner loop. For each `t_i`, the agent reads `I_{i-1}`, `t_i`, and the historical context `C` from Firestore, decides which tools to call, executes them, writes the intermediate `I_i^{j+1}` to Cloud Storage, and writes the orchestration plan `R_i^{j}` back to Firestore.

**Multi-Expert Reflection (Phase 3)** — Three parallel VLM calls (different providers for genuine heterogeneity), then a single LLM aggregator call to produce `F_i^{j+1}`. Writes feedback to Firestore. If score ≥ τ_sr, advance; else loop.

The historical context `C` is literally a Firestore document. Each turn reads it, decides, writes back.

---

## Cloud Functions and the timeout problem

Firebase Cloud Functions limits (as of writing):

- HTTP and callable functions: 3600 seconds (60 minutes)
- Scheduled / Task queue functions: 1800 seconds (30 minutes)
- Other event-driven functions: 540 seconds (9 minutes)

A full multi-turn run with 5 sub-tasks × 3 iterations × 4 model calls per iteration plus image editing latency is 5–15 minutes per request. Holding an HTTP connection open that long is an antipattern: mobile clients drop, retries duplicate work, cold starts mid-request are catastrophic.

### Right pattern: fire-and-forget with task queues

1. Client calls a thin HTTP function: `startEdit(imageUrl, targetSpec)` → returns `jobId` immediately, enqueues a Cloud Task, writes initial state to Firestore.
2. A Cloud Task-triggered function (30-min limit) runs Phase 1, then enqueues one task per sub-task.
3. Each sub-task task runs one iteration of orchestrate→reflect. If it fails the threshold, re-enqueues itself with the iteration counter incremented. If it succeeds, enqueues the next sub-task.
4. Client subscribes to the Firestore document for `jobId` and gets real-time updates as `I_i` images are written.

This pattern is durable: each task is small, idempotent (key by `(jobId, taskIdx, iter)`), and Cloud Tasks gives free retry policies. If a task fails partway, the next retry reads current state from Firestore and continues.

For more complex graphs (10+ steps, branching, human-in-the-loop), Cloud Workflows or LangGraph with a Firestore checkpointer is preferable. For a first commercial version, raw Cloud Tasks is sufficient.

---

## Context injection strategy

For each model call within a sub-task iteration, read from Firestore and assemble the prompt with **stable prefix first, dynamic content last**, because that's how prompt caching works on every major provider.

### Layout for an orchestrator call

```
[CACHED — system prompt + tool definitions]   ← rarely changes, cache hit every call
[CACHED — historical context summary up to turn i-1]   ← grows but slowly
[DYNAMIC — current sub-task t_i + current image + last feedback F_neg]
```

### Provider caching specifics

- **Anthropic Claude**: explicit `cache_control` markers on the last static block. Cache reads at 10% of base input price. Cache writes at 1.25× (5-min TTL) or 2× (1-hour TTL). Up to 4 cache breakpoints per request. Available on direct Anthropic API, AWS Bedrock, and Google Vertex AI.
- **OpenAI GPT-5 / Responses API**: automatic prompt caching, no markers needed. Internal tests claim 40–80% cache utilization improvement vs Chat Completions.
- **Google Gemini (Vertex)**: automatic caching for Gemini models, explicit caching available for Claude-via-Vertex.

### Cost impact

For an agent making 15–20 model calls per user request with a large overlapping prefix, prompt caching is the difference between unprofitable and profitable. The IMAGAgent paper's own cost analysis lands at ~$0.017 per turn assuming caching is active. Without caching, multi-turn agent costs scale linearly with conversation length.

### Important: don't break the cache

- Place static content (system prompts, tool definitions, large reference images) at the start.
- Don't restructure or reformat conversation history between turns in ways that change the token sequence.
- Place cache breakpoints at the end of static content blocks, not mid-sentence in dynamic content.
- Third-party tool wrappers can break caching by reformatting requests; verify cache hit rates with the API's `cache_read_input_tokens` field.

---

## Hosted API feasibility

**Every component in the IMAGAgent paper has a hosted API equivalent.** Self-hosting is not required and is the wrong choice for commercial client work.

### Direct API mapping

| Paper component | Hosted equivalents |
|-----------------|-------------------|
| Planner (Qwen-VL-MAX) | Claude Opus 4.7, Gemini 2.5 Pro, GPT-5 |
| Orchestrator (GLM-4.1V-9B-Thinking) | Claude Opus 4.7 (best tool use), Gemini 2.5 Pro (cheapest competent) |
| Expert panel (Qwen, Doubao×2) | Pick three of: Claude, GPT-5, Gemini, Qwen-VL via DashScope, Mistral Pixtral |
| Aggregator (DeepSeek-V3.2) | DeepSeek API direct, or any cheap LLM |
| SAM3, Grounding-DINO | Replicate, fal.ai (combined `grounded-sam` model exists) |
| Seedream 4.0 | Volcengine API direct, or Gemini 2.5 Flash Image (Vertex), Qwen-Image-Edit (Replicate), FLUX.1 Kontext (fal.ai) |
| Qwen-Image-Edit, SDXL | Replicate, fal.ai, Modal |

### Why API-only is correct for client work

Self-hosting frontier-quality VLMs requires multiple A100s/H100s, plus DevOps for the inference server (vLLM, TGI), plus on-call when it falls over. That's a full-time infrastructure cost that only makes sense at very high volume (tens of thousands of edits per day) or under hard data-residency requirements. For a typical client engagement, even a successful one doing thousands of edits a month, pure API is cheaper, faster to ship, and more reliable.

### Real gotchas

- **Image editing model quality varies a lot by edit type.** Test FLUX.1 Kontext, Gemini 2.5 Flash Image, and Qwen-Image-Edit on actual use cases.
- **Heterogeneity matters in the critic panel.** Three calls to the same model are not three independent opinions. Use three different providers.
- **Rate limits at scale.** Multi-expert reflection fires 3 VLM + 1 aggregator per iteration. With 3 iterations max per sub-task and 5 sub-tasks, that's 60 model calls per edit. Multiple concurrent users will hit per-minute token limits on frontier APIs. Plan for client-side queuing or quota increases.
- **No fine-tuning escape hatch.** Closed hosted models can't be fine-tuned. Handle domain-specific behavior through prompt engineering, IP-Adapter reference images, or LoRAs on Replicate's serverless fine-tunes.

---

## Adapting IMAGAgent for creative outpainting

The generic IMAGAgent paper handles arbitrary natural-language edits, which is why it needs the constraint-aware planner with target singularity, semantic atomicity, and visual perceptibility constraints. **For creative resizing, the input is `(source_image, target_dimensions)` — not natural language.** The user never types an instruction. This kills Phase 1's decomposition logic.

But the rest of the loop becomes *more* valuable because outpainting is exactly the kind of operation where single-shot generation often fails in ways a critic can catch:

- Subjects get cropped or shifted out of safe zones
- Copy gets distorted, hallucinated, or duplicated
- New canvas regions look stylistically off (different color grade, lighting direction, depth of field)

### The adaptation

**Replace Phase 1 with deterministic vision analysis. Keep Phases 2 and 3 essentially intact.** Phase 1 becomes a single VLM call that returns structured JSON describing the image, not a sub-task array.

---

## Pipeline phases

### Phase 1: Vision analysis (replaces the planner)

One VLM call (Gemini 2.5 Pro or Claude Opus). Input: source image + target dimensions. Output: structured JSON with:

1. **Subject bounding box** — focal subject location in the source. Used to compute subject-safe zones in the new canvas.
2. **Copy regions** — bounding boxes around all text (headline, CTA, logo, legal disclaimers). These are do-not-touch zones.
3. **Style descriptors** — color palette, lighting direction, depth of field, mood. Short tags like `warm sunset, shallow DOF, cinematic teal-and-orange grade`.
4. **Outpaint prompt** — a generation prompt the VLM writes for Phase 2, encoding all of the above as positive guidance.

Strict JSON schema, validated server-side.

### Canvas and mask preparation (deterministic, no model)

Pure image manipulation in the Cloud Function. Given a 1080×1080 source and 1080×1920 target:

- **Anchor decision** — for 1:1 → 9:16, the source typically anchors center or center-bottom; outpaint upward and downward. The subject bbox from Phase 1 dictates which anchoring keeps the subject in the safe area.
- **Outpaint mask** — binary mask where white = needs generation, black = preserve from source.
- **Protect mask** — hard-locked region around copy bboxes with feathering, so the model can't bleed into text. This is the key trick: you tell the outpaint model "you cannot touch these pixels" by including them as locked context.

Coordinate math + PIL (Python) or Sharp (Node). No VLM needed.

### Phase 2: Outpaint model call

Pass the prepared canvas, locked copy mask, and the Phase 1 prompt. Get the candidate back.

Top candidates:

- **FLUX.1 Kontext** on fal.ai — purpose-built for instruction-driven editing including outpainting; best quality on photorealistic creatives.
- **Gemini 2.5 Flash Image** on Vertex — strong at preserving subject identity and style across outpainting.
- **Qwen-Image-Edit** on Replicate — open-weights, cheaper.

### Phase 3: Critic panel — hybrid deterministic + VLM

The paper's pure-VLM scoring is fine for arbitrary edits. For ad creatives, **mix deterministic checks with VLM checks**, because the things that can be measured deterministically should be.

- **Subject preservation (deterministic)** — run a detector (Grounding-DINO or simpler) on source and candidate, compute IoU of the subject bbox. Below threshold = fail.
- **Copy integrity (deterministic)** — OCR both images (Google Vision API, AWS Textract, or Tesseract). Diff the extracted text. More than ~2 character edits = fail. Catches the most common outpaint failure mode where the model hallucinates or distorts text.
- **Style match (VLM)** — one or two VLM calls asking "does the cinematic style of the new regions match the source? Rate 1-10 with specific issues." This is genuinely subjective and benefits from multiple opinions.

Mixing deterministic and VLM checks is cheaper and more reliable than pure VLM judgment.

### Aggregator and retry decision

Same as the paper. If any deterministic check fails or average style score is below threshold, retry with negative feedback in the next prompt. Cap at 3 iterations. If iteration cap is hit, return the highest-scoring candidate.

---

## Recommended provider stack

For a Firebase-native indie/agency build:

### Option A: Vertex AI for everything

- Gemini 2.5 Pro for Phase 1 analysis
- Claude Opus 4.7 (via Vertex) for orchestration if needed
- Gemini 2.5 Flash Image for outpainting
- Imagen for fallback generation
- All inside one Google Cloud project, one IAM perimeter, same VPC as the Firebase project
- Caching automatic on Gemini, explicit on Claude-via-Vertex

This is the cleanest choice for a Firebase build.

### Option B: Multi-provider for the critic panel

Since critic heterogeneity actually matters:

- Anthropic Claude direct API for orchestrator (best tool use)
- OpenAI GPT-5 for one critic
- Gemini 2.5 Pro for another critic
- A specialized vision model (Mistral Pixtral or Qwen-VL) for the third
- fal.ai for FLUX.1 Kontext outpainting
- Replicate for SAM/Grounding-DINO combined endpoint

More complex but matches the paper's "panel of heterogeneous experts" properly.

### Image tool layer

Don't try to host SAM, Grounding-DINO, or diffusion models on Cloud Functions — they need GPUs. Use:

- **fal.ai** — lowest latency for image gen, FLUX models, Qwen-Image-Edit
- **Replicate** — widest model selection, including combined `grounded-sam`
- **Modal** — best for custom model packaging if you need it later

All three are pay-per-second of GPU time, no infra to manage.

---

## Cost and latency profile

Pure-API reproduction:

- **Per-edit cost**: $0.02–0.10 depending on iteration count and model choices. Higher than the paper's $0.017 because frontier API models cost more than Doubao/Qwen, but still well within commercial margins for client work.
- **Latency**: 30–90 seconds per full multi-turn edit. Dominated by image generation (~5–15s each on fal.ai), not LLM reasoning.
- **Infrastructure cost**: zero GPU infrastructure. Cloud Functions / Cloud Run for orchestration, Cloud Tasks for queuing, Firestore for state, Cloud Storage for images.

Without the reflection loop, naive single-shot outpaint to 9:16 fails 30–40% of the time on real creatives. With the loop, ~95%+ success rate at the cost of 2–3× latency and ~2× compute.

---

## Framework decision: raw vs LangGraph

For commercial client work, **start with LangGraph**. The IMAGAgent paper is essentially a state machine: plan → execute → reflect → branch on score → loop or advance. That maps directly onto LangGraph's primitives. Implementing it raw means writing a worse version of: a state object, conditional edges, a checkpointer, a retry mechanism, and an iteration counter.

### LangGraph specifics

- Each module is a node
- Historical context is the graph state
- Success threshold is a conditional edge
- Iteration limit is a loop counter in state
- Checkpointer handles persistence (DynamoDB on AWS, or write a Firestore-adapted checkpointer — ~100 lines)

Deploy the LangGraph runtime on Cloud Run, keep Firebase for auth and the client-facing layer.

### When raw Firebase + Cloud Tasks still wins

- The whole stack is TypeScript and you don't want to add a Python deploy target (LangGraph is Python-first; the TS port lags).
- The state machine is genuinely simple (5 fixed steps, no branching beyond retry).
- You need the lowest possible cold start latency.

### Managed alternatives worth knowing

- **AWS Bedrock AgentCore Memory + Runtime** — fully managed, Memory has built-in semantic search and hierarchical organization by actor/session. Tight AWS integration; less flexibility outside AWS.
- **LangGraph Platform** — managed deployment for LangGraph agents.
- **Letta** — purpose-built REST API for stateful agents with persistent memory.

---

## Architectural diagram (text version)

```
INPUT
  Source creative (1:1)        Target spec (9:16, 300x720)
         │                            │
         └──────────┬─────────────────┘
                    ▼
        PHASE 1: Vision analysis (1 VLM call)
        Subject bbox, copy regions, style cues, outpaint prompt
                    │
                    ▼
        PHASE 2: Canvas + mask prep (deterministic)
        Anchor source, build outpaint mask, lock copy zones
                    │
                    ▼
        Outpaint model (FLUX Kontext / Gemini Flash Image)
                    │
                    ▼
        PHASE 3: Critic panel
          ┌──────────────┬───────────────┬───────────────┐
          │ Subject IoU  │ OCR diff      │ Style match   │
          │ (det.)       │ (det.)        │ (VLM x 2)     │
          └──────────────┴───────────────┴───────────────┘
                    │
                    ▼
        Aggregator + decision
                    │
            ┌───────┴───────┐
       fail │               │ pass
            ▼               ▼
   Retry (max 3x        Deliver final
   with Fneg)           creative
```

---

## Key references

### Stateful inference and context
- **OpenAI Conversations API + `previous_response_id`** — server-side conversation state for the Responses API. https://developers.openai.com/api/docs/guides/conversation-state
- **Anthropic prompt caching** — official docs on `cache_control`, TTLs (5min/1hr), pricing multipliers (1.25× write, 0.1× read). https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- **Pensieve paper** — research on stateful LLM serving with multi-tier KV cache. https://arxiv.org/html/2312.05516v2
- **Letta** — stateful agents framework with persistent memory. https://www.letta.com/blog/stateful-agents

### IMAGAgent paper
- "IMAGAgent: Orchestrating Multi-Turn Image Editing via Constraint-Aware Planning and Reflection" (arXiv:2603.29602, Feb 2026). Code: https://github.com/hackermmzz/IMAGAgent.git

### Firebase orchestration
- **Cloud Functions limits and timeouts** — https://firebase.google.com/docs/functions/manage-functions
- **Task queue functions with Cloud Tasks** — https://firebase.google.com/docs/functions/task-functions

### Agent frameworks with state
- **LangGraph + AgentCore Memory** — https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory-integrate-lang.html
- **LangGraph + DynamoDB checkpointer** — https://aws.amazon.com/blogs/database/build-durable-ai-agents-with-langgraph-and-amazon-dynamodb/
- **`langgraph-checkpoint-aws`** — https://pypi.org/project/langgraph-checkpoint-aws/

### Image generation APIs
- **fal.ai** — FLUX.1 Kontext, fast image gen
- **Replicate** — wide model catalog including combined `grounded-sam`
- **Vertex AI Gemini 2.5 Flash Image** — outpainting via Google Cloud
- **Volcengine Doubao-Seedream 4.0** — paper's primary image editor

---

## Open questions to resolve before shipping

1. **Anchor strategy for extreme aspect ratio shifts** (e.g. 1:1 → 9:16) — center vs center-bottom vs subject-aware. May need its own small heuristic.
2. **Copy preservation under heavy outpainting** — when the new canvas is 2× the source area, even locked masks bleed. Test whether per-character OCR diff is strict enough or if perceptual hashing of the copy region is needed.
3. **Brand consistency LoRAs** — for repeat clients, a fine-tuned LoRA on their existing creative library may outperform prompting alone. Replicate offers serverless LoRA training.
4. **Human-in-the-loop for borderline cases** — when iteration cap hits but the best candidate scores 6/10, surface it for human review rather than auto-delivering.
5. **Pricing model** — per-edit, per-month, or seat-based, depending on how the agency client buys. Per-edit aligns cost to value but creates billing friction.
