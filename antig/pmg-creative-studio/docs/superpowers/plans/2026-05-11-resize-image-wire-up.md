# Resize Image — Tracer → Production Wire-Up Plan

**Status:** Locked. Output of a 14-question grill + 4-section eng review + codex outside-voice on 2026-05-11.
**Owner:** Diego.
**Branch (target):** new feature branch off `dev` (e.g. `feature/resize-image-wireup`).
**Supersedes (for the wire-up portion only):** `2026-05-07-resize-image-app.md` § Q7-onwards "Production P2 model" choice — resolved to **OpenAI gpt-image-2** based on tracer v0 results.
**Builds on:** `2026-05-07-resize-tracer-v0.md` (the tracer lives at `tools/resize-tracer/`; its pipeline gets duplicated into Firebase Functions for deploy independence).

---

## Vision

Replace the ad-resizing app's mocked generation flow (`simulateOutputCompletion` → picsum) with the real outpainting pipeline we've been validating in the tracer. The in-product Resize Image app calls a Firebase v2 Callable function that runs P1 (Gemini 2.5 Pro structural analysis, **hoisted to run once per batch**) + P2 (gpt-image-2 outpaint, **fan-out throttled with `p-limit(4)`**) per output, writes results to Firebase Storage and Firestore, and the UI live-updates via `onSnapshot`.

This is a **prototype**, scoped to one user at a time. No queue infrastructure, no production-grade per-client claims enforcement, no quality A/B. The architecture is laid out so the production-grade pieces can be added later without rewriting the core.

---

## Empirical baseline (what's actually wired today)

Confirmed by a code-explorer agent on `dev`:

- **Nothing real is wired.** Generation is `setTimeout(900-1300ms) → picsum.photos`. (`src/apps/ad-resizing/AppRoot.tsx:169-191`)
- `src/apps/resize-image/` — old WizardShell skeleton from a prior plan iteration. `void resizeImageManifest` keeps it OFF the dashboard. **Out of scope for this PR; can be deleted later.**
- `mockCreatives.ts` is dead code (zero imports).
- `feedToCreatives.ts:51-58` produces real feed CDN URLs but hardcodes `width: 1080, height: 1080`. ID generation `feed-${i}-${imageColumn}` is row-position-dependent (not cache-stable).
- Re-crop UI is fully built (`SingleImageModal.tsx:172-207`) but `handleReiterate(_outputId, _prompt)` discards the prompt.
- Storage bucket (`automated-creative-e10d7.firebasestorage.app`) already has permissive CORS (`["*"]` origins, GET/HEAD/OPTIONS) configured for template-builder's font assets. **No CORS work needed** for this project.
- `src/services/batches.ts` already provides `BatchRecord` type + `batchService.{createBatch,updateBatchStatus,listActiveBatchesForClient}`. `src/pages/DashboardPage.tsx:44,74` wires the Active Batch Jobs widget against this. **We reuse this infrastructure rather than inventing a parallel schema.**
- `functions/src/_shared/assertAlliStudioUser.ts` (v2 `CallableRequest`) provides email-allowlist gate. Existing callables in `ai.ts` are v1; the new resize callable uses v2 (consistent with the helper).

---

## Decisions locked

### Q1 — Execution model: **async job-doc + Firestore `onSnapshot`**

Matches the v1-plan locked decision. Enables resumability + dashboard deep-links.

### Q2 — Backend execution sub-pattern: **B.3** — callable does the work itself, writes progressively to Firestore

Prototype scale = 1 user. No Cloud Tasks, no Firestore triggers. Callable holds the connection while running `Promise.all` across outputs, writing per-output status updates as each resolves.

### Q3 — Source bytes: **pre-stage to Firebase Storage** with per-client isolation

Source originals cached under `clients/{slug}/apps/ad-resizing/sources/{sourceKey}.{ext}` where `sourceKey = sha256(originalUrl).slice(0, 16)`. URL-stable across feed reorders (codex F10 fix). Path scoping enforces tenant separation via existing `firestore.rules` + `storage.rules` (recursive wildcards under `clients/{clientSlug}/...`).

### Q4 — Pre-staging timing: **(T.3) lazy server-side fetch on first job**

Function receives `{ originalUrl, creativeId }`, computes `sourceKey`, checks Storage. On cache hit reads back the bytes. On miss, fetches + writes + returns the in-memory buffer. **SSRF guard: HTTPS-only + DNS-resolve hostname + reject RFC1918, link-local (169.254.0.0/16), localhost variants, and `metadata.google.internal`.** No domain allowlist (we don't have stable knowledge of Alli's feed CDN domains).

### Q5 — Data layout

**Storage paths:**
```
clients/{slug}/apps/ad-resizing/
  sources/{sourceKey}.{ext}                        ← T.3 cache; sourceKey = sha256(originalUrl).slice(0,16)
  outputs/{outputId}.png                           ← final result
  intermediates/{batchId}/{outputId}/
    ├─ canvas.png                                  ← debug: padded source sent to model
    ├─ mask.png                                    ← debug: transparency mask
    └─ raw.png                                     ← debug: raw model output pre-resize
```

**Firestore schema (reusing existing `BatchRecord` from `src/services/batches.ts`):**

Extend the existing `BatchRecord` interface:

```ts
// src/services/batches.ts — extensions for ad-resizing
interface BatchRecord {
  // existing fields:
  id: string;
  clientSlug: string;
  appId: string;
  templateId: string;          // for ad-resizing: stores creativeId (read-only narration only)
  feedId: string;              // for ad-resizing: stores datasource name
  feedName: string;            // for ad-resizing: human-readable batch name "Ralph Lauren X — Social"
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'partial';  // ← 'partial' added
  totalVariations: number;
  completedVariations: number;
  ratio: string;               // for ad-resizing: '{w}x{h}' of the source
  createdAt: any;
  updatedAt: any;

  // NEW optional fields for ad-resizing:
  errorCount?: number;
  sourceCreative?: {
    creativeId: string;
    originalUrl: string;
    storageRef: string;        // gs:// after T.3 fetch
    width: number;
    height: number;
    mime: string;
  };
}
```

Template-builder's read code already treats anything not `completed` as in-progress-or-failed; verify it handles `'partial'` gracefully (probably as "completed with errors" or "failed" depending on its UI). PR-A includes this verification.

**Output sub-collection (flat sibling, per Q14):**

```ts
// clients/{slug}/apps/ad-resizing/outputs/{outputId}
interface OutpaintOutputDoc {
  outputId: string;
  batchId: string;                                  // join key (formerly jobId in earlier draft)
  dimension: { width: number; height: number; label?: string; channel?: string };
  status: 'pending' | 'complete' | 'error';         // 3 states; 'pending' covers in-flight
  storageRef?: string;                              // gs:// when status === 'complete'
  errorCategory?: 'transient' | 'permanent';
  errorMessage?: string;
  p1Analysis?: P1Output;                            // populated once per batch from hoisted P1
  timings?: { p1Ms: number; p2Ms: number };         // p1Ms is batch-level (same value across outputs)
  model: 'gpt-image-2';
  quality: 'medium' | 'high';                       // hardcoded 'medium' in v0
  prompt?: string;                                  // last re-crop prompt
  createdAt: Timestamp;
  completedAt?: Timestamp;
}
```

**Path helpers added to `src/platform/firebase/paths.ts`:**
```ts
outpaintOutputs: (slug, appId) => `${root(slug)}/apps/${appId}/outputs`,
outpaintOutput:  (slug, appId, outputId) => `${root(slug)}/apps/${appId}/outputs/${outputId}`,
outpaintSources: (slug, appId) => `${root(slug)}/apps/${appId}/sources`,
```

Reuse `paths.batch(...)` for the BatchRecord doc — no new helper needed.

### Q6 — Output URL: **(U.4) storageRef-only, UI resolves with `getDownloadURL`**

Firestore stores `storageRef: string` (gs:// path). UI calls `getDownloadURL(ref(storage, path))` client-side using the authenticated user's token. New hook `useStorageUrl(storageRef)` memoized per ref.

### Q7 — Target dim wire shape: `{ width, height, label?, channel? }`

`channels.ts` is the source of truth. Tracer's `TARGET_PRESETS` is dev-rig only. Server-side bounds check: dims in [50, 3840] per edge before `legalGenDims`.

### Q8 — Auth: **(A.1) UI passes `clientSlug`, function trusts it** + helper reuse

Use existing helpers from `functions/src/_shared/`:
- `assertAlliStudioUser(req)` — email allowlist re-check
- Inline regex `/^[a-z0-9_-]+$/` on `clientSlug`

`assertResourceClient` doesn't fit our `originalUrl` shape (URL not Storage path); SSRF guard handles that case.

### Q9 — Functions infra (post-review)

| Decision | Value |
|---|---|
| Package location | `functions/src/resize/` |
| Callable API | **firebase-functions v2 `onCall`** (consistent with `assertAlliStudioUser` helper signature) |
| Export | `functions/src/index.ts` adds `export * from './resize';` |
| Code source | **Copy** pipeline files from `tools/resize-tracer/src/` verbatim. Top-of-file marker comment: `// MAINTAINED IN PARALLEL with tools/resize-tracer/src/<file> — see TODO(resize-pipeline-extract)` |
| New dependencies for `functions/package.json` | `@google/genai` (replaces deprecated `@google/generative-ai`), `openai`, `sharp`, `zod`, `p-limit` |
| Secrets | `defineSecret('GEMINI_API_KEY')`, `defineSecret('OPENAI_API_KEY')` bound via the v2 onCall options |
| Region | `us-central1` |
| Memory | **`2GiB`** (bumped from 1GiB to absorb p-limit(4) × sharp peak) |
| Timeout | `300s` |
| Concurrency | `1` per instance |
| Instances | `min=0`, `max=10` |
| sharp build fix | `"gcp-build": "npm install --platform=linux --arch=x64 sharp"` in `functions/package.json` |
| AI client init | **Lazy inside handler** with module-level `let` cache (v2 secrets are only available via `.value()` at invocation time). Module-top init won't have secret values. |
| OpenAI org | **Verified** — confirmed via tracer's 400 model-level errors clearing the 403 gate |

### Q10 — Re-iterate prompt: **(R.4) prompt → P1 `additionalContext`**

Code-level change required (codex F12): `Phase1Input` gains `additionalContext?: string`; `phase1.ts` user content prepends `additionalContext` to the prompt before `Target dimensions: WxH...`. Tracer keeps the same code (pure addition, no behavior change when undefined).

Re-crop is **single-output**: callable invoked with `outputs.length === 1`, same `outputId`, overwrites Storage path and Firestore doc atomically. **Overwrite, no version history.** Re-crop button disabled until prompt non-empty. Prompt cap: 500 chars server-side.

### Q11 — Quality: **medium always**

Callable accepts `quality?: 'medium' | 'high'` for future flexibility; UI never sends it. Server defaults to `'medium'`.

### Q12 — Error UX: **(E.2) two-bucket (transient/permanent)** + classifier

Callable classifies before writing Firestore. Mapping:

- **permanent:** P2 400 content_policy, P2 403 org_verification, source URL rejected by SSRF, source URL 404, dimension exceeds 3840 / below 50, sharp can't decode source, Gemini safety reject, Gemini schema-validation fails twice
- **transient:** P2 429, P2 5xx, P1 timeout, Gemini quota, Storage write quota, Firestore write failures, network errors

`GeneratedTile` shows Retry only when `errorCategory === 'transient'`. Permanent shows static "Can't generate this size" with no button. **Dead tile stays in the grid; user downloads what worked.**

Download failures (separate surface): try/catch around the `forEach` in `handleDownloadSelected`/`handleDownloadAll` (`AppRoot.tsx:279-300`), `await` each promise, surface via toast or `alert()` for prototype.

### Q13 — Bucket CORS: **no-op** (verified)

Existing CORS already covers our paths.

### Q14 — Cancel/abort + discoverability: **C.3** with dashboard + flat outputs collection

- Jobs run to completion regardless of UI state. No Cancel button. No `beforeunload` warning.
- **DashboardPage Active Batch Jobs widget** — already wired to `listActiveBatchesForClient(clientSlug, 'ad-resizing')`. Reuses existing query. **No widget changes needed; PR-E just verifies it lights up when batches exist.**
- **Recently generated widget** (PR-E new): single query `clients/{slug}/apps/ad-resizing/outputs order by completedAt desc limit 6`.
- **Library route** at `/<slug>/adlabs/ad-resizing/library` — channel / dimension / date / batch filters. Reuses `GeneratedTile`.
- **Deep-link**: `?batchId=<id>` on `/ad-resizing` or `/library`. "View job" navigates with this param. `AppRoot` honors on mount.

**Flat outputs collection** under `clients/{slug}/apps/ad-resizing/outputs/{outputId}` (NOT nested under `batches/{batchId}/...`). Every query path-scoped → zero cross-client read leak risk. No collectionGroup queries.

---

## Implementation breakdown

Five PRs, each independently reviewable + deployable to `dev`.

### PR-A — Functions package skeleton + types + BatchRecord extension

- Create `functions/src/resize/` directory.
- Copy `phase1.ts`, `phase2.ts`, `canvasPrep.ts`, `promptTemplate.ts`, `config.ts`, `schema.ts`, `resize.ts`, `runId.ts` from `tools/resize-tracer/src/` **verbatim** with top-of-file `// MAINTAINED IN PARALLEL` comments.
- **Refactor `pipeline.ts` (this is the only file that changes shape):**
  - Split `runPipeline` into two exports: `runPhase1Once(genai, source, sourceSpec, additionalContext?)` and `runPhase2ForTarget(openai, source, p1Output, targetSpec, quality)`.
  - Drop `OUT_ROOT`, drop all `fs.writeFile` calls.
  - Return Buffers (resultBuffer, canvasBuffer, maskBuffer, rawBuffer), not paths.
  - `Phase1Input` gains `additionalContext?: string`; `phase1.ts` prompt prepends it.
- Add `errorClassifier.ts` (table-driven map of known errors → `'transient' | 'permanent'`).
- Add `ssrf.ts` (HTTPS check, DNS-resolve, reject private/link-local/metadata).
- Extend `src/services/batches.ts` `BatchRecord.status` with `'partial'`. Add optional `errorCount` + `sourceCreative` fields. **Verify template-builder's read-side handles `'partial'`** (probably treats as `completed` for display purposes).
- Add path helpers to `src/platform/firebase/paths.ts`: `outpaintOutputs`, `outpaintOutput`, `outpaintSources`.
- Update `functions/package.json` deps: `@google/genai`, `openai`, `sharp`, `zod`, `p-limit`. Add `"gcp-build"` script.
- **Tests:** unit tests for `errorClassifier` (all 10+ mappings), `ssrf` (5 reject + 1 accept), `runPhase1Once` (mocked genai, schema retry, additionalContext threading), `runPhase2ForTarget` (mocked openai, all error paths), `legalGenDims` (copy regression cases from tracer's `pipeline.test.ts`).

**Acceptance:** `functions/` builds. `npm test` passes. No deploy. No wire to UI.

### PR-B — Storage layer + source-staging utility

- Add `functions/src/resize/storage.ts`:
  - `stageSourceIfMissing({ clientSlug, originalUrl }) → { storageRef, sourceKey, width, height, mime, buffer }` — buffer always returned (codex F9). On cache miss: SSRF check → fetch → write to Storage → probe with sharp.metadata(). On cache hit: read back from Storage → probe.
  - `uploadOutput({ clientSlug, outputId, buffer }) → storageRef`
  - `uploadIntermediate({ clientSlug, batchId, outputId, kind, buffer })` — non-fatal on error (log + continue).
- **Tests:** unit tests with mocked Firebase Admin Storage. SSRF coverage. Cache hit/miss paths.

**Acceptance:** unit tests pass.

### PR-C — Callable `runOutpaintBatch` + Firestore writes

- Add `functions/src/resize/runOutpaintBatch.ts`:
  ```ts
  import { onCall } from 'firebase-functions/v2/https';
  import { defineSecret } from 'firebase-functions/params';

  const GEMINI_KEY = defineSecret('GEMINI_API_KEY');
  const OPENAI_KEY = defineSecret('OPENAI_API_KEY');

  let genai: GoogleGenAI | null = null;
  let openai: OpenAI | null = null;

  export const runOutpaintBatch = onCall(
    {
      secrets: [GEMINI_KEY, OPENAI_KEY],
      memory: '2GiB',
      timeoutSeconds: 300,
      concurrency: 1,
      maxInstances: 10,
      region: 'us-central1',
    },
    async (req) => {
      assertAlliStudioUser(req);
      const { clientSlug, batchId, creativeId, originalUrl, creativeName, outputs, retryPrompt } = req.data;
      // ... validate clientSlug regex, dim bounds, retryPrompt length
      genai ??= new GoogleGenAI({ apiKey: GEMINI_KEY.value() });
      openai ??= new OpenAI({ apiKey: OPENAI_KEY.value() });
      // ... orchestration (see below)
    }
  );
  ```
- Add `functions/src/index.ts: export * from './resize';` (codex F8).
- Input contract:
  ```ts
  {
    clientSlug: string,
    batchId: string,                  // UI pre-generates
    creativeId: string,
    originalUrl: string,
    creativeName: string,             // for BatchRecord.feedName
    feedName?: string,                // datasource name for BatchRecord.feedId
    outputs: Array<{
      outputId: string,               // UI pre-generates
      dimension: { width: number; height: number; label?: string; channel?: string },
    }>,
    retryPrompt?: string,             // single-output re-crop only
    quality?: 'medium' | 'high',      // default 'medium'
  }
  ```
- Orchestration:
  1. Email allowlist + clientSlug regex + dim bounds + retryPrompt cap.
  2. Idempotency check: if `outputs[0]` already exists in Firestore with `status === 'complete'` and no retryPrompt, return early.
  3. `stageSourceIfMissing` → `{ buffer, width, height, mime, storageRef }`.
  4. Upsert BatchRecord (status `'processing'`, sourceCreative populated).
  5. Write all `outputs/{outputId}` Firestore docs with `status: 'pending'`.
  6. **Hoist P1: `const p1 = await runPhase1Once(genai, buffer, { w: width, h: height }, retryPrompt)`.** Runs ONCE.
  7. `const limit = pLimit(4); await Promise.all(outputs.map(o => limit(() => runOne(o, p1))))`.
  8. `runOne(output, p1)`:
     - `runPhase2ForTarget` → result buffer + intermediates.
     - `uploadOutput` + 3 × `uploadIntermediate`.
     - Single Firestore `update()` with `status: 'complete'`, `storageRef`, `p1Analysis: p1`, `timings`, `model`, `quality`, `completedAt`.
     - On error: classify → write `status: 'error'`, `errorCategory`, `errorMessage`.
  9. Update BatchRecord with final counts + status (`completed` / `partial` / `failed`).
- **Tests:** auth gate (rejects non-allowlist), input validation (out-of-bounds dim, oversized prompt), idempotency check, happy-path with mocked SDKs, BatchRecord status transitions (all 4 paths: all-success, all-error, mixed → partial, single-output retry).

**Acceptance:** deployed to `dev` Firebase project. Manual smoke test with one Polo Ralph Lauren creative + 4 social dims + 1 extreme (160×600). Verify Storage uploads + Firestore writes + status transitions.

### PR-D — UI: replace simulate with real backend

- Rename `MockCreative` → `Creative` across `src/apps/ad-resizing/`.
- `Creative` gains `originalUrl: string`. `feedToCreatives.ts` populates from feed row.
- **`CreativeTile.tsx`** reads `naturalWidth`/`naturalHeight` from the loaded `<img>` and writes back through a callback to replace the hardcoded 1080×1080.
- **`feedToCreatives.ts`** ID generation changes to `sha256(originalUrl).slice(0, 16)` (codex F10), so cache key is stable.
- New `src/apps/ad-resizing/hooks/useOutpaintJob.ts` (extracts from AppRoot to keep AppRoot.tsx under 800 lines):
  - Subscribes to `outpaintOutputs(slug, 'ad-resizing') where batchId == X`.
  - Exposes `{ outputs, batch, status, handleRun, handleRetry, handleReiterate }`.
  - `handleRun` calls `httpsCallable('runOutpaintBatch')` with **client-side timeout `{ timeout: 600000 }`** (codex F13) since pipeline can take 115s+ and default 70s is too short.
  - `handleRetry` invokes the callable with `outputs.length === 1`, no prompt.
  - `handleReiterate(outputId, prompt)` invokes with `outputs.length === 1`, `retryPrompt: prompt`.
  - Cleanup on unmount + jobId change.
- New `src/apps/ad-resizing/hooks/useStorageUrl.ts`: memoized `getDownloadURL` resolver.
- `GeneratedTile.tsx`: reads `useStorageUrl(output.storageRef)`. Retry button only when `errorCategory === 'transient'`. Static "Can't generate this size" when permanent.
- `SingleImageModal.tsx`: Re-crop button `disabled={!recropText.trim()}`.
- `utils/downloadImage.ts`: try/catch + `await`; surface failures via toast/`alert()`.
- AppRoot.tsx: replace `simulateOutputCompletion` + `handleRun`/`handleRetry`/`handleReiterate` with calls into `useOutpaintJob`. Honor `?batchId=` query param on mount.
- Filename for downloads: `${creativeName}_${label}_${w}x${h}_${shortTimestamp}.${ext}`.

**Acceptance:** end-to-end manual QA on `dev`. Plus **1 Playwright E2E**: pick creative → toggle Social + Programmatic → select 1:1, 9:16, 160×600 → Generate → wait for all to reach `complete` → download 9:16 → verify file. **Plus 1 LLM eval**: 5 PMG creatives × 3 sizes, subjective scoring saved to `evals/resize-image/baseline.md`.

### PR-E — Dashboard widgets + gallery route

- DashboardPage "Active Batch Jobs" widget: **no changes needed** (already wired via `listActiveBatchesForClient`). Just verify it lights up with `appId: 'ad-resizing'` batches.
- DashboardPage adds "Recently generated" 6-card widget. Query: `outpaintOutputs(slug, 'ad-resizing') order by completedAt desc limit 6`.
- New route `/<slug>/adlabs/ad-resizing/library` → `LibraryPage`. Filter chips: channel, dimension, batch, date. Reuses `GeneratedTile`.
- Deep-link `?batchId=<id>` honored by `AppRoot` and `LibraryPage`.
- "View job" / "Compare slots" links from dashboard navigate with this param.

**Acceptance:** open three concurrent batches from different creatives. Navigate back to dashboard. See all three in Active Batch Jobs. Open library, filter to one batch via `?batchId=`. Click "View job" → land in `/ad-resizing?batchId=<id>` with the right tiles hydrated.

---

## Out of scope for v0 (deferred — see grill for rationale)

- `syncClientClaims` callable + `isClientMember` rule activation
- Quality toggle in UI (hardcoded medium)
- Cancel button / abort mid-batch
- Version history on re-crop
- Per-output retry-with-prompt (retry stays prompt-free; only re-crop carries prompt)
- Pre-staging on selection (we use lazy T.3 on Run)
- Per-output P1 caching across batches (within-batch hoisting IS in scope per Section 1 issue 2)
- Brand standards / partial-approval / cost guardrails / dedup / pause-resume
- Workspace extraction (`packages/resize-pipeline/`) — duplicate copy with TODO marker for now
- Removing the dead `src/apps/resize-image/` skeleton — separate cleanup PR
- Migration of `ai.ts` / `alliProxy.ts` from v1 → v2 callable patterns — out of scope

---

## Risks + open questions

1. **gpt-image-2 content-policy rejection rate on real PMG creatives is unknown.** Tracer hasn't exercised this at volume. If permanent-error rate is high, the prototype will feel broken. Mitigation: log permanent errors prominently for first week; if pattern emerges, evaluate Imagen 3 swap.
2. **Cold-start latency** with sharp + Gemini SDK + OpenAI SDK loaded: ~3-5s. First batch in a session feels slow.
3. **OpenAI per-output cost** at medium quality: ~$0.04/output × 16-size batch = $0.64/batch. With P1 hoisting + p-limit(4), an additional ~$0.005 Gemini cost per batch (down from $0.08 unhoisted).
4. **2GiB function memory** absorbs sharp + concurrency=4 P2 in flight. If we ever raise p-limit, revisit memory.
5. **`useStorageUrl` resolution adds ~50ms per output on first render.** Negligible at parallel scale.
6. **Dimension snapshot vs canonical source** — Firestore stores `dimension` snapshot (denormalized). If `channels.ts` changes, past outputs keep their original snapshot. Correct for archives, but recently-generated widget may show old labels.
7. **Template-builder reads `BatchRecord.status`** — verify it handles new `'partial'` value (likely treats as `completed` or `failed`; should at minimum not crash).

---

## Success criteria for v0

- Single user picks a creative from a feed, selects 4 sizes (mix of social + programmatic including 1 extreme aspect), clicks Generate, sees real AI-generated outputs within ~60-130s.
- Re-crop with prompt produces a structurally different output (validated by LLM eval rubric: subject preservation, extension realism).
- Navigate away mid-batch → return via dashboard's Active Batch Jobs widget → see results hydrate.
- Open library, filter by channel + jobId, find a prior output.
- All Firestore writes path-scoped to `clients/{slug}/...` — verified by manual Firestore Console inspection.
- Unit tests pass for `errorClassifier`, `ssrf`, `stageSourceIfMissing`, `runOutpaintBatch` orchestration, `useOutpaintJob`, `useStorageUrl`.
- 1 Playwright E2E passes (3 sizes, full happy path).
- LLM eval baseline established (`evals/resize-image/baseline.md`).

---

## Origin

This plan is the output of:
- A 14-question grill (`/grill-me` skill, 2026-05-11) on Diego's brief: "Wire the resize-tracer outpainting pipeline into the in-product Resize Image app."
- A 4-section `/plan-eng-review` pass (Step 0 scope challenge, Architecture, Code Quality, Tests, Performance).
- A `codex` outside-voice review surfacing 14 additional issues (memory bump, P1 hoisting plan-text gap, p-limit absence, dep gaps, v1-vs-v2 callable, missing index export, staging buffer return, cache-key stability, SSRF allowlist, Phase1 additionalContext, callable timeout, test scope).

All decisions locked. Ready to implement PR-A.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | issues_found | 14 findings, all addressed |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 11 issues raised across Step 0/Arch/Quality/Tests/Perf; all resolved via AskUserQuestion |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |

**CODEX:** 14 findings surfaced; all turned into either plan updates (memory, hoisting, p-limit text, BatchRecord reuse, SSRF, dashboard query) or new locked decisions (v2 callable, staging-buffer-return, sha256 cache key, E2E extreme-aspect coverage).

**CROSS-MODEL:** Claude inside-review + Codex outside-review converged. No outright disagreements — Codex caught things Claude missed (deps gap, v1/v2 callable, export omission, signature contradictions, cache-key bug, additionalContext code-level gap, client timeout). All resolved.

**UNRESOLVED:** 0

**VERDICT:** ENG CLEARED + CODEX CLEARED — ready to implement PR-A.
