# cutdown-tracer (video-stitch v0 · Milestone 0)

A local debug rig that turns **one long video + a music track** into a **15.000s · 1080×1920 · 9:16 MP4** with hard cuts snapped to a beat grid and the track baked in. Rendering is outsourced to **Shotstack**; everything else is composed from small, independently-proven seams.

**Status: ✅ renders live end-to-end** (first reel 2026-06-04). 71 offline tests green.
Spec/UML: [`../../src/apps/video-stitch/v0-design.html`](../../src/apps/video-stitch/v0-design.html) · PRD: dillonlarberg/dl-creative-studio#78 · **Architecture diagram: [`ARCHITECTURE.html`](./ARCHITECTURE.html)**.

## The pipeline

```
probe duration ─► Gemini selects moments ─► clamp to duration ─► fetch track + BPM
   ─► planCuts (beat grid) ─► ffmpeg cuts each moment into a small clip
   ─► upload each clip (GCS) ─► Shotstack assembles + renders ─► 15s 9:16 MP4
```

Each step sits behind an interface **seam** (`src/seams.ts`) with a **Fake** (`src/fakes.ts`), so `npm test` runs with no network and no credentials. The real providers (Gemini, librosa, Firestore, ffmpeg, GCS, Shotstack) are wired only in `src/realClients.ts`, used by `npm run run-live`.

## Architecture at a glance

| Seam (`seams.ts`) | Pure / real impl | Fake | Provider |
|---|---|---|---|
| `VideoMomentSelector` | `gemini.ts` | `FakeEvenSpacedSelector` | Gemini (Files API + structured output) |
| `TempoDetector` | `librosa.ts` → `scripts/tempo.py` | `FakeFixedBpm` | librosa subprocess |
| `MusicCatalog` | `firestoreCatalog.ts` | `FakeMusicCatalog` | Firestore `sampleMusic` |
| `ClipExtractor` | `ffmpeg.ts` → ffmpeg | `FakeClipExtractor` | ffmpeg subprocess |
| `BlobStore` | `storage.ts` | `FakeBlobStore` | Cloud Storage (`getDownloadURL`) |
| `VideoRenderer` | `shotstack.ts` | `FakeEchoRenderer` | Shotstack |
| `planCuts` / `clampSegments` | `planCuts.ts` (pure) | — | — |

`pipeline.ts` (`runPipeline`) composes the seams; `factory.ts` (`makeDeps`) wires the Fakes; `realClients.ts` (`makeRealDeps`) wires the real providers.

## Setup

```bash
cd tools/cutdown-tracer
npm install                     # firebase-admin, @google/genai, zod, dotenv, …
cp .env.example .env            # fill in keys (below)
```

### Offline only (tests + fake pipeline)
Nothing else needed — `npm test` and `npm run run-fake` need no keys, no network.

### Real providers

1. **Gemini** — `GEMINI_API_KEY` in `.env` (https://aistudio.google.com/app/apikey).
2. **Shotstack** — `SHOTSTACK_API_KEY` in `.env` (use the **sandbox/stage** key; renders are free + watermarked).
3. **librosa + ffmpeg** — a Python **3.13** venv (3.14 has no numba wheels):
   ```bash
   /opt/homebrew/bin/python3.13 -m venv .venv-librosa
   .venv-librosa/bin/python -m pip install librosa soundfile numpy imageio-ffmpeg
   ```
   `imageio-ffmpeg` ships a static `ffmpeg` binary used for clip extraction. Resolve it once:
   ```bash
   export FFMPEG_BIN=$(.venv-librosa/bin/python -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())")
   export PYTHON_BIN=$(pwd)/.venv-librosa/bin/python
   ```
4. **Firestore + Storage** — ADC (no service-account key file):
   ```bash
   gcloud auth application-default login
   gcloud auth application-default set-quota-project automated-creative-e10d7
   ```
   `.env`: `GOOGLE_CLOUD_PROJECT=automated-creative-e10d7`, `GCS_BUCKET=automated-creative-e10d7.firebasestorage.app`.

Full cloud walkthrough: [`SETUP-step5.md`](./SETUP-step5.md).

## Running it

```bash
# ── offline ───────────────────────────────────────────────
npm test                         # vitest, 71 tests, no network/env
npm run typecheck
npm run run-fake [trackId]       # full pipeline on Fakes; prints the cut plan

# ── prove a single real seam ──────────────────────────────
npm run verify-gemini ./fixtures/<clip>.mp4         # Gemini Files API + structured output
npm run verify-shotstack                            # Shotstack submit→poll→playable mp4
PYTHON_BIN=… npm run detect-tempo ./fixtures/<track>.(wav|mp3)   # librosa BPM
npm run select-gemini ./fixtures/<clip>.mp4 [bpm]   # real moments → planCuts eyeball

# ── catalog ───────────────────────────────────────────────
# Upload tracks to gs://<bucket>/sampleMusic/, then auto-write the Firestore docs
# (probes bpm + duration with librosa — no manual metadata):
PYTHON_BIN=… npm run ingest-music            # add --dry-run to probe without writing

# ── the whole thing, live ─────────────────────────────────
FFMPEG_BIN=… npm run run-live <trackId> [videoPath]   # default video: fixtures/test_02.mp4
#   → prints a playable Shotstack URL; artifacts in out/<runId>/

# ── diagnostics ───────────────────────────────────────────
npm run diag-assets <trackId> <sourceObject>   # isolate which Shotstack asset is rejected
npm run shotstack-status <renderId>            # full status/error of a render
npm run sign-url <objectPath>                  # print a getDownloadURL for an object
```

`SHOTSTACK_DEBUG=1` dumps the render payload + poll statuses.

## V1 cutdown brain (3 versions)

The V1 brain returns three angled cut versions for a human to pick:

```ts
aiCutdown(video, track, { humanInput?, targetSec }) → CutdownPlan[]
```

- One shared Gemini *video* call (analyze → theme + beats); then per-angle text-only
  select + critique over the beats (1 + 3 + 3 = 7 calls total).
- Angles: **Narrative** (chronological) · **Highlights** (impact-ordered) · **Punchy**
  (strongest-first). A brief (`humanInput`), when present, biases all three.
- Each `CutdownPlan` carries a `description` (a per-angle pitch built from the AI-derived
  theme) plus an AI-written per-cut `why`; a bounded per-version self-critique runs before
  the plan is returned (degrades gracefully on failure).

```bash
# print 3 versions; add --pick N to render one via Shotstack
FFMPEG_BIN=… PYTHON_BIN=… npm run run-cutdown <trackId> [video] [--target 15|30|60] [--brief "…"] [--pick N]
```

Implemented in `src/cutdownBrain.ts` (`GeminiCutdownBrain`), `src/angles.ts` (the three
fixed angles + ordering logic), and `src/geminiCore.ts` (shared Gemini plumbing). Storyboard
thumbnails + the web shell are a follow-up (spec checkpoint 5).

## File map

```
src/
  types.ts            value objects (Zod): Segment, Cut, CutPlan, ClipRef, SampleMusicTrack, EditSpec, OUTPUT
  seams.ts            the 6 interfaces + PipelineDeps
  fakes.ts            one Fake per seam (no-network test doubles)
  planCuts.ts         PURE: bar-grid plan + dedup + clampSegments (exact 15.000s)
  pipeline.ts         runPipeline — composition only
  factory.ts          makeDeps — wires Fakes (real branch defers to realClients)
  gemini.ts           GeminiMomentSelector (real VideoMomentSelector)
  librosa.ts          LibrosaTempoDetector + PythonTempoRunner
  firestoreCatalog.ts FirestoreMusicCatalog + MusicDocSchema
  storage.ts          GcsBlobStore (upload + getDownloadURL)
  shotstack.ts        ShotstackRenderer + buildShotstackTimeline (pure)
  ffmpeg.ts           FfmpegClipExtractor (probe duration + cut clips)
  realClients.ts      makeRealDeps — wires every real provider (the only firebase-admin importer)
scripts/
  verify-gemini.ts, verify-shotstack.ts     surface smoke tests
  run-fake.ts, select-gemini.ts, detect-tempo.ts, run-live.ts
  ingest-music.ts (+ probe-audio.py)         catalog builder
  tempo.py                                   librosa BPM sidecar
  diag-assets.ts, shotstack-status.ts, sign-url.ts   diagnostics
fixtures/   local media (gitignored)   ·   out/<runId>/   per-run artifacts
```

## Output contract
15.000s · 1080×1920 · 9:16 · hard cuts only · music baked · Shotstack sandbox (watermark OK for v0).

## Known limitations (v0)
- **No audio tail-fade yet** — Shotstack's clip `transition:{out:"fade"}` doesn't apply to an audio-only clip; needs the proper audio-fade mechanism.
- **Source audio dropped** — clips are extracted with `-an`; only the music track plays.
- **Long sources** — the renderer won't ingest a full long video, so we extract only the selected moments (a few seconds total). This is why `ClipExtractor` exists.
- **Sandbox watermark** on all renders.

## Out of scope (deferred past v0)
Multi-creative stitch / outpaint / ordering (M1) · Cloud Function + `OutputDoc` + auth + multi-tenant + React studio · Artlist API + vibe→music · real beat-*detection* cutting · transitions · 30s · librosa-as-Cloud-Run · paid Shotstack · Veo motion · social posting.
