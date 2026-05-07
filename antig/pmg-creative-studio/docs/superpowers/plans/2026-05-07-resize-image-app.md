# Resize Image — App Plan (v1)

**Status:** In progress — grilling paused at Q7 (model choice). User is gathering multimodal-framework research notes before resuming.
**Owner:** Diego (planning) → Annie (implementation, per kickoff doc)
**Branch:** `feature/resize-image-app` (off `dev`)
**Skeleton already in:** `src/apps/resize-image/` (PR `feature/resize-image-skeleton`, merged via PR #11)
**Kickoff doc:** `docs/teammate-prompts/resize-image-app-kickoff.md`

---

## Vision

A modular AdLabs app that **takes existing approved creatives from a client's product/ad feed and AI-expands them to additional dimensions**. Source assets come from Alli platform datasources (same plumbing Dynamic Template Builder uses) — no uploads. Output is a batch of resized variants written under the SOC2 path-scoping pattern (PR #7) and surfaced on the AdLabs dashboard's Active Batch Jobs.

The kickoff doc (Annie's brief) was written assuming a single-upload model. **This plan supersedes the source-input portion of the kickoff** — datasources replace uploads. Everything else in the kickoff (Firestore paths, persistence rules, tracer-test discipline, no top-level collections) still holds.

---

## Decisions locked

### Q1 — Source input
**Pull from client's Alli datasources**, not uploads.
- Reuse `fetchDataSources({ clientSlug })` from `src/apps/template-builder/_internal/handlers.ts` (already battle-tested + client-scoped).
- Reuse `fetchFeedSample({ clientSlug, feed })` to pull rows.
- Drop the `UploadStep` from the scaffold; rename to `SourceStep`.

### Q2 — Selection model
**Multi-asset (B)**, with single-asset (A) as the tracer-test happy-path.
- One BatchRecord covers M assets × N sizes = M×N variations.
- M=1 is the integration-test target (cheapest end-to-end pipeline exercise).
- Hard ceiling for v1: 100 assets × 10 sizes per batch (sanity cap, not a product cap).

### Q3 — Wizard structure
**5 steps**: `Source → Assets → Sizes → Preview → Approve`.
- Replaces the scaffold's 4-step layout (`upload, sizes, preview, approve`). Cheap to update — Annie's step bodies are still stubs.
- Each step has one clear decision; `Source` validates `selectedDatasource`, `Assets` validates `selectedAssetIds.length > 0`, etc.
- Registry order (`_registry.ts`) doesn't change because that's app-level, not step-level.

### Q4 — Datasource column inference
**Cloud Function with lazy Firestore caching** (replaced the simpler client-side heuristic).
- New CF: `inferDatasourceColumns({ clientSlug, datasourceName })`
  1. Check Firestore at `clients/{slug}/datasourceMappings/{datasourceName}`.
  2. If hit + within 7-day TTL + schema-fingerprint-matches → return cached.
  3. Else: fetch sample, scan first ~10 rows, classify columns into `{ imageColumns, titleColumns, descriptionColumns, idColumns, otherColumns }`, persist with schema fingerprint, return.
  4. On error: return null; client falls back to heuristic from `SourceStep.tsx:376-381` so flow never hard-breaks.
- Storage: client-level (cross-app reusable for future Edit & Tweak, Batch Variants), follows PR #7 SOC2 path-scoping.
- TTL: 7 days; schema fingerprint (hash of column names) shortens earlier if feed schema changes.
- Trigger: fire-and-forget when user clicks a datasource on Source step. By Continue → Assets render, mapping is ready (~500ms–2s blocking on first run, instant on cache hit). Visual: small "analyzing schema…" pill on the datasource card.
- Enhancement: `fetchDataSources` joins in cached mappings server-side so pre-mapped datasources show a ✓ "ready" indicator in the picker — no extra round-trip.
- Why this beats pre-warming all datasources on app entry: average client has 50–100 datasources, user picks 1, so pre-warm = 49–99× wasted compute per session. Lazy + cache wins.
- Cost: ~$0.001/datasource (heuristic only, no LLM). Storage ~1 KB per mapping. Total ~$0.05/client/month at typical usage.
- Future v2: optional LLM-assisted classification via Haiku (~$0.005/call) for richer column understanding — defer.

### Q5 — Asset gallery card
**Image-only thumbnail grid + list-view toggle + search-by-ID**.
- Default: dense thumbnail grid (4–6 cols at typical viewport). Each card = image + checkbox for multi-select. Filename/index in tooltip.
- Toggle: list view (rows with thumbnail + ID + title + checkbox). Useful when scanning many assets.
- Search bar: client-side filter on the row array by ID/title.
- No Instagram-mockup framing — that's the platform's Ad Gallery surface; ours is a picker.
- Rows where the image-column resolution returns no URL render as unselectable cards with a "no image detected" badge.

### Q6 — Preview pipeline architecture
**Async-first batch model**, not foreground submit.
- PreviewStep `submit` kicks off the batch (writes BatchRecord, status=`processing`), then **immediately advances to Approve**. ApproveStep shows pending state with thumbnail skeletons that fill in as `Result` documents land in `clients/{slug}/apps/resize-image/batches/{batchId}/results/`.
- Live UI: Firestore `onSnapshot` on `batches/{batchId}` (for `completedVariations` progress) and on `batches/{batchId}/results` (for individual thumbnails).
- User can close the tab during processing. Reopening the dashboard shows the in-flight batch in Active Batch Jobs (the prototype `.job-card` pattern: title + status badge + meta + progress bar + footer).
- **"View job" link** on the dashboard's Active Batch Jobs row routes to `/adlabs/:clientSlug/resize-image/batch/:batchId` and **re-enters the wizard at ApproveStep** hydrated from the BatchRecord. Same UI as fresh-flow ApproveStep — just resumed.
- Approve writes `approved: true` on the batch and the Result documents (depending on per-result vs batch-level approval — see Q-open).
- Cloud Function side: `runResizeBatch` is fire-and-forget. It iterates assets × sizes, calls Replicate (model TBD — Q7) per (asset, size), writes Result documents one at a time, updates `completedVariations` after each, sets `status: 'completed'` when done.
- Tracer (M=1): user sees one skeleton flip to a thumbnail in ~30s, approves immediately. Same code path, no special-casing.

---

## Decisions OPEN (pending multimodal-framework notes)

### Q7 — AI-resize model on Replicate
**Status:** held by user pending research notes.
**Candidates surfaced so far:**
- Bria GenFill (~$0.025/call, ~5–8s, purpose-built for ad creative) — my v1 recommendation
- FLUX Fill Pro (~$0.05, ~10–15s, premium quality, higher hallucination risk on logos/text)
- SDXL Inpainting (~$0.005, ~6–10s, quality dings on brand work) — non-starter for v1

User wants to weigh in based on multimodal-framework research before locking. May also propose alternative architectures (custom Cloud Function pipeline, multi-model ensemble, etc.).

### Other open branches we'll hit after Q7
- **Output destination** — download links only? Push approved variants to Asset House? Both?
- **Brand standards involvement** — does the AI prompt incorporate brand color / logo / style from the asset house? Flips `requiresBrandStandards: true`. Whether the SizesStep pulls allowed sizes from asset house.
- **Per-asset preview regeneration** — can users re-run a single (asset, size) cell if AI output is bad?
- **Partial-approval semantics** — thumbs-up per result vs all-or-nothing batch approve.
- **Source crop/reposition** — does user adjust framing before AI fills, or fully automatic?
- **Watermark / brand mark** application on outputs.
- **Cost guardrails** — per-batch cost cap? Per-client monthly budget? Concurrent-batch rate limit?
- **Failure handling on partial success** — what happens when 47 of 150 calls fail mid-batch?
- **Sizes list confirmation** — kickoff doc has hardcoded `[1080×1080, 1080×1350, 1080×1920, 728×90, 300×250, 970×250]`. Pull from asset house instead?
- **Dedup** — if a row is selected and it matches a previously-resized asset (same image hash + same size), skip or re-run?
- **Cancel / pause** — kickoff doc shows "Pause" link in dashboard footer. Wire it or stub it for v1?

---

## Data model (so far)

### `ResizeImageStepData` (replaces `types.ts` skeleton)

```ts
export interface ResizeImageStepData extends StepData {
  // Source step
  selectedDatasource?: { id: string; name: string; type?: string };

  // Assets step
  imageColumn?: string;           // user-overridable; auto-seeded from inferred mapping
  selectedAssetIds?: string[];    // row IDs from the feed sample
  selectedAssets?: Array<{
    id: string;
    imageUrl: string;
    title?: string;
    raw?: Record<string, unknown>; // the source row, for downstream metadata
  }>;

  // Sizes step
  selectedSizes?: string[];       // e.g. ['1080x1080', '1080x1350']

  // Preview step
  batchId?: string;               // written when submit fires the batch

  // Approve step
  approved?: boolean;
}
```

Source images are **not** stored in stepData (they're URLs from the feed). Generated previews are not stored in stepData either — they live as `Result` documents under the batch and ApproveStep reads them via Firestore listener.

### Firestore paths (per PR #7 SOC2 path-scoping)

| Concern | Path |
|---|---|
| Datasource column mappings (cross-app cache) | `clients/{slug}/datasourceMappings/{datasourceName}` |
| Batch records | `clients/{slug}/apps/resize-image/batches/{batchId}` |
| Per-(asset, size) results | `clients/{slug}/apps/resize-image/batches/{batchId}/results/{resultId}` |
| Cloud Storage (generated images) | `clients/{slug}/apps/resize-image/outputs/{batchId}/{resultId}.{ext}` |

`Result` document shape:
```ts
{
  id: string;
  assetId: string;          // matches selectedAssets[i].id
  size: string;             // '1080x1080'
  status: 'pending' | 'done' | 'failed';
  url?: string;             // Cloud Storage download URL once complete
  thumbnailUrl?: string;    // small thumb for ApproveStep grid
  errorMessage?: string;    // populated on status='failed'
  createdAt: Timestamp;
  completedAt?: Timestamp;
  approved?: boolean;       // set when user approves (TBD: per-result vs batch-level)
}
```

---

## Component / file plan

```
src/apps/resize-image/
├── manifest.ts                ← update steps array to [source, assets, sizes, preview, approve]
├── types.ts                   ← replace stub with the data model above
├── steps.ts                   ← update barrel exports
├── steps/
│   ├── SourceStep.tsx         ← rename from UploadStep; reuse template-builder SourceStep pattern
│   ├── AssetsStep.tsx         ← NEW: gallery grid with multi-select + list toggle + search
│   ├── SizesStep.tsx          ← unchanged structurally (Annie's step)
│   ├── PreviewStep.tsx        ← submit kicks off batch, advances immediately
│   └── ApproveStep.tsx        ← live thumbnails via Firestore onSnapshot; approve writes batch-level flag
├── _internal/
│   ├── handlers.ts            ← thin wrappers around shared helpers; submitBatch() that calls runResizeBatch CF
│   └── gallery.ts             ← row-to-card transform (image col resolution, dedup, etc.)
└── AppRoot.tsx                ← unchanged

functions/src/resize-image/
├── inferDatasourceColumns.ts  ← NEW: Cloud Function, lazy-cached
├── runResizeBatch.ts          ← NEW: orchestrates per-(asset, size) Replicate calls, writes Results
└── runResizeOne.ts            ← internal: single Replicate call wrapper (called by runResizeBatch)
```

---

## Tracer-test discipline (per kickoff doc)

For each step, ship a unit test covering its `validate` + `submit` (where applicable) + `mergeStepData` calls. Plus E2E:

```
tests/e2e/resize-image.spec.ts
├── Tracer 1 (M=1 happy path): pick datasource → pick 1 asset → pick 1 size → submit → approve → BatchRecord exists
├── Tracer 2 (Multi-asset): pick datasource → pick 5 assets → pick 2 sizes → submit → batch shows 10 results
└── Tracer 3 (Resume): same as Tracer 2 but close the wizard during processing → reopen via dashboard "View job" → ApproveStep hydrates correctly
```

Mock Replicate at the network layer (or via a feature-flagged stub mode in `runResizeBatch`).

---

## Sequencing (proposed)

1. **PR 1 — Step shape + Source step.** Update manifest to 5 steps, rename UploadStep → SourceStep, reuse `fetchDataSources`. Lands the wizard skeleton without any AI work. Tracer: pick a datasource, see green checkmark.
2. **PR 2 — `inferDatasourceColumns` Cloud Function.** Lazy-cached column inference. Add to `fetchDataSources` response join. Source step shows ✓ on pre-mapped datasources.
3. **PR 3 — Assets step.** Gallery grid + list toggle + search + multi-select. Reads `imageColumn` from inferred mapping with override dropdown.
4. **PR 4 — Sizes step.** Hardcoded list per kickoff. Validates ≥1 size.
5. **PR 5 — Preview step async submit.** Writes BatchRecord, advances to Approve. CF stub returns mock URLs for now (no AI yet).
6. **PR 6 — `runResizeBatch` + chosen model (Q7).** Replace stub with real Replicate calls. Cost guardrails. This is where the multimodal-framework research notes will land.
7. **PR 7 — Approve step live thumbnails + dashboard "View job" wiring.** Firestore listener, skeleton-to-thumbnail, batch-level approve.
8. **PR 8 — Polish.** Error states, retry per-result, edge cases.

PRs 1–5 land before model choice — keeps the team unblocked while Q7 remains open.

---

## Notes from the conversation

- **Reuse over invent.** SourceStep template, fetchDataSources/fetchFeedSample handlers, BatchRecord schema, dashboard's Active Batch Jobs reader, Firestore path helpers — all already exist. We're composing, not building.
- **The "lift into Brand Asset House" line in the manifest description** (`Lift an approved creative into Brand Asset House and AI-expand it for new dimensions.`) reads strangely now. The source is already in a feed. Whether we *also* register it into Asset House as a side effect is a Q-open. Default for v1: don't, keep Asset House decoupled.
- **AppId union doesn't change** — `'resize-image'` is already in `src/platform/firebase/paths.ts`.
- **Dashboard registry order doesn't change** (e2e tracer 1 asserts a specific count).
