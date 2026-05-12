# Resize Re-crop → Variants (WIP)

**Status:** Design locked through Q9. Implementation not started.
**Origin:** /grill-me interview on 2026-05-12 after diagnosing broken-image bug on re-crop (commit `3593221` "fix(resize): bust storage URL cache + mint fresh token on re-crop" treated the symptom; this plan replaces the in-place re-crop model entirely).
**Prerequisite:** the cache-bust hotfix is already on `dev` — variants build assumes it stays.

## Problem

Today, re-crop overwrites the output at the same Firestore doc + storage path. User has no way to compare the new attempt against the prior, no way to revert, and the system has to fight cache-bust bugs to keep the UI honest. The "in-place re-crop" mental model is wrong for an iterative creative tool.

## New mental model

**Re-crop creates a sibling variant of the same slot, not a replacement.**

- Slot = `(creativeId, dimension.label, dimension.channel)` — the natural composite key. No new fields needed.
- Each re-crop mints a new output doc + new storage path. Old variants stay alive.
- Grid shows one tile per slot (the "representative" variant).
- `SingleImageModal` strip shows all variants of the focused slot; user picks the winner and "Make latest" pins it as the slot's representative.

## Locked decisions

| # | Decision | Notes |
|---|---|---|
| Q1 | Recrop = variant, not version. No history retention beyond the cap. | User rejected version history outright. |
| Q3 | Latest-per-slot in the grid; variant strip lives in `SingleImageModal`. | Keeps the grid a glanceable inventory. |
| Q4 | `retryOutput` (transient error) repairs in place. `reiterateOutput` (user prompt) creates variant. | Different intent → different semantics. |
| Q5 | Group by composite `(creativeId from BatchRecord, dimension.label, dimension.channel)`. No schema change. | `creativeId` not on output doc — read from `batch.sourceCreative.creativeId`. |
| Q6 | Strip ordered newest→oldest L→R. `isPreferred: true` flag overrides "latest" rule. "Make latest" toggles the flag and clears it from siblings. | Single Firestore batch write (2 doc updates). |
| Q7 | **Cap = 2 variants per slot.** FIFO eviction of non-preferred on next re-crop past the cap. Pinned variants never evicted. | Effectively A/B compare with curation. Cap is a starting value; revisit after dogfooding. |
| Q8 | Failed variant docs are written but **hidden from the strip**. Banner-on-failure with Retry button. Retry repairs in place per Q4. FIFO eviction sweeps stale failed docs on next successful re-crop. | Strip stays a curation surface, not an error log. |
| Q9 | Strip = bare thumbnails. Focused variant gets a meta panel below the main OUTPUT pane: prompt, completedAt, "Make latest" toggle, "Use this prompt" pre-fill. | "Use this prompt" is the affordance that makes iteration feel right. |

## Data model changes

**Output doc** (`clients/{slug}/apps/ad-resizing/outputs/{outputId}`):
- New field: `isPreferred?: boolean` (default unset).
- No other shape change. `prompt`, `completedAt`, `dimension.*`, `storageRef` already present.

**outputId format:**
- Today: `${dimId}-${Date.now()}-${rand4}` (AppRoot.tsx:38-40).
- New: `${channelId}-${dimensionId}-${shortId}` where `shortId` is a fresh 6-char per variant.
- Initial batch mints variant #1 with a fresh shortId. Re-crop mints variant #2..N.

**No `variantGroupId` field.** Grouping is computed client-side from the natural composite.

## Server changes (`functions/src/resize/runOutpaintBatch.ts`)

1. Callable already accepts arbitrary `outputs[].outputId` — the variant scheme works without server changes for the happy path.
2. **Eviction pass** after writing a re-crop variant doc:
   - Query slot's outputs by `(dimension.label, dimension.channel)` where `isPreferred != true`, ordered by `createdAt` ASC.
   - If count > 2, delete head doc + its `storageRef` + intermediates. Best-effort; wrap in try/catch.
3. **No change to `retryOutput` path** — in-place repair stays.

## Client changes

- **`useBatchOutputs`**: subscription unchanged; consumers group results by slot composite + filter to latest-or-preferred per slot for grid view.
- **New `useSlotVariants(outputs, slotKey)` hook** OR inline filter in `AppRoot.tsx`: returns ordered variants for a focused slot.
- **`GeneratedTile`**: no API change. Receives the representative variant.
- **`SingleImageModal`**:
  - Strip refactored from "all batch outputs" → "variants of focused slot."
  - Below main OUTPUT pane: meta panel with prompt, completedAt, "Make latest", "Use this prompt."
  - Re-crop textarea pre-fills from focused variant's prompt when "Use this prompt" is clicked.
- **Selection state**: currently a `Set<outputId>` (AppRoot.tsx:77, 426-428). **Must re-key by slot composite** and resolve to representative-variant-at-download-time. Otherwise: user selects tile → re-crops → download grabs stale variant.

## Caveats / risks

1. **`dimension.channel` is the human label**, not a slug. Grouping works but is brittle if channel labels are ever renamed upstream. Acceptable for now; flag in code.
2. **Selection-state staleness** is a data-correctness bug if not addressed at the same time as the variant rollout. Don't ship variants without re-keying selection.
3. **Eviction race**: a variant doc gets written, then ~1 RTT later the eviction query fires. Listener might briefly show 3 variants in the strip. Acceptable; can be tightened with a server-side transactional write if it becomes visible.
4. **Cap-locked state** (2 preferred-pinned variants in one slot): user must unpin one before next re-crop. Show soft UI warning; rare.

## Open questions deferred

- App Check / per-user rate limiting on re-crop spam (separate concern; v1 inherits whatever the callable has today).
- Whether the source image should appear in the strip alongside variants, or stay in its own SOURCE pane.
- Persistent prompt history across sessions (out of scope — prompts live on the variant doc, not a separate history collection).

## Implementation order (when picked up)

1. **Server**: add `isPreferred` to output schema. Implement eviction pass. Unit tests for: cap not hit (no eviction), cap hit (evict oldest non-preferred), all variants preferred (no eviction + soft warning surfaced to client).
2. **Client data layer**: slot-grouping helper; `useSlotVariants` selector.
3. **Grid**: switch `GeneratedTile` to receive representative variant; selection state re-keyed by slot composite.
4. **Modal**: strip refactor, meta panel, "Make latest", "Use this prompt" pre-fill, failure banner.
5. **outputId scheme** shift (deferred to last — touches `useOutpaintRunner.runBatch` and `reiterateOutput`; cleanest done with the modal work).
6. Manual QA: A/B compare flow, pin + re-crop, cap eviction, transient retry on failed re-crop.

## Files touched (estimated)

- `functions/src/resize/runOutpaintBatch.ts` (eviction logic)
- `functions/src/resize/schema.ts` (isPreferred field)
- `src/apps/ad-resizing/AppRoot.tsx` (selection re-key, grid grouping, modal wiring)
- `src/apps/ad-resizing/hooks/useBatchOutputs.ts` (grouping helper or new selector)
- `src/apps/ad-resizing/hooks/useOutpaintRunner.ts` (outputId scheme on `reiterateOutput`)
- `src/apps/ad-resizing/components/SingleImageModal.tsx` (strip + meta panel + "Use this prompt")
- `src/apps/ad-resizing/components/GeneratedTile.tsx` (representative variant prop)
- `src/apps/ad-resizing/types.ts` (`isPreferred` on `GeneratedOutput`)
