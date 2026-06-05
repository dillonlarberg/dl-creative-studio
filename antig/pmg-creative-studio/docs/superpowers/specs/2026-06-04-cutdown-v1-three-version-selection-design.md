# Cutdown V1 — Three-Version AI Selection · Design Spec

**Date:** 2026-06-04
**Status:** Approved (brainstorm → spec). Next: `writing-plans`.
**PRD / tracker:** dillonlarberg/dl-creative-studio#78
**Builds on:** Milestone 0 (the `tools/cutdown-tracer/` rig — renders a real 15s 9:16 reel end-to-end).
**Exploration artifact:** `tools/cutdown-tracer/V1-flow-exploration.html`

---

## 1. Summary

V1 turns the headless M0 tracer into a **standalone, isolatable cutdown tool**: one long video + a chosen music track → **three AI-generated cut versions** → a human picks one → a rendered 9:16 reel. The cutdown "brain" is a single brief-optional function so the tool can later drop into the larger **video-stitch** product as one module without rework.

The defining shift from M0: the brain returns **multiple whole versions for a human to choose between** (not one auto-cut), each carrying a written description, and selection is steerable by an optional natural-language **brief**.

## 2. Goals

- A clean isolation boundary: `aiCutdown(video, track, opts) → CutdownPlan[]` that the CLI, the V1 web shell, and future video-stitch all call.
- Higher-quality, **coherent** moment selection (meaningful beats, not just busy frames) — the gap M0 eyeballing exposed.
- An optional **creative brief** that steers selection; absent = sensible autodetect.
- **Three meaningfully-different versions** so the human picks by taste rather than editing cuts by hand.
- Preserve the M0 engineering discipline: interface seams + Fakes, no-network tests, incremental checkpoints with human gates.

## 3. Non-goals (V1)

- Per-cut manual editing (frame-trim, reorder, drag) — superseded by the 3-version pick.
- Multi-creative stitch / outpaint / ordering (that is video-stitch / M1).
- Free-form length or multiple aspect ratios (presets + 9:16 only).
- Real-time / in-browser rendered preview (storyboard thumbnails are the gate; the rendered output is the watch).
- Auth, OutputDoc, multi-tenant `clients/{slug}` wiring, paid Shotstack — deferred to studio integration.
- LangChain / LangGraph / a general agentic tool-calling loop (explicitly rejected — see §10).

## 4. The core abstraction

```ts
aiCutdown(
  video: VideoRef,
  track: SampleMusicTrack,          // url + detected BPM; the timing source of truth
  opts: {
    humanInput?: string;            // the brief — optional. absent = autodetect.
    targetSec: 15 | 30 | 60;        // preset length
    variants?: number;              // default 3 — see note below
  }
): Promise<CutdownPlan[]>           // one plan per angle, each ready to preview/render
```

> **On `variants`:** in V1 this is effectively fixed at **3**, mapping one-to-one to the three fixed angles (§5). The parameter exists so the boundary doesn't have to change when future versions vary the count or make angles dynamic; V1 ignores values other than 3.

- **Music-first, brain-blind-to-catalog.** The user browses the catalog and picks a track in the surface; the brain *receives* the chosen track. The track's BPM is the source of truth for the beat grid. The brain never queries Firestore.
- **Plan-then-render.** `aiCutdown` returns plans; rendering is a **separate seam** (`VideoRenderer`). The storyboard preview is built from the plan; only the final "Render" calls Shotstack.
- **Brief-optional, single code path.** `humanInput` absent → the system prompt finds the meaningful moments and they snap to the beat-grid regions (M0 behavior, made addressable). Present → it biases all three versions. Same return shape either way — the renderer learns no second path.

### `CutdownPlan` shape (per version)

```ts
interface CutdownPlan {
  angle: "narrative" | "highlights" | "punchy";
  description: string;              // AI-written pitch for this version (shown in storyboard)
  cuts: Cut[];                      // ordered for THIS angle's playback (not always score order)
  // each cut additionally carries: summary, role, why, score (optional, for the storyboard)
}
```

## 5. Pipeline (per run)

```
probe duration (ffmpeg)
  → ANALYZE once → { theme, beats[] }          (shared across all 3 versions)
  → for each angle in [Narrative, Highlights, Punchy]:
        SELECT (angled, brief-aware)   → ranked/ordered segments
        CRITIQUE once (coherence + brief-fit) → may nudge picks
        planCuts (beat grid, preserve angle order) → CutdownPlan
  → STORYBOARD (ffmpeg frame-grab per cut + descriptions)
  ── human picks ONE version ──
  → extract clips (ffmpeg) → upload (GCS) → render (Shotstack) → 9:16 reel
```

**Call budget per run:** 1 analyze + 3 select + 3 critique = 7 Gemini calls. A failed angle degrades to its pre-critique selection rather than aborting the run; if a whole angle fails, the run returns the surviving versions.

### The three angles (fixed)

| Angle | Selection bias | Playback order |
|---|---|---|
| **Narrative** | Beats that form a story arc (setup → turn → payoff). | Chronological (source-time). |
| **Highlights** | Highest-impact / most engaging beats. | By impact (score). |
| **Punchy** | Hook-dense, fast; front-loads the single strongest beat. | Strongest first, fast pacing. |

When a brief is present, **all three** filter toward it (they differ in framing, not in whether they obey). When absent, the three run "general."

### Per-version critique

One bounded AI self-check per version, after select, before it's shown. It evaluates the version against its angle + the brief + cut-to-cut coherence and may swap/drop/replace picks **once** (no loop). This is the only "agentic" element and it is a fixed single pass, not a general tool-calling loop.

## 6. Seam changes (extends the M0 tracer)

All new behavior sits behind interface seams with Fakes, preserving the no-network/no-env offline suite.

- **`VideoMomentSelector`** → gains `angle` + `brief` inputs; returns ordered, described selections. Internally `gemini.ts` orchestrates analyze → select → critique (raw `@google/genai`, mirroring `resize/phase1.ts` call shape).
- **New: analyze step** (shared content map) — a seam method or internal pass with a Fake.
- **New: critique step** — bounded single-pass self-check, with a Fake.
- **New: `StoryboardMaker`** seam — ffmpeg frame-grab per cut → thumbnail paths; Fake returns canned paths.
- **`planCuts`** — add a "preserve provided order" path so Narrative/Punchy orderings survive (today it always re-sorts by score). `clampSegments` unchanged and still guards out-of-bounds timestamps.
- **Types** — `Segment`/`Cut` gain optional `summary`/`role`/`why`; new `CutdownPlan` with `angle` + `description`. All optional/additive → non-breaking.
- **Unchanged:** `TempoDetector` (librosa), `MusicCatalog` (Firestore — `list()` now also powers browse), `BlobStore` (GCS), `ClipExtractor` (ffmpeg), `VideoRenderer` (Shotstack).

## 7. Surface (V1)

- **Functionality first; the UI is a thin, throwaway shell.** Priority is the brain + pipeline + data contracts, not polish.
- Flow: upload video → browse & pick track (BPM detected) → choose length preset + optional brief → see 3 storyboard versions (thumbnails + AI description + per-cut why/time/score) → pick one → render → download.
- **Preview = storyboard** (ffmpeg thumbnails). No in-gate playback. The rendered output is the watch; re-roll (3 fresh versions) if it disappoints.
- Output: presets **15 / 30 / 60s**, **9:16** locked. Shotstack sandbox (watermark acceptable for V1).

## 8. Build checkpoints (M0-style gates)

Each checkpoint ends at a human-reviewable gate; build headless first, the UI shell last.

1. **Analyze + angled select (headless).** Shared analyze pass; one angle end-to-end through `planCuts`. Eyeball via a script. Gate: a coherent single-angle plan.
2. **Three angles + per-version critique.** All three angles + the bounded critique; `planCuts` order-preservation. Script prints 3 plans + descriptions. Gate: 3 meaningfully-different plans.
3. **Brief steering.** Thread `humanInput` through analyze/select/critique. Gate: brief visibly changes the picks.
4. **Storyboard + pick + render.** `StoryboardMaker` thumbnails; pick one plan; render via the existing Shotstack path. Gate: a rendered reel from a chosen version.
5. **Thin web shell.** Minimal local page wiring the whole flow over `aiCutdown` + render. Gate: end-to-end through the UI.

Tests accompany each checkpoint; the offline suite stays no-network.

## 9. Error handling & testing

- Every AI pass is Zod-validated with retry + exponential backoff (existing `gemini.ts` pattern).
- Degradation: a failed critique → use the pre-critique selection; a failed angle → drop that version, return the rest; zero surviving versions → surface a clear error.
- `clampSegments` continues to clip/drop out-of-bounds model timestamps before planning.
- Offline tests inject a fake `GenAiLike` returning **queued** canned responses (analyze → select → critique per call); Fakes for the storyboard/render seams keep the suite no-network/no-env.

## 10. Rejected alternatives (why)

- **LangChain / LangGraph.** Their wins (provider abstraction, prebuilt agents, memory, output parsers) don't map here: single provider (Gemini), single video, no memory, structured output already solved with Zod. They'd hide the in-repo `@google/genai` call shape and fight the no-network-DI-seam pattern. The only "loop" is a bounded single-pass critique = a counter, not a graph.
- **General agentic tool-calling loop.** Gemini watches the entire video in one shot, so there are no tools to fetch external info. The user brief is prompt steering, not tool-decisions.
- **Per-cut manual editing (rung 1/2).** Replaced by the 3-version pick — better fit for "functionality over UI" and storyboard-only preview.
- **Real Shotstack preview per iteration.** Too slow/costly/watermarked to iterate; storyboard + final render is the chosen loop.
- **Temperature-only diversity.** Versions come out samey or randomly different and the AI description can't explain *why* they differ; fixed angles are interpretable and testable.

## 11. Open items for the plan

- Exact prompt text per pass (analyze / each angle / critique) — drafted during implementation, eyeballed at the gates.
- Whether analyze is a distinct seam method or an internal phase of the selector (lean: internal phase, one Fake).
- Storyboard thumbnail count/size and on-disk layout under `out/<runId>/`.
- Re-roll semantics (re-run all 3 with fresh generation, same angles) — confirm at checkpoint 2.
