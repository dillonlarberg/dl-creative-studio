# Video-Stitch Slice 0 (#90) — Feasibility Spike findings

Status: **GO (both halves).** Mechanical proven in tests; outpaint quality signed off by Diego
2026-06-17 on real Nike stills. Binding constraint = outpaint latency (~60-100s/asset) → pick-time
prepare is mandatory. Fallback (blurred-fill-everything) stays available per-asset.

## What's proven (deterministic, autonomous — landed in code + tests)

`functions/src/stitch/engine/ffmpegImage.ts` + tests (9 green, tsc clean):

| Risk | Result |
|------|--------|
| **concat-copy invariant** (the big one) | ✅ A zoompan still-clip + a blurred-fill video-clip — two different filter chains — join via `-c copy` through the REUSED `FfmpegReelRenderer`. Proven on real ffmpeg (`ffmpegImage.fixture.test.ts`). Both emit 1080×1920/30fps/yuv420p/H.264/no-audio. |
| **zoompan smoothness** | ✅ Upscale-before-zoom (3×) recipe. `buildZoompanArgs`. Eyeball the sample (below) to confirm on a real still. |
| **blurred-fill for off-aspect video** | ✅ scale-to-fit fg over scaled+cropped+blurred bg, centered. `buildBlurredFillArgs`. No crop of subject. |
| **ffmpeg encode budget** | ✅ Cheap: zoompan ~760ms, blurred-fill ~1.2s per 3s clip, **concat+mux 59ms** (one encode total). ffmpeg is NOT the bottleneck — outpaint is. |

Eyeball sample (synthetic 16:9 source): run
`FFMPEG_BIN=$(node -e "console.log(require('ffmpeg-static'))") npx tsx functions/src/stitch/spike-runner.ts [realStill] [realVideo]`
→ writes `still-kenburns.mp4`, `video-blurfill.mp4`, and the stitched `reel.mp4` to `$TMPDIR/stitch-spike/`.

## Finding: outpaint gen-canvas AR ≠ 9:16, but the pipeline already reconciles it

The model generates at **gpt-image legal dims** via `legalGenDims` — portrait = **1024×1536 (2:3)**,
wider than 9:16. BUT `runPhase2ForTarget(..., targetSpec={w:1080,h:1920})` already calls
`resizeToTarget(rawBuffer, 1080, 1920)` internally, so its **`resultBuffer` comes back cover-fit to
exactly 1080×1920** — the 2:3→9:16 reconciliation is handled inside the pipeline. The cover-fit crops
only the GENERATED border, never the subject.

Implication for Slice 3: `CanvasPreparer` just calls `runPhase2ForTarget(target={1080,1920})` and
caches `resultBuffer`. No extra reconciliation step to build. (One less thing than the plan assumed.)

```
off-aspect still → runPhase1Once → runPhase2ForTarget(target 1080×1920)
  → resultBuffer (1080×1920, cover-fit) → buildZoompanArgs → motion clip
```

## Outpaint half — RESULTS (run 2026-06-17 on real Nike stills)

Ran `outpaint-spike.ts` on two real off-aspect Nike ads (RESIZE_* keys, gpt-image-2):

| asset | source | → | p1 (Gemini) | p2 (outpaint) |
|-------|--------|---|-------------|---------------|
| test-2 (tennis "crazy dream") | 1152×648 (16:9) | 1080×1920 | 18.8s | **83.9s** |
| test-3 ("FAIL FORWARD") | 1537×1024 (3:2) | 1080×1920 | 10.5s | **51.1s** |

**Quality: GO.** Borders are seamless + on-brand — sky/court/background generated convincingly,
Nike branding + headline text preserved. (Minor gibberish micro-text artifact bottom-right on
test-3, barely visible.) Brand sign-off pending Diego's eyeball.

**Latency: the binding constraint (~60-100s/asset, p1+p2).** Implications, now confirmed not hypothetical:
- Pre-normalize-at-pick-time is **mandatory** — outpaint can NEVER run inside a synchronous render.
- Even at pick time, UX must show a per-tile "preparing ~1 min" state; generate is gated on prepares done.
- With `p-limit(4)` (like resize), 8 assets ≈ 2 batches ≈ ~3 min background prepare. Fine for a
  greenlight demo (creative curates meanwhile); a cost/latency item to revisit at scale (M2).
- `p1` (10-19s) is per-asset structural analysis feeding the outpaint prompt — keep it (skipping
  degrades border quality), but it's part of the per-asset budget.

**VERDICT: GO.** Diego signed off on border quality (2026-06-17). Fallback (blurred-fill-everything,
already proven) stays available if any specific asset's border disappoints.

## Outpaint half (HITL) — what's still needed before full GO

I can't complete these alone:
1. **API keys** — `GEMINI_API_KEY` (Phase 1 structural) + the OpenAI/RESIZE key (Phase 2 outpaint).
2. **Real off-aspect Nike/RL stills** — synthetic test patterns can't validate brand acceptability.
3. **Human eyeball** — does the outpainted border look on-brand enough for a luxury client?
4. **Latency number** — measure `runPhase2ForTarget` per asset → confirms ≤8 assets fits the
   pick-time/parallel budget (the whole reason for pre-normalize-at-pick-time).

Once you drop ~3 real off-aspect stills + the keys in, the spike-runner can be extended to call
the outpaint pipeline and print per-asset latency. Until then: **mechanical GO, outpaint TBD.**

## Acceptance criteria status (#90)
- [x] zoompan + blurred-fill mechanics proven on real ffmpeg
- [x] concat-copy of a zoompan-still clip + a blurred-fill-video clip succeeds (CRITICAL)
- [x] encode latency measured (ffmpeg is cheap; concat 59ms)
- [x] outpaint eyeball on real Nike stills — GO (Diego, 2026-06-17)
- [x] outpaint per-asset latency measured — p2 51-84s, p1 10-19s → pick-time prepare mandatory
- [x] go/no-go written (this doc): mechanical GO; outpaint pending HITL; fallback = blurred-fill-everything if outpaint disappoints
