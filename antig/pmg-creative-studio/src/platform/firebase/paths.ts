/**
 * Single source of truth for Firestore and Storage path strings.
 *
 * Every Firestore read/write and every Storage upload/download must go
 * through these helpers. Hand-built path strings elsewhere in the codebase
 * are a regression — the typed signatures here enforce that a clientSlug
 * and (where relevant) an appId are always supplied.
 *
 * Schema:
 *   clients/{slug}                                  ← profile metadata
 *     /assets/{assetId}                             ← brand assets
 *     /apps/{appId}                                 ← per-app subtree
 *       /creatives/{creativeId}                     ← drafts, completed runs
 *       /templates/{templateId}                     ← template-builder app
 *       /batches/{batchId}                          ← feed-processing app
 *
 * Storage mirrors the same hierarchy:
 *   clients/{slug}/apps/{appId}/<arbitrary suffix>
 */

export type AppId =
  | 'resize-image'
  | 'edit-image'
  | 'new-image'
  | 'edit-video'
  | 'new-video'
  | 'video-cutdown'
  | 'template-builder'
  | 'feed-processing';

export type ClientSlug = string;
export type CreativeId = string;
export type AssetId = string;

const root = (slug: ClientSlug) => `clients/${slug}`;

export const paths = {
  client: (slug: ClientSlug) => root(slug),
  profile: (slug: ClientSlug) => `${root(slug)}/profile`,

  assets: (slug: ClientSlug) => `${root(slug)}/assets`,
  asset: (slug: ClientSlug, id: AssetId) => `${root(slug)}/assets/${id}`,

  app: (slug: ClientSlug, appId: AppId) => `${root(slug)}/apps/${appId}`,
  creatives: (slug: ClientSlug, appId: AppId) => `${root(slug)}/apps/${appId}/creatives`,
  creative: (slug: ClientSlug, appId: AppId, id: CreativeId) =>
    `${root(slug)}/apps/${appId}/creatives/${id}`,

  storage: {
    client: (slug: ClientSlug) => root(slug),
    app: (slug: ClientSlug, appId: AppId, suffix: string) =>
      `${root(slug)}/apps/${appId}/${suffix.replace(/^\/+/, '')}`,
  },
} as const;

export type Paths = typeof paths;
