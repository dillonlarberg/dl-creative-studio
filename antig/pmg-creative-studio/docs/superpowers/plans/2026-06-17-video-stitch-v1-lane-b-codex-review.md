## Blockers (must-fix before build)

1. Plan is stale against locked decision B. It still says "subscribe to the output doc" as in-scope, scaffolds `useStitchOutput`, drives checklist from doc status, and says the subscription is source of truth. That directly contradicts the requested promise-authoritative Slice 1 path. See `docs/superpowers/plans/2026-06-17-video-stitch-v1-lane-b-frontend.md:72`, `docs/superpowers/plans/2026-06-17-video-stitch-v1-lane-b-frontend.md:99`, `docs/superpowers/plans/2026-06-17-video-stitch-v1-lane-b-frontend.md:125`, `docs/superpowers/plans/2026-06-17-video-stitch-v1-lane-b-frontend.md:191`.

2. The "mixed image + video datasource" prerequisite is bigger than the plan admits. The current ad-resizing hook always reads image datasources, not video datasources, so adapting `FeedConnectScreen` without splitting the hook will silently exclude the target feeds. See `src/apps/ad-resizing/hooks/useDatasources.ts:45` versus the plan's desired `getDatasources(slug,{media:'video'})` at `docs/superpowers/plans/2026-06-17-video-stitch-v1-lane-b-frontend.md:117`.

3. If the Nike/RL videos live in `creative_insights_data_export`, current code deletes them before either scan or picker sees them. Server scan filters `creative_type === video`; client sample fetch does the same. See `functions/src/datasources/scan.ts:87` and `src/platform/datasources/fetch.ts:217`. The first build task must use a source path that does not strip videos.

4. "Fetchable video URL" must mean "the Cloud Function can download and ffmpeg can decode it", not just "string starts with http". Detection accepts `.m3u8`, but the stitch backend downloads the URL to a local temp file with plain `fetch()` and then asks ffmpeg to read that file. HLS manifests with relative/authenticated segments will fail. See `functions/src/datasources/detect.ts:10`, `functions/src/stitch/deps.ts:19`, `functions/src/stitch/stitchGenerate.ts:144`, `functions/src/stitch/engine/ffmpegImage.ts:108`.

5. `assetId` is underspecified. The registry stores datasource metadata, not rows, and `fetchFeedSample()` returns raw rows with no stable row id. The plan says each tile builds `{ datasourceId, assetId, kind, srcUrl }`, but does not define whether `assetId` is a hash of URL, feed row key, or column+row index. See `src/platform/datasources/types.ts:28`, `src/platform/datasources/fetch.ts:20`, and `docs/superpowers/plans/2026-06-17-video-stitch-v1-lane-b-frontend.md:119`.

6. The plan still adds `useStorageUrl` even though Slice 1 decision C says no storage copy and the callable returns the playback URL directly. That is extra surface for stale-token bugs and test work with no Slice 1 value. See `docs/superpowers/plans/2026-06-17-video-stitch-v1-lane-b-frontend.md:101`; callable returns `reelUrl` only after upload/sign at `functions/src/stitch/stitchGenerate.ts:162`.

## Risks (likely to bite)

1. Decision B is mostly safe for spinner termination if the frontend uses `httpsCallable(...,{timeout:600000})`, because the server timeout is 540s. But the run UI needs its own settled/error state and stale-call guard. Without that, double-click Retry or navigating back can let an old promise overwrite the new run. Cutdown currently fires and catches without a stale guard because its run state comes from Firestore; stitch will not have that safety net. See `src/apps/video-cutdown/AppRoot.tsx:67` and `src/apps/video-cutdown/hooks/useCutdown.ts:10`.

2. There is no partial-success/degraded-reel path in the current stitch backend. It downloads and normalizes assets serially, throws on first bad asset, writes `status:'error'`, and rejects. If another review assumed backend partial-skip, that is stale or from another app. See `functions/src/stitch/stitchGenerate.ts:140` and `functions/src/stitch/stitchGenerate.ts:171`.

3. The datasource scan is not demo-safe unless the registry is already fresh. A stale/missing marker triggers `scanDatasources`, which requires a live Alli access token from session storage. A hard refresh after Firebase auth persists but the Alli token is gone means the source picker fails before stitch starts. See `src/platform/datasources/scan.ts:29` and `src/services/auth.ts:83`.

4. Auth guard messaging is inconsistent. `assertAlliStudioUser` allows verified Google or `oidc.alli`, but `getAlliUserIdFromAuth` rejects anything except `oidc.alli`. If a demo user reaches the app through any non-Alli Firebase provider, stitch rejects before creating an output doc. See `functions/src/_shared/assertAlliStudioUser.ts:31` and `functions/src/_shared/getAlliUserIdFromAuth.ts:37`.

5. `.m3u8` and remote video size/duration are unbounded. `downloadToFile()` has no max bytes, content-type check, or SSRF guard beyond http(s); the file can be huge or slow and consume the whole 540s. The TODO admits this is not production-safe, but the demo still needs a preflight whitelist or "mp4/mov/webm only" rule. See `functions/src/stitch/deps.ts:13`.

6. Directly importing `@dnd-kit/*` from the app is not declared in root `package.json`; it only appears transitively through the local design-system package in the lockfile. That can work by accident locally and still break CI/install hygiene. See `package.json:22` and `package-lock.json:52`.

7. Scale-only may look broken on real sponsor creative. The backend pads all off-aspect assets into black bars (`scale=...decrease`, `pad=...`) and blurred-fill/outpaint are explicitly later. For Nike/RL horizontal campaign videos, this will read as unpolished unless the picker filters to near-9:16 assets or the UI labels it as a mechanical stitch demo. See `functions/src/stitch/engine/ffmpegImage.ts:101` and the plan deferral at `docs/superpowers/plans/2026-06-17-video-stitch-v1-lane-b-frontend.md:75`.

8. The plan mentions `status:'processing'`, but stitch currently creates `pending` and then jumps to `complete` or `error`; there is no processing update. A checklist driven by status will sit on pending for the entire render unless frontend fakes steps. See `docs/superpowers/plans/2026-06-17-video-stitch-v1-lane-b-frontend.md:126` and `functions/src/stitch/stitchGenerate.ts:117`.

## Simplifications

1. Delete `useStitchOutput`, `useStorageUrl`, and the output-doc tests from Slice 1. Call `stitchGenerate`, show deterministic local progress copy, resolve to `reelUrl`, reject to Retry. The backend still writes the OutputDoc for history.

2. Do not port `FeedConnectScreen`. Build a small `SourcePicker` around `getDatasources(clientSlug,{media:'video'})`, `fetchFeedSample()`, and a new pure `datasourceToAssets()` util. The existing component is image-only in control flow, copy, icons, empty states, and column selection.

3. Restrict Slice 1 video inputs to direct file URLs: `.mp4`, `.mov`, `.webm`. Treat `.m3u8` as unsupported until the backend streams HLS correctly or resolves segment URLs.

4. For greenlight demo, consider video-only near-9:16 assets. Mixed stills plus letterboxed videos increases visual jank while proving nothing about the promised "narrative" behavior.

## Cross-check on locked decisions A-D

A. Correct target, but under-specified. `datasourceToAssets()` must bypass the existing video filters, define stable `assetId`, decide how to handle same-row image+video columns, and verify server-fetchability with an actual Cloud Function fetch/ffmpeg smoke. A browser `<video src>` success is not enough.

B. Safer than the plan's subscription path, but only if implemented literally with explicit timeout, settled state, stale-call guard, and Retry creating a new `batchId`. There is no current degraded-success path in stitch; success means all selected assets made it through the serial loop.

C. Correct. The plan violates it by adding `useStorageUrl`. Remove it from build order and tests.

D. Fine as UX direction, but declare `@dnd-kit/core`, `@dnd-kit/sortable`, and `@dnd-kit/utilities` in root dependencies before importing them. Do not rely on the design-system transitive dependency.

## Verdict (one line).

Do not build from this plan until it is rewritten around promise-authoritative run state and a verified direct-video datasource path; otherwise the frontend can ship cleanly and still fail the first real Nike/RL demo.
