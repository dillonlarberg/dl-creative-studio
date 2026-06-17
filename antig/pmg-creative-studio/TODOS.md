# TODOS

## Phase 2: Konva Canvas Upgrade — Needs Scoping
**What:** Before starting the Konva canvas upgrade, run `/office-hours` + `/plan-eng-review` to produce a proper implementation plan.
**Why:** The Phase 2 section in the current design doc is aspirational (no task breakdown, no migration plan from CSS overlay → Konva Stage, no coordinate-system reconciliation spec).
**Context:** Phase 2 replaces CanvasOverlay.tsx CSS div handles with a Konva Stage + Transformer for drag/resize/lasso. The zone-reporter postMessage protocol from Phase 1 is reusable. Key open questions: how to reconcile Konva's coordinate system with the iframe scale; how to handle multi-size templates; whether ResizeObserver from Phase 1 needs to change.
**Depends on:** Phase 1 complete and verified on localhost.

## Video-Stitch: HLS / streaming video support
**What:** Teach the stitch backend to handle streaming video sources (`.m3u8` / HLS), not just direct files.
**Why:** Slice 1 restricts video inputs to direct files (`.mp4/.mov/.webm`) because `downloadToFile()` (`functions/src/stitch/deps.ts`) does a plain `fetch()` to a local temp file and ffmpeg reads that file. HLS manifests with relative/authenticated segments fail, and there's no size/content-type/SSRF guard. If real Nike/RL video datasources serve HLS, those assets are silently unusable until this lands.
**Context:** Either resolve HLS → a concrete segment/MP4 URL server-side, or have ffmpeg consume the manifest with proper headers. Pair with a download preflight (max bytes, content-type allowlist, host allowlist). Surfaced in the Video-Stitch Lane B eng review (2026-06-17). See `functions/src/stitch/deps.ts:13`, `functions/src/datasources/detect.ts:10`.
**Depends on:** Video-Stitch Slice 1 Lane B shipped; a real datasource sample confirming HLS is actually present.

## Video-Stitch: extract shared useStorageUrl
**What:** When a later slice needs `useStorageUrl`, extract ONE shared `src/platform/storage/useStorageUrl.ts` instead of copying it a third time.
**Why:** The hook is already duplicated in `src/apps/ad-resizing/hooks/useStorageUrl.ts` and `src/apps/video-cutdown/hooks/useStorageUrl.ts`. Slice 1 of video-stitch needs none (the reel comes back pre-signed; source assets are external URLs), so we avoided a third copy. The DRY debt is real and will bite the first slice that reads a `gs://`/`storageRef` (e.g. the unified "your generations" list).
**Context:** Behavior-preserving extraction to a platform-level module, repoint both existing apps. Surfaced in the Video-Stitch Lane B eng review (2026-06-17).
**Depends on:** A slice that actually resolves a storage path (e.g. generations-list view).

## Video-Stitch: hover-to-preview in the source picker
**What:** Play a short muted preview of a video clip on hover in the picker (instead of just the static first-frame).
**Why:** Lets a curator judge motion/content before selecting — directly serves the "human curates" premise. Surfaced in the Lane B design review (2026-06-17).
**Pros:** Better curation decisions; feels premium. **Cons:** More component state + video-load management (pause/cleanup on mouseout, avoid loading many videos at once).
**Context:** Slice 1 ships first-frame + play badge (Decision D1: `<video preload="metadata">`). This upgrades hover to `play()` a muted loop. Bound concurrent playing videos (1 at a time) to avoid jank.
**Depends on:** Slice 1 picker shipped.
