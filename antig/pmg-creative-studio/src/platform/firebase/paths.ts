/**
 * Single source of truth for Firestore and Storage path strings.
 *
 * Every Firestore read/write and every Storage upload/download must go
 * through these helpers. Hand-built path strings elsewhere in the codebase
 * are a regression — the typed signatures here enforce that a clientSlug
 * and (where relevant) an appId are always supplied.
 *
 * Schema:
 *   clients/{slug}                                  ← brand profile fields live on this doc
 *     /assets/{assetId}                             ← brand assets
 *     /datasources/{modelName}                      ← feed metadata (written by scanDatasources CF)
 *     /templateLibrary/{templateId}                 ← published templates, shared across all apps
 *       /history/{entryId}                          ← immutable version snapshots
 *     /apps/{appId}                                 ← per-app subtree
 *       /creatives/{creativeId}                     ← wizard WIP sessions (auto-saved step data)
 *       /batches/{batchId}                          ← batch generation jobs
 *       /outputs/{outputId}                         ← generated ad outputs
 *
 * Storage mirrors the same hierarchy:
 *   clients/{slug}/apps/{appId}/<arbitrary suffix>
 */

export type AppId =
  | 'video-cutdown'
  | 'template-builder'
  | 'video-stitch'
  | 'ad-resizing'
  | 'edit-image';

const VALID_APP_IDS: readonly AppId[] = [
  'video-cutdown',
  'template-builder',
  'video-stitch',
  'ad-resizing',
  'edit-image',
];

export function isAppId(value: unknown): value is AppId {
  return typeof value === 'string' && (VALID_APP_IDS as readonly string[]).includes(value);
}

export type ClientSlug = string;
export type CreativeId = string;
export type AssetId = string;

const root = (slug: ClientSlug) => `clients/${slug}`;

export const paths = {
  client: (slug: ClientSlug) => root(slug),

  assets: (slug: ClientSlug) => `${root(slug)}/assets`,
  asset: (slug: ClientSlug, id: AssetId) => `${root(slug)}/assets/${id}`,

  app: (slug: ClientSlug, appId: AppId) => `${root(slug)}/apps/${appId}`,

  creatives: (slug: ClientSlug, appId: AppId) => `${root(slug)}/apps/${appId}/creatives`,
  creative: (slug: ClientSlug, appId: AppId, id: CreativeId) =>
    `${root(slug)}/apps/${appId}/creatives/${id}`,

  batches: (slug: ClientSlug, appId: AppId) => `${root(slug)}/apps/${appId}/batches`,
  batch: (slug: ClientSlug, appId: AppId, id: string) => `${root(slug)}/apps/${appId}/batches/${id}`,

  // Unified per-app outputs (collectionGroup-queryable). Every modular app
  // writes generated artifacts here. See OutputDoc schema in src/types/outputs.ts
  // and the writeOutput helper in src/services/outputs.ts.
  outputs: (slug: ClientSlug, appId: AppId) => `${root(slug)}/apps/${appId}/outputs`,
  output: (slug: ClientSlug, appId: AppId, outputId: string) =>
    `${root(slug)}/apps/${appId}/outputs/${outputId}`,

  // App-agnostic per-client datasource registry, written only by the
  // scanDatasources Cloud Function. Queried by every app (e.g. ad-resizing
  // filters where hasImage == true). Sits alongside `assets`.
  datasources: (slug: ClientSlug) => `${root(slug)}/datasources`,
  datasource: (slug: ClientSlug, modelName: string) =>
    `${root(slug)}/datasources/${modelName}`,

  templateLibrary: (slug: ClientSlug): string =>
    `${root(slug)}/templateLibrary`,

  templateLibraryDoc: (slug: ClientSlug, templateId: string): string =>
    `${root(slug)}/templateLibrary/${templateId}`,

  templateLibraryHistory: (slug: ClientSlug, templateId: string): string =>
    `${root(slug)}/templateLibrary/${templateId}/history`,

  storage: {
    client: (slug: ClientSlug) => root(slug),
    app: (slug: ClientSlug, appId: AppId, suffix: string) =>
      `${root(slug)}/apps/${appId}/${suffix.replace(/^\/+/, '')}`,
  },
} as const;

export type Paths = typeof paths;
