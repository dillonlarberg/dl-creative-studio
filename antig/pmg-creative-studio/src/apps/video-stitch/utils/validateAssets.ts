/**
 * validateAssets — pre-Stitch gate (Decision 4: all-or-nothing + client pre-validation).
 *
 * The merged stitchGenerate is all-or-nothing: one un-fetchable/un-decodable asset
 * fails the whole reel. And `deps.fetchUrl` does a plain download + ffmpeg-on-file,
 * so HLS (.m3u8) and non-direct URLs break. This catches those BEFORE the user hits
 * Stitch — a synchronous URL-shape gate. Network reachability is enforced by the
 * backend fetch + fail-fast (not unit-testable deterministically here).
 */
import type { AssetRef } from '../types';

const DIRECT_VIDEO = ['.mp4', '.mov', '.webm'];
const IMAGE = ['.jpg', '.jpeg', '.png', '.webp'];

export interface AssetIssue {
  assetId: string;
  reason: string;
}
export interface ValidateResult {
  ok: boolean;
  invalid: AssetIssue[];
}

function has(url: string, exts: string[]): boolean {
  const u = url.toLowerCase();
  return exts.some((e) => u.includes(e));
}

/** True iff this single asset's URL is a fetchable direct file for its kind. */
export function isValidAsset(a: AssetRef): boolean {
  const u = String(a.srcUrl ?? '').toLowerCase();
  if (!u.startsWith('http')) return false;
  if (a.kind === 'video') return has(u, DIRECT_VIDEO) && !u.includes('.m3u8');
  return has(u, IMAGE);
}

export function validateAssets(assets: AssetRef[]): ValidateResult {
  const invalid: AssetIssue[] = [];
  for (const a of assets) {
    if (isValidAsset(a)) continue;
    const u = String(a.srcUrl ?? '').toLowerCase();
    const reason = u.includes('.m3u8')
      ? 'HLS (.m3u8) streams are not supported yet — pick a direct video file.'
      : !u.startsWith('http')
        ? 'Not a fetchable URL.'
        : a.kind === 'video'
          ? 'Not a direct video file (.mp4/.mov/.webm).'
          : 'Not a supported image file (.jpg/.png/.webp).';
    invalid.push({ assetId: a.assetId, reason });
  }
  return { ok: invalid.length === 0, invalid };
}
