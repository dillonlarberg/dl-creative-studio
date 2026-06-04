# cutdown-tracer (v0)

Local debug rig for the **video-stitch v0** pipeline: one long video → AI-selected best moments → beat-snapped uniform grid → 15s 9:16 MP4 (rendered by Shotstack).

Full spec + UML: `src/apps/video-stitch/v0-design.html` · PRD: dillonlarberg/dl-creative-studio#78.

Mirrors the `tools/resize-tracer/` convention (standalone package, smoke tests in `scripts/`, fixtures + `out/<runId>/`, vitest no-network).

## Setup

```bash
cd tools/cutdown-tracer
cp .env.example .env       # add GEMINI_API_KEY (https://aistudio.google.com/app/apikey)
npm install
```

Drop a short test clip (5–10s mp4) into `fixtures/` (gitignored).

## Smoke tests (build-order step 1)

```bash
npm run verify-gemini ./fixtures/<clip>.mp4
```

Proves the `VideoMomentSelector` surface end-to-end: (1) the key authenticates, (2) the Files API accepts the video and transitions it to `ACTIVE`, (3) Gemini returns schema-valid `{ segments: [{startSec,endSec,score}] }` — the exact shape `planCuts()` will consume. Mirrors the in-repo call shape in `functions/src/resize/phase1.ts` (`@google/genai` ^1.0.0, `responseMimeType` + `responseSchema`).

`verify-shotstack` lands once the Shotstack sandbox key is procured.

## Build order

1. `verify-gemini` + `verify-shotstack` smoke tests ← **here**
2. tracer green end-to-end with Fakes
3. swap in real Gemini `VideoMomentSelector`
4. real librosa tempo (`TempoDetector`)
5. `MusicCatalog` over Firestore `sampleMusic`
6. eyeball + iterate

## Tests

```bash
npm test         # vitest, no network, no env required
npm run typecheck
```
