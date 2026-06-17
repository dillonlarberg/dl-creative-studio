/**
 * Video-Stitch v1 (Lane B) shared types.
 *
 * The user curates + orders assets; the tool does the mechanics. A `PickedAsset`
 * carries UI-only fields (thumb/name/channel) for the picker + arrange screens;
 * `toAssetRef` strips it down to the wire shape the `stitchGenerate` callable
 * accepts (mirrors functions/src/stitch/engine/types.ts AssetRef).
 */

export type AssetKind = 'image' | 'video';

/** The 5-stage wizard (mirrors v1-prototype.html). */
export type Stage = 'source' | 'arrange' | 'music' | 'run' | 'reel';

/** Wire shape sent to `stitchGenerate` — keep in sync with functions AssetRef. */
export interface AssetRef {
  datasourceId: string;
  assetId: string;
  kind: AssetKind;
  srcUrl: string;
}

/** A picked asset: AssetRef + UI-only display fields. */
export interface PickedAsset extends AssetRef {
  /** Thumbnail to show in the picker/filmstrip (videos reuse srcUrl + a play badge). */
  thumbUrl: string;
  /** Human label for the tile. */
  name: string;
  /** Derived channel (pinterest/meta/snapchat…) for a small tag, when known. */
  channel?: string;
  /** True when the asset is not ~9:16 — surfaces a "letterboxed" badge (Decision 5). */
  offAspect?: boolean;
}

/** Strip a PickedAsset down to the callable wire shape. */
export function toAssetRef(a: PickedAsset): AssetRef {
  return { datasourceId: a.datasourceId, assetId: a.assetId, kind: a.kind, srcUrl: a.srcUrl };
}

export interface StitchConfig {
  trackId: string | null;
  targetSec: number;
}

/** v1 reel bounds (mirrors functions planStitch MAX_ASSETS + the 2-asset floor). */
export const MIN_ASSETS = 2;
export const MAX_ASSETS = 8;
