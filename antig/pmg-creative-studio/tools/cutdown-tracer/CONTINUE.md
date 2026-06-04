# cutdown-tracer — autonomous continuation brief

**Plan of record (reference these every session):**
- **PRD:** dillonlarberg/dl-creative-studio#78
- **Full spec, UML architecture, scope lock:** `../../src/apps/video-stitch/v0-design.html`
- **Session memory:** `~/.claude/.../memory/project_video_stitch_v0_spec.md`

This is **Milestone 0** of the video-stitch v0: one video (15–180s) → AI-selected best moments → beat-snapped uniform grid → **15.000s · 1080×1920 · 9:16** MP4, hard cuts, music baked, rendered by Shotstack. Deliverable is this **local tracer** (mirrors `tools/resize-tracer/`), not a deployed app.

## How an autonomous agent should run this build
- **Branch off `dev`** (no worktrees — branch directly; project convention).
- Work autonomously **between** the gates below. **STOP at each ⛳ gate and wait for the human to review that tracer test before continuing.**
- Keep every unit behind its **interface seam** (`src/seams.ts`) with a **Fake** (`src/fakes.ts`) so `npm test` runs **no-network, no-env**. Mirror `tools/resize-tracer/` conventions.
- Reuse the in-repo `@google/genai` call shape from `functions/src/resize/phase1.ts` (`responseMimeType` + `responseSchema`).
- **Never commit** `.env` or `node_modules`.

## Status
- [x] **Step 1 — external surfaces proven against real keys**
  - [x] `npm run verify-gemini ./fixtures/<clip>.mp4` — Files API upload→ACTIVE + structured `[{startSec,endSec,score}]` — ✓ green
  - [x] `npm run verify-shotstack` — sandbox render submit→poll→playable mp4 — ✓ green (host: `/edit/stage`)

## Build order + ⛳ check-in gates
- [ ] **Step 2 — tracer green end-to-end on Fakes** (no external deps)
  - `src/types.ts` — `Segment`, `Cut`, `CutPlan`, `SampleMusicTrack`, `EditSpec` (Zod)
  - `src/seams.ts` — `VideoMomentSelector`, `TempoDetector`, `MusicCatalog`, `VideoRenderer`
  - `src/fakes.ts` — `FakeEvenSpacedSelector`, `FakeFixedBpm`, `FakeMusicCatalog`, `FakeEchoRenderer`
  - `src/planCuts.ts` — **pure**: uniform bar-grid from BPM; **grid owns timing, Gemini owns content**; **dedup overlapping ranked segments** (see smoke-test finding); cuts sum to **exactly 15.000s**
  - `src/pipeline.ts` — `runPipeline` composes the seams
  - tests: `planCuts.test.ts` (thorough), `fakes.test.ts` (per-seam contract), `pipeline.test.ts` (all-Fakes e2e)
  - **⛳ GATE:** `npm test` + `npm run typecheck` green → human reviews.
- [ ] **Step 3 — real `VideoMomentSelector` (Gemini)** — `src/gemini.ts`, reusing verify-gemini's upload/poll/structured-output. Add a minimal `public/` UI or a `runOnce` script to eyeball.
  - **⛳ GATE:** run against a 70s fixture → human reviews the selected segments.
- [ ] **Step 4 — real `TempoDetector` (librosa)** — `scripts/tempo.py` (`librosa.beat.beat_track` → `{bpm}` JSON) + `src/librosa.ts` spawning it as a subprocess.
  - **⛳ GATE:** detected BPM sane on a real track → human reviews.
- [ ] **Step 5 — real `MusicCatalog` (Firestore `sampleMusic`) + real `ShotstackRenderer`** + **GCS long-TTL signed URLs** for source video + music (Shotstack must fetch them).
  - **⛳ GATE:** full live tracer run → human **eyeballs the rendered 15s reel**.

## Output contract (hard)
15.000s · 1080×1920 · 9:16 · **hard cuts only** · music baked + tail fade · render = Shotstack (sandbox watermark OK for v0).

## Out of scope — do NOT build in v0
Multi-creative stitch / outpaint / ordering (M1) · Cloud Function + `OutputDoc` + auth + multi-tenant + React studio · Artlist API + vibe→Gemini mapping · real beat-*detection* cutting · transitions · 30s · librosa-as-Cloud-Run · paid Shotstack · Veo motion · social posting.
