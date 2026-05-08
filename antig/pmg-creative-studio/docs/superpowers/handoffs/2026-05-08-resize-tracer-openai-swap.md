# Resize Tracer — OpenAI swap handoff

**Date:** 2026-05-08
**Branch:** `feature/resize-image-app` (off `dev`)
**Last clean commit on disk:** `61e54fa` (none of the OpenAI swap work is committed yet — it's all uncommitted edits)
**Status: ~95% done.** Code is in place, typecheck clean, 21/22 tests pass, 1 test perf-failing. Needs: (a) one test fix, (b) real-key smoke run, (c) eyeball pass on real fixtures.

---

## What this patch does

Replaces Phase 2 of the resize tracer pipeline. Was: Google Nano Banana (`gemini-2.5-flash-image`) prompt-only. Is now: **OpenAI `gpt-image-2`** with a true binary mask (separate `mask` PNG) plus a **strict post-composite step** (paste original source pixels back over the preserve region of the model output).

Why: Nano Banana cannot honor masks — confirmed by two independent web research passes. On extreme aspect changes it either replicates source aspect or returns the input unchanged. The new flow uses a real mask channel and guarantees pixel-perfect source preservation via deterministic compositing, neutralizing OpenAI's known "regenerates whole image" bug.

Phase 1 (Gemini 2.5 Pro vision analysis) is unchanged. Both SDKs (`@google/genai` for P1, `openai` for P2) coexist.

For the full reasoning, see this branch's prior conversation context. The decision crystallized after seeing the Polo Ralph Lauren result where Nano Banana literally returned the padded canvas (black bars and all) untouched.

---

## Pipeline shape (current)

```
Source bytes
    │
    ▼
P1: Gemini 2.5 Pro vision analysis  (phase1.ts, @google/genai SDK)
    └─→ P1Output JSON (subject, copy, style, extension directive)
    │
    ▼
canvasPrep (canvasPrep.ts, sharp, deterministic)
    ├─→ imageBuffer:  RGBA PNG, source pixels at max-fit position, transparent elsewhere
    ├─→ maskBuffer:   RGBA PNG, opaque white over source region, transparent elsewhere
    └─  metadata:     width, height, sourceBox, scaledW/H, offsetX/Y, fitRatio, sourceCoveragePct, emptyRegions
    │
    ▼
P2: OpenAI gpt-image-2 images.edit  (phase2.ts, openai SDK)
    │   image=imageBuffer, mask=maskBuffer, size=`${W}x${H}` (canvas dims, divisible by 16)
    └─→ raw model output buffer at canvas dims
    │
    ▼
strictPostComposite (postComposite.ts, sharp)
    └─→ paste original scaled-source pixels back over the preserve region.
        guarantees pixel-perfect subject/copy preservation regardless of model behavior.
    │
    ▼
resize (resize.ts, sharp, fit:cover, position:center)
    └─→ result.png at exact targetSpec.w × targetSpec.h
```

Artifacts written per run to `tools/resize-tracer/out/{runId}/`:

| File | What |
|---|---|
| `source.{jpg,png}` | original upload |
| `p1.json` | Phase 1 structured analysis |
| `p2-canvas.png` | the imageBuffer sent to OpenAI (source on transparent canvas) |
| `p2-mask.png` | the mask sent to OpenAI (white-opaque over source) |
| `p2-raw.png` | raw model output at canvas dims |
| `p2-composited.png` | post-composite (source pixels pasted back) |
| `result.png` | final, sharp-resized to exact target dims |

---

## State of every file (relative to `tools/resize-tracer/`)

| File | State | Notes |
|---|---|---|
| `package.json` | ✅ done | `openai ^4.67.0` added; `verify-p2-openai` script in place; `@google/genai` retained for P1 |
| `.env.example` | ✅ done | both `GEMINI_API_KEY=` and `OPENAI_API_KEY=` present |
| `README.md` | ✅ done | updated with new setup + verified-org note + smoke flow |
| `src/config.ts` | ✅ done | dropped `160x600` and `728x90` (out of gpt-image-2's 1:3–3:1 aspect range); added `OPENAI_P2_MODEL` constant; added `legalGenDims()` helper that returns div-by-16 dims with long edge ≥ 1024 |
| `src/canvasPrep.ts` | ✅ done | new shape: emits `imageBuffer` (transparent canvas + source) AND `maskBuffer` (opaque white over source). Exposes `scaledW/H, offsetX/Y, fitRatio, sourceCoveragePct, emptyRegions` for downstream use |
| `src/promptTemplate.ts` | ✅ done | slimmed to a single `buildP2PromptForOpenAi()` — short, content-focused, since the mask carries the layout signal |
| `src/phase2.ts` | ✅ done | full rewrite. Uses `openai.images.edit` with separate `image` + `mask`. Handles 403 verified-org with hint, propagates 429/4xx |
| `src/postComposite.ts` | ✅ NEW | strict composite — extracts scaled-source pixels from canvas, pastes onto model output at original offset |
| `src/pipeline.ts` | ✅ done | takes both `genai` + `openai` clients, wires the new ordering, persists all artifacts |
| `src/server.ts` | ✅ done | constructs both clients at boot, throws if either key missing, exposes new artifact URLs |
| `src/phase1.ts` | ✅ unchanged | still Gemini 2.5 Pro structured-JSON analysis |
| `src/log.ts`, `src/runId.ts`, `src/schema.ts`, `src/resize.ts` | ✅ unchanged | |
| `scripts/verify-p2-openai.ts` | ✅ NEW | replaces old `verify-p2.ts` (deleted). Calls gpt-image-2 with one fixture; surfaces 403/429/4xx with helpful hints |
| `scripts/verify-p2.ts` | ✅ DELETED | old Nano Banana smoke |
| `public/tracer.html` | ✅ done | 5-column grid: Source / Mask / Raw P2 / Composited / Final |
| `public/tracer.js` | ✅ done | renders new artifact URLs into the 5 image slots |
| `public/tracer.css` | ✅ done | `.grid` is now `grid-template-columns: repeat(5, 1fr)` |
| `src/pipeline.test.ts` | ⚠️ 1 failing | 21/22 tests pass. One test times out — see "What's broken" below |
| `src/promptTemplate.test.ts` | ✅ done | snapshot of new prompt |
| `src/schema.test.ts` | ✅ unchanged | |

---

## What works (verified 2026-05-08)

- `npm install` from `tools/resize-tracer/` — succeeds
- `npm run typecheck` — clean (`tsc --noEmit` no errors)
- `npm test` — 21 of 22 tests pass; the 22nd is a timeout, not a logic failure (see below)

---

## What's broken (one thing)

### Failing test: `pipeline.test.ts:244` — `strictPostComposite > source region of output is bytewise equal to scaled source`

**Symptom:** times out at 5000ms.

**Root cause:** the test does a per-pixel nested for-loop comparing `compRegion.data[ci+0..2]` against `sourceRegion.data[si+0..2]` using `expect(x).toBe(y)` for every pixel. At canvas dims of 1088×1920 with the source landing at 1088×1088, that's ~1.18M pixels × 3 channels = **~3.5M assertions**. Vitest's per-assertion overhead is non-trivial; the loop alone runs ~12s on this machine.

The test logic is correct (verifies pixel-exact preservation, which is the whole point of strict composite). But the assertion strategy is the problem.

**Fix (pick one — agent's choice):**

1. **Buffer.equals on RGB slices.** Strip to RGB-only with `sharp(...).removeAlpha().raw().toBuffer()`, then `expect(Buffer.compare(compRgb, sourceRgb)).toBe(0)`. One assertion, identical guarantee.
2. **Sample 20 random pixels.** Statistical proof; faster but not bytewise.
3. **SHA-256 hash comparison.** Hash both regions, expect equal hex strings. One assertion.

My recommended fix is **(1)**. Code sketch:

```ts
const compRgb = await sharp(composited)
  .extract({ left: padded.offsetX, top: padded.offsetY, width: padded.scaledW, height: padded.scaledH })
  .removeAlpha()
  .raw()
  .toBuffer();

const sourceRgb = await sharp(padded.imageBuffer)
  .extract({ left: padded.offsetX, top: padded.offsetY, width: padded.scaledW, height: padded.scaledH })
  .removeAlpha()
  .raw()
  .toBuffer();

expect(Buffer.compare(compRgb, sourceRgb)).toBe(0);
```

Keep the "outside the source region" sanity check that follows (around line 302).

---

## What hasn't been validated yet

These need the user's actual `OPENAI_API_KEY` and a fixture, so they're sequential, not parallel:

1. **`npm run verify-p2-openai`** — confirms SDK + model id + mask shape work end-to-end with the user's key. Possible first-encounter failures:
   - 403 `organization_must_be_verified` → user needs to verify at platform.openai.com → Settings → Organization → Verification (15-min ID + selfie process). User has confirmed verified-org status.
   - 429 rate limit → tier-based, retry with backoff.
   - 400 content policy → some PMG creatives may trigger refusals on logos/celebrities/IP imagery — surface clean error, don't retry.
2. **`npm run tracer`** + browser test — drop a fixture, pick a target, click Run, eyeball results. The strict-composite hypothesis is that the source region will be pixel-perfect and only the surrounding outpainted background will have model character.
3. **Eyeball pass on the 7 in-range presets** — see "Targets in scope" below.

---

## Decisions locked (don't second-guess)

| # | Decision | Rationale |
|---|---|---|
| 1 | **Drop `160x600` (1:3.75) and `728x90` (8.09:1) from v0** | Outside gpt-image-2's [1:3, 3:1] aspect range. Will reintroduce in v1+ with a different model (Replicate Bria/FLUX) |
| 2 | **OpenAI key only — no GCP/Vertex/Imagen path** | User has OpenAI key, doesn't want GCP service-account dance. Imagen 3 is being deprecated June 2026 anyway |
| 3 | **Rip Nano Banana** | Two SDKs in tracer = unnecessary debug surface. `@google/genai` stays for P1 only |
| 4 | **Strict post-composite** | Model output is COMPLETELY DISCARDED in source region. Source pixels pasted back deterministically. Pixel-perfect preservation > any "stylistic improvement" the model might make at edges |
| 5 | **Verified Org confirmed by user** | User has org verified status. No 403 wall expected at runtime |

---

## Targets in scope (7 presets)

| Channel | Label | Final dims | Canvas dims (div by 16) | Aspect |
|---|---|---|---|---|
| Social | `1x1` | 1080×1080 | 1024×1024 (or similar — see `legalGenDims`) | 1:1 |
| Social | `9x16` | 1080×1920 | 1088×1920 | 0.5625 |
| Social | `2x3` | 1080×1620 | 1088×1632 | 0.667 |
| Programmatic | `300x250` | 300×250 | scaled up to ≥1024 long edge with 1.2:1 aspect | 1.2 |
| Programmatic | `300x600` | 300×600 | 768×1536 | 0.5 |
| Print | `letter` | 1275×1650 | 1280×1648 | 0.773 |
| Print | `4x6` | 1200×1800 | 1200×1808 | 0.667 |

**Confirm at runtime:** these are what `legalGenDims()` returns; verify by running. If anything looks off, fix the helper.

---

## Run order for the next agent

### Phase 1 — finish what's broken (no API key required)

1. Read these files to understand current shape:
   - `tools/resize-tracer/src/postComposite.ts`
   - `tools/resize-tracer/src/pipeline.test.ts` (especially lines 244–305)
   - `tools/resize-tracer/src/canvasPrep.ts` (especially the `PaddedCanvas` interface)
2. Fix the failing test per the recommendation in "What's broken" above. Use `Buffer.compare` + `removeAlpha`. Verify via `npm test`.
3. Confirm `npm run typecheck` is still clean.
4. Mark task #14 (`Fix strictPostComposite test timeout`) completed in the task list.

### Phase 2 — smoke + first real run (requires user's `OPENAI_API_KEY` in `.env`)

5. Verify `tools/resize-tracer/.env` exists and has `GEMINI_API_KEY=` AND `OPENAI_API_KEY=`. (User said yes 2026-05-08.)
6. Run `npm run verify-p2-openai` from `tools/resize-tracer/`. **Expected outputs:**
   - Console log of model + dims + b64 size
   - File `tools/resize-tracer/scripts/_smoke-out.png` — open and eyeball: source pixels intact, surrounding region outpainted naturally.
   - **If 403 verified-org error:** STOP, surface to user. They have org verified per prior conversation, so this would be unexpected — check `OPENAI_API_KEY` is the right one (sometimes orgs have multiple keys, only some are tied to the verified org).
   - **If 400 content policy:** the smoke fixture might contain something that trips OpenAI's filters (real faces, logos, etc.). Try a different fixture from `tools/resize-tracer/fixtures/`.
7. If smoke passes, mark task #12 completed.

### Phase 3 — hand back to user (do NOT background-launch the dev server)

8. **DO NOT run `npm run tracer` yourself** — feedback memory at `~/.claude/projects/-Users-diegoescobar-Documents-dl-creative-studio/memory/feedback_run_dev_servers.md` says user runs dev servers themselves to see live logs. Hand them this command:
   ```
   cd tools/resize-tracer && npm run tracer
   ```
9. Tell them what to look for:
   - Browser at `http://127.0.0.1:3000/`
   - 5-column grid per result: Source / Mask (white = preserve) / Raw P2 / Composited / Final
   - The composited image should have **pixel-exact source content** in the source region (that's the strict composite's promise) with model-generated background filling the previously-transparent areas
   - The "Raw P2" column shows what the model actually produced — useful to see whether the model honored the mask or hit OpenAI's known "regenerates whole image" bug. Either way, the composited and final columns are what matter for the user's verdict.
10. Mark task #13 completed once handed off.

---

## Hard constraints (must not violate)

- **Don't background-launch the dev server.** User runs it themselves. See feedback memory.
- **Don't touch `phase1.ts`** unless something is genuinely broken there. P1 works.
- **Don't touch `functions/src/ai.ts`** at the repo root — that's the existing Gemini setup for the production app, on the deprecated SDK. Migrating it is a separate PR scoped to v1, not v0.
- **Don't add 160x600 or 728x90 back** to `TARGET_PRESETS` — they're out of gpt-image-2's range. v1 will handle these with a different model.
- **Don't re-introduce Nano Banana fallback code paths.** If gpt-image-2 fails, surface the error; we'll redesign if needed. Two parallel paths = debug hell.
- **Don't commit** unless the user asks. The whole tracer (`tools/resize-tracer/`) is uncommitted right now; that's intentional.

---

## Optional follow-ups (only if user asks)

These came up during build but aren't blockers:

1. **Bump `multer` 1.x → 2.x.** 1.x has known vulnerabilities; tracer is local-only on 127.0.0.1 so it's not a security blocker, but cleanup would be nice.
2. **Add HTTPS for local dev.** Not needed for v0, but if we ever expose this off-localhost we'd need it.
3. **Cache `legalGenDims()` results.** Computed per request now; trivial cost. Skip unless profile says otherwise.
4. **Capture per-run cost.** OpenAI's response includes token usage; could log estimated $ per run to the JSONL critique entries. Useful when accumulating eyeball data.
5. **Migrate `functions/src/ai.ts` to `@google/genai`.** Pre-existing tech debt — separate PR, in scope for v1, not this handoff.

---

## Quick reference — task list IDs

- #9 Drop Nano Banana, swap P2 to OpenAI gpt-image-2 — **completed**
- #10 Update presets + UI + smoke script — **completed**
- #11 Update tests + run validation — **partially complete** (one failing — see #14)
- #12 Run smoke against real OpenAI key — **pending** (Phase 2 above)
- #13 Hand back to user for fixture pass — **pending** (Phase 3 above)
- #14 Fix strictPostComposite test timeout — **pending** (Phase 1 above)

---

## End-state success criteria

You're done with this handoff when:

1. ✅ All tests pass (22/22) — `npm test` from `tools/resize-tracer/`
2. ✅ Typecheck clean — `npm run typecheck`
3. ✅ Smoke script writes a valid PNG with pixel-perfect source preservation — `npm run verify-p2-openai`
4. ✅ User has been handed the run command and told what to look for in the browser
5. ✅ Tasks #11, #12, #13, #14 marked completed in the task list

Then this becomes a v0-eyeball-pass conversation — the user runs the tracer, critiques real fixtures via the form, populates `critiques.jsonl`, and we move to v1 (wizard integration) when 3+ of 5 fixtures pass on at least one target spec.
