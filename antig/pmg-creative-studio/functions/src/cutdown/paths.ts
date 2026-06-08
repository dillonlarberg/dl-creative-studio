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
  renderClip: (slug: string, batchId: string, angle: string, i: number) =>
    `${appRoot(slug)}/renders/${batchId}/${angle}-clip-${i}.mp4`,
};
