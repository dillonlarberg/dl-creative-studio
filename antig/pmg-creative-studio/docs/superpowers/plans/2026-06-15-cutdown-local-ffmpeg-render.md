# Plan: Replace Shotstack with local ffmpeg for video-cutdown v0

**Date:** 2026-06-15
**App:** `video-cutdown` (functions side)
**Status:** Reviewed (architecture locked via grill; eng review + Codex outside-voice folded in)

## Goal

Render the final cutdown reel ourselves with local `ffmpeg` instead of the
Shotstack cloud render API. This removes an external dependency, a bound secret
(`SHOTSTACK_API_KEY`), the intermediate per-clip GCS upload, the submit/poll
loop, the host-discovery hack, and the known-broken audio tail-fade — and puts
the finished reel in our own Cloud Storage bucket (fixing the existing
`storageRef` TODO in `cutdownRender.ts`).

## Background

Current `cutdownRender` flow:
`download source → probe duration → catalog.fetch (music URL) →
extractClips (local ffmpeg, NOT scaled, audio stripped) → upload each clip to
GCS + sign → ShotstackRenderer.render({clips:url[], musicUrl, totalSec, 1080×1920})
→ mp4Url → OutputDoc(storageRef = Shotstack URL)`.

The intermediate clip upload exists **only** so Shotstack's cloud workers can
fetch the clips by URL. Shotstack's actual job is small: tile clips with hard
cuts, lay one music track with a tail fade, scale to 1080×1920. All of that is
bread-and-butter ffmpeg, and the now-deleted wizard monolith already did
concat + audio in a single ffmpeg `complexFilter` — so this is a proven path.

The **tracer** (`tools/cutdown-tracer/src/`) is a fully independent copy of the
engine (its own `types.ts`, `seams.ts`, `shotstack.ts`, `fakes.ts`); nothing in
`functions/src` imports it and vice-versa. It keeps its Shotstack impl as the
live-render reference. **The tracer does NOT exercise the Functions renderer** —
so a tracer run proves nothing about `functions/src`. This plan touches
`functions/src` only and is verified by a live `cutdownRender` call.

## Guiding principles

- **One clean abstraction, not two.** Repurpose the single renderer seam.
- **SRP / pure-core, thin-shell.** Extractor extracts, renderer composes a file,
  orchestrator persists. Compositing *logic* lives in pure, unit-testable
  arg-builders; the class is a thin subprocess wrapper that **reuses**
  `runFfmpeg`/`runFfmpegCapture` from `ffmpeg.ts` (DRY — do not re-spawn).
- **Decoupled, readable steps** over a clever single-command optimization.
- **Delete dead code**, but only **after** a live render gate proves the
  replacement works (reversibility).

## Architecture decisions

| # | Decision | Rationale |
|---|----------|-----------|
| Shape | Keep `extractClips` local; swap only the renderer. Clips never upload to GCS — they stay in a per-invocation tmp dir and feed the renderer directly. | Smallest, lowest-risk diff; per-clip encode normalizes before concat. |
| Normalization | `extractClips` normalizes each clip to 1080×1920 / 30fps / yuv420p / `setsar=1`, **with rotation metadata baked in** (`-noautorotate` off / explicit handling) so iPhone-rotated sources don't render sideways. | One encode total → renderer can stream-copy concat. |
| Renderer seam | `VideoRenderer`/`EditSpec` → `ReelRenderer`/`ReelComposition`. Local clip paths in, local `mp4Path` out. | Liskov-honest; keeps persistence out of the renderer. |
| Render impl | Two decoupled ffmpeg passes: (1) concat-copy clips → silent `concat.mp4`; (2) mux music → final. Pure arg-builders + **a real-ffmpeg fixture test** proving the join (duration/frame count), since arg-shape tests can't catch timebase/PTS drift. | Readability + proof the stream-copy concat is sound. |
| Music | Music starts at **t=0** (beat-sync dropped). Download the existing signed URL → tmp (no catalog seam change). No `-ss` on the music input. AAC 128k, one audio stream mapped explicitly (ignore artwork streams), `afade` out 1s + in 0.1s, `apad`, `-t totalSec`. | Minimal diff; beat-sync deferred. |
| Duration | **Derive `totalSec` from the plan**, not raw client `targetSec`. Validate `srcOut − srcIn === len` per cut and `Σ cuts.len ≈ targetSec` in `validateInput`/`CutdownPlanSchema`. | `-t totalSec` makes a stale/tampered value silently truncate video or freeze the tail. Closes the critical gap. |
| Temp files | One **per-invocation `mkdtemp` root** holds source, clips, music, concat, and final output. | Fixes the fixed-`${batchId}` tmp path clobber when two renders run concurrently. |
| Persistence | Orchestrator uploads final mp4 → **versioned** `renders/{batchId}/{angle}-{renderTs}.mp4` with `contentType: video/mp4` + `cache-control`, signs → `previewUrl`; `storageRef` = object path; `model: "ffmpeg"`. | Versioned path avoids stale browser cache + overwrite races on re-render. Fixes the `storageRef` TODO (parity with resize: storageRef = object path). |
| Shotstack | Deleted from `functions/src` (recoverable via git; tracer keeps its copy). `SHOTSTACK_API_KEY` dropped from all 3 callables — **but only after** the live render gate passes. | No orphaned dead code / unused bound secret, without losing the rollback path mid-cutover. |
| Cleanup | Out of scope (fast-follow): scheduled pick-aware `thumbs/` expiry (7d) + `deleteBatch` callable. `renders/` durable, `uploads/` durable for now. | Thumbnails are KB-scale; not load-bearing. Native GCS lifecycle can't target mid-path slug/batchId on a shared bucket, so cleanup must be app-driven. |
| fps | 30 | Dominant capture/web rate. |

## Files touched

**New**
- `functions/src/cutdown/engine/ffmpegReel.ts` — `buildConcatArgs`,
  `buildMuxArgs`, `writeConcatList`, `FfmpegReelRenderer implements ReelRenderer`,
  `makeFfmpegReelRenderer()`. Reuses `runFfmpeg`/`runFfmpegCapture` from `ffmpeg.ts`.
- `functions/src/cutdown/engine/ffmpegReel.test.ts` — pure-builder unit tests +
  a **real-ffmpeg fixture test** for the concat join.

**Modified**
- `engine/seams.ts` — remove `VideoRenderer`; add `ReelRenderer`
- `engine/types.ts` — remove `EditSpec`/`ClipRef`; add `ReelComposition`
  (no `musicStartSec` — music always starts at 0); tighten `CutdownPlanSchema`
  (per-cut `srcOut − srcIn === len`, `Σ len ≈ targetSec`)
- `engine/ffmpeg.ts` — `extractClips` gains the 9:16/30fps normalization filter
  (exact args: scale/crop/setsar/fps/pix_fmt + rotation handling + CRF/preset);
  export `runFfmpeg`/`runFfmpegCapture` if not already
- `engine/fakes.ts` (+ `fakes.test.ts`) — `FakeEchoRenderer` → `FakeReelRenderer`
  (returns a canned local `mp4Path`)
- `cutdown/deps.ts` — `makeCutdownDeps(geminiKey)`; wire `makeFfmpegReelRenderer()`;
  drop shotstack import + `shotstackKey` param
- `cutdown/paths.ts` — remove `renderClip`; add
  `finalReel(slug, batchId, angle, renderTs)` → `…/renders/{batchId}/{angle}-{renderTs}.mp4`
- `cutdown/cutdownRender.ts` — extract a testable **`cutdownRenderCore`** with
  injectable deps (resize-app pattern); drop `SHOTSTACK_KEY`; new tail (below);
  remove per-clip upload loop; per-invocation mkdtemp + cleanup
- `cutdown/cutdownGenerate.ts`, `cutdown/cutdownListTracks.ts` — drop
  `SHOTSTACK_API_KEY` from `secrets:[]`

**Deleted (last step, after live gate)**
- `engine/shotstack.ts`, `engine/shotstack.test.ts`

## New seam

```ts
// seams.ts
/** Composes ordered, pre-normalized clips + a music bed into one reel MP4 on disk. */
export interface ReelRenderer {
  render(comp: ReelComposition): Promise<{ mp4Path: string }>;
}

// types.ts
export interface ReelComposition {
  clipPaths: readonly string[];  // ordered; each already 1080×1920 / 30fps / yuv420p
  musicPath: string;             // local audio file (music starts at t=0)
  totalSec: number;              // derived from the plan, not raw client targetSec
  width: number;
  height: number;
}
```

## Render impl (two decoupled passes)

```
Step 1 — concat:  ffmpeg -f concat -safe 0 -i clips.txt -c copy  concat.mp4
Step 2 — mux:     ffmpeg -i concat.mp4 -i music.mp3 \
                    -map 0:v:0 -map 1:a:0 -c:v copy \
                    -af "afade=t=in:st=0:d=0.1, afade=t=out:st={totalSec-1}:d=1, apad" \
                    -t {totalSec} -c:a aac -b:a 128k -movflags +faststart  out.mp4
```

`buildConcatArgs` and `buildMuxArgs` are pure; `writeConcatList` escapes paths
per the concat-demuxer format (single-quote escaping) and uses `-safe 0`.
`FfmpegReelRenderer` writes the list, runs the two passes via the shared
`runFfmpeg`, and returns the final path. A real-ffmpeg fixture test feeds two
tiny normalized clips through both passes and asserts the joined duration.

## `cutdownRender` new tail (`cutdownRenderCore`, injectable deps)

```
validate plan: srcOut-srcIn===len, Σlen≈targetSec → totalSec = Σ cuts.len
work = mkdtemp()                                    // per-invocation root
extractClips (normalized) into work                 → local clip paths
download music signed URL → work/music              → local music path
renderer.render({ clipPaths, musicPath, totalSec, w, h }) → mp4Path
renderTs = Date.now()
bucket.upload(mp4Path → finalReel(slug,batchId,angle,renderTs)) {contentType, cacheControl}
sign → previewUrl
updateOutput({ status:"complete", storageRef: <object path>, previewUrl, model:"ffmpeg" })
return { mp4Url: previewUrl, angle }
finally: rm -rf work
```

## Testing strategy

- **Unit (offline CI, no ffmpeg):** `buildConcatArgs`, `buildMuxArgs`, and
  `writeConcatList` (incl. path-with-apostrophe escaping) are pure → assert flag
  sequences, `afade`/`apad`/`-t` math, clip ordering. Plus an arg snapshot for
  `extractClips`' normalization filter. Mirrors `buildShotstackTimeline.test.ts`.
- **Real-ffmpeg fixture test (CI, ffmpeg-static available):** two tiny normalized
  clips → concat-copy → mux → assert output duration/frame count. Proves the
  stream-copy join is sound (the thing arg-shape tests can't catch).
- **Orchestration test (offline, faked deps) — CRITICAL / regression:**
  `cutdownRenderCore` with `FakeReelRenderer` + fake bucket/sign asserts the tail
  wires `storageRef` = object path, `previewUrl` = signed URL, `model` = `"ffmpeg"`,
  versioned path used, and the per-clip upload loop is gone.
- **`FakeReelRenderer`:** returns a canned local `mp4Path`.
- **Live gate:** a manual `cutdownRender` call (emulator/dev) producing a playable
  GCS-backed MP4 — **required before** deleting `shotstack.ts` + the secret.

## Unchanged

Firestore tree (`batches/{id}` → `versions/{angle}`, `outputs/{batchId}-{angle}`),
all doc shapes, the 7 Gemini calls, `planCuts`, the 3 angles,
`cutdownListTracks`/`cutdownGenerate` logic, and the **frontend** `RenderResult`
(a signed URL drops into `<video>`/download exactly like the old Shotstack URL).
Note: the `OutputDoc.storageRef` *contract* changes (URL → object path) — old
Shotstack-era outputs still carry URLs; a unified-gallery reader compatibility
stance is deferred (see follow-ups).

## Suggested implementation order (TDD)

> Sequential — every step touches the `cutdown/` module. No worktree
> parallelization opportunity.

1. Pure arg-builders + `writeConcatList` + their unit tests (RED→GREEN).
2. Real-ffmpeg fixture test for the concat join.
3. `FfmpegReelRenderer` class (thin wrapper, reuses `runFfmpeg`).
4. Seam + types changes (`ReelRenderer`/`ReelComposition`, plan validation);
   update `fakes.ts` → `FakeReelRenderer`.
5. `extractClips` normalization filter (+ rotation handling) + arg snapshot test.
6. Extract `cutdownRenderCore`; rewrite tail (mkdtemp, versioned path, metadata);
   orchestration test with faked deps.
7. Rewire `deps.ts` (`makeCutdownDeps(geminiKey)`), `paths.ts` (`finalReel`).
8. **Live gate:** manual `cutdownRender` (emulator/dev) → playable GCS output.
9. **Only after step 8 passes:** delete `shotstack.ts` + test; drop the secret
   from all 3 callables; remove `EditSpec`/`ClipRef`.

## Failure modes (new/changed codepaths)

| Failure | Test? | Error handling? | User sees |
|---------|-------|-----------------|-----------|
| Concat boundary drift (timebase/PTS) | ✅ fixture test | ffmpeg non-zero exit → OutputDoc error | clear error |
| Plan cuts don't sum to targetSec | ✅ validation test | rejected up front (`invalid-argument`) | clear error (was silent truncation — gap closed) |
| Music download fails (signed URL) | ✅ orchestration test (fake throws) | try/catch → OutputDoc error | clear error |
| ffmpeg spawn fails (FFMPEG_BIN) | partial | `runFfmpeg` rejects → OutputDoc error | clear error |
| Concurrent re-render same angle | n/a | mkdtemp + versioned path isolate | no clobber |
| tmpfs OOM on ~500MB source | ❌ | function crash → `HttpsError internal` | generic error (pre-existing; see follow-up) |

No remaining **critical** gaps (no path is silent + unhandled + untested).

## NOT in scope (deferred, with rationale)

- **Trust-boundary hardening** (load `batches/{batchId}`+`versions/{angle}`
  server-side, verify `videoStoragePath`/`trackId`/`targetSec`, `assertResourceClient`)
  — pre-existing trust posture; the Shotstack code trusted the same inputs.
- **Outputs `storageRef` compatibility shim** (old URL vs new path) — only bites
  once a unified gallery reads cutdown outputs.
- **Scheduled `thumbs/` cleanup** (pick-aware, 7d) + **`deleteBatch` callable** —
  KB-scale; app-driven cleanup, separate lifecycle scope.
- **tmpfs/memory guard** (max input size / stream source instead of full download)
  — pre-existing; marginally worse here.
- **Music download via `storagePath`** (Admin Storage) instead of signing our own
  URL — cheap cleanup, but needs the catalog seam to expose `storagePath`.
- **Beat-sync** (`firstBeatSec` music offset) — dropped for v0; revisit when the
  catalog returns `firstBeatSec`.

## What already exists (reused, not rebuilt)

- `extractClips` + `runFfmpeg`/`runFfmpegCapture` (`engine/ffmpeg.ts`) — extended/reused.
- `buildShotstackTimeline` pure-fn + thin-class **pattern** — mirrored by `ffmpegReel.ts`.
- `createOutput`/`updateOutput` (`_shared/outputs.ts`), `cutdownPaths`, `deps.ts`,
  `FFMPEG_BIN` resolution — reused.
- Resize app's `storageRef = object path` convention + injectable-deps `*Core`
  pattern — reused.
- The deleted wizard's `complexFilter` — proven precedent for local concat+audio.

## Out of scope (fast-follow tickets)

1. Scheduled cleanup function: pick-aware deletion of `thumbs/**` after 7 days.
2. `deleteBatch` / `deleteSource` callable + UI action for `uploads/**`.
3. Trust-boundary hardening (server-side batch/version load).
4. Outputs `storageRef` URL↔path compatibility for the unified gallery.
5. tmpfs/memory guard (max input size or streamed source).
6. Music download via `storagePath` (drop the self-signed-URL round-trip).

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | issues_found | 15 findings, all triaged; 9 folded, 4 decided, 2 deferred |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clean | 6 issues raised, 0 unresolved, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |

- **CROSS-MODEL:** Eng review + Codex agreed on the test-strategy gap (tracer ≠ Functions proof) and the catalog/firstBeatSec gap. Codex added the duration-trust, tmp-clobber, rerender-cache, and cutover-sequencing findings — all folded or decided.
- **UNRESOLVED:** 0
- **VERDICT:** ENG CLEARED — ready to implement. Live `cutdownRender` gate required before deleting Shotstack.
