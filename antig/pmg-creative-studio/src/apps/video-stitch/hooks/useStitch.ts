/**
 * useStitch — the stitchGenerate callable.
 *
 * One synchronous call (backend 540s; client timeout 600000ms so the promise
 * doesn't reject before the server can). Decision 2: the PROMISE is the source of
 * truth — resolve → reel, reject → fail-fast. No Firestore subscription in Slice 1.
 */
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebase';
import type { AssetRef } from '../types';

export interface StitchInput {
  clientSlug: string;
  batchId: string;
  assets: AssetRef[];
  trackId: string;
  targetSec: number;
}

export interface StitchResult {
  reelUrl: string;
}

export function useStitch() {
  const generate = httpsCallable<StitchInput, StitchResult>(functions, 'stitchGenerate', {
    timeout: 600000,
  });
  return { generate };
}
