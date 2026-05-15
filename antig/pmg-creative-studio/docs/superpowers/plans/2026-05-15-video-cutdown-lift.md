# Video Cutdown — Full Lift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift the legacy video-cutdown app from `src/pages/use-cases/UseCaseWizardPage.tsx` (a 4,323-line monolith at `/create/video-cutdown`) into a modular app at `src/apps/video-cutdown/` with scoped Firestore + Storage paths, async job persistence, and a reimagined 6-step WizardShell UI.

**Architecture:** Two Firebase v2 callables (`analyzeVideoCutdownBatch` + `renderVideoCutdownBatch`) using ad-resizing's "Firestore-as-progress-channel" pattern: callable writes `batches/{batchId}` + `outputs/{outputId}` docs progressively; UI subscribes via `onSnapshot`. Human-in-the-loop pause at `status: 'awaiting-approval'` between analysis and render. Schema parity with ad-resizing (`batches` + `outputs`) — mandated by the future cross-app "your generations" view. Shared server-side primitives (paths, ssrf, errorClassifier, timeToSeconds) live in `functions/src/_shared/` to keep `resize/` and `videoCutdown/` decoupled. UI is a **6-step WizardShell** (Upload, Configure, Analyze, Approve, Render, Download).

**Tech Stack:** TypeScript, React, React Router v6, Firebase (Firestore + Storage + v2 Callable Functions), Gemini 3 Pro (`@google/generative-ai`), FFmpeg (`fluent-ffmpeg`), Vite, Vitest, Playwright, WizardShell + `usePersistedStepData`.

**Status:** Locked. Output of the 2026-05-15 grill + storage-rules audit + legacy-paths audit.
**Owner:** Diego.
**Branch (target):** `feature/video-cutdown-lift` off `dev` (no worktrees).
**Closes:** the legacy `/create/video-cutdown` route after PR-C; partially implements the "no UI but routes go to it" cleanup workstream.

---

## Vision

Replace the legacy monolith's video-cutdown flow with a modular per-client app at `/adlabs/:clientSlug/video-cutdown/*`. Users upload (or pick from a feed) a short video (≤2 minutes), pick target lengths (6/15/30s), review AI-recommended cuts, then render. Results persist per-client across refreshes; the dashboard's Active Batch Jobs widget lights up while jobs run; a per-app "Recent renders" widget surfaces the last 6 completed cuts (lands in PR-B); a future cross-app "your generations" view will surface every rendered cut next to every resized image because `outputs/{outputId}` is consistently shaped across apps.

This is a **full lift**, not a wrapper: zero monolith UI code is reused. Backend cloud-function logic (Gemini analysis prompts, FFmpeg pipeline) is preserved verbatim where it works, ported into a scoped, v2-callable, retryable shape.

---

## Empirical baseline (what's actually wired today)

Confirmed via storage-rules audit + legacy-paths audit on `dev`:

- **Modern route exists, stub only.** `src/App.tsx:135` mounts `WizardShell` against `src/apps/video-cutdown/manifest.ts`, which is `status: 'preview'` with one fail-validation step. Registry inclusion gated behind `VITE_FEATURE_VIDEO_CUTDOWN_LIFT === 'true'` (`src/apps/_registry.ts:65-82`).
- **Real working logic in the legacy monolith.** `src/pages/use-cases/UseCaseWizardPage.tsx:1865-1992` handles video-cutdown screens. Upload step writes browser → Storage at `uploads/{client.slug}/{ts}_{filename}` (line 1874).
- **Two v1 callables back the legacy flow:**
  - `analyzeVideoForCutdowns` in `functions/src/ai.ts` — Gemini 3 Pro analysis, 540s, 1GB
  - `processVideoCutdowns` in `functions/src/video.ts` — FFmpeg pipeline, 540s, 4GB; writes to `results/{cut.id}_{length}s.mp4` (line 158)
  - `deleteStorageFiles` admin sweeper in `functions/src/video.ts:182-203` — unscoped, dangerous post-migration
- **Browser upload is silently broken on deployed rules.** `storage.rules:47-49` default-deny everything outside `clients/{slug}/...`. The legacy upload path `uploads/{slug}/...` is denied. Function writes succeed only because admin SDK bypasses rules. **There is no live "working in prod" video-cutdown traffic to disturb** — this is a clean migration.
- **`src/services/videoService.ts` is the only callable client.** Used exclusively from the monolith.
- **No Firestore persistence today.** All state is in-memory `setStepData`; refresh = lose everything.
- **Storage + Firestore rules already permit the target modular path.** `storage.rules:42` allows `clients/{clientSlug}/{path=**}` for allowlisted users. No rules changes required.

Reference patterns we're cloning:

- **`src/apps/ad-resizing/`** — single-file `AppRoot.tsx` browsing UI. Source of `useBatchOutputs.ts` (live Firestore subscription) and `useOutpaintRunner.ts` (callable wrapper with `{ timeout: 600000 }`).
- **`functions/src/resize/runOutpaintBatch.ts`** — v2 onCall orchestration. Source for SSRF guard, error classifier, scoped storage helpers.
- **`functions/src/resize/errorClassifier.ts`** — table-driven transient/permanent classifier; **reused verbatim** (already exported from `functions/src/resize/index.ts`).
- **`src/apps/template-builder/`** — multi-step `WizardShell` consumer; `manifest.ts` shape + per-step files in `steps/`.
- **`src/apps/types.ts:60-71`** — `WizardStep.submit` async hook is already defined; comments explicitly mention "lifted apps (e.g. video-cutdown) whose Continue button must kick off long-running server work."

---

## Decisions locked (grilled 2026-05-15)

### Q1 — Execution model: **async job-doc + Firestore `onSnapshot`** (B)

Matches ad-resizing exactly. Persistence across refresh, progress UI, multi-tab safe.

### Q2 — Topology: **two callables with human-in-the-loop** (D)

`analyzeVideoCutdownBatch(sourceKey, targetLengths, model) → { batchId }` runs Gemini, writes `batches/{batchId}.analysis`, sets `status: 'awaiting-approval'`. User reviews → `renderVideoCutdownBatch(batchId, selectedSegments)` does FFmpeg fan-out, writes `outputs/{outputId}` per cut, settles batch to `complete | partial | failed`.

### Q3 — Firestore schema: **schema parity with ad-resizing**

```
clients/{slug}/apps/video-cutdown/
  sources/{sourceKey}                 ← content-hashed dedup
  batches/{batchId}                   ← parent job, analysis as a field
  outputs/{outputId}                  ← flat sibling, batchId field
```

**Naming locked as `batches` + `outputs`** (not `jobs` + `cuts`) — the future cross-app "your generations" view will run `collectionGroup('outputs')` queries scoped to the client, which only works if every modular app uses the same vocabulary.

**`analysis` as a field on the parent batch doc** (not a subcollection). Re-running analysis = new batch.

### Q4 — Source dedup: **hybrid hash**

- **Human upload:** SHA256 of file bytes, computed client-side via Web Crypto on a `File` blob, then upload to `clients/{slug}/apps/video-cutdown/sources/{sha256}.{ext}`.
- **Feed URL:** SHA256 of the URL string (not bytes). Diverges from ad-resizing's bytes-only strategy — justified by video size asymmetry (videos are 10-1000× larger than images; downloading-just-to-hash is wasteful).

### Q5 — Storage layout: **mirror ad-resizing verbatim**

```
clients/{slug}/apps/video-cutdown/
  sources/{sha256}.{ext}              ← .mp4 / .mov / .webm
  outputs/{outputId}.mp4              ← final rendered cut
```

No `intermediates/` directory; FFmpeg writes directly to outputs (intermediates exist only inside `/tmp` on the function instance, cleaned up on exit).

### Q6 — Upload model: **hybrid**

- Human upload: direct browser → Storage (uses `paths.storage.app(slug, 'video-cutdown', 'sources/{sha256}.{ext}')`).
- Feed URL: callable-mediated SSRF-guarded fetch in `analyzeVideoCutdownBatch` (cloned from `functions/src/resize/ssrf.ts` + `storage.ts:stageSourceIfMissing`).

### Q7 — Hard constraints

| Constraint | Value | Enforced where |
|---|---|---|
| Max file size | 2 GiB | Client (file picker) + analyze callable (validate `sources/{sourceKey}` metadata) |
| Format whitelist | `video/mp4`, `video/quicktime`, `video/webm` | Client (`accept=` + extension check) + analyze callable (probe first bytes) |
| Min duration | 6 seconds | Analyze callable (probe via `ffprobe`) |
| Max duration | **2 minutes (120s)** | Analyze callable (probe via `ffprobe`) |
| Concurrency cap | **1 simultaneous FFmpeg render** (default; env-tunable) | Render callable (`p-limit(MAX_RENDER_CONCURRENCY ?? 1)`) |

### Q8 — Cloud Function infra

| Decision | Value |
|---|---|
| Package location | `functions/src/videoCutdown/` |
| Callable API | **firebase-functions v2 `onCall`** (consistent with `assertAlliStudioUser` helper) |
| Export | `functions/src/index.ts` adds `export * from './videoCutdown';` |
| New dependencies | None — `@google/generative-ai`, `fluent-ffmpeg`, `ffmpeg-static`, `axios`, `p-limit`, `firebase-admin` already in `functions/package.json` |
| Secrets | `defineSecret('GEMINI_API_KEY')` (existing) |
| Region | `us-central1` (matches resize) |
| Memory | `4GiB` (matches current video.ts) — needed for FFmpeg headroom |
| vCPU | `2` (implicit at 4GiB) |
| Timeout | `3600s` (v2 max; analysis ~15min, renders 5-10min × 2 concurrent ≈ 60min worst case) |
| Concurrency | `1` per instance |
| Max instances | `5` (analyze) / `10` (render) |
| FFmpeg path | `ffmpeg-static` resolved at module load (matches current video.ts:11-13) |

### Q9 — Auth: **(A.1) UI passes `clientSlug`, function trusts it** + helper reuse

Reuse `functions/src/_shared/assertAlliStudioUser.ts` verbatim. Inline regex `/^[a-z0-9_-]+$/` validates `clientSlug` before any Firestore read.

### Q10 — Error UX: **two-bucket (transient/permanent)** — reuse `errorClassifier`

`functions/src/resize/errorClassifier.ts` is the source of truth for both apps. Already exported via `functions/src/resize/index.ts:6`. Render callable classifies each FFmpeg/Gemini failure, writes `errorCategory` + `errorMessage` to the output doc.

Video-specific permanent reasons added: `unsupported_codec`, `video_too_long`, `video_too_short`, `invalid_segment_range`. Transient reasons inherited unchanged.

### Q11 — Retry: **per-output retry callable** (`retryVideoCutdownOutput`)

Mirrors ad-resizing's retry path. Single-output invocation that resets the output doc to `pending`, re-reads the source from Storage, re-runs FFmpeg, settles. **No retry-analysis** — re-running analysis = new batch.

### Q12 — Feature flag policy

- **PR-A:** flag stays default off; no user-facing change.
- **PR-B:** flag stays default off but Diego flips it locally + on `dev` hosting target to QA the new wizard. Manifest `status` flips to `'live'`.
- **PR-C:** flag default flips to `true` (delete the conditional check in `_registry.ts`); all references to `VITE_FEATURE_VIDEO_CUTDOWN_LIFT` are deleted from the codebase.

### Q13 — Decommission safety

- PR-A: monolith untouched. Both routes coexist.
- PR-B: monolith untouched. Both routes coexist. New route is now real; old route still works.
- PR-C: monolith video-cutdown sections deleted, `/create/video-cutdown` route removed, legacy callables (`analyzeVideoForCutdowns`, `processVideoCutdowns`) deleted, `src/services/videoService.ts` deleted. Atomic in a single PR so deployed state never has dangling legacy.

### Q15 — Shared server-side primitives in `functions/src/_shared/`

Decided in plan-eng-review 2026-05-15 (Code Quality #1). Move these out of `functions/src/resize/` and into `functions/src/_shared/`:

- `paths.ts` — server-side mirror of `src/platform/firebase/paths.ts` (kills triple-source-of-truth between client, functions hand-built strings, and rules tests). PR-A scope.
- `ssrf.ts` + `ssrf.test.ts` — DRY between `resize/` and `videoCutdown/`. PR-A scope.
- `errorClassifier.ts` + `errorClassifier.test.ts` — base classifier. `videoCutdownErrors.ts` augments it. PR-A scope.
- `timeToSeconds.ts` — extract from legacy `video.ts` + new `render.ts` into one place. PR-A scope.

Resize package gets refactored to import from `_shared/` in the same PR. Test suites move with their files.

### Q16 — Idempotency check in `analyzeVideoCutdownBatch`

Decided in plan-eng-review 2026-05-15 (Arch #2). At callable entry, after auth + input validation:

```ts
const existing = await batchRef.get();
if (existing.exists && existing.data()?.videoAnalysis) {
  logger.info('Idempotent re-submit; returning existing analysis', { batchId });
  return { batchId, status: existing.data()!.status };
}
```

Same pattern in `renderVideoCutdownBatch` — if any pre-existing output for this batchId is `'complete'` and not present in the new request, leave it; if all requested outputs already complete, return early.

### Q17 — Stuck-batch recovery in `renderVideoCutdownBatch`

Decided in plan-eng-review 2026-05-15 (Failure mode critical gap). At callable entry, scan `outputs where batchId == X && status == 'rendering'` (orphans from a prior function-timeout). Reset each to `status: 'error', errorCategory: 'transient', errorMessage: 'Recovered from prior timeout — safe to retry'`. Then the user can retry via the retry callable.

### Q18 — Per-app "Recent renders" widget

Decided in plan-eng-review 2026-05-15 (Arch #3). PR-B includes a dashboard widget rendering the last 6 `outputs` for video-cutdown, filtered by current client. Query: `clients/{slug}/apps/video-cutdown/outputs order by completedAt desc limit 6 where status == 'complete'`. Mirrors ad-resizing's "Recently generated" widget. Sets up the data path for the future cross-app library.

### Q19 — Orphan source TTL cleanup

Decided in plan-eng-review 2026-05-15 (Code Quality #2). New Firestore-triggered function `cleanupOrphanedSources`. Fires nightly via scheduled trigger. For each `batches` doc older than 30 days where `status` not in `['completed', 'partial']`, delete the referenced `sourceVideo.storageRef`. Cost: ~50 LOC + a Cloud Scheduler entry. Lives in `functions/src/videoCutdown/cleanupOrphanedSources.ts`. PR-A scope (function), but doesn't fire on dev until enabled in prod. PR-B/C unaffected.

### Q14 — Parity criteria for "lift complete" (declared at PR-B merge)

- [ ] User can upload a ≤2-minute MP4 from local disk
- [ ] User can pick a video URL from an Alli feed (datasource)
- [ ] User selects target lengths from {6, 15, 30}s; multi-select
- [ ] AI Recs step renders ≥1 cut option per target length within 15min
- [ ] User can select/deselect proposed segments per cut
- [ ] Process step kicks off renders, shows per-cut progress live
- [ ] User can download each completed cut as MP4
- [ ] State persists across refresh at every step
- [ ] Active Batch Jobs widget on dashboard shows in-flight video-cutdown batches
- [ ] Recent renders widget shows the last 6 completed cuts per client (Q18)
- [ ] Re-submitting an in-progress batch is a no-op (Q16 idempotency)
- [ ] Batches stuck in 'processing' from a function timeout are recoverable via retry (Q17)

---

## File structure

### Created in PR-A (scaffold)

```
src/apps/video-cutdown/
  types.ts                              ← VideoCutdownStepData, VideoCutdownAnalysis, VideoCutdownSegment, etc.
                                          (CLIENT-SIDE types only)

src/services/
  videoCutdown.ts                       ← new callable client (BatchRecord-typed); replaces videoService.ts in PR-C

functions/src/_shared/                  ← NEW per Q15 — shared server-side primitives
  paths.ts                              ← server-side mirror of src/platform/firebase/paths.ts
  paths.test.ts
  ssrf.ts                               ← MOVED from functions/src/resize/ssrf.ts
  ssrf.test.ts                          ← MOVED from functions/src/resize/ssrf.test.ts
  errorClassifier.ts                    ← MOVED from functions/src/resize/errorClassifier.ts
  errorClassifier.test.ts               ← MOVED from functions/src/resize/errorClassifier.test.ts
  timeToSeconds.ts                      ← extracted from legacy video.ts + render.ts
  timeToSeconds.test.ts

functions/src/videoCutdown/
  index.ts                              ← barrel: export * from each file
  config.ts                             ← constants: MAX_DURATION_SEC = 120, MIN_DURATION_SEC = 6, MAX_FILE_BYTES, format whitelist, concurrency
  types.ts                              ← LOCAL duplicate of VideoCutdownAnalysis / Segment / Selection /
                                          OutputDoc interfaces (server cannot import from src/ — tsconfig
                                          rootDir boundary; per plan-eng-review Arch finding). Keep these
                                          contract types in sync manually; the test suite asserts shape.
  storage.ts                            ← stageSourceIfMissing, uploadOutput, probeVideo (ffprobe wrapper)
  analyze.ts                            ← Gemini call extracted from ai.ts, parametric over (genai, sourceBuffer, targetLengths, model)
  render.ts                             ← FFmpeg pipeline extracted from video.ts, parametric over (sourceLocalPath, segments, targetWidth, targetHeight)
  videoCutdownErrors.ts                 ← video-specific error rules; delegates to _shared/errorClassifier
  analyzeVideoCutdownBatch.ts           ← v2 onCall — orchestration #1 (with Q16 idempotency guard)
  renderVideoCutdownBatch.ts            ← v2 onCall — orchestration #2 (with Q17 orphan reset)
  retryVideoCutdownOutput.ts            ← v2 onCall — single-output retry
  cleanupOrphanedSources.ts             ← NEW per Q19 — scheduled function, 30-day TTL
  analyze.test.ts
  render.test.ts
  storage.test.ts
  videoCutdownErrors.test.ts
  analyzeVideoCutdownBatch.test.ts      ← includes idempotency test (Q16)
  renderVideoCutdownBatch.test.ts       ← includes orphan-reset test (Q17) + concurrency cap test
  retryVideoCutdownOutput.test.ts       ← full test list per plan-eng-review Test #2
  cleanupOrphanedSources.test.ts
```

### Modified in PR-A (refactor `resize/` to import from `_shared/`)

```
functions/src/resize/ssrf.ts            ← DELETE (moved to _shared/)
functions/src/resize/ssrf.test.ts       ← DELETE
functions/src/resize/errorClassifier.ts ← DELETE (moved to _shared/)
functions/src/resize/errorClassifier.test.ts ← DELETE
functions/src/resize/index.ts           ← update exports: re-export from _shared/ for backwards-compat
functions/src/resize/runOutpaintBatch.ts ← update import paths for ssrf + errorClassifier
functions/src/resize/storage.ts         ← update import paths if it uses ssrf
```

### Modified in PR-A

```
src/platform/firebase/paths.ts          ← add videoCutdownSources/Batches/Outputs helpers
src/platform/firebase/__tests__/paths.test.ts  ← add tests for new helpers
src/services/batches.ts                 ← extend BatchRecord union: add 'analyzing' | 'awaiting-approval'; add optional videoAnalysis, selectedSegments, sourceVideo fields
functions/src/index.ts                  ← add `export * from "./videoCutdown";`
tests/rules/storage.rules.test.ts       ← add coverage for clients/{slug}/apps/video-cutdown/{sources,outputs}/...
tests/rules/firestore.rules.test.ts     ← add coverage for clients/{slug}/apps/video-cutdown/batches and /outputs
```

### Created in PR-B (UI lift)

```
src/apps/video-cutdown/
  manifest.ts                           ← REPLACES the stub: status='live', 6 steps
  steps.ts                              ← barrel re-export
  steps/
    UploadStep.tsx                      ← human upload + feed picker
    UploadStep.test.tsx                 ← validate() unit test per plan-eng-review Test #1
    ConfigureStep.tsx                   ← target length multi-select
    ConfigureStep.test.tsx
    AnalyzeStep.tsx                     ← submit() kicks analyzeVideoCutdownBatch; waiting + result view
    AnalyzeStep.test.tsx
    ApproveStep.tsx                     ← AI recs review + per-segment toggle
    ApproveStep.test.tsx
    RenderStep.tsx                      ← submit() kicks renderVideoCutdownBatch; live per-output grid
    RenderStep.test.tsx
    DownloadStep.tsx                    ← completed cuts list with download buttons
    DownloadStep.test.tsx
  hooks/
    useVideoCutdownRunner.ts            ← httpsCallable wrappers (analyze/render/retry)
    useVideoCutdownRunner.test.ts
    useVideoCutdownBatch.ts             ← onSnapshot subscription mirroring useBatchOutputs.ts
    useVideoCutdownBatch.test.ts
    useVideoUpload.ts                   ← client-side SHA256 + paths.storage.app + uploadBytesResumable + progress
    useVideoUpload.test.ts
    useStorageUrl.ts                    ← re-export from ad-resizing OR copy (decision in task)
  utils/
    feedToVideoCreatives.ts             ← Alli datasource adapter for video URL columns
    feedToVideoCreatives.test.ts
    formatDuration.ts                   ← seconds → "1:23"
  components/
    SegmentEditor.tsx                   ← shared between ApproveStep + RenderStep
    VideoFeedPicker.tsx                 ← feed selector + URL column picker
    RecentRendersWidget.tsx             ← NEW per Q18 — dashboard widget
    RecentRendersWidget.test.tsx
```

### E2E added in PR-B (per plan-eng-review Test #1)

```
tests/e2e/video-cutdown-happy-path.spec.ts     ← Task B13 (full upload → download)
tests/e2e/video-cutdown-submit-boundaries.spec.ts  ← Configure→Analyze + Analyze→Approve + Render→Download
                                                    transitions with mocked callables, refresh-resumption check
```

### Modified in PR-B

```
src/apps/video-cutdown/manifest.ts      ← stub → real (status='live', 5 steps)
src/apps/_registry.ts                   ← keep flag check; flag default still false
src/App.tsx                             ← no change (route already mounted)
```

### Modified / removed in PR-C (decommission)

```
src/apps/_registry.ts                   ← remove VITE_FEATURE_VIDEO_CUTDOWN_LIFT block; manifest always in MANIFESTS
src/App.tsx                             ← remove `/create/video-cutdown` legacy route
src/pages/use-cases/UseCaseWizardPage.tsx  ← delete video-cutdown sections (lines ~1865-1992 + 379-383)
src/services/videoService.ts            ← DELETE (only referenced by monolith)
functions/src/ai.ts                     ← delete analyzeVideoForCutdowns (kept only if still referenced by other apps — verified empty)
functions/src/video.ts                  ← delete processVideoCutdowns + deleteStorageFiles
functions/src/index.ts                  ← drop `export * from "./ai";` and `export * from "./video";` (or strip if other exports remain)
.env.example, dev .env, hosting env     ← remove VITE_FEATURE_VIDEO_CUTDOWN_LIFT
```

---

## Path helpers added (PR-A)

`src/platform/firebase/paths.ts`:

```ts
videoCutdownSources: (slug: ClientSlug) =>
  `${root(slug)}/apps/video-cutdown/sources`,
videoCutdownSource: (slug: ClientSlug, sourceKey: string) =>
  `${root(slug)}/apps/video-cutdown/sources/${sourceKey}`,
videoCutdownBatches: (slug: ClientSlug) =>
  `${root(slug)}/apps/video-cutdown/batches`,
videoCutdownBatch: (slug: ClientSlug, batchId: string) =>
  `${root(slug)}/apps/video-cutdown/batches/${batchId}`,
videoCutdownOutputs: (slug: ClientSlug) =>
  `${root(slug)}/apps/video-cutdown/outputs`,
videoCutdownOutput: (slug: ClientSlug, outputId: string) =>
  `${root(slug)}/apps/video-cutdown/outputs/${outputId}`,
```

Note: a separate issue tracks generalizing all `batches/outputs/sources` helpers to take `(slug, appId)`; defer that refactor.

---

## Types added (PR-A)

`src/apps/video-cutdown/types.ts`:

```ts
import type { StepData } from '../types';

export interface VideoCutdownSegment {
  /** HH:MM:SS.mmm or seconds-only string, as returned by Gemini. */
  start: string;
  end: string;
}

export interface VideoCutdownOption {
  /** AI-assigned numeric id within the (targetLength × batch) scope. */
  id: number;
  reason: string;
  segments: VideoCutdownSegment[];
}

export interface VideoCutdownRecommendation {
  length: number;                    // target length in seconds
  options: VideoCutdownOption[];
}

export interface VideoCutdownAnalysis {
  recommendations: VideoCutdownRecommendation[];
  model: string;                     // e.g. 'gemini-3-pro-preview'
  analyzedAt: number;                // ms epoch
  latencyMs: number;
}

export interface VideoCutdownSelection {
  /** length × optionId pair the user chose to render. */
  length: number;
  optionId: number;
  /** Snapshot of the segments at approval time (user may have edited). */
  segments: VideoCutdownSegment[];
}

export interface VideoCutdownSourceInfo {
  sourceKey: string;                 // sha256 (16-hex prefix) of bytes or URL
  storageRef: string;                // gs://bucket/clients/{slug}/apps/video-cutdown/sources/{sourceKey}.{ext}
  durationSec: number;
  sizeBytes: number;
  mime: 'video/mp4' | 'video/quicktime' | 'video/webm';
  origin: 'upload' | 'feed';
  originalUrl?: string;              // only set when origin === 'feed'
  uploadedAt: number;
}

export interface VideoCutdownOutputDoc {
  outputId: string;
  batchId: string;
  /** Which (length, optionId) pair this output renders. */
  selection: VideoCutdownSelection;
  status: 'pending' | 'rendering' | 'complete' | 'error';
  storageRef?: string;
  errorCategory?: 'transient' | 'permanent';
  errorMessage?: string;
  durationSec?: number;              // actual rendered duration (sanity check)
  sizeBytes?: number;
  createdAt: unknown;                // Firestore Timestamp
  completedAt?: unknown;
}

export interface VideoCutdownStepData extends StepData {
  source?: VideoCutdownSourceInfo;
  targetLengths?: number[];          // user picks from {6, 15, 30}
  analysisModel?: string;            // default 'gemini-3-pro-preview'
  batchId?: string;
  selections?: VideoCutdownSelection[];  // user-approved subset at ApproveStep
}
```

---

## BatchRecord extensions (PR-A)

Extend `src/services/batches.ts` `BatchRecord`:

```ts
export interface BatchRecord {
  // ... existing fields ...
  status:
    | 'pending'
    | 'analyzing'             // ← NEW: video-cutdown
    | 'awaiting-approval'     // ← NEW: video-cutdown
    | 'processing'
    | 'completed'
    | 'failed'
    | 'partial';

  // ── New optional fields (video-cutdown only) ──
  sourceVideo?: {
    sourceKey: string;
    storageRef: string;
    durationSec: number;
    sizeBytes: number;
    mime: string;
    origin: 'upload' | 'feed';
    originalUrl?: string;
  };
  videoAnalysis?: VideoCutdownAnalysis;
  videoSelections?: VideoCutdownSelection[];   // populated when render kicks off
}
```

**Verify template-builder + ad-resizing read-sides handle the new status values gracefully** (`'analyzing'` + `'awaiting-approval'` should display as in-progress; `Active Batch Jobs` widget filter logic must include them). PR-A task includes this verification.

---

# PR-A — Scaffold + scoping (backend + types, no UI changes)

**Acceptance:**
- `npm run build` in repo root passes.
- `npm run build` in `functions/` passes.
- `npm run test` and `npm run test:rules` pass.
- New v2 callables deployed to `dev` (Firebase project `automated-creative-e10d7`) but unused by UI.
- Manual emulator smoke test: invoke `analyzeVideoCutdownBatch` from `npm run shell` with a known short MP4 URL; verify `batches/{batchId}.analysis` appears in Firestore + `sources/{sha256}.mp4` in Storage.
- No user-facing change: legacy `/create/video-cutdown` still works; `/adlabs/:clientSlug/video-cutdown/*` still renders the preview stub.

### Task A1: Add path helpers + tests

**Files:**
- Modify: `src/platform/firebase/paths.ts`
- Modify: `src/platform/firebase/__tests__/paths.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/platform/firebase/__tests__/paths.test.ts` (inside the existing `describe('paths', ...)` block):

```ts
describe('video-cutdown helpers', () => {
  it('returns the sources collection path', () => {
    expect(paths.videoCutdownSources('ralph_lauren')).toBe(
      'clients/ralph_lauren/apps/video-cutdown/sources'
    );
  });
  it('returns a single source doc path', () => {
    expect(paths.videoCutdownSource('ralph_lauren', 'abc123def4567890')).toBe(
      'clients/ralph_lauren/apps/video-cutdown/sources/abc123def4567890'
    );
  });
  it('returns the batches collection path', () => {
    expect(paths.videoCutdownBatches('ralph_lauren')).toBe(
      'clients/ralph_lauren/apps/video-cutdown/batches'
    );
  });
  it('returns a single batch doc path', () => {
    expect(paths.videoCutdownBatch('ralph_lauren', 'b1')).toBe(
      'clients/ralph_lauren/apps/video-cutdown/batches/b1'
    );
  });
  it('returns the outputs collection path', () => {
    expect(paths.videoCutdownOutputs('ralph_lauren')).toBe(
      'clients/ralph_lauren/apps/video-cutdown/outputs'
    );
  });
  it('returns a single output doc path', () => {
    expect(paths.videoCutdownOutput('ralph_lauren', 'o1')).toBe(
      'clients/ralph_lauren/apps/video-cutdown/outputs/o1'
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test -- src/platform/firebase/__tests__/paths.test.ts
```
Expected: 6 failing — `paths.videoCutdownSources is not a function` etc.

- [ ] **Step 3: Add the helpers**

In `src/platform/firebase/paths.ts`, inside the `paths` object literal, after the existing `outpaintSources` entry:

```ts
  videoCutdownSources: (slug: ClientSlug) =>
    `${root(slug)}/apps/video-cutdown/sources`,
  videoCutdownSource: (slug: ClientSlug, sourceKey: string) =>
    `${root(slug)}/apps/video-cutdown/sources/${sourceKey}`,
  videoCutdownBatches: (slug: ClientSlug) =>
    `${root(slug)}/apps/video-cutdown/batches`,
  videoCutdownBatch: (slug: ClientSlug, batchId: string) =>
    `${root(slug)}/apps/video-cutdown/batches/${batchId}`,
  videoCutdownOutputs: (slug: ClientSlug) =>
    `${root(slug)}/apps/video-cutdown/outputs`,
  videoCutdownOutput: (slug: ClientSlug, outputId: string) =>
    `${root(slug)}/apps/video-cutdown/outputs/${outputId}`,
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test -- src/platform/firebase/__tests__/paths.test.ts
```
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/platform/firebase/paths.ts src/platform/firebase/__tests__/paths.test.ts
git commit -m "feat(paths): add video-cutdown firestore + storage path helpers"
```

### Task A2: Add Firestore + Storage rules tests for new paths

**Files:**
- Modify: `tests/rules/firestore.rules.test.ts`
- Modify: `tests/rules/storage.rules.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `tests/rules/firestore.rules.test.ts` (inside the top-level `describe`):

```ts
describe('clients/{slug}/apps/video-cutdown/', () => {
  it('allows allowlisted user to write a batch doc', async () => {
    const ctx = env.authenticatedContext('uid', { email: allowedEmail, email_verified: true });
    const ref = ctx.firestore().doc('clients/ralph_lauren/apps/video-cutdown/batches/b1');
    await expect(ref.set({ status: 'analyzing' })).resolves.not.toThrow();
  });
  it('allows allowlisted user to write an output doc', async () => {
    const ctx = env.authenticatedContext('uid', { email: allowedEmail, email_verified: true });
    const ref = ctx.firestore().doc('clients/ralph_lauren/apps/video-cutdown/outputs/o1');
    await expect(ref.set({ batchId: 'b1', status: 'pending' })).resolves.not.toThrow();
  });
  it('denies non-allowlisted user', async () => {
    const ctx = env.authenticatedContext('uid', { email: deniedEmail, email_verified: true });
    const ref = ctx.firestore().doc('clients/ralph_lauren/apps/video-cutdown/batches/b1');
    await expect(ref.set({ status: 'analyzing' })).rejects.toThrow();
  });
});
```

Append to `tests/rules/storage.rules.test.ts`:

```ts
describe('video-cutdown Storage paths', () => {
  it('allows allowlisted user to upload a source', async () => {
    const ctx = env.authenticatedContext('uid', { email: allowedEmail, email_verified: true });
    const ref = ctx.storage().ref('clients/ralph_lauren/apps/video-cutdown/sources/abc.mp4');
    await expect(ref.put(new Blob(['x']))).resolves.toBeDefined();
  });
  it('allows allowlisted user to read an output', async () => {
    const ctx = env.authenticatedContext('uid', { email: allowedEmail, email_verified: true });
    const ref = ctx.storage().ref('clients/ralph_lauren/apps/video-cutdown/outputs/o1.mp4');
    await expect(ref.getDownloadURL()).resolves.toBeDefined();
  });
});
```

(`allowedEmail` + `deniedEmail` already defined at the top of each test file.)

- [ ] **Step 2: Run rules tests to verify they pass**

```bash
npm run test:rules
```

Expected: all green. (The rules don't change — these tests verify the existing rules continue to permit the new modular paths.)

- [ ] **Step 3: Commit**

```bash
git add tests/rules/firestore.rules.test.ts tests/rules/storage.rules.test.ts
git commit -m "test(rules): cover clients/{slug}/apps/video-cutdown/ paths"
```

### Task A2b: Add Firestore composite index for Q17 orphan query

`renderVideoCutdownBatch` (Q17) runs `outputs where batchId == X && status == 'rendering'`. That's a two-field equality query; Firestore needs a composite index to serve it without scanning. Add the index declaration so deploys include it.

**Files:**
- Modify: `firestore.indexes.json` (create if absent — `firebase.json` already references `firestore.rules`; index file is conventional)
- Modify: `firebase.json` to register the indexes file

- [ ] **Step 1: Create or extend `firestore.indexes.json`**

```json
{
  "indexes": [
    {
      "collectionGroup": "outputs",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "batchId", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "outputs",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "completedAt", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

(The second index covers the Q18 Recent Renders widget: `status == 'complete' order by completedAt desc`.)

- [ ] **Step 2: Register the indexes file in `firebase.json`**

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  ...
}
```

- [ ] **Step 3: Deploy + verify**

```bash
firebase deploy --only firestore:indexes
```

Expected: indexes report as `READY` in the Firebase console (build can take a few minutes on first creation; subsequent deploys are no-ops if unchanged).

- [ ] **Step 4: Commit**

```bash
git add firestore.indexes.json firebase.json
git commit -m "feat(firestore): add composite indexes for video-cutdown orphan + Recent Renders queries"
```

### Task A3: Extend BatchRecord status + add video fields

**Files:**
- Modify: `src/services/batches.ts`
- Create: `src/apps/video-cutdown/types.ts`

- [ ] **Step 1: Create video-cutdown types module**

Write `src/apps/video-cutdown/types.ts` with the full contents from the "Types added" section above.

- [ ] **Step 2: Extend BatchRecord**

In `src/services/batches.ts`, locate the existing `BatchRecord` interface. Modify the `status` union to add `'analyzing'` and `'awaiting-approval'`. Add the three new optional fields after the existing optionals:

```ts
import type {
  VideoCutdownAnalysis,
  VideoCutdownSelection,
} from '../apps/video-cutdown/types';

// ... inside BatchRecord interface, after existing optional fields:
  sourceVideo?: {
    sourceKey: string;
    storageRef: string;
    durationSec: number;
    sizeBytes: number;
    mime: string;
    origin: 'upload' | 'feed';
    originalUrl?: string;
  };
  videoAnalysis?: VideoCutdownAnalysis;
  videoSelections?: VideoCutdownSelection[];
```

- [ ] **Step 3: Verify template-builder + ad-resizing reads handle new statuses**

Grep for every read site:

```bash
grep -rn "BatchRecord\|status:.*completed\|status.*'pending'\|status.*'processing'" src/services src/apps src/pages | grep -v __tests__
```

For each match that switches/branches on `status`, ensure the new `'analyzing'` and `'awaiting-approval'` values fall into the "in-progress" branch (NOT into "completed" or "failed"). Most commonly the predicate is `status !== 'completed' && status !== 'failed'`; that's already inclusive. The Active Batch Jobs widget in `src/services/batches.ts` `listActiveBatchesForClient` should already be a `where status in [...]` query — extend the array.

If you find any `switch (status) { case 'pending': ... case 'processing': ... default: ... }` exhaustiveness check, add the two new cases mapping to the same branch as `'processing'`.

- [ ] **Step 4: Update listActiveBatchesForClient if needed**

In `src/services/batches.ts`, find `listActiveBatchesForClient` and update the in-clause:

```ts
where('status', 'in', ['pending', 'analyzing', 'awaiting-approval', 'processing'])
```

(If the function uses `!= 'completed'` semantics, no change needed.)

- [ ] **Step 5: Run typecheck + relevant tests**

```bash
npm run build
npm run test -- src/services
```

Expected: typecheck passes, batch tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/services/batches.ts src/apps/video-cutdown/types.ts
git commit -m "feat(batches): extend BatchRecord with analyzing/awaiting-approval statuses and video fields"
```

### Task A4: Create `functions/src/_shared/` and relocate shared primitives

Per Q15. Move ssrf, errorClassifier, paths (new), timeToSeconds (extract) into a single shared package consumed by both `resize/` and `videoCutdown/`.

**Files:**
- Create: `functions/src/_shared/paths.ts`
- Create: `functions/src/_shared/paths.test.ts`
- Create: `functions/src/_shared/timeToSeconds.ts`
- Create: `functions/src/_shared/timeToSeconds.test.ts`
- Move: `functions/src/resize/ssrf.ts` → `functions/src/_shared/ssrf.ts`
- Move: `functions/src/resize/ssrf.test.ts` → `functions/src/_shared/ssrf.test.ts`
- Move: `functions/src/resize/errorClassifier.ts` → `functions/src/_shared/errorClassifier.ts`
- Move: `functions/src/resize/errorClassifier.test.ts` → `functions/src/_shared/errorClassifier.test.ts`
- Modify: `functions/src/resize/index.ts` — re-export from `_shared/` for backwards-compat
- Modify: `functions/src/resize/runOutpaintBatch.ts` — update imports
- Modify: `functions/src/resize/storage.ts` — update imports

- [ ] **Step 1: Move ssrf + errorClassifier (verbatim file moves)**

```bash
git mv functions/src/resize/ssrf.ts functions/src/_shared/ssrf.ts
git mv functions/src/resize/ssrf.test.ts functions/src/_shared/ssrf.test.ts
git mv functions/src/resize/errorClassifier.ts functions/src/_shared/errorClassifier.ts
git mv functions/src/resize/errorClassifier.test.ts functions/src/_shared/errorClassifier.test.ts
```

- [ ] **Step 2: Update `functions/src/resize/index.ts` to re-export from `_shared/`**

Existing exports of `ssrf` + `errorClassifier` keep working for callers outside the package:

```ts
// functions/src/resize/index.ts
export * from "./pipeline";
export * from "../_shared/errorClassifier";
export * from "../_shared/ssrf";
export * from "./storage";
export * from "./runOutpaintBatch";
// ... rest unchanged
```

- [ ] **Step 3: Update internal resize imports**

In `functions/src/resize/runOutpaintBatch.ts` and `functions/src/resize/storage.ts`, find imports of `'./ssrf'` and `'./errorClassifier'`. Change to `'../_shared/ssrf'` and `'../_shared/errorClassifier'`.

- [ ] **Step 4: Write `_shared/paths.ts`**

Server-side mirror of the client `src/platform/firebase/paths.ts`. Only the subset functions/ actually uses. Keeps clean from `clientAssetHouse` legacy.

```ts
// functions/src/_shared/paths.ts
/**
 * Server-side path helpers. Mirrors src/platform/firebase/paths.ts for the
 * subset of paths Cloud Functions write to. The paths.test.ts file asserts
 * the strings match the client helper so the two stay in sync.
 *
 * Adding a new path here without adding the matching client helper (or
 * vice versa) is a drift bug — the test will catch it.
 */

const root = (slug: string) => `clients/${slug}`;

export const paths = {
  // Generic (per-app)
  appRoot: (slug: string, appId: string) => `${root(slug)}/apps/${appId}`,
  batch: (slug: string, appId: string, batchId: string) =>
    `${root(slug)}/apps/${appId}/batches/${batchId}`,

  // Resize / ad-resizing
  outpaintOutput: (slug: string, outputId: string) =>
    `${root(slug)}/apps/ad-resizing/outputs/${outputId}`,
  outpaintOutputs: (slug: string) =>
    `${root(slug)}/apps/ad-resizing/outputs`,
  outpaintSources: (slug: string) =>
    `${root(slug)}/apps/ad-resizing/sources`,

  // Video-cutdown
  videoCutdownSources: (slug: string) =>
    `${root(slug)}/apps/video-cutdown/sources`,
  videoCutdownSource: (slug: string, sourceKey: string) =>
    `${root(slug)}/apps/video-cutdown/sources/${sourceKey}`,
  videoCutdownBatch: (slug: string, batchId: string) =>
    `${root(slug)}/apps/video-cutdown/batches/${batchId}`,
  videoCutdownBatches: (slug: string) =>
    `${root(slug)}/apps/video-cutdown/batches`,
  videoCutdownOutput: (slug: string, outputId: string) =>
    `${root(slug)}/apps/video-cutdown/outputs/${outputId}`,
  videoCutdownOutputs: (slug: string) =>
    `${root(slug)}/apps/video-cutdown/outputs`,
} as const;
```

- [ ] **Step 5: Write `_shared/paths.test.ts`**

```ts
// functions/src/_shared/paths.test.ts
import { describe, it, expect } from 'vitest';
import { paths } from './paths';

describe('shared paths', () => {
  it('appRoot', () => {
    expect(paths.appRoot('rl', 'video-cutdown')).toBe('clients/rl/apps/video-cutdown');
  });
  it('videoCutdownBatch', () => {
    expect(paths.videoCutdownBatch('rl', 'b1')).toBe('clients/rl/apps/video-cutdown/batches/b1');
  });
  it('videoCutdownOutput', () => {
    expect(paths.videoCutdownOutput('rl', 'o1')).toBe('clients/rl/apps/video-cutdown/outputs/o1');
  });
  it('videoCutdownSource', () => {
    expect(paths.videoCutdownSource('rl', 'abc123')).toBe('clients/rl/apps/video-cutdown/sources/abc123');
  });
  it('outpaintOutput', () => {
    expect(paths.outpaintOutput('rl', 'o1')).toBe('clients/rl/apps/ad-resizing/outputs/o1');
  });
});
```

- [ ] **Step 6: Write `_shared/timeToSeconds.ts` + test**

```ts
// functions/src/_shared/timeToSeconds.ts
export function timeToSeconds(t: string | undefined): number {
  if (!t) return 0;
  const parts = String(t).trim().split(':').reverse().map((p) => {
    const n = parseFloat(p);
    return Number.isNaN(n) ? 0 : n;
  });
  return (parts[0] ?? 0) + (parts[1] ?? 0) * 60 + (parts[2] ?? 0) * 3600;
}
```

```ts
// functions/src/_shared/timeToSeconds.test.ts
import { describe, it, expect } from 'vitest';
import { timeToSeconds } from './timeToSeconds';
describe('timeToSeconds', () => {
  it('HH:MM:SS', () => expect(timeToSeconds('00:01:30')).toBe(90));
  it('MM:SS', () => expect(timeToSeconds('01:30')).toBe(90));
  it('SS', () => expect(timeToSeconds('90')).toBe(90));
  it('empty', () => expect(timeToSeconds('')).toBe(0));
  it('undefined', () => expect(timeToSeconds(undefined)).toBe(0));
  it('malformed', () => expect(timeToSeconds('abc')).toBe(0));
});
```

- [ ] **Step 7: Run shared tests + resize tests (regression check)**

```bash
cd functions && npm run build && npx vitest run src/_shared src/resize
```

Expected: all green; resize tests still pass through the indirection.

- [ ] **Step 8: Commit**

```bash
git add functions/src/_shared functions/src/resize
git commit -m "feat(functions/_shared): extract ssrf, errorClassifier, paths, timeToSeconds into shared package"
```

### Task A4b: Create `functions/src/videoCutdown/config.ts`

**Files:**
- Create: `functions/src/videoCutdown/config.ts`

- [ ] **Step 1: Write config.ts**

```ts
// functions/src/videoCutdown/config.ts
export const MAX_DURATION_SEC = 120;          // 2 minutes
export const MIN_DURATION_SEC = 6;
export const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024;   // 2 GiB

export const ALLOWED_MIMES = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
] as const;

export type AllowedMime = (typeof ALLOWED_MIMES)[number];

export function isAllowedMime(m: string | undefined): m is AllowedMime {
  return !!m && (ALLOWED_MIMES as readonly string[]).includes(m);
}

/**
 * FFmpeg renders are CPU + memory heavy. At 4GiB / 2 vCPU function size,
 * two concurrent x264 encodes at `-preset ultrafast` can OOM (each holds
 * ~500MB-1GB of internal buffers + the source bytes). The legacy
 * `functions/src/video.ts:80-155` deliberately serialized cuts in one
 * call (comment: "prevent OOM/CPU throttling").
 *
 * Plan-eng-review (Architecture finding P1): start serial. Raise this
 * env var to 2-4 only after observing memory headroom on prod jobs and
 * sizing the function up to 8GiB / 4 vCPU if needed.
 */
export const RENDER_CONCURRENCY =
  Number(process.env.MAX_RENDER_CONCURRENCY ?? 1);

export const DEFAULT_ANALYSIS_MODEL = 'gemini-3-pro-preview';

/** Hardcoded for v1; one of the platform output sizes from the legacy app. */
export const RENDER_OUTPUT_WIDTH = 720;
export const RENDER_OUTPUT_HEIGHT = 1280;
```

- [ ] **Step 2: Commit**

```bash
git add functions/src/videoCutdown/config.ts
git commit -m "feat(video-cutdown): add config constants (durations, mimes, concurrency, output dims)"
```

(SSRF is no longer copied — it lives in `_shared/` per Task A4. `videoCutdown/` callables and storage helpers will import via `'../_shared/ssrf'`.)

### Task A4c: Duplicate `VideoCutdownAnalysis`/`Segment`/`Selection`/`OutputDoc` into `functions/src/videoCutdown/types.ts`

Per plan-eng-review Architecture finding. `functions/tsconfig.json` has its own `rootDir`, so the cross-package import from `src/apps/video-cutdown/types` will not resolve. Duplicate the contract interfaces locally. They are small and stable — duplication is correct here (client/server are independently versionable for these wire types).

**Files:**
- Create: `functions/src/videoCutdown/types.ts`

- [ ] **Step 1: Write types.ts (copy from `src/apps/video-cutdown/types.ts`)**

```ts
// functions/src/videoCutdown/types.ts
//
// SERVER-SIDE duplicate of the wire-contract types in
// src/apps/video-cutdown/types.ts. functions/tsconfig.json cannot reach
// across the package boundary, so we duplicate. Keep these in sync by
// running the wire-contract test (see analyzeVideoCutdownBatch.test.ts —
// it asserts the shape of the analysis field).

export interface VideoCutdownSegment {
  start: string;
  end: string;
}

export interface VideoCutdownOption {
  id: number;
  reason: string;
  segments: VideoCutdownSegment[];
}

export interface VideoCutdownRecommendation {
  length: number;
  options: VideoCutdownOption[];
}

export interface VideoCutdownAnalysis {
  recommendations: VideoCutdownRecommendation[];
  model: string;
  analyzedAt: number;
  latencyMs: number;
}

export interface VideoCutdownSelection {
  length: number;
  optionId: number;
  segments: VideoCutdownSegment[];
}

export interface VideoCutdownOutputDoc {
  outputId: string;
  batchId: string;
  selection: VideoCutdownSelection;
  status: 'pending' | 'rendering' | 'complete' | 'error';
  storageRef?: string;
  errorCategory?: 'transient' | 'permanent';
  errorMessage?: string;
  durationSec?: number;
  sizeBytes?: number;
  createdAt: unknown;
  completedAt?: unknown;
}
```

- [ ] **Step 2: Commit**

```bash
git add functions/src/videoCutdown/types.ts
git commit -m "feat(video-cutdown/functions): duplicate wire-contract types locally"
```

### Task A5: Create functions/src/videoCutdown/videoCutdownErrors.ts

**Files:**
- Create: `functions/src/videoCutdown/videoCutdownErrors.ts`
- Create: `functions/src/videoCutdown/videoCutdownErrors.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// functions/src/videoCutdown/videoCutdownErrors.test.ts
import { describe, it, expect } from 'vitest';
import { classifyVideoCutdownError } from './videoCutdownErrors';

describe('classifyVideoCutdownError', () => {
  it('routes unsupported codec to permanent', () => {
    const r = classifyVideoCutdownError(new Error('Unsupported codec: hevc'));
    expect(r.category).toBe('permanent');
    expect(r.reason).toBe('unsupported_codec');
  });
  it('routes video_too_long to permanent', () => {
    const r = classifyVideoCutdownError(new Error('Source duration 180s exceeds max 120s'));
    expect(r.category).toBe('permanent');
    expect(r.reason).toBe('video_too_long');
  });
  it('routes video_too_short to permanent', () => {
    const r = classifyVideoCutdownError(new Error('Source duration 3s under min 6s'));
    expect(r.category).toBe('permanent');
    expect(r.reason).toBe('video_too_short');
  });
  it('routes invalid_segment_range to permanent', () => {
    const r = classifyVideoCutdownError(new Error('Segment end 5 before start 10'));
    expect(r.category).toBe('permanent');
    expect(r.reason).toBe('invalid_segment_range');
  });
  it('delegates to base classifier for 429', () => {
    const e: any = new Error('rate limited');
    e.status = 429;
    expect(classifyVideoCutdownError(e).category).toBe('transient');
  });
  it('delegates to base classifier for ssrf rejection', () => {
    expect(classifyVideoCutdownError(new Error('ssrf: private address')).category).toBe('permanent');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd functions && npx vitest run src/videoCutdown/videoCutdownErrors.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// functions/src/videoCutdown/videoCutdownErrors.ts
import { classifyError, type ClassifiedError } from '../_shared/errorClassifier';

interface VideoRule {
  reason: string;
  test: (msg: string) => boolean;
}

const VIDEO_PERMANENT_RULES: VideoRule[] = [
  { reason: 'unsupported_codec', test: (m) => /unsupported codec|invalid codec/i.test(m) },
  { reason: 'video_too_long', test: (m) => /exceeds max|too long|duration.*exceeds/i.test(m) },
  { reason: 'video_too_short', test: (m) => /under min|too short|duration.*under/i.test(m) },
  { reason: 'invalid_segment_range', test: (m) => /segment end.*before start|invalid segment/i.test(m) },
];

export function classifyVideoCutdownError(err: unknown): ClassifiedError {
  const msg = err instanceof Error ? err.message : String(err);
  for (const rule of VIDEO_PERMANENT_RULES) {
    if (rule.test(msg)) {
      return { category: 'permanent', message: msg, reason: rule.reason };
    }
  }
  return classifyError(err);
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
cd functions && npx vitest run src/videoCutdown/videoCutdownErrors.test.ts
```
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add functions/src/videoCutdown/videoCutdownErrors.ts functions/src/videoCutdown/videoCutdownErrors.test.ts
git commit -m "feat(video-cutdown): add error classifier extending resize classifier"
```

### Task A6: Create functions/src/videoCutdown/storage.ts

**Files:**
- Create: `functions/src/videoCutdown/storage.ts`
- Create: `functions/src/videoCutdown/storage.test.ts`

Three responsibilities: `stageSourceIfMissing` (feed-URL ingest, SSRF-guarded fetch → Storage write), `probeVideo` (ffprobe → duration + mime + dims), `uploadOutput` (FFmpeg result → Storage).

- [ ] **Step 1: Write storage.ts**

```ts
// functions/src/videoCutdown/storage.ts
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import axios from 'axios';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import ffprobePath from 'ffprobe-static';
import { assertSafeUrl } from '../_shared/ssrf';
import {
  MAX_FILE_BYTES,
  MAX_DURATION_SEC,
  MIN_DURATION_SEC,
  isAllowedMime,
  type AllowedMime,
} from './config';

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);
if (ffprobePath?.path) ffmpeg.setFfprobePath(ffprobePath.path);

const VIDEO_CUTDOWN_PREFIX = (slug: string) =>
  `clients/${slug}/apps/video-cutdown`;

function sha256Hex16(input: string | Buffer): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function extFromMime(m: AllowedMime): 'mp4' | 'mov' | 'webm' {
  if (m === 'video/mp4') return 'mp4';
  if (m === 'video/quicktime') return 'mov';
  return 'webm';
}

export interface ProbedVideo {
  durationSec: number;
  width: number;
  height: number;
  mime: AllowedMime;
}

export async function probeVideo(localPath: string): Promise<ProbedVideo> {
  const meta = await new Promise<ffmpeg.FfprobeData>((resolve, reject) => {
    ffmpeg.ffprobe(localPath, (err, data) => (err ? reject(err) : resolve(data)));
  });
  const v = meta.streams.find((s) => s.codec_type === 'video');
  if (!v) throw new Error('Unsupported codec: no video stream');
  const durationSec = Number(meta.format.duration ?? 0);
  if (durationSec < MIN_DURATION_SEC) {
    throw new Error(`Source duration ${durationSec}s under min ${MIN_DURATION_SEC}s`);
  }
  if (durationSec > MAX_DURATION_SEC) {
    throw new Error(`Source duration ${durationSec}s exceeds max ${MAX_DURATION_SEC}s`);
  }
  const mime = mimeFromFormat(meta.format.format_name ?? '');
  return {
    durationSec,
    width: Number(v.width ?? 0),
    height: Number(v.height ?? 0),
    mime,
  };
}

function mimeFromFormat(fmt: string): AllowedMime {
  if (/mp4|m4v/.test(fmt)) return 'video/mp4';
  if (/mov|quicktime/.test(fmt)) return 'video/quicktime';
  if (/webm/.test(fmt)) return 'video/webm';
  throw new Error(`Unsupported codec: ${fmt}`);
}

export interface StageResult {
  sourceKey: string;
  storageRef: string;
  localPath: string;          // /tmp path for FFmpeg to read; caller cleans up
  sizeBytes: number;
  probed: ProbedVideo;
}

/**
 * Feed-URL ingest. Computes sourceKey = sha256(url), checks Storage for
 * existing object, downloads + writes + probes only on miss. Always returns
 * a local /tmp path so the render callable can hand it to FFmpeg without
 * re-downloading.
 */
export async function stageSourceFromUrl(
  clientSlug: string,
  url: string,
): Promise<StageResult> {
  assertSafeUrl(url);
  const sourceKey = sha256Hex16(url);
  const bucket = admin.storage().bucket();

  // List with prefix so we don't have to know the extension upfront.
  const prefix = `${VIDEO_CUTDOWN_PREFIX(clientSlug)}/sources/${sourceKey}.`;
  const [existing] = await bucket.getFiles({ prefix, maxResults: 1 });
  const localPath = path.join(os.tmpdir(), `vc_${sourceKey}_${Date.now()}.tmp`);

  if (existing[0]) {
    await existing[0].download({ destination: localPath });
    const sizeBytes = fs.statSync(localPath).size;
    const probed = await probeVideo(localPath);
    return {
      sourceKey,
      storageRef: `gs://${bucket.name}/${existing[0].name}`,
      localPath,
      sizeBytes,
      probed,
    };
  }

  const resp = await axios.get<NodeJS.ReadableStream>(url, {
    responseType: 'stream',
    maxContentLength: MAX_FILE_BYTES,
    maxBodyLength: MAX_FILE_BYTES,
  });
  await new Promise<void>((resolve, reject) => {
    const writer = fs.createWriteStream(localPath);
    resp.data.pipe(writer);
    writer.on('finish', () => resolve());
    writer.on('error', reject);
  });
  const sizeBytes = fs.statSync(localPath).size;
  if (sizeBytes > MAX_FILE_BYTES) {
    fs.unlinkSync(localPath);
    throw new Error(`Source size ${sizeBytes} exceeds max ${MAX_FILE_BYTES}`);
  }
  const probed = await probeVideo(localPath);
  if (!isAllowedMime(probed.mime)) {
    fs.unlinkSync(localPath);
    throw new Error(`Unsupported codec: ${probed.mime}`);
  }

  const ext = extFromMime(probed.mime);
  const destination = `${VIDEO_CUTDOWN_PREFIX(clientSlug)}/sources/${sourceKey}.${ext}`;
  await bucket.upload(localPath, {
    destination,
    contentType: probed.mime,
  });
  return {
    sourceKey,
    storageRef: `gs://${bucket.name}/${destination}`,
    localPath,
    sizeBytes,
    probed,
  };
}

/**
 * Browser-uploaded source. The client has already written bytes to
 * `clients/{slug}/apps/video-cutdown/sources/{sourceKey}.{ext}` directly
 * (callable-mediated upload would require streaming a 2GB file through a
 * Cloud Function, which is wasteful). The render callable downloads to
 * /tmp and probes here.
 */
export async function downloadStagedSource(
  storageRef: string,
): Promise<{ localPath: string; probed: ProbedVideo; sizeBytes: number }> {
  const bucket = admin.storage().bucket();
  const objectPath = storageRef.replace(/^gs:\/\/[^/]+\//, '');
  const localPath = path.join(os.tmpdir(), `vc_dl_${Date.now()}.tmp`);
  await bucket.file(objectPath).download({ destination: localPath });
  const sizeBytes = fs.statSync(localPath).size;
  const probed = await probeVideo(localPath);
  return { localPath, probed, sizeBytes };
}

export async function uploadOutput(
  clientSlug: string,
  outputId: string,
  localPath: string,
): Promise<string> {
  const bucket = admin.storage().bucket();
  const destination = `${VIDEO_CUTDOWN_PREFIX(clientSlug)}/outputs/${outputId}.mp4`;
  await bucket.upload(localPath, {
    destination,
    contentType: 'video/mp4',
  });
  return `gs://${bucket.name}/${destination}`;
}
```

- [ ] **Step 2: Add ffprobe-static to functions/package.json**

```bash
cd functions && npm install --save ffprobe-static
```

- [ ] **Step 3: Write storage.test.ts**

```ts
// functions/src/videoCutdown/storage.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import { Readable } from 'stream';

const writableEnd = vi.fn();
const uploadMock = vi.fn().mockResolvedValue([]);
const downloadMock = vi.fn().mockResolvedValue(undefined);
const getFilesMock = vi.fn();
const fileMock = vi.fn(() => ({ download: downloadMock }));
const bucketMock = {
  name: 'test-bucket',
  getFiles: getFilesMock,
  upload: uploadMock,
  file: fileMock,
};

vi.mock('firebase-admin', () => ({
  storage: vi.fn(() => ({ bucket: () => bucketMock })),
}));
vi.mock('axios', () => ({
  default: { get: vi.fn() },
}));
vi.mock('fs', () => ({
  createWriteStream: vi.fn(() => {
    const writer: any = { on: (_evt: string, cb: any) => { if (_evt === 'finish') queueMicrotask(cb); return writer; }, end: writableEnd };
    return writer;
  }),
  statSync: vi.fn(() => ({ size: 1000 })),
  unlinkSync: vi.fn(),
  readFileSync: vi.fn(() => Buffer.from('x')),
  existsSync: vi.fn(() => true),
}));
const ffprobeMock = vi.fn();
vi.mock('fluent-ffmpeg', () => {
  const m: any = vi.fn();
  m.setFfmpegPath = vi.fn();
  m.setFfprobePath = vi.fn();
  m.ffprobe = ffprobeMock;
  return { default: m };
});
vi.mock('ffprobe-static', () => ({ default: { path: '/usr/local/bin/ffprobe' } }));

import axios from 'axios';
import { stageSourceFromUrl, downloadStagedSource } from './storage';

function mockProbe(durationSec: number, fmt = 'mov,mp4,m4a,3gp,3g2,mj2') {
  ffprobeMock.mockImplementation((_p: string, cb: any) => {
    cb(null, {
      streams: [{ codec_type: 'video', width: 720, height: 1280 }],
      format: { duration: durationSec, format_name: fmt },
    });
  });
}

describe('stageSourceFromUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFilesMock.mockResolvedValue([[]]);
    (axios.get as any).mockResolvedValue({ data: Readable.from(Buffer.from('x')) });
  });

  it('rejects non-https URLs via SSRF guard', async () => {
    await expect(
      stageSourceFromUrl('ralph_lauren', 'http://example.com/v.mp4'),
    ).rejects.toThrow(/ssrf|not https/i);
  });

  it('rejects videos longer than 120s with video_too_long', async () => {
    mockProbe(180);
    await expect(
      stageSourceFromUrl('ralph_lauren', 'https://example.com/long.mp4'),
    ).rejects.toThrow(/exceeds max 120s/i);
  });

  it('rejects videos shorter than 6s with video_too_short', async () => {
    mockProbe(3);
    await expect(
      stageSourceFromUrl('ralph_lauren', 'https://example.com/short.mp4'),
    ).rejects.toThrow(/under min 6s/i);
  });

  it('happy path: downloads, probes, uploads to scoped Storage path', async () => {
    mockProbe(30);
    const r = await stageSourceFromUrl('ralph_lauren', 'https://example.com/v.mp4');
    expect(r.sourceKey).toHaveLength(16);
    expect(r.probed.durationSec).toBe(30);
    expect(uploadMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        destination: expect.stringMatching(/^clients\/ralph_lauren\/apps\/video-cutdown\/sources\/[0-9a-f]{16}\.mp4$/),
        contentType: 'video/mp4',
      }),
    );
    expect(r.storageRef).toMatch(/^gs:\/\/test-bucket\/clients\/ralph_lauren\/apps\/video-cutdown\/sources\/[0-9a-f]{16}\.mp4$/);
  });

  it('cache hit: skips download and upload, returns existing storageRef', async () => {
    const existingFile = { name: 'clients/ralph_lauren/apps/video-cutdown/sources/abc.mp4', download: downloadMock };
    getFilesMock.mockResolvedValueOnce([[existingFile]]);
    mockProbe(30);
    const r = await stageSourceFromUrl('ralph_lauren', 'https://example.com/v.mp4');
    expect(axios.get).not.toHaveBeenCalled();
    expect(uploadMock).not.toHaveBeenCalled();
    expect(downloadMock).toHaveBeenCalled();
    expect(r.storageRef).toBe('gs://test-bucket/clients/ralph_lauren/apps/video-cutdown/sources/abc.mp4');
  });
});

describe('downloadStagedSource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('downloads object to /tmp, probes, returns metadata', async () => {
    mockProbe(45);
    const r = await downloadStagedSource('gs://test-bucket/clients/ralph_lauren/apps/video-cutdown/sources/abc.mp4');
    expect(fileMock).toHaveBeenCalledWith('clients/ralph_lauren/apps/video-cutdown/sources/abc.mp4');
    expect(downloadMock).toHaveBeenCalledWith(expect.objectContaining({ destination: expect.stringMatching(/vc_dl_\d+\.tmp$/) }));
    expect(r.probed.durationSec).toBe(45);
    expect(r.sizeBytes).toBe(1000);
  });

  it('propagates probe failure (unsupported codec) verbatim', async () => {
    ffprobeMock.mockImplementation((_p: string, cb: any) => cb(new Error('Unsupported codec: hevc')));
    await expect(
      downloadStagedSource('gs://test-bucket/x'),
    ).rejects.toThrow(/unsupported codec/i);
  });
});
```

- [ ] **Step 4: Run tests**

```bash
cd functions && npx vitest run src/videoCutdown/storage.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add functions/src/videoCutdown/storage.ts functions/src/videoCutdown/storage.test.ts functions/package.json functions/package-lock.json
git commit -m "feat(video-cutdown): add Storage helpers (stage, download, upload, probe)"
```

### Task A7: Create functions/src/videoCutdown/analyze.ts

Ports the Gemini analysis logic out of `functions/src/ai.ts`, parametrized.

**Files:**
- Create: `functions/src/videoCutdown/analyze.ts`
- Create: `functions/src/videoCutdown/analyze.test.ts`

- [ ] **Step 1: Write analyze.ts**

```ts
// functions/src/videoCutdown/analyze.ts
import * as fs from 'fs';
import {
  GoogleGenerativeAI,
  GenerationConfig,
  SchemaType,
} from '@google/generative-ai';
import type {
  VideoCutdownAnalysis,
  VideoCutdownRecommendation,
} from './types';
import { DEFAULT_ANALYSIS_MODEL } from './config';

const SYSTEM_INSTRUCTION = `You are a narrative-driven video editor. Your priority is to ensure the audio track makes complete sense.

CRITICAL: If the video contains speech (voiceover, dialogue, or interview), the audio track is the MASTER TRACK. All cuts MUST occur during natural silences or the end of a complete thought/sentence. NEVER cut mid-word, mid-phrase, or while someone is visibly still speaking.

If there is no speech, prioritize visual impact and rhythmic energy.`;

const RESPONSE_SCHEMA: GenerationConfig['responseSchema'] = {
  type: SchemaType.OBJECT,
  properties: {
    recommendations: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          length: { type: SchemaType.NUMBER },
          options: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                id: { type: SchemaType.NUMBER },
                reason: { type: SchemaType.STRING },
                segments: {
                  type: SchemaType.ARRAY,
                  items: {
                    type: SchemaType.OBJECT,
                    properties: {
                      start: { type: SchemaType.STRING },
                      end: { type: SchemaType.STRING },
                    },
                    required: ['start', 'end'],
                  },
                },
              },
              required: ['id', 'reason', 'segments'],
            },
          },
        },
        required: ['length', 'options'],
      },
    },
  },
  required: ['recommendations'],
};

const PROMPT_TEMPLATE = (targetLengths: number[]) => `Your mission is to create exactly 3 DISTINCT cutdown options for EACH of these target durations: ${targetLengths.join(', ')} seconds.

═══════════════════════════════════════
🚨 AUDIO-FIRST EDITING RULES 🚨
═══════════════════════════════════════
- Watch/Listen to the whole video. If there is a voiceover or dialogue, the narrative MUST be the driver.
- DO NOT "lead the witness" with forced structures like hooks or montages. Simply find the 3 most compelling ways to tell a short story using this footage.
- Each segment's start and end times MUST align with natural pauses in speech. It is better to have a slightly shorter clip than to cut someone off mid-sentence.
- If no speech is present, focus on the visual motion and musical beats.

═══════════════════════════════════════
STITCHING RULES
═══════════════════════════════════════
- A cutdown is a sequence of 1-5 segments pulled from the video.
- Jump around to find the best moments. Do not just take one long 30s chunk unless it is a perfect performance.
- 🚨 FOR 6s: Often a single continuous 6s shot is much better than multiple cuts, especially if it contains a complete and compelling thought.
- The SUM of the segments must equal EXACTLY the target length.

RETURN VALID JSON following requested schema.`;

export interface AnalyzeInput {
  apiKey: string;
  localVideoPath: string;
  mime: string;
  targetLengths: number[];
  model?: string;
}

export async function analyze(
  input: AnalyzeInput,
): Promise<VideoCutdownAnalysis> {
  const started = Date.now();
  const genAI = new GoogleGenerativeAI(input.apiKey);
  const modelName = input.model ?? DEFAULT_ANALYSIS_MODEL;
  const videoBase64 = fs.readFileSync(input.localVideoPath).toString('base64');
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: SYSTEM_INSTRUCTION,
  });

  const generationConfig: GenerationConfig = {
    temperature: 0.7,
    topP: 0.95,
    topK: 64,
    maxOutputTokens: 8192,
    responseMimeType: 'application/json',
    responseSchema: RESPONSE_SCHEMA,
  };

  let result: Awaited<ReturnType<typeof model.generateContent>> | undefined;
  let lastErr: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      result = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: input.mime, data: videoBase64 } },
              { text: PROMPT_TEMPLATE(input.targetLengths) },
            ],
          },
        ],
        generationConfig,
      });
      break;
    } catch (err: any) {
      lastErr = err;
      const status = err.status ?? err.response?.status;
      if ((status === 429 || status === 503) && i < 2) {
        await new Promise((r) => setTimeout(r, (i + 1) * 5000));
        continue;
      }
      throw err;
    }
  }
  if (!result) throw lastErr;

  const text = result.response.text().trim();
  const cleaned = text
    .replace(/^```json/, '')
    .replace(/^```/, '')
    .replace(/```$/, '')
    .trim();
  const parsed = JSON.parse(cleaned) as {
    recommendations: VideoCutdownRecommendation[];
  };
  return {
    recommendations: parsed.recommendations,
    model: modelName,
    analyzedAt: Date.now(),
    latencyMs: Date.now() - started,
  };
}
```

- [ ] **Step 2: Write analyze.test.ts**

```ts
// functions/src/videoCutdown/analyze.test.ts
import { describe, it, expect, vi } from 'vitest';

const generateContentMock = vi.fn();
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: () => ({ generateContent: generateContentMock }),
  })),
  SchemaType: { OBJECT: 'object', ARRAY: 'array', NUMBER: 'number', STRING: 'number' },
}));
vi.mock('fs', () => ({ readFileSync: vi.fn().mockReturnValue(Buffer.from('x')) }));

import { analyze } from './analyze';

describe('analyze', () => {
  it('parses valid Gemini response into VideoCutdownAnalysis', async () => {
    generateContentMock.mockResolvedValue({
      response: {
        text: () =>
          JSON.stringify({
            recommendations: [
              { length: 6, options: [{ id: 1, reason: 'r', segments: [{ start: '0', end: '6' }] }] },
            ],
          }),
      },
    });
    const r = await analyze({
      apiKey: 'k',
      localVideoPath: '/tmp/v.mp4',
      mime: 'video/mp4',
      targetLengths: [6],
    });
    expect(r.recommendations).toHaveLength(1);
    expect(r.recommendations[0]!.length).toBe(6);
    expect(r.model).toBe('gemini-3-pro-preview');
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('retries on 429 then succeeds', async () => {
    const e: any = new Error('rate limited'); e.status = 429;
    generateContentMock
      .mockRejectedValueOnce(e)
      .mockResolvedValueOnce({ response: { text: () => '{"recommendations":[]}' } });
    const r = await analyze({
      apiKey: 'k', localVideoPath: '/tmp/v.mp4', mime: 'video/mp4', targetLengths: [6],
    });
    expect(generateContentMock).toHaveBeenCalledTimes(2);
    expect(r.recommendations).toEqual([]);
  }, 20000);

  it('rethrows on non-retryable error', async () => {
    const e: any = new Error('bad prompt'); e.status = 400;
    generateContentMock.mockRejectedValue(e);
    await expect(analyze({
      apiKey: 'k', localVideoPath: '/tmp/v.mp4', mime: 'video/mp4', targetLengths: [6],
    })).rejects.toThrow('bad prompt');
  });
});
```

- [ ] **Step 3: Run analyze tests**

```bash
cd functions && npx vitest run src/videoCutdown/analyze.test.ts
```

Expected: 3/3 pass.

- [ ] **Step 4: Commit**

```bash
git add functions/src/videoCutdown/analyze.ts functions/src/videoCutdown/analyze.test.ts
git commit -m "feat(video-cutdown): port Gemini analyze logic, parametric over input + tests"
```

### Task A8: Create functions/src/videoCutdown/render.ts

Ports the FFmpeg pipeline out of `functions/src/video.ts`, parametrized over (source path, single cut segments, target dims, output path).

**Files:**
- Create: `functions/src/videoCutdown/render.ts`
- Create: `functions/src/videoCutdown/render.test.ts`

- [ ] **Step 1: Write render.ts**

```ts
// functions/src/videoCutdown/render.ts
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import * as path from 'path';
import * as os from 'os';
import type { VideoCutdownSegment } from './types';
import { timeToSeconds } from '../_shared/timeToSeconds';
import {
  RENDER_OUTPUT_WIDTH,
  RENDER_OUTPUT_HEIGHT,
} from './config';

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

export interface RenderInput {
  sourceLocalPath: string;
  outputId: string;
  segments: VideoCutdownSegment[];
  targetWidth?: number;
  targetHeight?: number;
}

export interface RenderResult {
  outputLocalPath: string;
  durationSec: number;
}

export async function render(input: RenderInput): Promise<RenderResult> {
  const targetWidth = input.targetWidth ?? RENDER_OUTPUT_WIDTH;
  const targetHeight = input.targetHeight ?? RENDER_OUTPUT_HEIGHT;
  const outputLocalPath = path.join(os.tmpdir(), `vc_out_${input.outputId}.mp4`);

  let filter = '';
  let vInputs = '';
  let aInputs = '';
  let validCount = 0;
  let totalDuration = 0;

  for (let i = 0; i < input.segments.length; i++) {
    const seg = input.segments[i]!;
    const start = Math.max(0, timeToSeconds(seg.start));
    const end = timeToSeconds(seg.end);
    if (end <= start) {
      throw new Error(`Segment end ${end} before start ${start}`);
    }
    const duration = end - start;
    const fadeLen = Math.min(0.05, duration / 2);
    const prev = input.segments[i - 1];
    const next = input.segments[i + 1];
    const prevContiguous = prev && Math.abs(start - timeToSeconds(prev.end)) < 0.05;
    const nextContiguous = next && Math.abs(timeToSeconds(next.start) - end) < 0.05;
    const inFade = i === 0 || !prevContiguous ? `,afade=t=in:st=0:d=${fadeLen}` : '';
    const outFade = nextContiguous ? '' : `,afade=t=out:st=${Math.max(0, duration - fadeLen)}:d=${fadeLen}`;

    filter += `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,fps=30,scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},setsar=1,format=yuv420p[v${validCount}]; `;
    vInputs += `[v${validCount}]`;
    filter += `[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS${inFade}${outFade},aresample=44100,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a${validCount}]; `;
    aInputs += `[a${validCount}]`;
    validCount++;
    totalDuration += duration;
  }

  if (validCount === 0) {
    throw new Error('Invalid segment range: no valid segments');
  }

  filter += `${vInputs}concat=n=${validCount}:v=1:a=0[v]; `;
  filter += `${aInputs}concat=n=${validCount}:v=0:a=1[a]`;

  await new Promise<void>((resolve, reject) => {
    ffmpeg(input.sourceLocalPath)
      .complexFilter(filter)
      .map('[v]')
      .map('[a]')
      .outputOptions([
        '-c:v libx264',
        '-preset ultrafast',
        '-crf 23',
        '-c:a aac',
        '-b:a 128k',
        '-movflags +faststart',
      ])
      .output(outputLocalPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });

  return { outputLocalPath, durationSec: totalDuration };
}
```

- [ ] **Step 2: Write render.test.ts**

```ts
// functions/src/videoCutdown/render.test.ts
import { describe, it, expect, vi } from 'vitest';

const ffmpegInstance: any = {
  complexFilter: vi.fn().mockReturnThis(),
  map: vi.fn().mockReturnThis(),
  outputOptions: vi.fn().mockReturnThis(),
  output: vi.fn().mockReturnThis(),
  on: vi.fn().mockImplementation(function (this: any, evt: string, cb: (...args: any[]) => void) {
    if (evt === 'end') setTimeout(() => cb(), 0);
    return this;
  }),
  run: vi.fn(),
};
const ffmpegMock: any = vi.fn().mockReturnValue(ffmpegInstance);
ffmpegMock.setFfmpegPath = vi.fn();
vi.mock('fluent-ffmpeg', () => ({ default: ffmpegMock }));
vi.mock('ffmpeg-static', () => ({ default: '/usr/local/bin/ffmpeg' }));

import { render } from './render';
// timeToSeconds tests live in _shared/timeToSeconds.test.ts (Task A4).

describe('render', () => {
  it('throws on empty segments', async () => {
    await expect(
      render({ sourceLocalPath: '/tmp/v.mp4', outputId: 'o1', segments: [] }),
    ).rejects.toThrow(/invalid segment/i);
  });

  it('throws on end-before-start', async () => {
    await expect(
      render({
        sourceLocalPath: '/tmp/v.mp4',
        outputId: 'o1',
        segments: [{ start: '10', end: '5' }],
      }),
    ).rejects.toThrow(/Segment end.*before start/i);
  });

  it('builds filter and returns output path on happy path', async () => {
    const r = await render({
      sourceLocalPath: '/tmp/v.mp4',
      outputId: 'o1',
      segments: [{ start: '0', end: '3' }, { start: '5', end: '8' }],
    });
    expect(r.outputLocalPath).toMatch(/vc_out_o1\.mp4$/);
    expect(r.durationSec).toBe(6);
    expect(ffmpegInstance.complexFilter).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run render tests**

```bash
cd functions && npx vitest run src/videoCutdown/render.test.ts
```

Expected: 7/7 pass.

- [ ] **Step 4: Commit**

```bash
git add functions/src/videoCutdown/render.ts functions/src/videoCutdown/render.test.ts
git commit -m "feat(video-cutdown): port FFmpeg render pipeline, parametric over single cut + tests"
```

### Task A9: Create analyzeVideoCutdownBatch callable

**Files:**
- Create: `functions/src/videoCutdown/analyzeVideoCutdownBatch.ts`
- Create: `functions/src/videoCutdown/analyzeVideoCutdownBatch.test.ts`

- [ ] **Step 1: Write the callable**

```ts
// functions/src/videoCutdown/analyzeVideoCutdownBatch.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import { assertAlliStudioUser } from '../_shared/assertAlliStudioUser';
import { analyze } from './analyze';
import {
  stageSourceFromUrl,
  downloadStagedSource,
} from './storage';
import { DEFAULT_ANALYSIS_MODEL } from './config';
import { classifyVideoCutdownError } from './videoCutdownErrors';

const GEMINI_KEY = defineSecret('GEMINI_API_KEY');

const CLIENT_SLUG_RE = /^[a-z0-9_-]+$/;

export interface AnalyzeBatchInput {
  clientSlug: string;
  batchId: string;                        // UI pre-generates
  source:
    | { kind: 'upload'; storageRef: string; sourceKey: string; mime: string; sizeBytes: number; durationSec: number }
    | { kind: 'feed'; url: string };
  targetLengths: number[];
  model?: string;
}

export const analyzeVideoCutdownBatch = onCall(
  {
    secrets: [GEMINI_KEY],
    memory: '4GiB',
    timeoutSeconds: 3600,
    concurrency: 1,
    maxInstances: 5,
    region: 'us-central1',
  },
  async (req): Promise<{ batchId: string; status: 'awaiting-approval' | 'failed' }> => {
    assertAlliStudioUser(req);
    const data = req.data as AnalyzeBatchInput;
    const { clientSlug, batchId, source, targetLengths, model } = data;

    if (!CLIENT_SLUG_RE.test(clientSlug ?? '')) {
      throw new HttpsError('invalid-argument', 'Invalid clientSlug');
    }
    if (!batchId || !Array.isArray(targetLengths) || targetLengths.length === 0) {
      throw new HttpsError('invalid-argument', 'Missing batchId or targetLengths');
    }
    if (targetLengths.some((n) => ![6, 15, 30].includes(n))) {
      throw new HttpsError('invalid-argument', 'targetLengths must be in {6,15,30}');
    }

    const db = admin.firestore();
    const batchRef = db.doc(`clients/${clientSlug}/apps/video-cutdown/batches/${batchId}`);
    let localPath: string | null = null;

    // Q16 idempotency guard — if the same batchId has already been analyzed
    // (e.g., browser double-submit, retry storm), return early without burning
    // another ~15min of Gemini latency + cost.
    const existingSnap = await batchRef.get();
    if (existingSnap.exists && existingSnap.data()?.videoAnalysis) {
      logger.info('analyzeVideoCutdownBatch: idempotent re-submit', { batchId });
      const data = existingSnap.data()!;
      return {
        batchId,
        status: data.status === 'awaiting-approval' ? 'awaiting-approval' : 'failed',
      };
    }

    try {
      // Stage the source (download to /tmp + probe + write to Storage on miss).
      let sourceMeta: {
        sourceKey: string;
        storageRef: string;
        durationSec: number;
        sizeBytes: number;
        mime: string;
        origin: 'upload' | 'feed';
        originalUrl?: string;
      };
      if (source.kind === 'feed') {
        const s = await stageSourceFromUrl(clientSlug, source.url);
        localPath = s.localPath;
        sourceMeta = {
          sourceKey: s.sourceKey,
          storageRef: s.storageRef,
          durationSec: s.probed.durationSec,
          sizeBytes: s.sizeBytes,
          mime: s.probed.mime,
          origin: 'feed',
          originalUrl: source.url,
        };
      } else {
        const d = await downloadStagedSource(source.storageRef);
        localPath = d.localPath;
        sourceMeta = {
          sourceKey: source.sourceKey,
          storageRef: source.storageRef,
          durationSec: d.probed.durationSec,
          sizeBytes: d.sizeBytes,
          mime: d.probed.mime,
          origin: 'upload',
        };
      }

      // Write the batch doc upfront so the UI can subscribe.
      await batchRef.set(
        {
          id: batchId,
          clientSlug,
          appId: 'video-cutdown',
          status: 'analyzing',
          sourceVideo: sourceMeta,
          targetLengths,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      // Run Gemini analysis.
      const analysis = await analyze({
        apiKey: GEMINI_KEY.value(),
        localVideoPath: localPath,
        mime: sourceMeta.mime,
        targetLengths,
        model: model ?? DEFAULT_ANALYSIS_MODEL,
      });

      await batchRef.update({
        videoAnalysis: analysis,
        status: 'awaiting-approval',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { batchId, status: 'awaiting-approval' };
    } catch (err) {
      const classified = classifyVideoCutdownError(err);
      logger.error('analyzeVideoCutdownBatch failed', {
        batchId,
        clientSlug,
        reason: classified.reason,
        message: classified.message,
      });
      await batchRef.set(
        {
          status: 'failed',
          errorCategory: classified.category,
          errorMessage: classified.message,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      throw new HttpsError(
        classified.category === 'permanent' ? 'failed-precondition' : 'internal',
        classified.message,
      );
    } finally {
      if (localPath && fs.existsSync(localPath)) {
        try { fs.unlinkSync(localPath); } catch { /* swallow */ }
      }
    }
  },
);
```

- [ ] **Step 2: Write callable tests**

```ts
// functions/src/videoCutdown/analyzeVideoCutdownBatch.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const setMock = vi.fn().mockResolvedValue(undefined);
const updateMock = vi.fn().mockResolvedValue(undefined);
// Base get() returns "doesn't exist" so the Q16 idempotency guard falls
// through and the rest of the callable runs. Tests that exercise the
// idempotency path override `get` per-call via mockReturnValueOnce.
const baseGetMock = vi.fn().mockResolvedValue({ exists: false, data: () => undefined });
const docMock = vi.fn(() => ({ set: setMock, update: updateMock, get: baseGetMock }));

vi.mock('firebase-admin', () => ({
  firestore: vi.fn(() => ({ doc: docMock })),
  storage: vi.fn(() => ({ bucket: () => ({}) })),
}));
vi.mock('./storage', () => ({
  stageSourceFromUrl: vi.fn(),
  downloadStagedSource: vi.fn(),
}));
vi.mock('./analyze', () => ({ analyze: vi.fn() }));
vi.mock('../_shared/assertAlliStudioUser', () => ({
  assertAlliStudioUser: vi.fn(),
}));
vi.mock('firebase-functions/params', () => ({
  defineSecret: () => ({ value: () => 'fake-key' }),
}));

import { analyzeVideoCutdownBatch } from './analyzeVideoCutdownBatch';
import { analyze } from './analyze';
import { stageSourceFromUrl } from './storage';

const handler = (analyzeVideoCutdownBatch as any).run as (
  req: any,
) => Promise<any>;

describe('analyzeVideoCutdownBatch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects invalid clientSlug', async () => {
    await expect(
      handler({ auth: {}, data: { clientSlug: 'BAD slug', batchId: 'b1', source: { kind: 'feed', url: 'https://x.com/v.mp4' }, targetLengths: [6] } }),
    ).rejects.toThrow(/clientSlug/);
  });

  it('rejects invalid targetLengths', async () => {
    await expect(
      handler({ auth: {}, data: { clientSlug: 'rl', batchId: 'b1', source: { kind: 'feed', url: 'https://x' }, targetLengths: [7] } }),
    ).rejects.toThrow(/targetLengths/);
  });

  it('happy path: stages, analyzes, writes awaiting-approval', async () => {
    (stageSourceFromUrl as any).mockResolvedValue({
      sourceKey: 'abc', storageRef: 'gs://b/c', localPath: '/tmp/x',
      sizeBytes: 1000, probed: { durationSec: 30, width: 720, height: 1280, mime: 'video/mp4' },
    });
    (analyze as any).mockResolvedValue({
      recommendations: [], model: 'm', analyzedAt: 1, latencyMs: 1,
    });
    const r = await handler({
      auth: {},
      data: { clientSlug: 'ralph_lauren', batchId: 'b1', source: { kind: 'feed', url: 'https://x/v.mp4' }, targetLengths: [6, 15] },
    });
    expect(r.status).toBe('awaiting-approval');
    expect(setMock).toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'awaiting-approval' }));
  });

  it('writes status=failed on permanent error', async () => {
    (stageSourceFromUrl as any).mockRejectedValue(new Error('Unsupported codec: hevc'));
    await expect(
      handler({
        auth: {},
        data: { clientSlug: 'rl', batchId: 'b1', source: { kind: 'feed', url: 'https://x' }, targetLengths: [6] },
      }),
    ).rejects.toThrow();
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', errorCategory: 'permanent' }),
      expect.any(Object),
    );
  });

  it('is idempotent — returns existing analysis without re-running Gemini (Q16)', async () => {
    const getMock = vi.fn().mockResolvedValue({
      exists: true,
      data: () => ({ videoAnalysis: { recommendations: [], model: 'm', analyzedAt: 1, latencyMs: 1 }, status: 'awaiting-approval' }),
    });
    docMock.mockReturnValueOnce({ set: setMock, update: updateMock, get: getMock });
    const r = await handler({
      auth: {},
      data: { clientSlug: 'rl', batchId: 'b1', source: { kind: 'feed', url: 'https://x' }, targetLengths: [6] },
    });
    expect(r.status).toBe('awaiting-approval');
    expect(analyze).not.toHaveBeenCalled();
    expect(stageSourceFromUrl).not.toHaveBeenCalled();
    expect(setMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('Q16: idempotent re-submit on previously-failed batch returns failed status', async () => {
    const getMock = vi.fn().mockResolvedValue({
      exists: true,
      data: () => ({ videoAnalysis: { recommendations: [], model: 'm', analyzedAt: 1, latencyMs: 1 }, status: 'failed' }),
    });
    docMock.mockReturnValueOnce({ set: setMock, update: updateMock, get: getMock });
    const r = await handler({
      auth: {},
      data: { clientSlug: 'rl', batchId: 'b1', source: { kind: 'feed', url: 'https://x' }, targetLengths: [6] },
    });
    expect(r.status).toBe('failed');
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd functions && npx vitest run src/videoCutdown/analyzeVideoCutdownBatch.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add functions/src/videoCutdown/analyzeVideoCutdownBatch.ts functions/src/videoCutdown/analyzeVideoCutdownBatch.test.ts
git commit -m "feat(video-cutdown): add analyzeVideoCutdownBatch v2 callable"
```

### Task A10: Create renderVideoCutdownBatch callable

**Files:**
- Create: `functions/src/videoCutdown/renderVideoCutdownBatch.ts`
- Create: `functions/src/videoCutdown/renderVideoCutdownBatch.test.ts`

- [ ] **Step 1: Write the callable**

```ts
// functions/src/videoCutdown/renderVideoCutdownBatch.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import pLimit from 'p-limit';
import { assertAlliStudioUser } from '../_shared/assertAlliStudioUser';
import { downloadStagedSource, uploadOutput } from './storage';
import { render } from './render';
import { RENDER_CONCURRENCY } from './config';
import { classifyVideoCutdownError } from './videoCutdownErrors';
import type {
  VideoCutdownSelection,
  VideoCutdownOutputDoc,
} from './types';

const CLIENT_SLUG_RE = /^[a-z0-9_-]+$/;

export interface RenderBatchInput {
  clientSlug: string;
  batchId: string;
  /** UI pre-generates one outputId per selection. */
  outputs: Array<{
    outputId: string;
    selection: VideoCutdownSelection;
  }>;
}

export interface RenderBatchResult {
  batchId: string;
  status: 'completed' | 'partial' | 'failed';
  completedCount: number;
  errorCount: number;
}

export const renderVideoCutdownBatch = onCall(
  {
    memory: '4GiB',
    timeoutSeconds: 3600,
    concurrency: 1,
    maxInstances: 10,
    region: 'us-central1',
  },
  async (req): Promise<RenderBatchResult> => {
    assertAlliStudioUser(req);
    const { clientSlug, batchId, outputs } = req.data as RenderBatchInput;

    if (!CLIENT_SLUG_RE.test(clientSlug ?? '')) {
      throw new HttpsError('invalid-argument', 'Invalid clientSlug');
    }
    if (!batchId || !Array.isArray(outputs) || outputs.length === 0) {
      throw new HttpsError('invalid-argument', 'Missing batchId or outputs');
    }

    const db = admin.firestore();
    const batchRef = db.doc(`clients/${clientSlug}/apps/video-cutdown/batches/${batchId}`);
    const batchSnap = await batchRef.get();
    if (!batchSnap.exists) {
      throw new HttpsError('not-found', `Batch ${batchId} not found`);
    }
    const batch = batchSnap.data()!;
    if (!batch.sourceVideo?.storageRef) {
      throw new HttpsError('failed-precondition', 'Batch has no sourceVideo');
    }

    // Q17 stuck-batch recovery — reset any output orphans from a prior
    // function timeout. Orphans = status 'rendering' for this batchId that
    // are NOT in the new request. Mark them transient-error so the user can
    // retry via the retry callable. We don't auto-retry because the same
    // input may still OOM the function.
    const orphanQuery = await db
      .collection(`clients/${clientSlug}/apps/video-cutdown/outputs`)
      .where('batchId', '==', batchId)
      .where('status', '==', 'rendering')
      .get();
    if (!orphanQuery.empty) {
      const resetBatch = db.batch();
      orphanQuery.docs.forEach((doc) => {
        resetBatch.update(doc.ref, {
          status: 'error',
          errorCategory: 'transient',
          errorMessage: 'Recovered from prior timeout — safe to retry',
        });
      });
      await resetBatch.commit();
      logger.warn('renderVideoCutdownBatch: reset orphan outputs', {
        batchId,
        count: orphanQuery.size,
      });
    }

    await batchRef.update({
      status: 'processing',
      videoSelections: outputs.map((o) => o.selection),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Pre-write all output docs as pending.
    const writes = outputs.map((o) =>
      db.doc(`clients/${clientSlug}/apps/video-cutdown/outputs/${o.outputId}`).set({
        outputId: o.outputId,
        batchId,
        selection: o.selection,
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      } as VideoCutdownOutputDoc),
    );
    await Promise.all(writes);

    // Download source once.
    const { localPath: sourceLocalPath } = await downloadStagedSource(batch.sourceVideo.storageRef);

    const limit = pLimit(RENDER_CONCURRENCY);
    let completedCount = 0;
    let errorCount = 0;

    await Promise.all(
      outputs.map((o) =>
        limit(async () => {
          const outputRef = db.doc(
            `clients/${clientSlug}/apps/video-cutdown/outputs/${o.outputId}`,
          );
          try {
            await outputRef.update({ status: 'rendering' });
            const result = await render({
              sourceLocalPath,
              outputId: o.outputId,
              segments: o.selection.segments,
            });
            const storageRef = await uploadOutput(clientSlug, o.outputId, result.outputLocalPath);
            await outputRef.update({
              status: 'complete',
              storageRef,
              durationSec: result.durationSec,
              sizeBytes: fs.statSync(result.outputLocalPath).size,
              completedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            try { fs.unlinkSync(result.outputLocalPath); } catch {}
            completedCount++;
          } catch (err) {
            const classified = classifyVideoCutdownError(err);
            logger.error('render failed', { outputId: o.outputId, reason: classified.reason });
            await outputRef.update({
              status: 'error',
              errorCategory: classified.category,
              errorMessage: classified.message,
            });
            errorCount++;
          }
        }),
      ),
    );

    try { fs.unlinkSync(sourceLocalPath); } catch {}

    const status: 'completed' | 'partial' | 'failed' =
      errorCount === 0 ? 'completed' : completedCount === 0 ? 'failed' : 'partial';
    await batchRef.update({
      status,
      completedVariations: completedCount,
      errorCount,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { batchId, status, completedCount, errorCount };
  },
);
```

- [ ] **Step 2: Write callable tests**

(Cover: invalid slug rejected, non-existent batch rejected, happy path (all succeed → 'completed'), mixed (1 success + 1 failure → 'partial'), all failures → 'failed'. Mock pattern same as Task A9.)

```ts
// functions/src/videoCutdown/renderVideoCutdownBatch.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const updateMock = vi.fn().mockResolvedValue(undefined);
const setMock = vi.fn().mockResolvedValue(undefined);
const getMock = vi.fn();
const docMock = vi.fn(() => ({ update: updateMock, set: setMock, get: getMock }));

vi.mock('firebase-admin', () => ({
  firestore: Object.assign(vi.fn(() => ({ doc: docMock })), {
    FieldValue: { serverTimestamp: () => 'now' },
  }),
  storage: vi.fn(() => ({ bucket: () => ({}) })),
}));
vi.mock('./storage', () => ({
  downloadStagedSource: vi.fn().mockResolvedValue({ localPath: '/tmp/v.mp4' }),
  uploadOutput: vi.fn().mockResolvedValue('gs://b/c'),
}));
vi.mock('./render', () => ({
  render: vi.fn(),
}));
vi.mock('../_shared/assertAlliStudioUser', () => ({ assertAlliStudioUser: vi.fn() }));
vi.mock('fs', () => ({ statSync: () => ({ size: 100 }), unlinkSync: vi.fn() }));

import { renderVideoCutdownBatch } from './renderVideoCutdownBatch';
import { render } from './render';

const handler = (renderVideoCutdownBatch as any).run as (req: any) => Promise<any>;
const okBatch = { sourceVideo: { storageRef: 'gs://b/s' } };

describe('renderVideoCutdownBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMock.mockResolvedValue({ exists: true, data: () => okBatch });
  });

  it('rejects invalid clientSlug', async () => {
    await expect(handler({ auth: {}, data: { clientSlug: 'BAD', batchId: 'b', outputs: [{ outputId: 'o', selection: { length: 6, optionId: 1, segments: [] } }] } })).rejects.toThrow();
  });

  it('returns completed when all renders succeed', async () => {
    (render as any).mockResolvedValue({ outputLocalPath: '/tmp/x.mp4', durationSec: 6 });
    const r = await handler({
      auth: {}, data: {
        clientSlug: 'rl', batchId: 'b1',
        outputs: [
          { outputId: 'o1', selection: { length: 6, optionId: 1, segments: [{ start: '0', end: '6' }] } },
          { outputId: 'o2', selection: { length: 6, optionId: 2, segments: [{ start: '6', end: '12' }] } },
        ],
      },
    });
    expect(r.status).toBe('completed');
    expect(r.completedCount).toBe(2);
    expect(r.errorCount).toBe(0);
  });

  it('returns partial when one render fails', async () => {
    (render as any)
      .mockResolvedValueOnce({ outputLocalPath: '/tmp/x.mp4', durationSec: 6 })
      .mockRejectedValueOnce(new Error('Unsupported codec: hevc'));
    const r = await handler({
      auth: {}, data: {
        clientSlug: 'rl', batchId: 'b1',
        outputs: [
          { outputId: 'o1', selection: { length: 6, optionId: 1, segments: [{ start: '0', end: '6' }] } },
          { outputId: 'o2', selection: { length: 6, optionId: 2, segments: [{ start: '6', end: '12' }] } },
        ],
      },
    });
    expect(r.status).toBe('partial');
    expect(r.completedCount).toBe(1);
    expect(r.errorCount).toBe(1);
  });

  it('returns failed when all renders fail', async () => {
    (render as any).mockRejectedValue(new Error('boom'));
    const r = await handler({
      auth: {}, data: {
        clientSlug: 'rl', batchId: 'b1',
        outputs: [{ outputId: 'o1', selection: { length: 6, optionId: 1, segments: [{ start: '0', end: '6' }] } }],
      },
    });
    expect(r.status).toBe('failed');
  });

  it('rejects when batch does not exist', async () => {
    getMock.mockResolvedValueOnce({ exists: false });
    await expect(
      handler({ auth: {}, data: { clientSlug: 'rl', batchId: 'nope', outputs: [{ outputId: 'o', selection: { length: 6, optionId: 1, segments: [] } }] } }),
    ).rejects.toThrow(/not found/i);
  });

  it('resets orphan outputs from prior timeout (Q17)', async () => {
    // Set up orphan query to return two 'rendering' docs from a prior invocation.
    // Assert each orphan ref receives a targeted update with transient-error
    // payload — not just that the query ran.
    const orphanRefA = { update: vi.fn().mockResolvedValue(undefined) };
    const orphanRefB = { update: vi.fn().mockResolvedValue(undefined) };
    const batchUpdateMock = vi.fn();
    const batchCommitMock = vi.fn().mockResolvedValue(undefined);
    const orphanGet = vi.fn().mockResolvedValue({
      empty: false, size: 2,
      docs: [
        { ref: orphanRefA, data: () => ({ status: 'rendering', outputId: 'orphanA' }) },
        { ref: orphanRefB, data: () => ({ status: 'rendering', outputId: 'orphanB' }) },
      ],
    });
    const collectionMock = vi.fn(() => ({
      where: () => ({ where: () => ({ get: orphanGet }) }),
    }));
    (admin.firestore as any).mockReturnValueOnce(Object.assign(
      () => ({
        doc: docMock,
        collection: collectionMock,
        batch: () => ({ update: batchUpdateMock, commit: batchCommitMock }),
      }),
      { FieldValue: { serverTimestamp: () => 'now', delete: () => 'DEL' } },
    ));
    (render as any).mockResolvedValue({ outputLocalPath: '/tmp/x.mp4', durationSec: 6 });
    await handler({
      auth: {}, data: {
        clientSlug: 'rl', batchId: 'b1',
        outputs: [{ outputId: 'fresh', selection: { length: 6, optionId: 1, segments: [{ start: '0', end: '6' }] } }],
      },
    });
    expect(orphanGet).toHaveBeenCalled();
    // Assert both orphans were enqueued in the reset batch with the correct payload.
    expect(batchUpdateMock).toHaveBeenCalledTimes(2);
    expect(batchUpdateMock).toHaveBeenCalledWith(orphanRefA, expect.objectContaining({
      status: 'error',
      errorCategory: 'transient',
      errorMessage: expect.stringMatching(/Recovered from prior timeout/i),
    }));
    expect(batchUpdateMock).toHaveBeenCalledWith(orphanRefB, expect.objectContaining({
      status: 'error',
      errorCategory: 'transient',
    }));
    expect(batchCommitMock).toHaveBeenCalled();
  });

  it('no-op when there are no orphan outputs (Q17)', async () => {
    const orphanGet = vi.fn().mockResolvedValue({ empty: true, size: 0, docs: [] });
    const collectionMock = vi.fn(() => ({
      where: () => ({ where: () => ({ get: orphanGet }) }),
    }));
    const batchUpdateMock = vi.fn();
    const batchCommitMock = vi.fn().mockResolvedValue(undefined);
    (admin.firestore as any).mockReturnValueOnce(Object.assign(
      () => ({
        doc: docMock,
        collection: collectionMock,
        batch: () => ({ update: batchUpdateMock, commit: batchCommitMock }),
      }),
      { FieldValue: { serverTimestamp: () => 'now', delete: () => 'DEL' } },
    ));
    (render as any).mockResolvedValue({ outputLocalPath: '/tmp/x.mp4', durationSec: 6 });
    await handler({
      auth: {}, data: {
        clientSlug: 'rl', batchId: 'b1',
        outputs: [{ outputId: 'fresh', selection: { length: 6, optionId: 1, segments: [{ start: '0', end: '6' }] } }],
      },
    });
    expect(batchUpdateMock).not.toHaveBeenCalled();
    expect(batchCommitMock).not.toHaveBeenCalled();
  });

  it('respects RENDER_CONCURRENCY cap (p-limit serializes beyond N)', async () => {
    // Default RENDER_CONCURRENCY=1 (per Q8) — assert true serialization:
    // exactly one in-flight at a time. To exercise N>1, set
    // process.env.MAX_RENDER_CONCURRENCY=2 in a separate test.
    const callOrder: string[] = [];
    const resolveOrder: ((v: any) => void)[] = [];
    (render as any).mockImplementation((input: any) =>
      new Promise((resolve) => {
        callOrder.push(input.outputId);
        resolveOrder.push(resolve);
      }),
    );
    const p = handler({
      auth: {}, data: {
        clientSlug: 'rl', batchId: 'b1',
        outputs: [
          { outputId: 'a', selection: { length: 6, optionId: 1, segments: [{ start: '0', end: '6' }] } },
          { outputId: 'b', selection: { length: 6, optionId: 2, segments: [{ start: '6', end: '12' }] } },
          { outputId: 'c', selection: { length: 6, optionId: 3, segments: [{ start: '12', end: '18' }] } },
        ],
      },
    });
    // Wait microtask for p-limit to schedule.
    await new Promise((r) => setTimeout(r, 0));
    expect(callOrder.length).toBe(1);  // RENDER_CONCURRENCY=1 means strictly serial
    resolveOrder[0]!({ outputLocalPath: '/tmp/a.mp4', durationSec: 6 });
    await new Promise((r) => setTimeout(r, 0));
    expect(callOrder.length).toBe(2);  // second starts only after first resolves
    resolveOrder[1]!({ outputLocalPath: '/tmp/b.mp4', durationSec: 6 });
    await new Promise((r) => setTimeout(r, 0));
    expect(callOrder.length).toBe(3);
    resolveOrder[2]!({ outputLocalPath: '/tmp/c.mp4', durationSec: 6 });
    await p;
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd functions && npx vitest run src/videoCutdown/renderVideoCutdownBatch.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add functions/src/videoCutdown/renderVideoCutdownBatch.ts functions/src/videoCutdown/renderVideoCutdownBatch.test.ts
git commit -m "feat(video-cutdown): add renderVideoCutdownBatch v2 callable with concurrency cap"
```

### Task A11: Create retryVideoCutdownOutput callable

**Files:**
- Create: `functions/src/videoCutdown/retryVideoCutdownOutput.ts`
- Create: `functions/src/videoCutdown/retryVideoCutdownOutput.test.ts`

- [ ] **Step 1: Write the callable**

```ts
// functions/src/videoCutdown/retryVideoCutdownOutput.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import { assertAlliStudioUser } from '../_shared/assertAlliStudioUser';
import { downloadStagedSource, uploadOutput } from './storage';
import { render } from './render';
import { classifyVideoCutdownError } from './videoCutdownErrors';

const CLIENT_SLUG_RE = /^[a-z0-9_-]+$/;

export const retryVideoCutdownOutput = onCall(
  {
    memory: '4GiB',
    timeoutSeconds: 3600,
    concurrency: 1,
    maxInstances: 10,
    region: 'us-central1',
  },
  async (req): Promise<{ outputId: string; status: 'complete' | 'error' }> => {
    assertAlliStudioUser(req);
    const { clientSlug, outputId } = req.data as { clientSlug: string; outputId: string };

    if (!CLIENT_SLUG_RE.test(clientSlug ?? '')) {
      throw new HttpsError('invalid-argument', 'Invalid clientSlug');
    }
    const db = admin.firestore();
    const outputRef = db.doc(`clients/${clientSlug}/apps/video-cutdown/outputs/${outputId}`);
    const snap = await outputRef.get();
    if (!snap.exists) throw new HttpsError('not-found', 'Output not found');
    const out = snap.data()!;
    const batchRef = db.doc(`clients/${clientSlug}/apps/video-cutdown/batches/${out.batchId}`);
    const batchSnap = await batchRef.get();
    if (!batchSnap.exists) throw new HttpsError('not-found', 'Batch not found');
    const batch = batchSnap.data()!;

    await outputRef.update({
      status: 'rendering',
      errorCategory: admin.firestore.FieldValue.delete(),
      errorMessage: admin.firestore.FieldValue.delete(),
    });

    let sourceLocalPath: string | null = null;
    try {
      const dl = await downloadStagedSource(batch.sourceVideo.storageRef);
      sourceLocalPath = dl.localPath;
      const result = await render({
        sourceLocalPath: dl.localPath,
        outputId,
        segments: out.selection.segments,
      });
      const storageRef = await uploadOutput(clientSlug, outputId, result.outputLocalPath);
      await outputRef.update({
        status: 'complete',
        storageRef,
        durationSec: result.durationSec,
        sizeBytes: fs.statSync(result.outputLocalPath).size,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      try { fs.unlinkSync(result.outputLocalPath); } catch {}
      return { outputId, status: 'complete' };
    } catch (err) {
      const classified = classifyVideoCutdownError(err);
      logger.error('retryVideoCutdownOutput failed', { outputId, reason: classified.reason });
      await outputRef.update({
        status: 'error',
        errorCategory: classified.category,
        errorMessage: classified.message,
      });
      return { outputId, status: 'error' };
    } finally {
      if (sourceLocalPath) try { fs.unlinkSync(sourceLocalPath); } catch {}
    }
  },
);
```

- [ ] **Step 2: Write explicit tests** (no shorthand per plan-eng-review Test #2)

```ts
// functions/src/videoCutdown/retryVideoCutdownOutput.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const updateMock = vi.fn().mockResolvedValue(undefined);
const getOutputMock = vi.fn();
const getBatchMock = vi.fn();
const docMock = vi.fn();

vi.mock('firebase-admin', () => ({
  firestore: Object.assign(vi.fn(() => ({ doc: docMock })), {
    FieldValue: { serverTimestamp: () => 'now', delete: () => 'DEL' },
  }),
  storage: vi.fn(() => ({ bucket: () => ({}) })),
}));
vi.mock('./storage', () => ({
  downloadStagedSource: vi.fn().mockResolvedValue({ localPath: '/tmp/v.mp4' }),
  uploadOutput: vi.fn().mockResolvedValue('gs://b/c'),
}));
vi.mock('./render', () => ({ render: vi.fn() }));
vi.mock('../_shared/assertAlliStudioUser', () => ({ assertAlliStudioUser: vi.fn() }));
vi.mock('fs', () => ({ statSync: () => ({ size: 100 }), unlinkSync: vi.fn() }));

import { retryVideoCutdownOutput } from './retryVideoCutdownOutput';
import { render } from './render';

const handler = (retryVideoCutdownOutput as any).run as (req: any) => Promise<any>;

describe('retryVideoCutdownOutput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    docMock.mockImplementation((path: string) => {
      if (path.includes('/outputs/')) return { get: getOutputMock, update: updateMock };
      if (path.includes('/batches/')) return { get: getBatchMock };
      return {};
    });
  });

  it('rejects invalid clientSlug', async () => {
    await expect(handler({ auth: {}, data: { clientSlug: 'BAD', outputId: 'o1' } })).rejects.toThrow(/clientSlug/);
  });

  it('rejects when output does not exist', async () => {
    getOutputMock.mockResolvedValue({ exists: false });
    await expect(handler({ auth: {}, data: { clientSlug: 'rl', outputId: 'nope' } })).rejects.toThrow(/not found/i);
  });

  it('rejects when batch does not exist', async () => {
    getOutputMock.mockResolvedValue({ exists: true, data: () => ({ batchId: 'b1', selection: { segments: [] } }) });
    getBatchMock.mockResolvedValue({ exists: false });
    await expect(handler({ auth: {}, data: { clientSlug: 'rl', outputId: 'o1' } })).rejects.toThrow(/not found/i);
  });

  it('happy path — renders and marks complete', async () => {
    getOutputMock.mockResolvedValue({ exists: true, data: () => ({ batchId: 'b1', selection: { segments: [{ start: '0', end: '6' }] } }) });
    getBatchMock.mockResolvedValue({ exists: true, data: () => ({ sourceVideo: { storageRef: 'gs://b/s' } }) });
    (render as any).mockResolvedValue({ outputLocalPath: '/tmp/x.mp4', durationSec: 6 });
    const r = await handler({ auth: {}, data: { clientSlug: 'rl', outputId: 'o1' } });
    expect(r).toEqual({ outputId: 'o1', status: 'complete' });
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'rendering' }));
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'complete' }));
  });

  it('classifies render failure and marks error', async () => {
    getOutputMock.mockResolvedValue({ exists: true, data: () => ({ batchId: 'b1', selection: { segments: [{ start: '0', end: '6' }] } }) });
    getBatchMock.mockResolvedValue({ exists: true, data: () => ({ sourceVideo: { storageRef: 'gs://b/s' } }) });
    (render as any).mockRejectedValue(new Error('Unsupported codec: hevc'));
    const r = await handler({ auth: {}, data: { clientSlug: 'rl', outputId: 'o1' } });
    expect(r.status).toBe('error');
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'error', errorCategory: 'permanent' }));
  });

  it('clears stale error fields before retry', async () => {
    getOutputMock.mockResolvedValue({ exists: true, data: () => ({ batchId: 'b1', selection: { segments: [{ start: '0', end: '6' }] } }) });
    getBatchMock.mockResolvedValue({ exists: true, data: () => ({ sourceVideo: { storageRef: 'gs://b/s' } }) });
    (render as any).mockResolvedValue({ outputLocalPath: '/tmp/x.mp4', durationSec: 6 });
    await handler({ auth: {}, data: { clientSlug: 'rl', outputId: 'o1' } });
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      status: 'rendering',
      errorCategory: 'DEL',
      errorMessage: 'DEL',
    }));
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
cd functions && npx vitest run src/videoCutdown/retryVideoCutdownOutput.test.ts
git add functions/src/videoCutdown/retryVideoCutdownOutput.ts functions/src/videoCutdown/retryVideoCutdownOutput.test.ts
git commit -m "feat(video-cutdown): add retryVideoCutdownOutput v2 callable"
```

### Task A11b: Create `cleanupOrphanedSources` scheduled function (Q19)

Nightly sweeper: for each batch older than 30 days where `status` is not in `['completed', 'partial']`, delete the referenced `sourceVideo.storageRef`. Disabled on dev (Cloud Scheduler entry only enabled in prod) so it doesn't surprise anyone during testing.

**Files:**
- Create: `functions/src/videoCutdown/cleanupOrphanedSources.ts`
- Create: `functions/src/videoCutdown/cleanupOrphanedSources.test.ts`

- [ ] **Step 1: Write the scheduled function**

```ts
// functions/src/videoCutdown/cleanupOrphanedSources.ts
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';

const ORPHAN_AGE_MS = 30 * 24 * 60 * 60 * 1000;   // 30 days
const ORPHAN_STATUSES = ['pending', 'analyzing', 'awaiting-approval', 'processing', 'failed'];

export const cleanupOrphanedSources = onSchedule(
  {
    schedule: '0 3 * * *',   // 03:00 UTC daily
    timeZone: 'UTC',
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 540,
  },
  async () => {
    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - ORPHAN_AGE_MS);

    let scanned = 0;
    let deleted = 0;
    const errors: string[] = [];

    // collectionGroup query across all clients' video-cutdown batches.
    const orphanQuery = await db
      .collectionGroup('batches')
      .where('appId', '==', 'video-cutdown')
      .where('status', 'in', ORPHAN_STATUSES)
      .where('createdAt', '<', cutoff)
      .get();

    for (const doc of orphanQuery.docs) {
      scanned++;
      const data = doc.data();
      const storageRef = data.sourceVideo?.storageRef;
      if (!storageRef) continue;
      const objectPath = storageRef.replace(/^gs:\/\/[^/]+\//, '');
      try {
        await bucket.file(objectPath).delete({ ignoreNotFound: true });
        await doc.ref.update({
          'sourceVideo.storageRef': admin.firestore.FieldValue.delete(),
          status: 'cleaned-up',
        });
        deleted++;
      } catch (err) {
        errors.push(`${doc.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    logger.info('cleanupOrphanedSources', { scanned, deleted, errors });
  },
);
```

- [ ] **Step 2: Write tests (mocked collectionGroup + Storage)**

```ts
// functions/src/videoCutdown/cleanupOrphanedSources.test.ts
import { describe, it, expect, vi } from 'vitest';

const deleteMock = vi.fn().mockResolvedValue(undefined);
const updateDocMock = vi.fn().mockResolvedValue(undefined);
const bucketFileMock = vi.fn(() => ({ delete: deleteMock }));
const collectionGroupMock = vi.fn();

vi.mock('firebase-admin', () => ({
  firestore: Object.assign(
    vi.fn(() => ({ collectionGroup: collectionGroupMock })),
    {
      FieldValue: { delete: () => 'DEL' },
      Timestamp: { fromMillis: (m: number) => ({ toMillis: () => m }) },
    },
  ),
  storage: vi.fn(() => ({ bucket: () => ({ file: bucketFileMock }) })),
}));

import { cleanupOrphanedSources } from './cleanupOrphanedSources';

const handler = (cleanupOrphanedSources as any).run as () => Promise<any>;

describe('cleanupOrphanedSources', () => {
  it('deletes storage objects for orphaned batches', async () => {
    collectionGroupMock.mockReturnValue({
      where: () => ({ where: () => ({ where: () => ({ get: () => Promise.resolve({
        docs: [
          { id: 'b1', ref: { update: updateDocMock }, data: () => ({ sourceVideo: { storageRef: 'gs://b/clients/rl/apps/video-cutdown/sources/abc.mp4' } }) },
        ],
      }) }) }) }),
    });
    await handler();
    expect(bucketFileMock).toHaveBeenCalledWith('clients/rl/apps/video-cutdown/sources/abc.mp4');
    expect(deleteMock).toHaveBeenCalled();
    expect(updateDocMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'cleaned-up' }));
  });

  it('skips batches with no storageRef', async () => {
    collectionGroupMock.mockReturnValue({
      where: () => ({ where: () => ({ where: () => ({ get: () => Promise.resolve({
        docs: [{ id: 'b1', ref: { update: updateDocMock }, data: () => ({}) }],
      }) }) }) }),
    });
    await handler();
    expect(deleteMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
cd functions && npx vitest run src/videoCutdown/cleanupOrphanedSources.test.ts
git add functions/src/videoCutdown/cleanupOrphanedSources.ts functions/src/videoCutdown/cleanupOrphanedSources.test.ts
git commit -m "feat(video-cutdown): add cleanupOrphanedSources scheduled function (30-day TTL)"
```

### Task A12: Wire functions/src/videoCutdown/index.ts and root index.ts

**Files:**
- Create: `functions/src/videoCutdown/index.ts`
- Modify: `functions/src/index.ts`

- [ ] **Step 1: Create the barrel**

```ts
// functions/src/videoCutdown/index.ts
export * from './analyzeVideoCutdownBatch';
export * from './renderVideoCutdownBatch';
export * from './retryVideoCutdownOutput';
export * from './cleanupOrphanedSources';
```

- [ ] **Step 2: Add the root export**

In `functions/src/index.ts`, after the existing `export * from "./resize";`:

```ts
export * from "./videoCutdown";
```

- [ ] **Step 3: Verify build**

```bash
cd functions && npm run build
```

Expected: no errors. Verify `functions/lib/videoCutdown/index.js` exists.

- [ ] **Step 4: Commit**

```bash
git add functions/src/videoCutdown/index.ts functions/src/index.ts
git commit -m "feat(functions): export video-cutdown package"
```

### Task A13: Create src/services/videoCutdown.ts (callable client)

**Files:**
- Create: `src/services/videoCutdown.ts`

- [ ] **Step 1: Write the service**

```ts
// src/services/videoCutdown.ts
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import type {
  VideoCutdownSelection,
} from '../apps/video-cutdown/types';

const analyzeCallable = httpsCallable(functions, 'analyzeVideoCutdownBatch', {
  timeout: 600000,    // 10 min (Gemini analysis ~15min worst-case, but we let
                      // the client side bail if the server hits its own 3600s
                      // limit — Firestore subscription is the source of truth
                      // anyway, so the client timeout is just for UI clarity)
});
const renderCallable = httpsCallable(functions, 'renderVideoCutdownBatch', {
  timeout: 600000,
});
const retryCallable = httpsCallable(functions, 'retryVideoCutdownOutput', {
  timeout: 600000,
});

export interface AnalyzeInput {
  clientSlug: string;
  batchId: string;
  source:
    | { kind: 'upload'; storageRef: string; sourceKey: string; mime: string; sizeBytes: number; durationSec: number }
    | { kind: 'feed'; url: string };
  targetLengths: number[];
  model?: string;
}

export interface RenderInput {
  clientSlug: string;
  batchId: string;
  outputs: Array<{ outputId: string; selection: VideoCutdownSelection }>;
}

export const videoCutdownService = {
  async analyze(input: AnalyzeInput): Promise<{ batchId: string; status: string }> {
    const r = await analyzeCallable(input);
    return r.data as { batchId: string; status: string };
  },
  async render(input: RenderInput): Promise<{ batchId: string; status: string; completedCount: number; errorCount: number }> {
    const r = await renderCallable(input);
    return r.data as any;
  },
  async retry(clientSlug: string, outputId: string): Promise<{ outputId: string; status: string }> {
    const r = await retryCallable({ clientSlug, outputId });
    return r.data as any;
  },
};
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/services/videoCutdown.ts
git commit -m "feat(video-cutdown): add callable client service"
```

### Task A14: Smoke test on dev

- [ ] **Step 1: Deploy functions to dev**

```bash
cd functions && npm run deploy
```

Expected: three new callables visible at the bottom of the deploy report — `analyzeVideoCutdownBatch`, `renderVideoCutdownBatch`, `retryVideoCutdownOutput`.

- [ ] **Step 2: Manual emulator smoke test (optional, but recommended before PR-A merges)**

Pick a short MP4 (≤2min) hosted at a public HTTPS URL. From `npm run shell` in `functions/`:

```js
analyzeVideoCutdownBatch({
  clientSlug: 'ralph_lauren',
  batchId: 'smoke-' + Date.now(),
  source: { kind: 'feed', url: 'https://example.com/short.mp4' },
  targetLengths: [6],
})
```

Expected: returns `{ batchId, status: 'awaiting-approval' }`. Verify in Firebase console:
- `clients/ralph_lauren/apps/video-cutdown/batches/{batchId}` doc with `videoAnalysis.recommendations`
- `clients/ralph_lauren/apps/video-cutdown/sources/{sha256}.mp4` in Storage

- [ ] **Step 3: Open PR-A**

```bash
git push -u origin feature/video-cutdown-lift
gh pr create --base dev --title "feat(video-cutdown): PR-A scaffold + scoped backend (no UI changes)" --body "$(cat <<'EOF'
## Summary
- New v2 callables: \`analyzeVideoCutdownBatch\`, \`renderVideoCutdownBatch\`, \`retryVideoCutdownOutput\`
- Scoped Firestore + Storage writes under \`clients/{slug}/apps/video-cutdown/\`
- BatchRecord status extended with \`analyzing\` + \`awaiting-approval\`
- Path helpers + types + rules tests added

No user-facing changes. Legacy \`/create/video-cutdown\` still works; the modern route still renders the preview stub. PR-B will wire the new UI.

## Test plan
- [ ] \`npm run build\` (root + functions/)
- [ ] \`npm run test\` green
- [ ] \`npm run test:rules\` green
- [ ] \`cd functions && npm run deploy\` deploys 3 new callables
- [ ] Manual smoke (short public MP4) returns awaiting-approval + writes to Firestore + Storage

Closes part of #34's spiritual sibling (legacy app migration workstream).
EOF
)"
```

---

# PR-B — UI lift (6-step wizard with reimagined UX)

**Acceptance:**
- All 9 parity criteria from §Q14 pass on `dev` with `VITE_FEATURE_VIDEO_CUTDOWN_LIFT=true`.
- Manifest `status` flips to `'live'`; the preview stub view is gone.
- Legacy `/create/video-cutdown` route still works unchanged — coexistence period.
- `npm run test` + `npm run test:rules` green; new tests added for hooks, step components, and feedToVideoCreatives adapter.
- Playwright smoke covers the happy path (upload → configure → analyze → approve → render → download).

(Tasks B1–B15 follow the same TDD shape as PR-A. Per plan-eng-review Test #1: **every step component ships with a vitest unit test asserting validate() correctness, and every submit() boundary is covered by an E2E test in tests/e2e/video-cutdown-submit-boundaries.spec.ts.** Component step tasks below are TDD-bited: failing test first, implementation, passing test, commit.)

### Task B1: Create `feedToVideoCreatives.ts` (Alli feed adapter)

Mirrors `src/apps/ad-resizing/utils/feedToCreatives.ts`. Reads a feed row's `videoUrl` column (configurable, default heuristic: any column ending in `_url` whose first sampled value is a URL with `.mp4|.mov|.webm` extension or `video/*` content-type).

Output: `Array<{ id: string; name: string; videoUrl: string; sourceKey: string }>` — `sourceKey = sha256(videoUrl).slice(0, 16)`.

**Files:**
- Create: `src/apps/video-cutdown/utils/feedToVideoCreatives.ts`
- Create: `src/apps/video-cutdown/utils/feedToVideoCreatives.test.ts`

(Steps: test-first using a fixture row array; mirror feedToCreatives shape; commit.)

### Task B2: Create `useVideoUpload.ts` (client-side SHA256 + direct upload)

```ts
// src/apps/video-cutdown/hooks/useVideoUpload.ts
// Hashes the File via crypto.subtle.digest, computes sourceKey,
// uploads to clients/{slug}/apps/video-cutdown/sources/{sourceKey}.{ext}
// via uploadBytesResumable, reports progress, returns the storageRef + meta.
```

Test: mock Storage SDK, assert correct path string, assert progress callback fires.

### Task B3: Create `useVideoCutdownRunner.ts` (callable wrapper)

Thin wrapper over `videoCutdownService` (Task A13) bound to a `clientSlug`. Matches `useOutpaintRunner.ts` shape.

### Task B4: Create `useVideoCutdownBatch.ts` (Firestore subscription)

Mirrors `useBatchOutputs.ts` exactly but typed against `VideoCutdownOutputDoc` + `BatchRecord` with `videoAnalysis`. Filter outputs `where('batchId', '==', batchId)`.

### Task B5: Replace `src/apps/video-cutdown/manifest.ts` with the live 6-step manifest

```ts
// src/apps/video-cutdown/manifest.ts
import type { AppManifest } from '../types';
import type { VideoCutdownStepData } from './types';
import {
  uploadStep,
  configureStep,
  analyzeStep,
  approveStep,
  renderStep,
  downloadStep,
} from './steps';

const manifest: AppManifest<VideoCutdownStepData> = {
  id: 'video-cutdown',
  basePath: 'video-cutdown',
  title: 'Video Cutdown',
  description:
    'AI-driven cutdown of long-form video into 6/15/30s variants.',
  status: 'live',
  requiresBrandStandards: false,
  steps: [
    uploadStep,
    configureStep,
    analyzeStep,
    approveStep,
    renderStep,
    downloadStep,
  ],
  initialStepData: () => ({}),
};

export default manifest;
```

(Note: 6 steps not 5 — Download is the terminal step; Analyze and Approve are separate because Analyze is the async submit boundary and Approve is the human-in-the-loop interaction. Update the plan vision accordingly if you'd rather collapse Analyze into Approve.)

### Task B6: Implement UploadStep + tests

**Files:** `src/apps/video-cutdown/steps/UploadStep.tsx`, `UploadStep.test.tsx`

- [ ] **Step 1: Write validate() unit test**

```ts
// UploadStep.test.tsx
import { describe, it, expect } from 'vitest';
import { uploadStep } from './UploadStep';

describe('uploadStep.validate', () => {
  it('rejects when no source set', () => {
    expect(uploadStep.validate({})).toMatchObject({ ok: false });
  });
  it('passes when source set with both kinds', () => {
    expect(uploadStep.validate({ source: { origin: 'upload', sourceKey: 'k', storageRef: 'gs://b/x', durationSec: 30, sizeBytes: 1, mime: 'video/mp4', uploadedAt: 1 } })).toEqual({ ok: true });
    expect(uploadStep.validate({ source: { origin: 'feed', sourceKey: 'k', storageRef: 'gs://b/x', durationSec: 30, sizeBytes: 1, mime: 'video/mp4', originalUrl: 'https://x', uploadedAt: 1 } })).toEqual({ ok: true });
  });
  it('returns the "Source video selected" requirement when not met', () => {
    const r = uploadStep.validate({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.requirements?.[0]?.label).toMatch(/source/i);
  });
});
```

- [ ] **Step 2: Run test (fails — module missing)**

```bash
npm run test -- src/apps/video-cutdown/steps/UploadStep.test.tsx
```

- [ ] **Step 3: Implement**

Component: file `<input type="file" accept="video/mp4,video/quicktime,video/webm">` + `VideoFeedPicker` button. On file pick, calls `useVideoUpload()` → on success, calls `mergeStepData({ source })`. Reject client-side if `file.size > MAX_FILE_BYTES`.

```ts
// validate exposed by uploadStep:
validate: (data) => ({
  ok: !!data.source,
  requirements: [{ label: 'Source video selected', met: !!data.source }],
}),
```

- [ ] **Step 4: Run test (passes)**
- [ ] **Step 5: Commit**

```bash
git add src/apps/video-cutdown/steps/UploadStep.tsx src/apps/video-cutdown/steps/UploadStep.test.tsx
git commit -m "feat(video-cutdown): UploadStep + validate() unit test"
```

### Task B7: Implement ConfigureStep + tests

**Files:** `ConfigureStep.tsx`, `ConfigureStep.test.tsx`

- [ ] **Step 1: validate() test**

```ts
import { configureStep } from './ConfigureStep';

describe('configureStep.validate', () => {
  it('rejects empty targetLengths', () => {
    expect(configureStep.validate({}).ok).toBe(false);
    expect(configureStep.validate({ targetLengths: [] }).ok).toBe(false);
  });
  it('passes with one or more lengths', () => {
    expect(configureStep.validate({ targetLengths: [6] }).ok).toBe(true);
    expect(configureStep.validate({ targetLengths: [6, 15, 30] }).ok).toBe(true);
  });
});
```

- [ ] **Step 2-5: implement (three toggle chips, writes `targetLengths`), pass test, commit.**

### Task B8: Implement AnalyzeStep (async submit) + tests

**Files:** `src/apps/video-cutdown/steps/AnalyzeStep.tsx`, `AnalyzeStep.test.tsx`

- [ ] **Step 1: Write the failing test**

```ts
// AnalyzeStep.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { analyzeStep } from './AnalyzeStep';

describe('analyzeStep.validate', () => {
  it('rejects when source is missing', () => {
    expect(analyzeStep.validate({}).ok).toBe(false);
  });
  it('rejects when targetLengths is missing or empty', () => {
    expect(analyzeStep.validate({ source: { sourceKey: 'k', storageRef: 'gs://b/x', durationSec: 30, sizeBytes: 1, mime: 'video/mp4', origin: 'upload', uploadedAt: 1 } }).ok).toBe(false);
    expect(analyzeStep.validate({ source: { sourceKey: 'k', storageRef: 'gs://b/x', durationSec: 30, sizeBytes: 1, mime: 'video/mp4', origin: 'upload', uploadedAt: 1 }, targetLengths: [] }).ok).toBe(false);
  });
  it('passes when source + targetLengths are set', () => {
    const r = analyzeStep.validate({
      source: { sourceKey: 'k', storageRef: 'gs://b/x', durationSec: 30, sizeBytes: 1, mime: 'video/mp4', origin: 'upload', uploadedAt: 1 },
      targetLengths: [6],
    });
    expect(r.ok).toBe(true);
  });
});

describe('analyzeStep.submit', () => {
  it('calls runner.analyze with the right source kind and returns nextStepId=approve', async () => {
    const analyze = vi.fn().mockResolvedValue({ batchId: 'b1', status: 'awaiting-approval' });
    const mergeStepData = vi.fn();
    const ctx: any = {
      client: { slug: 'rl' },
      stepData: {
        source: { sourceKey: 'k', storageRef: 'gs://b/x', durationSec: 30, sizeBytes: 1, mime: 'video/mp4', origin: 'upload', uploadedAt: 1 },
        targetLengths: [6, 15],
      },
      mergeStepData,
      // analyzeStep.submit internally constructs the runner via a hook;
      // test injects via context.runner for testability.
      runner: { analyze, render: vi.fn(), retry: vi.fn() },
    };
    const r = await analyzeStep.submit!(ctx);
    expect(analyze).toHaveBeenCalledWith(expect.objectContaining({
      clientSlug: 'rl',
      source: expect.objectContaining({ kind: 'upload', storageRef: 'gs://b/x' }),
      targetLengths: [6, 15],
    }));
    expect(r).toEqual({ nextStepId: 'approve' });
    expect(mergeStepData).toHaveBeenCalledWith({ batchId: 'b1' });
  });

  it('routes feed source via kind=feed', async () => {
    const analyze = vi.fn().mockResolvedValue({ batchId: 'b1', status: 'awaiting-approval' });
    const ctx: any = {
      client: { slug: 'rl' },
      stepData: {
        source: { sourceKey: 'k', storageRef: 'gs://b/x', durationSec: 30, sizeBytes: 1, mime: 'video/mp4', origin: 'feed', originalUrl: 'https://feed.example.com/v.mp4', uploadedAt: 1 },
        targetLengths: [6],
      },
      mergeStepData: vi.fn(),
      runner: { analyze, render: vi.fn(), retry: vi.fn() },
    };
    await analyzeStep.submit!(ctx);
    expect(analyze).toHaveBeenCalledWith(expect.objectContaining({
      source: { kind: 'feed', url: 'https://feed.example.com/v.mp4' },
    }));
  });

  it('rejects when runner.analyze throws (user stays on step)', async () => {
    const analyze = vi.fn().mockRejectedValue(new Error('Gemini quota exhausted'));
    const ctx: any = {
      client: { slug: 'rl' },
      stepData: {
        source: { sourceKey: 'k', storageRef: 'gs://b/x', durationSec: 30, sizeBytes: 1, mime: 'video/mp4', origin: 'upload', uploadedAt: 1 },
        targetLengths: [6],
      },
      mergeStepData: vi.fn(),
      runner: { analyze, render: vi.fn(), retry: vi.fn() },
    };
    await expect(analyzeStep.submit!(ctx)).rejects.toThrow(/Gemini quota/);
  });
});
```

- [ ] **Step 2: Run test (fails — module missing)**
- [ ] **Step 3: Implement**

```ts
// AnalyzeStep.tsx
submit: async (ctx) => {
  const batchId = newId();
  await ctx.runner.analyze({
    clientSlug: ctx.client.slug,
    batchId,
    source: ctx.stepData.source.origin === 'upload'
      ? { kind: 'upload', storageRef: ctx.stepData.source.storageRef, sourceKey: ctx.stepData.source.sourceKey, mime: ctx.stepData.source.mime, sizeBytes: ctx.stepData.source.sizeBytes, durationSec: ctx.stepData.source.durationSec }
      : { kind: 'feed', url: ctx.stepData.source.originalUrl! },
    targetLengths: ctx.stepData.targetLengths!,
    model: ctx.stepData.analysisModel,
  });
  ctx.mergeStepData({ batchId });
  return { nextStepId: 'approve' };
},
```

UI while pending: spinner + "Analyzing video — this can take 5-15 minutes. Safe to leave this tab open, we'll persist progress." Subscribes to batch doc; once `status === 'awaiting-approval'`, transitions automatically.

- [ ] **Step 4: Run test (passes) → commit**

### Task B9: Implement ApproveStep + tests

**Files:** `src/apps/video-cutdown/steps/ApproveStep.tsx`, `ApproveStep.test.tsx`

- [ ] **Step 1: Write the failing test**

```ts
// ApproveStep.test.tsx
import { describe, it, expect } from 'vitest';
import { approveStep } from './ApproveStep';

describe('approveStep.validate', () => {
  it('rejects when selections array is missing or empty', () => {
    expect(approveStep.validate({}).ok).toBe(false);
    expect(approveStep.validate({ selections: [] }).ok).toBe(false);
  });
  it('passes when at least one selection exists', () => {
    expect(approveStep.validate({ selections: [{ length: 6, optionId: 1, segments: [{ start: '0', end: '6' }] }] }).ok).toBe(true);
  });
  it('passes with selections across multiple lengths', () => {
    expect(approveStep.validate({ selections: [
      { length: 6, optionId: 1, segments: [{ start: '0', end: '6' }] },
      { length: 15, optionId: 2, segments: [{ start: '10', end: '25' }] },
    ] }).ok).toBe(true);
  });
  it('rejects a selection that has zero segments', () => {
    const r = approveStep.validate({ selections: [{ length: 6, optionId: 1, segments: [] }] });
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2-5:** Implement (AI recs grid, per-option checkbox writes `stepData.selections`, optional `SegmentEditor`), pass test, commit.

### Task B10: Implement RenderStep (async submit) + tests

**Files:** `src/apps/video-cutdown/steps/RenderStep.tsx`, `RenderStep.test.tsx`

- [ ] **Step 1: Write the failing test**

```ts
// RenderStep.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { renderStep } from './RenderStep';

describe('renderStep.validate', () => {
  it('rejects with no selections', () => {
    expect(renderStep.validate({}).ok).toBe(false);
  });
  it('passes with one or more selections (render kicks off via submit)', () => {
    expect(renderStep.validate({ selections: [{ length: 6, optionId: 1, segments: [{ start: '0', end: '6' }] }] }).ok).toBe(true);
  });
});

describe('renderStep.submit', () => {
  it('builds one output per selection and calls runner.render', async () => {
    const render = vi.fn().mockResolvedValue({ batchId: 'b1', status: 'completed', completedCount: 2, errorCount: 0 });
    const ctx: any = {
      client: { slug: 'rl' },
      stepData: {
        batchId: 'b1',
        selections: [
          { length: 6, optionId: 1, segments: [{ start: '0', end: '6' }] },
          { length: 15, optionId: 2, segments: [{ start: '10', end: '25' }] },
        ],
      },
      mergeStepData: vi.fn(),
      runner: { analyze: vi.fn(), render, retry: vi.fn() },
    };
    const r = await renderStep.submit!(ctx);
    expect(render).toHaveBeenCalledWith(expect.objectContaining({
      clientSlug: 'rl',
      batchId: 'b1',
      outputs: expect.arrayContaining([
        expect.objectContaining({ selection: expect.objectContaining({ length: 6 }) }),
        expect.objectContaining({ selection: expect.objectContaining({ length: 15 }) }),
      ]),
    }));
    expect(render.mock.calls[0]![0].outputs).toHaveLength(2);
    expect(r).toEqual({ nextStepId: 'download' });
  });

  it('rejects when submit is called without any selections', async () => {
    const render = vi.fn();
    const ctx: any = {
      client: { slug: 'rl' },
      stepData: { batchId: 'b1', selections: [] },
      mergeStepData: vi.fn(),
      runner: { analyze: vi.fn(), render, retry: vi.fn() },
    };
    await expect(renderStep.submit!(ctx)).rejects.toThrow(/no cuts selected/i);
    expect(render).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2-5:** Implement (build `outputs[]` via `newId()` per selection, call `runner.render`, return `{ nextStepId: 'download' }`; live grid via `useVideoCutdownBatch`), pass test, commit.

### Task B11: Implement DownloadStep + tests

**Files:** `src/apps/video-cutdown/steps/DownloadStep.tsx`, `DownloadStep.test.tsx`

- [ ] **Step 1: Write the failing test**

```ts
// DownloadStep.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render as rtlRender, screen } from '@testing-library/react';
import { downloadStep } from './DownloadStep';
import DownloadStepView from './DownloadStep';

vi.mock('../hooks/useVideoCutdownBatch', () => ({
  useVideoCutdownBatch: vi.fn(),
}));
import { useVideoCutdownBatch } from '../hooks/useVideoCutdownBatch';

describe('downloadStep.validate', () => {
  it('always returns ok (terminal step)', () => {
    expect(downloadStep.validate({}).ok).toBe(true);
    expect(downloadStep.validate({ batchId: 'b1' }).ok).toBe(true);
  });
});

describe('DownloadStep render', () => {
  it('renders one download button per complete output', () => {
    (useVideoCutdownBatch as any).mockReturnValue({
      batch: { status: 'completed' },
      outputs: [
        { outputId: 'o1', status: 'complete', storageRef: 'gs://b/o1.mp4' },
        { outputId: 'o2', status: 'complete', storageRef: 'gs://b/o2.mp4' },
        { outputId: 'o3', status: 'error', errorCategory: 'permanent' },
      ],
      loading: false,
    });
    rtlRender(<DownloadStepView stepData={{ batchId: 'b1' }} client={{ slug: 'rl' }} creativeId={null} mergeStepData={() => {}} navigate={() => {}} />);
    expect(screen.getAllByTestId(/download-button-/)).toHaveLength(2);
  });

  it('shows empty-state when zero completes', () => {
    (useVideoCutdownBatch as any).mockReturnValue({ batch: null, outputs: [], loading: false });
    rtlRender(<DownloadStepView stepData={{ batchId: 'b1' }} client={{ slug: 'rl' }} creativeId={null} mergeStepData={() => {}} navigate={() => {}} />);
    expect(screen.getByTestId('download-empty-state')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2-5:** Implement (list of complete outputs with `useStorageUrl` for download URLs, empty-state when none), pass test, commit.

### Task B11b: Implement RecentRendersWidget + tests (Q18)

**Files:** `src/apps/video-cutdown/components/RecentRendersWidget.tsx`, `RecentRendersWidget.test.tsx`

Dashboard widget rendering the last 6 `outputs` for the current client, scoped to `appId: 'video-cutdown'`. Mirrors ad-resizing's "Recently generated" pattern.

- [ ] **Step 1: Write the test**

```ts
// RecentRendersWidget.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render as rtlRender, screen } from '@testing-library/react';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn((q, cb) => {
    cb({ docs: [
      { id: 'o1', data: () => ({ outputId: 'o1', batchId: 'b1', status: 'complete', storageRef: 'gs://b/c', completedAt: { toMillis: () => Date.now() } }) },
    ] });
    return () => {};
  }),
}));

import RecentRendersWidget from './RecentRendersWidget';

describe('RecentRendersWidget', () => {
  it('renders the latest 6 complete outputs', () => {
    rtlRender(<RecentRendersWidget clientSlug="ralph_lauren" />);
    expect(screen.getByTestId('recent-renders-widget')).toBeInTheDocument();
    expect(screen.getAllByTestId(/recent-render-tile/)).toHaveLength(1);
  });

  it('shows empty state when no completes', () => {
    // Re-mock onSnapshot to return zero docs (override pattern).
    // ... empty array path
  });
});
```

- [ ] **Step 2: Implement**

```tsx
// RecentRendersWidget.tsx (sketch)
import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../../../firebase';
import { paths } from '../../../platform/firebase/paths';
import { useStorageUrl } from '../hooks/useStorageUrl';

interface Props { clientSlug: string; }
interface RenderItem { outputId: string; storageRef: string; completedAtMs: number; }

export default function RecentRendersWidget({ clientSlug }: Props) {
  const [items, setItems] = useState<RenderItem[]>([]);
  useEffect(() => {
    if (!clientSlug) return;
    const q = query(
      collection(db, paths.videoCutdownOutputs(clientSlug)),
      where('status', '==', 'complete'),
      orderBy('completedAt', 'desc'),
      limit(6),
    );
    return onSnapshot(q, (snap) => {
      setItems(snap.docs.map((d) => {
        const data = d.data();
        return { outputId: data.outputId, storageRef: data.storageRef, completedAtMs: data.completedAt?.toMillis() ?? 0 };
      }));
    });
  }, [clientSlug]);

  if (items.length === 0) {
    return <div data-testid="recent-renders-widget" className="text-sm text-gray-400">No renders yet.</div>;
  }
  return (
    <div data-testid="recent-renders-widget" className="grid grid-cols-3 gap-2">
      {items.map((it) => (
        <RecentRenderTile key={it.outputId} item={it} />
      ))}
    </div>
  );
}

function RecentRenderTile({ item }: { item: RenderItem }) {
  const url = useStorageUrl(item.storageRef);
  return (
    <a data-testid={`recent-render-tile-${item.outputId}`} href={url ?? '#'} download className="block aspect-video bg-black rounded">
      {url && <video src={url} className="w-full h-full object-cover" />}
    </a>
  );
}
```

- [ ] **Step 3: Mount the widget on the dashboard**

In `src/pages/DashboardPage.tsx` (next to the Active Batch Jobs widget), add a render of `<RecentRendersWidget clientSlug={currentClient.slug} />`. Title: "Recent video cuts".

- [ ] **Step 4: Commit**

```bash
git add src/apps/video-cutdown/components/RecentRendersWidget.tsx \
        src/apps/video-cutdown/components/RecentRendersWidget.test.tsx \
        src/pages/DashboardPage.tsx
git commit -m "feat(video-cutdown): RecentRendersWidget + dashboard mount (Q18)"
```

### Task B12: Update _registry.ts comment but keep flag

Flag default still `false`. Update the inline TODO comment to reflect "lift in progress" → "lift live behind flag (flip in PR-C)".

### Task B13: Add Playwright happy-path test (with fixture infra)

**Files:**
- Create: `tests/e2e/fixtures/video-cutdown/short.mp4` — tiny (~200KB) committed MP4 at 720×1280, 10-second duration. Generated once via `ffmpeg -f lavfi -i testsrc2=duration=10:size=720x1280:rate=30 -f lavfi -i sine=frequency=440:duration=10 -c:v libx264 -preset ultrafast -c:a aac -shortest short.mp4`. Committed to git LFS if size is a concern (otherwise raw commit — small enough).
- Create: `tests/e2e/fixtures/video-cutdown/mockAnalysis.json` — canned Gemini response (single recommendation, single option, one segment 0-6s).
- Create: `tests/e2e/setup/video-cutdown-callable-mocks.ts` — uses `playwright`'s `page.route()` to intercept Firebase Functions HTTPS calls to `/analyzeVideoCutdownBatch`, `/renderVideoCutdownBatch`, `/retryVideoCutdownOutput` and return canned responses. (We use `page.route` instead of `msw` because Firebase callables hit HTTPS endpoints from the browser; `msw` is for fetch/XHR within the JS context which Firebase SDK also uses — either is acceptable, but `page.route` is simpler for v1.)
- Create: `tests/e2e/video-cutdown-happy-path.spec.ts`

**Mock callable behavior:**
- `analyzeVideoCutdownBatch` returns `{ batchId: 'test-batch-1', status: 'awaiting-approval' }` and the spec separately seeds Firestore (via the Firebase emulator) with the batch doc + `videoAnalysis` payload.
- `renderVideoCutdownBatch` returns `{ batchId, status: 'completed', completedCount: 1, errorCount: 0 }` and seeds an `outputs/{outputId}` doc with `status: 'complete'` + a `storageRef` pointing at a real Storage-emulator object (test fixture).
- All callable mocks are 200ms-delayed to exercise the pending-state UI.

**Required infra:**
- Firebase emulator suite (Firestore + Storage + Auth) running during the test. `playwright.config.ts` adds a `globalSetup` that boots `firebase emulators:start --only firestore,storage,auth` and shuts down on teardown.
- Test client signs in via the emulator's auth seed (one of the Alli Studio allowlist emails).

**Spec coverage:**
- Upload step: drag the fixture MP4 into the file input → assert SHA256 hashing progress → assert `stepData.source` populated.
- Configure step: click `6s` chip → Continue enabled.
- Analyze step: Continue triggers mock callable → pending spinner visible → Firestore status flip auto-advances to Approve.
- Approve step: select option 1 → Continue enabled → Continue triggers mock render callable.
- Render step: live tile transitions through pending → rendering → complete (driven by Firestore writes).
- Download step: download button visible with a real Storage emulator URL.

### Task B13b: Add Playwright submit-boundaries test (Test #1)

`tests/e2e/video-cutdown-submit-boundaries.spec.ts`. Three scenarios with mocked callables:

1. **Configure → Analyze submit boundary** — clicking Continue on Configure should invoke the analyze callable, show pending state, then navigate to Approve on Firestore status flip.
2. **Render → Download submit boundary** — clicking Continue on Render should invoke the render callable, show live per-output tile updates as Firestore emits, then navigate to Download when batch settles.
3. **Refresh resumption** — reload mid-analyze (Firestore batch still in `'analyzing'`), the UI should land back on AnalyzeStep with pending state, and auto-advance once the mocked status flips to `'awaiting-approval'`.

### Task B14: Open PR-B

```bash
gh pr create --base dev --title "feat(video-cutdown): PR-B UI lift to 6-step WizardShell" --body "..."
```

---

# PR-C — Decommission legacy

**Acceptance:**
- `/create/video-cutdown` returns a 404 (or redirects to `/adlabs/:slug/video-cutdown`).
- `src/pages/use-cases/UseCaseWizardPage.tsx` no longer contains video-cutdown logic.
- `src/services/videoService.ts` deleted; no remaining imports anywhere.
- `functions/src/ai.ts` and `functions/src/video.ts` either deleted or stripped of the legacy callables.
- `VITE_FEATURE_VIDEO_CUTDOWN_LIFT` flag and all references deleted.
- All tests pass, build green, deploy succeeds, dashboard tile appears unconditionally.

### Task C1: Delete `/create/video-cutdown` route

Modify `src/App.tsx`. Remove the row from the legacy `<Route path="/create/:useCaseId" />` switch (or remove the `'video-cutdown'` case in `UseCaseWizardPage`'s use-case lookup, whichever pattern App.tsx uses).

### Task C2: Remove video-cutdown sections from UseCaseWizardPage.tsx

Identified blocks (verify before deleting):
- Step config registry entry around line 379-383
- Upload block 1865-1992
- Any `case 'video-cutdown'` branches in this file
- Imports of `videoService` and any video-only utilities (`getDownloadURL`, `uploadBytes` may remain for other apps — preserve)

Run `npm run build` after each surgical removal to ensure no cross-app collateral.

### Task C3: Delete `src/services/videoService.ts`

```bash
grep -rln "videoService\|services/videoService" src
```

Should return only files we're about to modify. Delete the service file.

### Task C4: Delete legacy cloud functions

- [ ] **Step 1: Pre-delete grep audit for `analyzeVideoForCutdowns`**

```bash
grep -rln "analyzeVideoForCutdowns" src functions tests scripts 2>/dev/null | grep -v __tests__ | grep -v node_modules
```

Expected: empty (legacy frontend caller `src/services/videoService.ts` was deleted in C3). If anything appears, investigate before deleting the function. Same audit for siblings:

```bash
grep -rln "processVideoCutdowns\|deleteStorageFiles" src functions tests scripts 2>/dev/null | grep -v __tests__ | grep -v node_modules
```

Expected: empty.

- [ ] **Step 2: Delete `analyzeVideoForCutdowns` from `functions/src/ai.ts`**

Remove only the `analyzeVideoForCutdowns` export. If `ai.ts` contains no other exports after the removal, delete the entire file. Then audit:

```bash
grep -n "from \"./ai\"\|from './ai'" functions/src/index.ts
```

If matched and `ai.ts` is now deleted, remove that export line.

- [ ] **Step 3: Delete `processVideoCutdowns` and `deleteStorageFiles` from `functions/src/video.ts`**

Same procedure. If `video.ts` is now empty, delete the file and the `export * from "./video";` line in `functions/src/index.ts`.

- [ ] **Step 4: Build + commit**

```bash
cd functions && npm run build
git add functions/src/ai.ts functions/src/video.ts functions/src/index.ts
git commit -m "chore(video-cutdown): remove legacy v1 callables (analyzeVideoForCutdowns, processVideoCutdowns, deleteStorageFiles)"
```

### Task C5: Flip the feature flag default + delete it

In `src/apps/_registry.ts`, replace:

```ts
const FEATURE_VIDEO_CUTDOWN_LIFT =
  import.meta.env.VITE_FEATURE_VIDEO_CUTDOWN_LIFT === 'true';

const MANIFESTS: AppManifest[] = [ ... ];

if (FEATURE_VIDEO_CUTDOWN_LIFT) {
  MANIFESTS.push(videoCutdownManifest as AppManifest);
}
```

with:

```ts
const MANIFESTS: AppManifest[] = [
  adResizingManifest as AppManifest,
  templateBuilderManifest as AppManifest,
  batchVariantsManifest as AppManifest,
  videoCutdownManifest as AppManifest,
];
```

Then grep + remove:

```bash
grep -rln "VITE_FEATURE_VIDEO_CUTDOWN_LIFT" .
```

Remove from `.env.example`, any dev `.env`, hosting env config, and any test fixtures.

### Task C6: Decide deleteStorageFiles fate

Two choices, pick one:

**(a) Delete it.** `videoService.clearStorage()` is the only caller; that's gone after C3. Remove the export and the function body.

**(b) Refit it.** Rename to `deleteVideoCutdownClientFiles(clientSlug)`, scope to `clients/{slug}/apps/video-cutdown/{sources,outputs}/`, expose via callable with `assertAlliStudioUser`. Only do this if a separate "purge my client's data" UX is needed.

**Recommendation: (a)** — clean break. If purge UX is needed later, build it fresh against the scoped paths.

### Task C7: Audit + remove orphaned legacy Storage data (separate task; tracked outside this plan)

After PR-C ships, run a one-off Firebase console cleanup of:
- `gs://automated-creative-e10d7.appspot.com/uploads/`
- `gs://automated-creative-e10d7.appspot.com/results/`

This is tracked as a separate post-merge task (Task #3 in the writing-plans session task list, mirrored as a TODO in the team's project tracker).

### Task C8: Smoke test + PR-C

- [ ] `npm run build` green
- [ ] `npm run test` + `npm run test:rules` green
- [ ] Manual: navigate to `/create/video-cutdown` — 404 expected
- [ ] Manual: navigate to `/adlabs/ralph_lauren/video-cutdown` — wizard renders, full happy path works without setting `VITE_FEATURE_VIDEO_CUTDOWN_LIFT`
- [ ] `cd functions && npm run deploy` — verify legacy callables disappear from the function list

```bash
gh pr create --base dev --title "feat(video-cutdown): PR-C decommission legacy monolith + flip flag" --body "..."
```

---

## Appendix — Out of scope (tracked separately)

1. **`paths.ts` generalization refactor** — turn `outpaintOutputs/outpaintSources` + `videoCutdownOutputs/...` into generic `outputs(slug, appId)` / `sources(slug, appId)`. Cross-cuts every ad-resizing file. Filed as a separate issue after PR-C lands so it can adopt the generalized helpers from day one.
2. **Cleanup of orphaned `/uploads` and `/results` legacy Storage** — post PR-C, run console-side cleanup (no code).
3. **The other 5 Bucket B legacy apps** (`edit-image`, `new-image`, `edit-video`, `new-video`, `feed-processing`) — each gets its own skeleton workstream. Video-cutdown is the precedent for the *real* lifts; the rest can be skeletons until the product needs them lifted.
4. **"Your generations" cross-app view** — depends on this PR landing (parity schema) + the paths.ts refactor + a `collectionGroup('outputs')` query infrastructure. Tracked as a future product epic.
5. **Function-timeout watchdog (proactive)** — Q17 handles recovery on next render attempt, but does not proactively notify users that their batch is stuck. Future work: a scheduled function that surfaces stuck batches to a dashboard banner. Tracked in TODOS.md.
6. **Web Worker SHA256 for large uploads** — `useVideoUpload` currently runs Web Crypto on the main thread. For files >500MB, the UI freezes 5-30s during hashing. Defer until anyone actually uploads files >500MB. Mitigation: progress indicator + fall back to UUID-based key (no dedup) above a configurable threshold. Tracked in TODOS.md.
7. **Library route + filters + deep-link** — per Q18, PR-B only ships the Recent Renders widget. A full library route (matching ad-resizing's §Q14 PR-E) is deferred to a follow-up workstream after the cross-app library view is scoped.
8. **Wire-contract test asserting client/server type duplication stays in sync** — Task A4c notes that `functions/src/videoCutdown/types.ts` duplicates `src/apps/video-cutdown/types.ts`. A runtime test that asserts the JSON shape of an analysis payload matches the client schema would catch drift. Deferred; for now, the test suite implicitly exercises the shape through the analyze callable test.
9. **Behavioral parity test (new vs legacy analyze/render)** — A fixture-driven integration test that runs both `legacy.analyzeVideoForCutdowns` and the new `analyze()` against the same input, asserts equivalent output shape. Same for FFmpeg `render()`. Would catch any drift introduced during the lift (e.g., a tweaked Gemini prompt parser, a changed FFmpeg filter string). Deferred to a follow-up PR because (a) the legacy callables are deleted in PR-C so the test would only be useful between PR-A merge and PR-C merge, and (b) the manual emulator smoke in Task A14 is the cheaper near-term verification. Recommended for any future app lift in the Bucket B workstream.
10. **Memory-pressure stress test for `RENDER_CONCURRENCY > 1`** — current default of 1 (per plan-eng-review Architecture P1 finding) keeps things safe. Before bumping to 2+, run a load test on a 4GiB function with two concurrent FFmpeg renders against a ~150MB source; observe Cloud Logging for OOM events. Track as a runbook entry, not a code task.

---

## Self-review checklist (run before opening PR-A)

- [ ] Every PR-A task has TDD steps with concrete failing-test → implementation → passing-test pattern.
- [ ] No `TODO` / `TBD` / `implement later` placeholders inside any task body.
- [ ] All `paths.*` helper names match between Task A1 (client definition), Task A4 (server mirror), and Tasks A6/A9/A10 (usage).
- [ ] `VideoCutdownOutputDoc.selection` field is consistent across `src/apps/video-cutdown/types.ts` (client), `functions/src/videoCutdown/types.ts` (server duplicate, Task A4c), renderVideoCutdownBatch, useVideoCutdownBatch.
- [ ] Status union (`'analyzing'`, `'awaiting-approval'`) added in both `BatchRecord` (Task A3) AND the in-list filter in `listActiveBatchesForClient` (Task A3 Step 4).
- [ ] Q16 idempotency guard is wired in `analyzeVideoCutdownBatch.ts` AND has a dedicated test.
- [ ] Q17 orphan-output reset is wired in `renderVideoCutdownBatch.ts` AND has a dedicated test.
- [ ] Q18 Recent Renders widget is mounted in `DashboardPage.tsx` AND queried via `paths.videoCutdownOutputs(...)`.
- [ ] Q19 `cleanupOrphanedSources` is exported from `functions/src/videoCutdown/index.ts` and is in the root `functions/src/index.ts` barrel.
- [ ] PR-B step components each have a vitest unit test for `validate()` correctness.
- [ ] PR-B Playwright suite includes both `happy-path` and `submit-boundaries` specs.
- [ ] `functions/src/_shared/` directory holds paths, ssrf, errorClassifier, timeToSeconds; both `resize/` and `videoCutdown/` import from there (no cross-package imports between them).
- [ ] Manifest `status` flip from `'preview'` to `'live'` is in Task B5, not earlier or later.
- [ ] Feature flag default flip is in Task C5, not earlier.
- [ ] No mention of generalizing `paths.ts` inside this plan (deferred to appendix).
- [ ] Cross-package type imports between `functions/` and `src/` are eliminated; server types are duplicated in `functions/src/videoCutdown/types.ts` (Task A4c).
- [ ] All "verbatim copy" SSRF instructions removed; SSRF lives once in `_shared/`.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ISSUES_OPEN→APPLIED | 8 decisions folded in: shared `_shared/` package (Q15), idempotency (Q16), orphan reset (Q17), Recent Renders widget (Q18), TTL cleanup (Q19), 6-step (not 5) wizard correction, cross-package type fix, PR-B per-step + boundary tests |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |

**VERDICT:** ENG REVIEW CLEAR (after fold-in). 1 unresolved decision proactively addressed via Q17 (was a critical-gap finding). Ready for design review and/or implementation handoff.
