/**
 * datasourceToAssets — map creative_insights_data_export rows → PickedAsset[].
 *
 * Build-step-0 smoke (2026-06-17) confirmed all Nike/RL video lives in this one
 * model as direct .mp4, alongside image rows, with a `creative_type` discriminator
 * and a `url` column. So the picker reads ONE model and sets kind from creative_type
 * — no image-column/video-column feed join (cf. ad-resizing feedToCreatives).
 *
 * Alli omits null columns per row and sometimes prefixes keys with the model name
 * (`creative_insights_data_export__url`), so every field read tries both forms.
 *
 * `offAspect` is NOT set here — per-asset aspect needs client-side probing (Image
 * onload / video metadata); the picker populates it when known (Decision 5).
 */
import type { AssetKind, PickedAsset } from '../types';
import { sha256Prefix } from './sha256';

const MODEL = 'creative_insights_data_export';

function col(row: Record<string, unknown>, name: string): unknown {
  return row[name] ?? row[`${MODEL}__${name}`];
}

/** pinterest from .../nike_na/pinterest/video/xyz.mp4 (best-effort, for a tag). */
function channelFromUrl(url: string): string | undefined {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    // [slug, channel, type, file] — channel is the 2nd segment when present.
    return parts.length >= 3 ? parts[1] : undefined;
  } catch {
    return undefined;
  }
}

function deriveName(row: Record<string, unknown>, channel: string | undefined, kind: AssetKind): string {
  for (const key of ['name', 'ad_name', 'creative_name', 'ad_id']) {
    const v = col(row, key);
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 60);
  }
  return [channel, kind].filter(Boolean).join(' · ') || 'Creative';
}

export async function datasourceToAssets(
  rows: Array<Record<string, unknown>>,
  datasourceId: string = MODEL,
): Promise<PickedAsset[]> {
  const withUrl = rows.filter((r) => String(col(r, 'url') ?? '').startsWith('http'));
  return Promise.all(
    withUrl.map(async (row) => {
      const srcUrl = String(col(row, 'url'));
      const ct = String(col(row, 'creative_type') ?? '').toLowerCase();
      const kind: AssetKind = ct === 'video' ? 'video' : 'image';
      const channel = channelFromUrl(srcUrl);
      return {
        datasourceId,
        assetId: await sha256Prefix(srcUrl),
        kind,
        srcUrl,
        thumbUrl: srcUrl,
        name: deriveName(row, channel, kind),
        channel,
      };
    }),
  );
}
