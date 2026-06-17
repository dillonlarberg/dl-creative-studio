# Video-Stitch v1 — Slice 1 Lane B (Frontend)

**Date:** 2026-06-17
**Branch:** dev (work directly per repo convention — no worktree)
**Tracker:** dillonlarberg/dl-creative-studio#78 · Slice 1
**Status:** PLAN — reviewed (/plan-eng-review + Codex outside voice), ready to implement
**Design doc:** ~/.gstack/projects/dillonlarberg-dl-creative-studio/diegoescobar-dev-design-20260616-090800.md (APPROVED)

---

## Context

Video-Stitch v1 = curated multi-asset → 15s social reel. Human curates + orders;
the tool does the mechanics (normalize to 9:16, motion on statics, cuts on the beat).
**Greenlight bar, not content bar. Zero AI in v1.** Analytics moat deferred to M2.

Slice 1 **Lane A (backend spine)** is built, tested, and MERGED to `dev` (PR #97).
`stitchGenerate` exists but is **not deployed** and has **no caller**. This plan is
**Lane B = the frontend** that calls it. Slice 1 is **scale-only** — off-aspect stills
and video letterbox-pad to 9:16 (no crop); outpaint (stills) + blurred-fill (video)
land later in #93/#94. Images ARE wired into the live flow (normalize gets `isStill` +
duration); zoompan *motion* on stills is the #92 polish.

Visual reference: `src/apps/video-stitch/v1-prototype.html` (clickable mock, 5 stages).

---

## Backend contract (already merged — Lane B consumes this, do not modify)

**Callable:** `stitchGenerate` (us-central1, 4GiB, 540s, App Check off). One synchronous
call: downloads + normalizes each asset in order, renders, uploads, returns a signed URL.

```ts
interface StitchInput {
  clientSlug: string;   // /^[a-z0-9_-]+$/
  batchId: string;      // non-empty; doubles as outputId
  assets: AssetRef[];   // 2–8 (MAX_ASSETS = 8)
  trackId: string;      // non-empty
  targetSec?: number;   // default 15
}
// returns: { reelUrl: string }   ← pre-signed MP4 URL (deps.sign), stitchGenerate.ts:162

type AssetRef = { datasourceId: string; assetId: string; kind: 'image'|'video'; srcUrl: string };
```

**VERIFIED backend behavior that shapes this plan:**
- **All-or-nothing** (stitchGenerate.ts:140-152): the asset loop `fetchUrl` → `normalize`
  throws on the FIRST bad asset → `catch` writes `status:'error'` + rejects. There is **no
  partial-skip** (the design doc's "skip + render remainder" was NOT implemented). → we
  protect with client-side pre-validation (Decision 4).
- **Direct-file download only** (`deps.fetchUrl` → plain `fetch()` to temp file, then ffmpeg
  reads the file). HLS `.m3u8` with authenticated/relative segments breaks. → Slice 1
  accepts `.mp4/.mov/.webm` only (Decision 4).
- **Scale-normalize PADS, never crops** (ffmpegImage.ts:101-103, `force_original_aspect_ratio
  =decrease` + `pad`). Off-aspect = black letterbox bars (Decision 5 mitigates).
- Writes a unified `OutputDoc` at `clients/{slug}/apps/video-stitch/outputs/{batchId}`
  (pending → complete/error). **Slice 1 does NOT subscribe to it** (Decision 2).

---

## Locked decisions (eng review + Codex, 2026-06-17)

1. **Mixed image+video picker, sourced from `creative_insights_data_export`.** Build-step-0
   smoke (2026-06-17, real Nike + RL) settled this: ALL video lives in the single
   `creative_insights_data_export` model as **direct-file `.mp4`** (`content-type video/mp4`,
   HTTP 206, fetchable; zero HLS). So the picker reads ONE model, not a feed join:
   `datasourceToAssets()` maps each row → `PickedAsset` with `kind` straight from
   `creative_type` ('image'|'video'), `srcUrl` from `url`, `assetId = sha256(url).slice(0,16)`.
   Query dims: `['ad_id','url','creative_type','brand_visuals']` (+ channel/name for labels).
   **Requires Decision 7** (media-aware strip) — video rows are filtered out by default today.
2. **Promise-authoritative run, fail fast.** No Firestore subscription, no `useStitchOutput`.
   `generate()` resolves `{reelUrl}` → reel; rejects → fail-fast error + Retry. The 540s call
   always settles (client timeout 600000ms > server 540s), so no infinite-spinner case.
   **Stale-call guard:** Retry mints a NEW `batchId`; an in-flight run is invalidated so an
   old promise can't overwrite a newer run; explicit settled/error state.
3. **No `useStorageUrl` in Slice 1.** Reel is pre-signed; source assets are external URLs.
   (Shared extraction deferred to TODOS.md when a later slice reads a storage path.)
4. **All-or-nothing + client pre-validation.** Backend unchanged. `validateAssets()` gates
   Stitch: every `kind:'video'` srcUrl ends `.mp4/.mov/.webm` (reject `.m3u8`) and is
   reachable. Backend partial-skip tracked on #78, not TODOS (user's call).
5. **Scale-only demo = soft-guide to near-9:16 + label.** Picker surfaces near-vertical
   assets first + a "vertical-ready" hint; off-aspect tiles get a small "letterboxed" badge;
   reel screen notes "polished fill (blur/outpaint) coming soon." No backend work.
6. **Drag-to-reorder = @dnd-kit.** Declare `@dnd-kit/core`, `@dnd-kit/sortable`,
   `@dnd-kit/utilities` in ROOT `package.json` (today only transitive via the DS package —
   importing transitive deps breaks CI/install hygiene).
7. **Media-aware datasource strip.** Add a `media` param to the shared sample/scan path
   (`src/platform/datasources/fetch.ts:217`, `functions/src/datasources/scan.ts:87`): default
   keeps dropping `creative_type === 'video'` from `creative_insights_data_export` (ad-resizing
   UNCHANGED); stitch passes `media:'all'` to include video. Surgical, one source of truth.
   Pulls a small, tested change into the shared `src/platform/datasources` layer (+ the
   functions-side scan for registry `hasVideo` accuracy).

---

## Architecture — mirror video-cutdown

`AppRoot` is a stage-based orchestrator; stages are conditional renders (no nested router).

```
src/apps/video-stitch/
├── AppRoot.tsx              # source→arrange→music→run→reel + fail-fast/stale-call guard
├── manifest.ts             # EDIT: status 'preview'→'live', steps: []
├── types.ts                # Stage, PickedAsset, StitchConfig
├── components/
│   ├── StepIndicator.tsx   # 5-step progress (port from cutdown)
│   ├── SourcePicker.tsx    # multi-select masonry; near-9:16 first + letterbox badge
│   ├── ArrangeBoard.tsx    # @dnd-kit sortable filmstrip + read-only beat ruler
│   ├── MusicPicker.tsx     # track list (port cutdown MusicPicker)
│   ├── GeneratingPanel.tsx # Ask-Alli orbit + indeterminate 'Stitching ~20-40s' (NO checklist)
│   └── ReelResult.tsx      # 9:16 <video> of reelUrl + download + error/Retry state
├── hooks/
│   ├── useStitch.ts        # httpsCallable(functions,'stitchGenerate',{timeout:600000})
│   └── useStitchTracks.ts  # music catalog (confirm reuse cutdownListTracks vs new — step 1)
└── utils/
    ├── planDurations.ts    # even 15s split, 0.5s beat-snap (port prototype durations())
    ├── datasourceToAssets.ts # rows → PickedAsset[] (image+video), assetId = sha256(srcUrl)
    ├── validateAssets.ts   # direct-file + reachable gate before Stitch
    └── reorder.ts          # arrayMove reducer (tested independently of dnd-kit)
```

Edits outside the app dir:
- `src/App.tsx` — swap video-stitch route from `<WizardShell .../>` to
  `<ClientProvider><VideoStitchAppRoot/></ClientProvider>` (copy cutdown L151-158).
- `package.json` — add the three `@dnd-kit/*` deps.
- `src/platform/datasources/fetch.ts` (+ `functions/src/datasources/scan.ts`) — media-aware
  strip (Decision 7), behavior-preserving for ad-resizing, with tests on both branches.
- `src/apps/_registry.ts` already lists `videoStitch` — no change.

`datasourceToAssets` reads `creative_insights_data_export` rows: `kind = creative_type`,
`srcUrl = url`, `assetId = sha256(url).slice(0,16)`. No image-column/video-column join.

---

## Data flow

```
source   useDatasources(slug) [show 'scanning' state] → getDatasources(slug,{media:'video'})
         → fetchFeedSample → datasourceToAssets() → ordered PickedAsset[] (tap order)
         gate: 2 ≤ N ≤ 8  AND  validateAssets() passes
arrange  @dnd-kit reorder PickedAsset[]; planDurations(N) shows beat-snapped split (display only)
music    pick trackId
run      mintBatchId() → generate({slug,batchId,assets,trackId,targetSec:15})
         ├─ resolve {reelUrl} → go('reel')
         └─ reject           → go('reel') in error state + Retry (new batchId → arrange)
         GeneratingPanel = orbit + 'Stitching ~20-40s' (no subscription)
reel     <video controls src={reelUrl}> + Download; error → message + Retry
```

`AssetRef` sent = `PickedAsset` minus UI-only fields (`thumbUrl/w/h/name/aspect`).

---

## Test plan (vitest; React-17-DS vi.mock shim per reference_ds_react_version_test_mock)

★★★ targets: `planDurations` (sum===target, 0.5s snap, N=2..8), `datasourceToAssets`
(image/video/mixed/missing-url), `validateAssets` (rejects .m3u8 + unreachable),
`reorder` (arrayMove), AppRoot **fail-fast reject path** (CRITICAL) + stale-call guard.
★★: SourcePicker select/gate, MusicPicker. Full happy path = manual smoke on dev staging
(no Playwright in repo). No regression tests (Slice 1 is additive).

Build step 1 also confirms `WizardShell.preview.test.tsx` uses an inline fixture (not the
real manifest) so flipping to `live` doesn't break it.

Artifact: ~/.gstack/projects/dillonlarberg-dl-creative-studio/diegoescobar-dev-eng-review-test-plan-20260617-115849.md

---

## Failure modes (each new codepath)

| Codepath | Realistic failure | Test? | Error handling | User sees |
|----------|-------------------|-------|----------------|-----------|
| generate() | backend throws / 540s timeout | ✓ reject test | ✓ fail-fast | error + Retry (not silent) |
| datasource scan | Alli token gone after hard refresh | — | picker error state | "reconnect" message (demo: avoid hard refresh) |
| validateAssets | .m3u8 / unreachable video | ✓ | ✓ gate Stitch | tile flagged, Stitch disabled |
| all-or-nothing | 1 of N assets bad slips past validation | ✓ reject | ✓ fail-fast | whole-reel error + Retry |
| stale Retry | old promise resolves after new run | ✓ guard test | ✓ batchId guard | only newest run shown |

No silent failures in scope. (Backend partial-skip would soften the all-or-nothing row — deferred to #78.)

---

## Design spec (Lane B) — from /plan-design-review (2026-06-17)

Happy-path visuals are locked by `v1-prototype.html` + Alli DS. This pass adds the
states + new-decision visuals the prototype doesn't show.

**Interaction states (what the user SEES):**

```
SCREEN        | LOADING                 | EMPTY                        | ERROR                               | SUCCESS
--------------|-------------------------|------------------------------|-------------------------------------|---------------
Source picker | "Scanning your library…"| "No stitchable creatives in  | "Couldn't reach your library.       | masonry + order
              | + shimmer tiles (.shimmer)| this client's library yet"   | Reconnect" + Retry (hard-refresh    | badges
              |                         | + try-another-datasource     | drops the Alli token — prior learn) |
Music         | track-row skeletons     | "No tracks available" (rare) | "Couldn't load tracks" + Retry      | track list
Run (generate)| IS the loading state    | n/a                          | fail-fast error card + Retry (D2)   | → reel
Reel          | native <video> buffering| n/a                          | "Reel couldn't load" + Re-stitch    | 9:16 player + DL
```

Empty/error copy is warm + has a primary action (never a bare "No items found").

**New-decision visuals:**
- **D1 — media-element tiles + aspect detection (design review):** `<img>` for images,
  `<video preload="metadata" muted>` first-frame for videos. `onLoad`/`onLoadedMetadata`
  → natural/videoWidth+Height → `offAspect` (|AR − 9/16| over threshold). Drives the
  near-9:16 sort + the "letterboxed" badge. Fallback: gradient + play icon on load error.
  Bounded by the picker sample size (note perf if a sample ever returns hundreds).
- **D2 — proactive tile validation (design review):** run `validateAssets`' synchronous
  URL-shape check as tiles load; unusable assets (HLS / non-direct) render dimmed +
  "Unsupported format" tag, not selectable, tooltip explains. The user never orders
  around a dead asset; the Stitch button never blocks on a bad pick.
- **Letterbox badge (Decision 5):** off-aspect tiles get a small "letterboxed" badge;
  near-9:16 surfaced first + a "vertical-ready" hint; reel screen notes "polished fill
  (blur/outpaint) coming soon."
- **Fail-fast error card (Decision 2):** Run/Reel error state = message + Retry (→ arrange,
  selection preserved, new batchId).

**Responsive + a11y:** masonry `columns-2 sm:3 lg:4` (prototype); arrange filmstrip
flex-wraps; step indicator scrolls-x on mobile. dnd-kit with touch + keyboard sensors,
44px drag handle. Tiles are `<button>` with visible focus rings; native `<video controls>`;
44px min touch targets; Alli blue-600-on-white contrast passes. Components use Alli DS
tokens only (no default font stacks / generic gradients).

## What already exists (reused, not rebuilt)

- video-cutdown `AppRoot` pattern + `StepIndicator`/`MusicPicker` (port).
- ad-resizing `useDatasources` + `getDatasources({media})` + `fetchFeedSample` (reuse;
  `feedToCreatives` is image-only → replaced by `datasourceToAssets`, NOT ported).
- `src/apps/_registry.ts` already lists `videoStitch`.
- Backend `stitchGenerate` + `planStitch` + scale-normalize (merged, untouched).

## NOT in scope (deferred, with rationale)

- **Live progress checklist / output-doc subscription** — promise is source of truth (Decision 2).
- **Outpaint stills (#93) + blurred-fill video (#94) + zoompan motion (#92)** — Slice 1 is scale-only.
- **Backend partial-skip** — all-or-nothing + client pre-validation for Slice 1 (tracked #78).
- **HLS/streaming video** — direct-file only (TODOS.md).
- **Upload tab, AI selection/auto-order, export targets, analytics remix, generations-list view** — later milestones.
- **Shared useStorageUrl extraction** — not needed in Slice 1 (TODOS.md).

---

## Parallelization

Mostly one module (`src/apps/video-stitch/`), so largely sequential, but two clean lanes
after the shared scaffold:

| Step | Modules | Depends on |
|------|---------|-----------|
| 0 scaffold + step-1 datasource smoke + deps | video-stitch/, package.json, App.tsx | — |
| A utils (planDurations, datasourceToAssets, validateAssets, reorder) + tests | video-stitch/utils | 0 |
| B SourcePicker + ArrangeBoard + MusicPicker | video-stitch/components | 0, A (utils) |
| C AppRoot wiring + GeneratingPanel + ReelResult + fail-fast | video-stitch/ | A, B |

Lane A (pure utils, fully testable) and the component shells in Lane B can run in parallel
after step 0. AppRoot (C) integrates — sequential. Worktrees not needed (one app dir; the
no-worktree repo convention applies).

---

## Build order

0. **Datasource smoke — ✅ DONE (2026-06-17).** Verified via `tools/stitch-smoke/probe.mjs`
   against real Nike + RL: video = direct `.mp4` in `creative_insights_data_export`, fetchable,
   zero HLS. Decisions 1 + 7 locked. Remaining step-0 mechanics: add `@dnd-kit/*` to
   package.json; flip `manifest.ts` → live + swap `App.tsx` route; confirm
   `WizardShell.preview.test.tsx` uses an inline fixture (not the real manifest). Delete the
   throwaway `tools/stitch-smoke/` when done.
1. **✅ DONE (2026-06-17).** Media-aware strip (`fetch.ts` + cache-key namespacing, behavior-
   preserving) + pure utils (`types.ts`, `planDurations`, `datasourceToAssets`, `validateAssets`,
   `reorder`, `sha256`) + tests. **33 tests green, tsc clean.** (scan.ts registry `hasVideo` change
   deferred — the picker targets `creative_insights_data_export` directly via `fetchFeedSample`
   `media:'all'`, so it isn't needed for Slice 1.)
2. **✅ DONE (2026-06-17).** SourcePicker (`useStitchSource` → creative_insights_data_export
   media:'all'; `SourceTile` media-element frame+aspect D1; proactive validation dimming D2;
   tap-order badges; off-aspect badge; scanning/empty/error states) + pure `aspect`/`selection`
   utils + tests. **34 tests green, tsc clean.** (Decision-5 refinement: badge + hint, no live
   re-sort — avoids grid jank. Not yet wired into AppRoot — that's step 5.)
3. **✅ DONE (2026-06-17).** @dnd-kit installed + declared (core 6.3.1 / sortable 10.0.0 /
   utilities 3.2.2). `StepIndicator` (5-stage, ported from cutdown) + `ArrangeBoard`
   (@dnd-kit sortable filmstrip, pointer+keyboard sensors, onDragEnd → tested `arrayMove`;
   beat ruler from `planDurations`). tsc clean, 34 tests green. (Not yet wired into AppRoot.)
4. **✅ DONE (2026-06-17).** `useStitchTracks` (reuses `cutdownListTracks` — same
   FirestoreMusicCatalog as cutdown, so trackId space matches; open-Q2 resolved) +
   `MusicPicker` (ported slim from cutdown; BPM-drives-beat banner, selection, Stitch
   gate on trackId). tsc clean. (Not yet wired into AppRoot.)
5. **✅ DONE (2026-06-17).** `useStitch` (stitchGenerate callable, 600s timeout) + `AppRoot`
   stage machine (source→arrange→music→run→reel) with **fail-fast + stale-call guard** (runId
   ref; Retry/back invalidates in-flight runs) + `GeneratingPanel` (indeterminate, no subscription)
   + `ReelResult` (9:16 `<video controls>` + Download + error/Retry). Flipped `manifest.ts`→live
   (steps:[]) + swapped `App.tsx` route (`WizardShell`→`VideoStitchAppRoot`, dead imports removed).
   **tsc clean; 127 tests pass** (incl. all video-stitch + fetch). ⚠️ 2 PRE-EXISTING test files
   red — `_registry.test.ts` + `template-builder/manifest.test.ts` fail to load on
   `BrandKitDrawer`'s `@agencypmg/alli-design-system` import (no DS `vi.mock`; documented quirk
   reference_ds_react_version_test_mock). Unrelated to this work (my diff only adds @dnd-kit;
   the failing import is in an untouched template-builder file). Flag, don't fix (not my feature).
6. Deploy `firebase deploy --only functions,hosting:adlabs-alli`; manual smoke on real
   Nike/RL video datasource; before/after evidence.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | (covered by office-hours design doc) |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | issues_found | 14 raised; 2 genuine tensions → user-decided, rest folded/agreed |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 6 issues, 0 critical gaps, 0 unresolved |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR | 6/10 → 9/10, 2 decisions (states + new-decision visuals) |

- **CODEX:** caught the stale plan (subscription/useStorageUrl), the all-or-nothing backend reality (corrected the plan), the HLS/direct-file trap, video stripped at the scan layer, stale-call guard, and @dnd-kit root-dep hygiene. High-value run.
- **CROSS-MODEL:** Both reviewers agree on the locked decisions. Two eng tensions (all-or-nothing failure mode; scale-only demo quality) resolved by user — not auto-applied.
- **DESIGN:** happy-path locked by v1-prototype.html; review added the interaction-state table + 2 new design decisions (D1 media-element tiles for frame+aspect; D2 proactive tile validation) + responsive/a11y specs. Build-step-0 smoke + step-1 foundation (33 tests, tsc clean) done.
- **UNRESOLVED:** 0
- **VERDICT:** ENG + DESIGN CLEARED — ready to implement. Step 0 + step 1 done; resume at step 2 (SourcePicker).
