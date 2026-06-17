/**
 * aspect — 9:16 proximity for the picker's "letterboxed" badge (Decision 5 + D1).
 *
 * Slice 1 scale-normalizes by PADDING (letterbox), never cropping. An asset far
 * from 9:16 gets noticeable black bars, so the picker badges it. Dimensions come
 * from the tile's media element (img.naturalWidth / video.videoWidth — D1); when
 * unknown (still loading / load failed) we don't badge.
 *
 * UX note: we badge in place — NOT live-reorder tiles as metadata loads (that
 * jumps the grid). The soft-guide is the badge + a header hint, not a re-sort.
 */

/** Portrait 9:16 ≈ 0.5625 (width / height). */
export const TARGET_AR = 9 / 16;

export function aspectRatioOf(w?: number, h?: number): number | null {
  if (!w || !h || h <= 0) return null;
  return w / h;
}

/** True when far enough from 9:16 to letterbox noticeably. Unknown dims → false. */
export function isOffAspect(w?: number, h?: number, tol = 0.12): boolean {
  const ar = aspectRatioOf(w, h);
  if (ar === null) return false;
  return Math.abs(ar - TARGET_AR) > tol;
}
