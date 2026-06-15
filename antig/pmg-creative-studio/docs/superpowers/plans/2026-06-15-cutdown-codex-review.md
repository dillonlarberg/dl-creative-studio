# Missed Findings: cutdown local ffmpeg plan

Scope: plan review against repository code under `functions/src/cutdown/` and the video-cutdown client. Tracer is not treated as proof of the Functions renderer.

## Problems

1. The plan still has beat-sync residue. It says `musicStartSec = firstBeatSec ?? 0` and seeks the audio input, but the current product rule is music always starts at `0`. `FirestoreMusicCatalog.fetch()` does not even return `firstBeatSec`. Delete `musicStartSec` from `ReelComposition`; do not carry a dead parameter that can silently reintroduce offset audio.

2. Duration is trusted from the client, not from the plan. The UI already supports `15/30/60` seconds, while backend comments and constants still talk like v0 is fixed at 15. `cutdownRender` uses client-sent `targetSec`, and `CutdownPlanSchema` only checks positive cuts; it does not enforce `sum(cuts.len) === targetSec` or `srcOut - srcIn === len`. The new mux uses `-t totalSec`, so a stale or tampered request can produce truncated video, overlong audio, frozen tails, or wrong OutputDoc duration. Derive duration from the stored plan or validate it exactly.

3. `cutdownRender` still trusts the caller's `plan`, `videoStoragePath`, `trackId`, and `targetSec`. The plan rewrites rendering but does not close that trust boundary. The function should load `batches/{batchId}` and `versions/{angle}` server-side, verify `videoStoragePath`, `trackId`, and target length against the batch, and render the stored version. Also use `assertResourceClient(clientSlug, videoStoragePath)`.

4. The music path is overcomplicated because the old Shotstack constraint leaked into the new design. Local ffmpeg does not need a signed HTTP URL to the track. `FirestoreMusicCatalog` already reads `storagePath` and then discards it in favor of a download URL. For render, return/download `storagePath` via Admin Storage. Keep signed URLs only for the track picker.

5. Tmp path collision is not addressed. Current `cutdownRender` downloads the source to `os.tmpdir()/cutdown-render-${batchId}.mp4`; two concurrent renders for the same batch can clobber and delete each other's source. The local renderer adds more temp files, so this gets worse. Use a per-invocation `mkdtemp` root and put source, music, concat, and final under it.

6. Resource accounting is hand-waved. The plan keeps the full source, normalized clips, concat output, final output, and music in temp storage at the same time. For 30/60s renders at 1080x1920/30, that can spike disk/memory on warm Functions instances. It needs cleanup after each phase, max input/output guards, bitrate/CRF decisions, and deployed memory/CPU/concurrency assumptions.

7. Stream-copy concat is assumed safe without proof. Normalizing clips helps, but ffmpeg concat demuxer with `-c copy` can still fail or drift if timebases/extradata/PTS differ. Pure arg-builder tests will not catch this. Add a real ffmpeg fixture test or re-encode the concat pass/use concat filter.

8. The planned extractor change is underspecified. "Add scale/crop/fps filter" is not enough. The implementation needs exact args and tests for dimensions, SAR, pixel format, duration rounding, autorotation/iPhone rotation metadata, and 30/60s outputs. Current extraction uses `-ss` before input and `-t len`; with fps normalization, frame rounding can move clip durations.

9. Audio mux edge cases are not specified. The command should explicitly map one audio stream, ignore video/artwork in audio files, set channel/sample rate expectations if needed, and prove the tail fade is audible at the actual output end. `apad` plus `-t` is plausible, but the plan has no verification beyond flag-shape assertions.

10. The test strategy misses the riskiest code. Testing `buildConcatArgs`/`buildMuxArgs` does not test `cutdownRender` wiring, output doc updates, storage upload metadata, cleanup, or error handling. Follow the resize pattern: extract a `cutdownRenderCore` with injectable deps and unit-test the orchestration. Then run a manual live `cutdownRender` emulator/dev invocation.

11. The plan's verification sequencing is backwards. It deletes `shotstack.ts` and the secret before the live Functions render gate. Since the tracer is an independent copy, a tracer smoke run proves nothing about the deployed renderer. Keep Shotstack or a feature flag until a real `cutdownRender` call has produced a playable GCS-backed output.

12. Deterministic final object names need cache/version semantics. `renders/{batchId}/{angle}.mp4` will be overwritten on a rerender of the same angle. Firebase download URLs can remain stable, and browsers may cache the old MP4. Use versioned object paths or force cache-busting/token rotation.

13. Final upload metadata is not called out. The plan says upload final mp4, but does not require `contentType: video/mp4` or cache-control. That is easy to miss because the old per-clip upload had metadata inline.

14. `createOutput` rerender semantics are ignored. The output id is deterministic (`${batchId}-${angle}`), but `createOutput()` is implemented as `set()`, not Firestore create. A second render can reset the document to pending and overwrite creation metadata. Decide whether rerender is allowed, idempotent, versioned, or rejected.

15. The "frontend unchanged" claim is too broad. `RenderResult` can consume the returned URL unchanged, but the output document contract changes from URL-as-`storageRef` to path-as-`storageRef`. Any unified outputs/gallery reader that resolves `storageRef` through Firebase Storage will behave differently for old and new cutdown outputs. The plan needs a compatibility stance.
