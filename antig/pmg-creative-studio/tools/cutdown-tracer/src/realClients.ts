/**
 * Real cloud wiring for the live tracer (build-order step 5). Kept OUT of
 * `factory.ts` so the offline test suite never loads `firebase-admin` — only
 * `scripts/run-live.ts` imports this.
 *
 * Auth is ADC (`gcloud auth application-default login`); URLs are `getDownloadURL`
 * token URLs (publicly fetchable, no service-account key), matching `functions/`.
 */
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage, getDownloadURL } from "firebase-admin/storage";

import type { PipelineDeps } from "./seams.js";
import { makeGeminiSelector } from "./gemini.js";
import { makeLibrosaTempoDetector } from "./librosa.js";
import { makeCutdownBrain } from "./cutdownBrain.js";
import { FirestoreMusicCatalog, type FirestoreLike } from "./firestoreCatalog.js";
import { GcsBlobStore, type BucketLike } from "./storage.js";
import { makeShotstackRenderer } from "./shotstack.js";
import { makeFfmpegClipExtractor } from "./ffmpeg.js";
import { makeFfmpegStoryboard } from "./storyboard.js";

const DEFAULT_PROJECT = "automated-creative-e10d7";
const DEFAULT_BUCKET = "automated-creative-e10d7.firebasestorage.app";

/** Compose the full real dependency set from env (ADC for Firestore/Storage). */
export function makeRealDeps(env: NodeJS.ProcessEnv = process.env): PipelineDeps {
  const projectId = env.GOOGLE_CLOUD_PROJECT ?? DEFAULT_PROJECT;
  const storageBucket = env.GCS_BUCKET ?? DEFAULT_BUCKET;

  if (getApps().length === 0) initializeApp({ projectId, storageBucket });

  const db = getFirestore();
  const bucket = getStorage().bucket();
  // getDownloadURL → a fetchable token URL (no signing/SA key needed).
  const resolveUrl = (objectPath: string): Promise<string> =>
    getDownloadURL(bucket.file(objectPath));

  const blobStore = new GcsBlobStore(bucket as unknown as BucketLike, resolveUrl);
  const catalog = new FirestoreMusicCatalog(
    db as unknown as FirestoreLike,
    (storagePath) => blobStore.sign(storagePath),
  );

  return {
    selector: makeGeminiSelector(env.GEMINI_API_KEY ?? ""),
    tempo: makeLibrosaTempoDetector(),
    catalog,
    renderer: makeShotstackRenderer(env.SHOTSTACK_API_KEY ?? ""),
    blobStore,
    clipExtractor: makeFfmpegClipExtractor(),
    brain: makeCutdownBrain(env.GEMINI_API_KEY ?? ""),
    storyboard: makeFfmpegStoryboard(),
  };
}
