/**
 * Firestore + Cloud Storage path helpers for the cutdown (video-stitch) app.
 *
 * All docs live under the canonical per-app tree
 * `clients/{slug}/apps/video-cutdown/...` (parity with the unified output
 * schema). Storage object paths for thumbs/render clips are keyed by batch +
 * angle so onSnapshot can stream them as they land.
 */
export const APP_ID = "video-cutdown" as const;

const appRoot = (slug: string) => `clients/${slug}/apps/${APP_ID}`;

export const cutdownPaths = {
  batch: (slug: string, batchId: string) => `${appRoot(slug)}/batches/${batchId}`,
  versions: (slug: string, batchId: string) => `${appRoot(slug)}/batches/${batchId}/versions`,
  version: (slug: string, batchId: string, angle: string) =>
    `${appRoot(slug)}/batches/${batchId}/versions/${angle}`,
  thumb: (slug: string, batchId: string, angle: string, i: number) =>
    `${appRoot(slug)}/batches/${batchId}/thumbs/${angle}-${i}.jpg`,
  /**
   * The final rendered reel. Versioned by `renderTs` (ms epoch) so a re-render of
   * the same angle writes a fresh object — no overwrite race, no stale browser
   * cache on the previous download URL. The OutputDoc points to the latest.
   */
  finalReel: (slug: string, batchId: string, angle: string, renderTs: number) =>
    `${appRoot(slug)}/renders/${batchId}/${angle}-${renderTs}.mp4`,
};
