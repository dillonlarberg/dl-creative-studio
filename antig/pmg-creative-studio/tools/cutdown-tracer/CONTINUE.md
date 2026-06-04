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
- [x] **Step 2 — tracer green end-to-end on Fakes** (no external deps) — ✓ green (32 tests, typecheck clean)
  - [x] `src/types.ts` — `Segment`, `Cut`, `CutPlan`, `SampleMusicTrack`, `EditSpec` (Zod) + `OUTPUT` contract const
  - [x] `src/seams.ts` — `VideoMomentSelector`, `TempoDetector`, `MusicCatalog`, `VideoRenderer` (+ `VideoRef`, `PipelineDeps`)
  - [x] `src/fakes.ts` — `FakeEvenSpacedSelector`, `FakeFixedBpm`, `FakeMusicCatalog`, `FakeEchoRenderer`
  - [x] `src/planCuts.ts` — **pure**: uniform bar-grid from BPM (`bar=(60/bpm)*4`, interior cuts on bar multiples, final slot snapped to exactly 15.000s, trailing-sliver<½-bar merged); **grid owns timing, content owns fill**; **dedup overlapping ranked segments** (highest score wins); overflow dropped / underflow cycles
  - [x] `src/pipeline.ts` — `runPipeline` composes the seams (BPM precedence: catalog BPM > TempoDetector fallback); `src/factory.ts` — env-keyed `makeDeps` (USE_FAKES, real branches throw until steps 3–5)
  - [x] tests: `planCuts.test.ts` (16, thorough), `fakes.test.ts` (8, per-seam contract), `pipeline.test.ts` (8, all-Fakes e2e) + `vitest.config.ts`, `.env.example`
  - **⛳ GATE — READY FOR HUMAN REVIEW:** `npm test` (32 ✓) + `npm run typecheck` (clean). Sample run @120 BPM = 8 hard cuts (7×2.0s on-grid + 1.0s snap), Σ=15.000s. NOT committed yet.
- [x] **Step 3 — real `VideoMomentSelector` (Gemini)** — code green; eyeballed live
  - [x] `src/gemini.ts` — `GeminiMomentSelector implements VideoMomentSelector`; DI'd genai client (mirrors resize `runPhase1(ai,…)`), upload→poll-until-ACTIVE→structured output→validate→retry/backoff→best-effort cleanup; `makeGeminiSelector(apiKey)` wires the real client
  - [x] factory: `USE_FAKES=0` now wires the real Gemini selector (tempo/catalog/renderer still deferred)
  - [x] `scripts/select-gemini.ts` (`npm run select-gemini <mp4> [bpm]`) — real selection → planCuts eyeball
  - [x] `src/gemini.test.ts` (6) — injected fake client, no-network: lifecycle, validation, retry, give-up, cleanup. **Suite 39 ✓, typecheck clean.**
  - **⛳ GATE — HUMAN REVIEW (findings):** live run OK (upload→ACTIVE→schema-valid JSON). BUT (1) only fixture is `test_01.mp4` ≈10s → Gemini returns ONE whole-clip segment; **need a ~70s fixture** to judge selection quality. (2) Single-segment input → planCuts cycles the same moment into every slot (repetitive reel) — **open refinement:** slice one long segment into distinct sub-windows vs. repeat. Both are review items, not blockers.
- [ ] **Step 4 — real `TempoDetector` (librosa)** — `scripts/tempo.py` (`librosa.beat.beat_track` → `{bpm}` JSON) + `src/librosa.ts` spawning it as a subprocess.
  - **⛳ GATE:** detected BPM sane on a real track → human reviews.
- [ ] **Step 5 — real `MusicCatalog` (Firestore `sampleMusic`) + real `ShotstackRenderer`** + **GCS long-TTL signed URLs** for source video + music (Shotstack must fetch them).
  - **⛳ GATE:** full live tracer run → human **eyeballs the rendered 15s reel**.

## Output contract (hard)
15.000s · 1080×1920 · 9:16 · **hard cuts only** · music baked + tail fade · render = Shotstack (sandbox watermark OK for v0).

## Out of scope — do NOT build in v0
Multi-creative stitch / outpaint / ordering (M1) · Cloud Function + `OutputDoc` + auth + multi-tenant + React studio · Artlist API + vibe→Gemini mapping · real beat-*detection* cutting · transitions · 30s · librosa-as-Cloud-Run · paid Shotstack · Veo motion · social posting.
