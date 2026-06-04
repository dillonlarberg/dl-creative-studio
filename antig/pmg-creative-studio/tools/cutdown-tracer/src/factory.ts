/**
 * Env-keyed factory (PRD #11): one switch flips each seam between its Fake (fast,
 * offline) and its real provider. In v0 only the Fakes exist — real branches are
 * wired in build-order steps 3–5 and currently throw a clear "not yet" error.
 *
 *   USE_FAKES=1  (default)  → all Fakes, no network/env
 *   USE_FAKES=0             → real providers (added incrementally)
 */
import type { PipelineDeps } from "./seams.js";
import {
  FakeEvenSpacedSelector,
  FakeFixedBpm,
  FakeMusicCatalog,
  FakeEchoRenderer,
} from "./fakes.js";

function notYet(seam: string, step: string): never {
  throw new Error(`${seam}: real implementation lands in build-order ${step} (set USE_FAKES=1 for now)`);
}

export function makeDeps(env: NodeJS.ProcessEnv = process.env): PipelineDeps {
  const useFakes = env.USE_FAKES !== "0";

  if (useFakes) {
    return {
      selector: new FakeEvenSpacedSelector(),
      tempo: new FakeFixedBpm(),
      catalog: new FakeMusicCatalog(),
      renderer: new FakeEchoRenderer(),
    };
  }

  // Real providers — wired one step at a time so the path stays runnable as it grows.
  return {
    selector: notYet("VideoMomentSelector", "step 3 (Gemini)"),
    tempo: notYet("TempoDetector", "step 4 (librosa)"),
    catalog: notYet("MusicCatalog", "step 5 (Firestore sampleMusic)"),
    renderer: notYet("VideoRenderer", "step 5 (Shotstack)"),
  };
}
