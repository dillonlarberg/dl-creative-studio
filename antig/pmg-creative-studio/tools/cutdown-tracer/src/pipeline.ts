/**
 * runPipeline — the orchestrator. It is *only* composition: each step is an
 * independently-proven seam or the pure planCuts/clampSegments functions (PRD #22).
 *
 *   probe duration → select moments → clamp to duration → fetch track → BPM →
 *   planCuts → extract per-cut clips → upload each → render
 *
 * Why per-clip extraction: the cloud renderer won't ingest a long full source, so
 * we cut the selected moments into small clips locally and upload only those.
 * Segments are clamped to the real duration first (models can return out-of-bounds
 * timestamps). BPM precedence: catalog BPM wins; TempoDetector is the fallback.
 */
import type { PipelineDeps } from "./seams.js";
import type { CutPlan, ClipRef, EditSpec, Segment } from "./types.js";
import { OUTPUT } from "./types.js";
import { planCuts, clampSegments, totalLen } from "./planCuts.js";

export interface PipelineResult {
  mp4Url: string;
  plan: CutPlan;
  bpm: number;
  segments: Segment[];
  durationSec: number;
  trackId: string;
  spec: EditSpec;
}

export interface PipelineOptions {
  /** Namespaces uploaded clip object names so concurrent/repeat runs don't collide. */
  runToken?: string;
}

export async function runPipeline(
  videoFile: string,
  trackId: string,
  deps: PipelineDeps,
  opts: PipelineOptions = {},
): Promise<PipelineResult> {
  const { selector, tempo, catalog, renderer, blobStore, clipExtractor } = deps;
  const runToken = opts.runToken ?? "run";

  // True duration first — used to clamp model-supplied timestamps and bound extraction.
  const durationSec = await clipExtractor.probeDurationSec(videoFile);

  const ranked = await selector.select({ path: videoFile }, { budgetSec: OUTPUT.totalSec });
  const segments = clampSegments(ranked, durationSec);
  if (segments.length === 0) {
    throw new Error(`runPipeline: no usable moments within the ${durationSec}s source`);
  }

  const track = await catalog.fetch(trackId);
  const bpm = track.bpm ?? (await tempo.detect(track.url)).bpm;

  const plan = planCuts({ bpm, totalSec: OUTPUT.totalSec, ranked: segments });

  // Cut each planned moment into its own small clip, then host each for the renderer.
  const clipPaths = await clipExtractor.extractClips(videoFile, plan, durationSec);
  const clips: ClipRef[] = [];
  for (let i = 0; i < clipPaths.length; i++) {
    const url = await blobStore.uploadAndSign(clipPaths[i], `${runToken}/clip-${i}.mp4`);
    clips.push({ url, len: plan[i].len });
  }

  const spec: EditSpec = {
    clips,
    musicUrl: track.url,
    totalSec: OUTPUT.totalSec,
    width: OUTPUT.width,
    height: OUTPUT.height,
  };

  const { mp4Url } = await renderer.render(spec);

  // Defensive: the orchestrator guarantees the exact-duration contract before handing off.
  if (totalLen(plan) !== OUTPUT.totalSec) {
    throw new Error(
      `runPipeline: cut plan sums to ${totalLen(plan)}s, expected ${OUTPUT.totalSec}s`,
    );
  }

  return { mp4Url, plan, bpm, segments, durationSec, trackId, spec };
}
