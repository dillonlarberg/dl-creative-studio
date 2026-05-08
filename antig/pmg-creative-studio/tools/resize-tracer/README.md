# resize-tracer (v0)

Local debug rig for the image-resize pipeline. Phase 1: Gemini 2.5 Pro vision analysis. Phase 2: OpenAI gpt-image-2 mask-based edit + sharp resize check to exact target dims.

Plan: `docs/superpowers/plans/2026-05-07-resize-tracer-v0.md`.

---

## Setup

```bash
cd tools/resize-tracer
cp .env.example .env
# edit .env, set GEMINI_API_KEY=... and OPENAI_API_KEY=...
# Note: the OpenAI org must be Verified to use gpt-image-2 — see
# https://platform.openai.com/settings/organization/general
npm install
```

Drop 1-5 PMG creatives into `fixtures/` (.jpg or .png). Directory is gitignored.

## Smoke-test the P2 API surface

```bash
npm run verify-p2-openai
```

Writes `scripts/_smoke-out.png` if successful. Surfaces 403 (verify org), 429 (rate limit), and 400 (content policy) errors with helpful hints.

## Run

```bash
npm run tracer
# open http://127.0.0.1:3000/tracer.html
```

Pick a fixture, pick a target, click Run. The page shows Source / Mask / Raw P2 / Final resize check — four panels — plus the P1 JSON (collapsible).

## Critique workflow

Each result card has a critique form. Fill out verdict / radio rows / failure tag chips / notes -> Save. The entry is appended to `critiques.jsonl` (gitignored). The UI does NOT show "Saved" until the server returns 200.

### Critique JSONL schema

```json
{
  "runId": "2026-05-07T15-42-08.142-a3f1-creative-01-9x16",
  "timestamp": "2026-05-07T15:42:08Z",
  "source": "creative-01.jpg",
  "targetSpec": "9x16",
  "p2Model": "gemini-2.5-flash-image",
  "p2OutputPath": "out/<runId>/result.png",
  "timings": { "p1Ms": 1840, "p2Ms": 7520 },
  "critique": {
    "verdict": "pass" | "retry" | "fail",
    "subjectPreserved": "yes" | "partial" | "no",
    "copyIntact": "yes" | "partial" | "no" | "n/a",
    "styleMatch": 1-5,
    "failureTags": ["subject-cropped", "text-distorted", ...],
    "notes": "free text"
  }
}
```

## Outputs

Every run writes to `out/<runId>/`:
- `source.{jpg,png}` — original upload
- `p1.json` — Phase 1 structured analysis
- `p2-canvas.png` — padded source PNG (model input)
- `p2-mask.png` — binary mask PNG (model input; opaque = preserve)
- `p2-raw.png` — raw gpt-image-2 output at canvas dims
- `result.png` — sharp cover-fit resize of raw P2 to exact target dims

`<runId>` format: `${ISO-with-ms-dashes}-${4-char-random}-${fixture}-${targetLabel}`.

## Tests

```bash
npm test         # vitest, no network, no env required
npm run typecheck
```

8+ unit tests cover P1 retry behavior, P2 safety guards, prompt template formatting, schema validation, and the end-to-end pipeline (with mocked `@google/genai`).

## Out of scope for v0

- Async batches / Cloud Tasks / Firestore (v1)
- Datasource feed integration (v1)
- Phase 3 critic panel — eyeballs + this critique form are the critic
- Hard copy-zone masking (deferred bake-off vs Vertex Imagen 3)
- React/dashboard wire-up (v1)

## Swapping P2 model later

The pipeline is wired through `src/phase2.ts`. Swapping to a true inpaint model (Bria/FLUX/Imagen 3) is NOT a one-line change — it needs canvas+mask prep before the call and a different prompt grammar. Budget ~1 day.

## Layout

```
src/
  server.ts           # Express, binds 127.0.0.1:3000
  pipeline.ts         # runPipeline() — pure async, the contract
  phase1.ts           # Gemini 2.5 Pro via @google/genai
  phase2.ts           # OpenAI gpt-image-2 image edit
  resize.ts           # sharp post-resize
  promptTemplate.ts   # P1Output -> P2 prompt string
  schema.ts           # zod schemas (P1Output, Critique)
  runId.ts            # ISO + random + names
  config.ts           # locked model ids, target presets
  log.ts              # JSONL append (propagates fs errors)
public/
  tracer.html         # vanilla UI
  tracer.js
  tracer.css
scripts/
  verify-p2-openai.ts # API surface smoke test
fixtures/             # gitignored
out/                  # gitignored
critiques.jsonl       # gitignored
```
