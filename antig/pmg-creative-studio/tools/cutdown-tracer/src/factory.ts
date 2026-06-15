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
  FakeBlobStore,
  FakeClipExtractor,
  FakeCutdownBrain,
  FakeStoryboard,
} from "./fakes.js";
import { makeGeminiSelector } from "./gemini.js";
import { makeLibrosaTempoDetector } from "./librosa.js";
import { makeCutdownBrain } from "./cutdownBrain.js";

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
      blobStore: new FakeBlobStore(),
      clipExtractor: new FakeClipExtractor(),
      brain: new FakeCutdownBrain(),
      storyboard: new FakeStoryboard(),
    };
  }

  // Real providers — wired one step at a time so the path stays runnable as it grows.
  // Steps 3–4: real selector (Gemini) + real tempo (librosa). Step 5 impls exist
  // (FirestoreMusicCatalog/ShotstackRenderer/GcsBlobStore) but their SDK-backed
  // `make*` constructors land once creds + `firebase-admin`/`@google-cloud/storage`
  // are installed — see SETUP-step5.md.
  return {
    selector: makeGeminiSelector(env.GEMINI_API_KEY ?? ""),
    tempo: makeLibrosaTempoDetector(),
    catalog: notYet("MusicCatalog", "step 5 (use makeRealDeps in realClients.ts — see SETUP-step5.md)"),
    renderer: notYet("VideoRenderer", "step 5 (use makeRealDeps in realClients.ts — see SETUP-step5.md)"),
    blobStore: notYet("BlobStore", "step 5 (use makeRealDeps in realClients.ts — see SETUP-step5.md)"),
    clipExtractor: notYet("ClipExtractor", "step 5 (use makeRealDeps in realClients.ts — see SETUP-step5.md)"),
    brain: makeCutdownBrain(env.GEMINI_API_KEY ?? ""),
    storyboard: notYet("StoryboardMaker", "functions wiring"),
  };
}
