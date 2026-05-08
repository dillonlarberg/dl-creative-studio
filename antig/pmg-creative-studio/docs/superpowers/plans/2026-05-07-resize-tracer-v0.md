# Resize Tracer — v0 Backend Debug Rig

**Status:** Ready to build (grilling complete, decisions locked).
**Owner:** Diego.
**Branch:** `feature/resize-image-app` (continues current branch).
**Relationship to v1 plan:** Pre-cursor to `2026-05-07-resize-image-app.md`. This rig debugs the *pipeline*; the v1 plan integrates the validated pipeline into the AdLabs wizard.

---

## Goal

Stand up the simplest viable rig to iterate on the **Phase 1 (vision analysis) → Phase 2 (outpaint generation)** halves of the IMAGAgent-adapted pipeline from `docs/referances/creative-outpaint-architecture.md`. v0 has no critic panel, no retry loop, no Firestore, no async — those are downstream milestones. v0 exists to answer one question: **"on real PMG creatives, does the analysis-then-generate loop produce believable outputs often enough to be worth productizing?"**

---

## v0 success criteria (Q6 = B)

v0 ships when, on **3 of 5 hand-picked PMG creatives**, the output passes "I'd show this to the team without embarrassment." Per-creative bar — written into the critique log — is:
- Subject preserved in frame
- No obvious distortion or hallucinated elements
- Copy still legible (if present)
- Style match plausible (lighting, color grade, depth)

The 5 creatives become the **regression set** for v1+ and the **seed test set** for the eventual Phase 3 critic panel. Should span the failure space: subject-in-different-positions, with-text vs without-text, busy vs simple backgrounds, photo vs illustration.

**Not a v0 gate:** percentage thresholds, automated grading, latency targets. v0 is qualitative.

---

## Architecture — locked decisions

### Q1 — Disposability: Hybrid (C)
Real backend logic, throwaway HTML UI. The pipeline is written as a pure async function from day one so the eventual port to a Cloud Function callable is mechanical (single file move, swap Express wrapper for callable wrapper). HTML gets deleted when v1 wizard ships.

### Q2 — Backend shape: Local Node script (C)
Local Express + minimal HTML, not deployed. Async-with-Cloud-Tasks (matching v1 plan's locked Q6) is the **third** milestone, not the first. v0 prioritizes the inner loop "tweak P1 prompt → run → look at output → tweak again," which is 15s locally vs 90s+ deploy-callable-Firestore.

**Pipeline contract:**
```ts
// Pure function, two thin wrappers
async function runPipeline(input: {
  source: Buffer,
  sourceSpec: { w: number, h: number },
  targetSpec: { w: number, h: number, label: string }
}): Promise<{
  p1: P1Output,
  p2: { outputBuffer: Buffer, model: string },  // exact model id confirmed in Step 2.5
  timings: { p1Ms: number, p2Ms: number }
}>
```
Wrapper #1 = Express POST handler (v0). Wrapper #2 = Firebase callable (v1+).

**Pattern reference (NOT copy-paste).** `functions/src/ai.ts::analyzeVideoForCutdowns` shows the *shape* of a Gemini call with `responseSchema` + secrets in this codebase, but it uses the **deprecated** `@google/generative-ai` SDK. The tracer uses `@google/genai` instead. Reference the old code for the *structure of what to pass* (system instruction style, schema discipline, error-handling shape), but the API surface differs — `ai.models.generateContent({ model, contents, config })` in the new SDK vs `getGenerativeModel(...).generateContent(...)` in the old. v1 port will involve migrating `functions/` to `@google/genai` at the same time.

### Q3 — Phase scope: P1 + P2, eyeball critic (B)
- **Phase 1 (analysis):** Gemini 2.5 Pro returns structured JSON (schema below).
- **Phase 2 (generation):** Nano Banana (`gemini-2.5-flash-image`) returns the resized image.
- **Phase 3 (critic):** **Out of scope for v0.** Human eyeballs + critique form is the critic.

### Q4 — Models: Gemini 2.5 Pro (P1) + Nano Banana (P2)

**SDK:** `@google/genai` (the unified GenAI SDK) — NOT `@google/generative-ai`. The latter is deprecated; all current Google docs use `@google/genai`. The existing `functions/src/ai.ts` still uses the old SDK and keeps working — we don't migrate it as part of v0. v1 port to a callable will involve a small SDK migration in functions/ at the same time.

**Locked constants** (verified via web research 2026-05-07):
- P1 (analysis): `gemini-2.5-pro` via `@google/genai`, `responseSchema` for structured JSON.
- P2 (generation): `gemini-2.5-flash-image` (GA since Oct 2025, no `-preview`), config `responseModalities: ["TEXT", "IMAGE"]`.
- Pricing: $0.039 / output image (P2). P1 negligible.
- Auth: AI Studio key works direct — no Vertex / GCP project needed.

**Output dimensions are NOT user-controllable.** Nano Banana returns ~1024px on the long edge in approximate aspect ratios you steer via prompt. You **cannot** request exact 1080×1920 or 300×720. This means:
- **`sharp` IS required after all** — for output post-processing (crop/resize to the exact target dimensions). Earlier "no sharp" claim was wrong.
- The pipeline now has a Phase 2.5: `postProcess(p2Output, targetSpec)` using sharp for cover/crop or letterbox/pad to exact dims.
- 300×250 and 300×720 (programmatic banners) are extreme low-res aspect ratios — likely poor quality from any current model. **Recommended: drop them from v0 target presets** and focus on 9:16 (1080×1920) and 16:9 (1920×1080). Reintroduce when v1 needs them with explicit downscale-from-large-output strategy.

**Response parse contract:** iterate `response.candidates[0].content.parts[]`. Each part is either `{text}` (likely refusal) or `{inlineData: {mimeType, data}}` (base64 image bytes). Never index `parts[0]` blindly.

**Safety detection (per agent research):** check `response.promptFeedback?.blockReason` AND `candidate.finishReason` (`SAFETY` / `RECITATION` / `IMAGE_SAFETY`). The F1 no-image guard must distinguish "model returned text refusal" vs "model errored out."

**OpenAI / gpt-image-1 considered and rejected for v0.** Stuck on 3 fixed sizes (1024×1024 / 1024×1536 / 1536×1024 — none match our targets), requires Verified Organization (403 on first call), known bug where masked edits regenerate the whole image. Multiple 2026 community benchmarks find Nano Banana wins on subject preservation during outpaint-style edits (our exact use case). Reconsider gpt-image-1 in v2 only if Gemini fails on text-heavy creatives.

**Tradeoff acknowledged:** Nano Banana doesn't honor a hard mask the way Bria GenFill / FLUX Fill Pro would. Hard copy-zone preservation is deferred to a later bake-off (Q7 in `2026-05-07-resize-image-app.md`). For v0 with eyeball critic, this is fine.

**Honest port estimate (per eng review A2):** swapping P2 to Bria/FLUX in v1+ is **NOT a one-line interface swap**. Inpaint models need a `sharp`-padded canvas + binary mask + different prompt grammar; `extensionDirective` in P1 becomes mostly unused, and a new pipeline node ("canvas+mask prep") inserts before P2. Q7 in the main plan should budget for ~1 day of wiring, not "swap a constant."

### Q5 — UI shape: Local HTML, no React touched
- `tools/resize-tracer/server.ts` (Express, ~80 lines) on `localhost:3000`.
- `tools/resize-tracer/public/tracer.html` (~200 lines: file picker, target dropdown, Run button, results display, critique form).
- No dashboard wire-up. Dev opens `localhost:3000/tracer.html` directly via `npm run tracer`.
- Feed-source integration deferred to v1 (when the pipeline ports into the React wizard and uses `fetchDataSources` / `fetchFeedSample`).

### Q6 — Success criteria: see top of doc.

### Q7 — Critique capture: Structured + free text (C)
Mirrors Phase 3 critic dimensions explicitly so v0 critique data is reusable as Phase 3 calibration ground truth.

**Critique JSONL schema** (`tools/resize-tracer/critiques.jsonl`):
```json
{
  "runId": "2026-05-07T15-42-08-fixt01-9x16",
  "timestamp": "2026-05-07T15:42:08Z",
  "source": "fixtures/creative-01.jpg",
  "targetSpec": "9:16",
  "p1Output": { "subjectDescription": "...", "subjectLocation": "...", "subjectBbox": [...], "copyRegions": [...], "styleCues": [...], "extensionDirective": "..." },
  "p2Model": "gemini-2.5-flash-image",
  "p2OutputPath": "out/2026-05-07T15-42-08/result.png",
  "timings": { "p1Ms": 1840, "p2Ms": 7520 },
  "critique": {
    "verdict": "pass" | "retry" | "fail",
    "subjectPreserved": "yes" | "partial" | "no",
    "copyIntact": "yes" | "partial" | "no" | "n/a",
    "styleMatch": 1-5,
    "failureTags": ["subject-cropped" | "text-distorted" | "wrong-grade" | "duplicated-element" | "lighting-mismatch" | "..."],
    "notes": "free text"
  }
}
```

UI under each result image:
1. Three-button verdict row: ✓ Pass / ⟳ Retry-worthy / ✗ Fail
2. Three radio rows: subject preserved / copy intact / style match (1–5)
3. Tag chips (multi-select), starting set = 5 common failure modes from architecture doc
4. Notes textarea
5. Save critique button → POST `/api/critique` → append to JSONL

Results page groups runs by `source` so the iteration sequence ("creative-01: attempt 1 fail → attempt 2 retry → attempt 3 pass") is legible during prompt tuning.

### Q8 — Repo / fixtures / secrets: A / A / A (fixtures gitignored)
- **Location:** `tools/resize-tracer/` (own `package.json`, self-contained, deletable).
- **Fixtures:** `tools/resize-tracer/fixtures/` — **gitignored**. `README.md` explains what to drop in.
- **Secrets:** `tools/resize-tracer/.env` (gitignored) + `dotenv`. Required key: `GEMINI_API_KEY`.

### Q9 — P1 schema / target presets / errors / dashboard: B / A / B / A

**P1 = structured JSON, deterministic prompt template.** Gemini's output:
```ts
type P1Output = {
  subjectDescription: string;        // "person holding red coffee cup, smiling"
  subjectLocation: "upper-left" | "upper-center" | "upper-right" | "center-left" | "center" | "center-right" | "lower-left" | "lower-center" | "lower-right";
  subjectBbox: [number, number, number, number];  // normalized 0-1 [x, y, w, h], for logging only
  copyRegions: Array<{ text: string; location: string }>;  // [] if none
  styleCues: string[];               // ["warm sunset", "shallow DOF", "teal-and-orange grade"]
  extensionDirective: string;        // "extend upward with sky, downward with reflective ground"
};
```

**Phase 2 prompt template (deterministic, fixed) — concrete implementation:**
```ts
const formatCopy = (regions: P1Output["copyRegions"]) =>
  regions.length === 0
    ? "none"
    : regions.map(r => `- "${r.text}" at ${r.location}`).join("\n");

const buildP2Prompt = (p1: P1Output, src: Spec, tgt: Spec) => `
Extend this image from ${src.w}x${src.h} to ${tgt.w}x${tgt.h}.
Subject: ${p1.subjectDescription}, located ${p1.subjectLocation}. Preserve subject identity and position.
Copy to preserve verbatim:
${formatCopy(p1.copyRegions)}
Style: ${p1.styleCues.join(", ")}.
Extension: ${p1.extensionDirective}.
`.trim();
```

**Single-subject limitation (per eng review C3):** v0 schema handles one subject. PMG creatives with product+person or two-product compositions degrade to "the model picks one." Acceptable for v0 critique; v1 should extend the schema to `subjects: Array<{description, location, bbox}>`.

Why structured-then-template (not pure prompt): the critique log captures both *what P1 saw* and *what P2 produced*, so a failure can be attributed to the right phase. Pure-prompt collapses both into "the prompt was bad."

**Target presets (dropdown only, no custom in v0):**
- `9:16 (1080×1920)` — social vertical
- `16:9 (1920×1080)` — social horizontal

Removed from v0 (per web research 2026-05-07):
- ~~`300×720`~~ — extreme low-res aspect, current image models produce poor quality at this size
- ~~`300×250`~~ — same reason

Programmatic banners reintroduced in v1 with explicit "generate at high-res then downscale" strategy.

**Error handling:**
- P1 malformed JSON → auto-retry once, then throw (Gemini ~5% malformed rate).
- **P2 no-image guard.** After receiving the response, before iterating parts:
  1. Check `response.promptFeedback?.blockReason` → if set, throw `"P2 prompt blocked: ${blockReason}"`.
  2. Check `candidate.finishReason` for `SAFETY` / `RECITATION` / `IMAGE_SAFETY` → throw `"P2 safety block: ${finishReason}"`.
  3. Iterate `parts[]`. If no part has `inlineData`, collect any `text` parts into the error message: throw `"P2 returned text instead of image: ${textParts.join(' / ')}"`.
- Gemini API hard-failures (auth, quota, network) → propagate to Express → 500 → error visible in HTML.
- **JSONL append failure** (per eng review F2) → `/api/critique` returns 500; UI must NOT show "saved" until 200 OK. Pending-state in UI between POST send and POST response.

**Dashboard:** **deferred.** v0 does not touch the React app. Dashboard tile wire-up is a 5-min change that belongs in the v1 wizard PR.

---

## File layout

```
tools/resize-tracer/
├── package.json              # express, @google/genai, sharp, dotenv, zod, tsx, vitest
├── tsconfig.json
├── .env                      # gitignored — GEMINI_API_KEY=...
├── .env.example              # checked in, documents required keys
├── .gitignore                # fixtures/, out/, critiques.jsonl, .env
├── README.md                 # how to set up + run + drop fixtures
├── src/
│   ├── server.ts             # express entry — `import 'dotenv/config'` FIRST line, binds 127.0.0.1:3000
│   ├── pipeline.ts           # runPipeline() — pure function, the contract above
│   ├── phase1.ts             # Gemini 2.5 Pro vision analysis via @google/genai
│   ├── phase2.ts             # Nano Banana generation (parts[] iteration, finishReason guard)
│   ├── resize.ts             # sharp: crop/resize raw P2 output → exact targetSpec dims
│   ├── promptTemplate.ts     # deterministic P1Output → string template (concrete impl above)
│   ├── schema.ts             # zod schemas for P1Output and Critique
│   ├── runId.ts              # unique runId: ISO-ms + 4-char random suffix
│   ├── config.ts             # locked constants: model ids, modalities, etc. (set in Step 2.5)
│   ├── log.ts                # JSONL append helpers — propagate fs errors, never swallow
│   ├── pipeline.test.ts      # vitest, mocked Gemini client
│   ├── promptTemplate.test.ts
│   └── schema.test.ts
├── scripts/
│   └── verify-p2.ts          # Step 2.5 smoke test
├── public/
│   ├── tracer.html           # UI (file picker, dropdown, run, results, critique form)
│   ├── tracer.js             # vanilla JS — fetches POST resp before showing "saved"
│   └── tracer.css            # minimal styling
├── fixtures/                 # gitignored — drop 5 PMG creatives here
│   └── README.md             # "drop test creatives here, .jpg/.png, ~1080×1080"
├── out/                      # gitignored — per-run outputs
│   └── {runId}/              # runId = "2026-05-07T15-42-08.142-a3f1-fixt01-9x16"
│       ├── source.jpg
│       ├── p1.json
│       ├── p2-raw.png        # ~1024px native Nano Banana output
│       └── result.png        # sharp-resized to exact targetSpec dims
└── critiques.jsonl           # gitignored — append-only critique log
```

**Belt-and-suspenders gitignore.** The repo root `.gitignore` should also list `tools/resize-tracer/fixtures/`, `tools/resize-tracer/out/`, `tools/resize-tracer/critiques.jsonl`, `tools/resize-tracer/.env` — redundant with the tracer-local `.gitignore`, but a single misplaced `git add tools/` shouldn't leak client creatives.

---

## Build sequence

Each step is a discrete commit, demoable on its own.

### Step 1 — Scaffold + secrets (≈30 min)
- Create `tools/resize-tracer/` with `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`, `README.md`.
- Add `npm run tracer` script (root package.json or tracer-local) using `tsx watch src/server.ts`.
- Express server boots, serves `public/`, returns 200 on `/healthz`.
- **Done when:** `npm run tracer` opens `localhost:3000/tracer.html` and shows a static placeholder.

### Step 2.5 — Verify Nano Banana API surface end-to-end (≈30 min) [added per eng review A1]
Web research (2026-05-07) locked the contract; this step proves it works on this machine with this key before wiring into the pipeline. Reference snippet:

```ts
import { GoogleGenAI } from "@google/genai";
import * as fs from "node:fs";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const srcB64 = fs.readFileSync("fixtures/creative-01.jpg").toString("base64");

const resp = await ai.models.generateContent({
  model: "gemini-2.5-flash-image",
  contents: [
    { text: "Extend this 1:1 ad creative to 9:16 vertical. Preserve subject and brand elements; outpaint background naturally above and below." },
    { inlineData: { mimeType: "image/jpeg", data: srcB64 } },
  ],
  config: { responseModalities: ["TEXT", "IMAGE"] },
});

for (const part of resp.candidates?.[0]?.content?.parts ?? []) {
  if (part.inlineData?.data) {
    fs.writeFileSync("scripts/_smoke-out.png", Buffer.from(part.inlineData.data, "base64"));
  } else if (part.text) {
    console.warn("Got text instead of image:", part.text);
  }
}
```

- Confirm: image bytes write successfully, mime type, approximate output dimensions.
- Lock confirmed values into `tools/resize-tracer/src/config.ts`:
  ```ts
  export const P2_MODEL = "gemini-2.5-flash-image";
  export const P2_RESPONSE_MODALITIES = ["TEXT", "IMAGE"] as const;
  export const P1_MODEL = "gemini-2.5-pro";
  ```
- **Done when:** script outputs a valid PNG. If the SDK or model id has shifted since 2026-05-07, this step catches it.

### Step 2 — P1 only, hardcoded fixture (≈1 hr)
- `phase1.ts`: takes a Buffer + sourceSpec + targetSpec, calls Gemini 2.5 Pro via `@google/genai` with strict `responseSchema`, validates with zod, retries once on validation failure. Reference shape from `functions/src/ai.ts::analyzeVideoForCutdowns` but adapt to the new SDK's `ai.models.generateContent({ model, contents, config })` API.
- `tracer.html`: file picker + target dropdown + Run button. POSTs to `/api/run-p1-only`. Shows P1 JSON in a `<pre>` block.
- **Done when:** dropping `fixtures/creative-01.jpg` and clicking Run shows valid P1 JSON in the browser.

### Step 3 — P2 + full pipeline (≈1.5 hr)
- `phase2.ts`: takes P1Output + source Buffer + targetSpec, builds prompt via `promptTemplate.ts`, calls Nano Banana via `@google/genai`, **iterates `parts[]` to find `inlineData`** (never index `parts[0]`), checks `finishReason` for safety blocks, returns Buffer.
- `resize.ts`: takes raw Nano Banana output Buffer + targetSpec, uses `sharp` to resize/crop to exact `targetSpec.w × targetSpec.h`. Pure function, easy to unit test.
- `pipeline.ts`: `runPipeline()` chains P1 → P2 → resize, writes intermediates (source, p1.json, raw P2, final resized) to `out/{runId}/`, returns timings.
- `/api/run` returns `{ p1, p2RawUrl, p2FinalUrl, timings }`. HTML displays source + P1 JSON + raw P2 + final resized side-by-side (so eyeball can see what `sharp` cropped, in case the model drew something interesting in the discarded region).
- **Done when:** the same fixture click produces a real outpainted image at exact target dimensions in the browser within ~15s.

### Step 3.5 — Unit tests for surviving code (≈30 min) [added per eng review test gap]
- `tools/resize-tracer/src/pipeline.test.ts` (vitest, already installed via PR #2):
  - happy path with mocked `@google/genai` client (P1 returns valid JSON, P2 returns image buffer)
  - P1 malformed JSON twice → throws after one retry
  - P1 retry succeeds on second attempt
  - P2 returns no image part → throws with exact message
- `tools/resize-tracer/src/promptTemplate.test.ts`:
  - empty `copyRegions` → "none" in output
  - multiple `copyRegions` → bullet list
  - snapshot test against a golden string with all P1 fields populated
- `tools/resize-tracer/src/schema.test.ts`:
  - zod P1Output rejects missing required field
- **Done when:** `npm test` (in tracer dir) passes 8 cases.
- These tests survive the port to v1 callable. `server.ts` and `public/*` remain untested (throwaway, manual integration via clicking Run).

### Step 4 — Critique form + JSONL log (≈1 hr)
- Critique form below result (verdict / radios / tag chips / notes / save).
- `/api/critique` POST → append zod-validated entry to `critiques.jsonl`.
- Results page groups runs by `source` (sort by source, then by timestamp desc) so iteration history per creative is visible.
- **Done when:** running the same fixture 3× with different P1 prompt tweaks shows 3 grouped entries in the UI and 3 lines in `critiques.jsonl`.

### Step 5 — Pick fixtures + first qualitative pass (≈1 day)
- Choose 5 PMG creatives spanning the failure space (subject position × text-presence × background-complexity × style).
- Run all 5 against `9:16` and `16:9`, critique each, capture failure tags.
- **Done when:** ≥3 of 5 critiques have `verdict: "pass"` on at least one target spec, OR the 5 creatives reveal a systematic failure that requires re-grilling on model choice (Nano Banana → Bria/FLUX).

### Step 6 — README + handoff notes (≈30 min)
- `tools/resize-tracer/README.md` covers: setup (`.env`, `fixtures/`), running (`npm run tracer`), critique workflow, JSONL schema, where outputs land, how to swap P2 model later.
- Append a "v0 results" section to `2026-05-07-resize-image-app.md` summarizing pass rate + dominant failure tags, which becomes input for Q7 (model lock-in) and Phase 3 critic design.

---

## Out of scope for v0 (explicit)

| Concern | Where it lives instead |
|---|---|
| Cloud Function deploy | v1 PR — port `runPipeline` into a callable. |
| Async batches / Cloud Tasks / Firestore | v1 PR — locked Q6 in main resize-image-app plan. |
| Datasource feed integration (`fetchDataSources` / `fetchFeedSample`) | v1 PR — locked Q1. |
| Multi-asset selection (M assets × N sizes) | v1 PR — locked Q2. |
| Phase 3 critic panel (subject IoU / OCR diff / VLM critics) | v2 milestone — only after v0 reveals which failure modes actually occur. |
| Hard copy-zone masking | New door per research: **Vertex Imagen 3 (`imagen-3.0-capability-001`)** has true mask-based outpainting. Requires GCP service account auth (no AI Studio key path). Bake-off vs Nano Banana when Phase 3 needs deterministic copy preservation. Replicate Bria/FLUX is plan-B. |
| Auto-retry with `F_neg` feedback | v2 milestone, paired with Phase 3. |
| `sharp` canvas + mask prep (input pre-padding) | Only re-introduced if we swap P2 from Nano Banana to a true inpaint model. v0 uses `sharp` for output resize only. |
| Replicate SDK | Only if Nano Banana is replaced. |
| OpenAI gpt-image-1 fallback | Researched and rejected: fixed sizes (1024² / 1024×1536 / 1536×1024) don't cover banner specs; verified-org gate; known mask-edit reliability bug. Worse fit for outpaint-while-preserving than Nano Banana. |
| Migrating `functions/src/ai.ts` from `@google/generative-ai` to `@google/genai` | Pre-existing tech debt, separate PR. Tracer adopts new SDK from day one so v1 port doesn't compound the migration. |
| React app changes / dashboard tile | v1 PR. |
| Output export to Cloud Storage / Asset House | v1 PR (locked: TBD per main plan open questions). |

---

## Web-research findings applied (2026-05-07)

| Finding | Source | Plan change |
|---|---|---|
| `@google/generative-ai` deprecated; current SDK is `@google/genai` | ai.google.dev image-generation docs | Tracer uses `@google/genai`. `functions/src/ai.ts` migration deferred to separate PR. |
| Model id locked: `gemini-2.5-flash-image` (GA since Oct 2025, no `-preview`) | ai.google.dev model card | Locked in Q4 + Step 2.5 reference snippet. |
| Config: `responseModalities: ["TEXT", "IMAGE"]` (canonical form) | Same | Locked. |
| Response shape: iterate `parts[]`, never index `parts[0]` (text-only on refusal) | Same | Phase2 implementation note added. |
| Pricing: $0.039/image standard | ai.google.dev pricing | Documented; v0 cost ≈ $0.39 total. |
| **Nano Banana does NOT honor exact output dimensions** — outputs ~1024px native | Multiple sources, community consensus | **`sharp` reintroduced** for output resize/crop (was wrongly excluded). New `resize.ts` module + Step 3 wiring. |
| OpenAI gpt-image-1 wrong fit (fixed sizes, verified-org gate, mask-edit bug) | platform.openai.com docs + community forums | Rejected as fallback; documented in "Out of scope." |
| Vertex Imagen 3 supports true mask-based outpainting | docs.cloud.google.com/vertex-ai | Surfaced as the *correct* door for Phase 3 deterministic copy preservation (replaces Bria/FLUX as primary plan-A in Q7). |

---

## Eng review fixes applied (2026-05-07)

| Ref | Finding | Fix in plan |
|---|---|---|
| A1 | Nano Banana API surface unverified | Added Step 2.5 smoke test |
| A2 | "Mechanical port" claim oversold | Honest port estimate added to Q4 section |
| A3 | Express defaults to all interfaces | `127.0.0.1:3000` specified in file layout |
| A4 | dotenv load-order footgun | `import 'dotenv/config'` as first line of server.ts, called out |
| C1 | RunId collision possible | Format updated: `ISO-ms + 4-char random suffix` |
| C2 | Pseudo-code in prompt template | Replaced with concrete TS implementation |
| C3 | Single-subject schema | Documented as v0 limitation; v1 extends |
| F1 | P2 no-image guard missing | Specified throw with exact message |
| F2 | JSONL append silent failure | Specified 500 propagation + UI pending-state |
| Tests | No unit tests for surviving code | Added Step 3.5 with 8 vitest cases |

---

## Risks + mitigations

1. **Nano Banana ignores prompt directives on subject placement** — most likely failure mode for extreme aspect-ratio shifts (1:1 → 9:16). Captured in critique tags as `subject-cropped` or `subject-shifted`. If >40% of v0 runs fail this way, Q7 in main plan needs to swap P2 to Bria GenFill (which adds back canvas/mask prep + `sharp` + Replicate SDK).
2. **Gemini JSON schema violations beyond ~5%** — would erode signal in P1 logs. One retry mitigates the common case; if violation rate stays high, tighten the response schema or move P1 to Claude. Captured in run-record metadata (`p1RetryCount`).
3. **PMG creative confidentiality** — fixtures are local-only / gitignored; a `.gitignore` mistake leaks. Mitigation: `tools/resize-tracer/.gitignore` includes `fixtures/`, `out/`, `.env`, `critiques.jsonl`. CI doesn't run on this directory; nothing here ever ships to Firebase.
4. **Diego diverges from v1 plan during v0 iteration** — tempting to add small features (auto-retry with `F_neg`, copy-zone masking) when P1+P2 disappoints. Mitigation: this plan's "out of scope" table is the gate. Anything in that table goes into a follow-up PR conversation, not into v0 commits.
5. **Tracer becomes permanent** — the "C" in Q1 was Hybrid because the user prefers throwaway UI. Mitigation: the pure-function `runPipeline` contract is the only artifact that survives. Step 6's handoff notes explicitly mark `server.ts` + `public/` for deletion when v1 wizard ships.

---

## Open questions surfaced for the main plan (`2026-05-07-resize-image-app.md`)

After v0 wraps, these questions are answerable with data:

- **Q7 (model choice):** v0 critique log answers "is Nano Banana good enough, or do we need Bria/FLUX?"
- **Q (failure modes):** v0's `failureTags` aggregation answers "which Phase 3 critics actually need to exist?" — can drop unused dimensions before building.
- **Q (latency):** v0 timings answer "is sync-callable viable for v1, or does Cloud Tasks matter from PR1?"
- **Q (copy preservation):** v0 with Nano Banana stress-tests the no-hard-mask approach. If copy distorts >20%, Phase 2 needs a true inpaint model regardless of overall quality.

---

## Resume protocol

When resuming:
1. Read `tools/resize-tracer/README.md` and the latest 20 lines of `tools/resize-tracer/critiques.jsonl` to see current pass rate and dominant failure tags.
2. If pass rate ≥3/5 on a target spec → v0 done, move to v1 PR sequence in `2026-05-07-resize-image-app.md`.
3. If pass rate <3/5 → check failure tag distribution → either tune P1 prompt template (`promptTemplate.ts`) or open a new grilling thread for P2 model swap.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 8 issues found, 0 critical gaps, all fixed inline |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — (N/A — debug rig, no production UI) | — |

**ENG REVIEW FINDINGS (all patched into plan):**
- Architecture (4): A1 Nano Banana API verification → Step 2.5 added; A2 port-claim softened; A3 server bind to 127.0.0.1; A4 dotenv load order
- Code quality (3): C1 runId collision → ms+random; C2 prompt template made concrete; C3 single-subject documented as v0 limit
- Test gap (1 section): Step 3.5 added with 8 vitest cases for surviving code
- Failure modes (2 minor): F1 P2 no-image guard, F2 JSONL append error UX

**UNRESOLVED:** 0
**VERDICT:** ENG CLEARED — ready to implement. CEO/Design review optional (N/A for a local debug rig).
