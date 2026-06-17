/**
 * Firestore + Storage path helpers for the video-stitch app. Docs live under the
 * canonical per-app tree `clients/{slug}/apps/video-stitch/...` (parity with the
 * unified output schema).
 */
export const APP_ID = "video-stitch" as const;

const appRoot = (slug: string) => `clients/${slug}/apps/${APP_ID}`;

export const stitchPaths = {
  batch: (slug: string, batchId: string) => `${appRoot(slug)}/batches/${batchId}`,
  /**
   * The final rendered reel, versioned by `renderTs` (ms epoch) so a re-render
   * writes a fresh object — no overwrite race, no stale download-URL cache.
   */
  finalReel: (slug: string, batchId: string, renderTs: number) =>
    `${appRoot(slug)}/renders/${batchId}/reel-${renderTs}.mp4`,
};
