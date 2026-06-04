/**
 * runPipeline — the orchestrator. It is *only* composition: each step is an
 * independently-proven seam or the pure planCuts function (PRD #22). No vendor
 * logic lives here.
 *
 *   select moments → fetch track → detect/read BPM → planCuts → render → mp4Url
 *
 * BPM precedence: a track's catalog BPM wins (cheap, hand/known); the TempoDetector
 * is the fallback when the catalog has none. This keeps librosa off the path for
 * tracks that already carry a reliable BPM.
 */
import type { PipelineDeps } from "./seams.js";
import type { CutPlan, EditSpec, Segment } from "./types.js";
import { OUTPUT } from "./types.js";
import { planCuts, totalLen } from "./planCuts.js";

export interface PipelineResult {
  mp4Url: string;
  plan: CutPlan;
  bpm: number;
  segments: Segment[];
  trackId: string;
  spec: EditSpec;
}

export async function runPipeline(
  videoFile: string,
  trackId: string,
  deps: PipelineDeps,
): Promise<PipelineResult> {
  const { selector, tempo, catalog, renderer } = deps;

  const segments = await selector.select({ path: videoFile }, { budgetSec: OUTPUT.totalSec });
  const track = await catalog.fetch(trackId);
  const bpm = track.bpm ?? (await tempo.detect(track.url)).bpm;

  const plan = planCuts({ bpm, totalSec: OUTPUT.totalSec, ranked: segments });

  const spec: EditSpec = {
    sourceUrl: videoFile,
    cuts: plan,
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

  return { mp4Url, plan, bpm, segments, trackId, spec };
}
