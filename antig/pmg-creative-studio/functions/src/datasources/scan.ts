// functions/src/datasources/scan.ts
import { logger } from 'firebase-functions';
import pLimit from 'p-limit';
import { listModels, getModelMetadata, executeQuery } from './alliClient';
import { detectImageColumns } from './detect';

// How many models to sample concurrently. Bounded so we don't hammer the
// (flaky, 500-prone) Alli metadata/query endpoints. Mirrors the old client
// BATCH=3 spirit with a little more parallelism for a one-time server scan.
const SAMPLE_CONCURRENCY = 5;

/**
 * Bump when detection logic changes so existing clients re-scan. Kept in sync
 * with EXPECTED_SCAN_VERSION in src/platform/datasources/scan.ts (client).
 * v2: faithful port (smart-proxy CSV fallback + creative_insights ladder) —
 * invalidates the v1 markers written by the broken scan that found no feeds.
 */
export const SCAN_VERSION = 2;

export interface DatasourceRecord {
  modelName: string;
  label: string | null;
  type: string | null;
  dimensions: string[];
  measures: string[];
  hasImage: boolean;
  hasVideo: boolean;
  imageColumns: string[];
  videoColumns: string[];
  imageCount: number;
  scanVersion: number;
}

function names(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((d) => (typeof d === 'string' ? d : d && typeof d === 'object' ? String((d as Record<string, unknown>).name ?? '') : ''))
    .filter((s) => s.length > 0);
}

/**
 * Sample rows for a model, trying a progressive ladder of dim/measure combos.
 * Faithful port of the client's fetchFeedSample (src/platform/datasources/
 * fetch.ts) — including the `creative_insights_data_export` hardcoded fallback
 * (its schema isn't discoverable, but those exact fields return image URLs) and
 * the video-row filter (so a mixed url column still reads as an image column).
 * The CSV fallback lives in smartExecuteQueryProxy (see alliClient.executeQuery).
 */
async function sampleRows(
  clientSlug: string,
  model: Record<string, unknown>,
  token: string,
): Promise<Array<Record<string, unknown>>> {
  const modelName = String(model.name);
  let dims = names(model.dimensions);
  let meas = names(model.measures);
  if (dims.length === 0 && meas.length === 0) {
    try {
      const meta = await getModelMetadata(clientSlug, modelName, token);
      dims = names(meta.dimensions);
      meas = names(meta.measures);
    } catch (e) {
      logger.warn('datasource-scan: metadata failed', { modelName, e: String(e) });
    }
  }

  const attempts: Array<{ dimensions: string[]; measures: string[] }> = [];
  if (dims.length || meas.length) attempts.push({ dimensions: dims, measures: meas });
  if (dims.length) attempts.push({ dimensions: dims, measures: [] });
  if (modelName === 'creative_insights_data_export') {
    attempts.unshift({ dimensions: ['ad_id', 'url', 'creative_type', 'brand_visuals'], measures: ['cpm', 'ctr'] });
    attempts.push({ dimensions: ['ad_id', 'url'], measures: [] });
    attempts.push({ dimensions: ['ad_id'], measures: [] });
  } else if (dims.length) {
    attempts.push({ dimensions: [dims[0]], measures: [] });
  }

  for (const attempt of attempts) {
    if (attempt.dimensions.length === 0 && attempt.measures.length === 0) continue;
    const body: { dimensions?: string[]; measures?: string[] } = {};
    if (attempt.dimensions.length) body.dimensions = attempt.dimensions;
    if (attempt.measures.length) body.measures = attempt.measures;
    try {
      const rows = await executeQuery(clientSlug, modelName, body, token);
      if (rows.length === 0) continue;
      if (modelName === 'creative_insights_data_export') {
        return rows.filter((r) => {
          const ct = r.creative_type ?? r.creative_insights_data_export__creative_type;
          return String(ct ?? '').toLowerCase() !== 'video';
        });
      }
      return rows;
    } catch (e) {
      logger.warn('datasource-scan: query attempt failed', { modelName, e: String(e) });
    }
  }
  return [];
}

/**
 * A model worth SAMPLING for media columns. Mirrors the old client-side
 * fetchDataSources filter. Critical for big warehouses (e.g. apple_services has
 * 100+ models, mostly non-feed tables whose metadata endpoint 500s): we still
 * RECORD every model for the superset list, but only sample candidates — else
 * the scan walks 100+ models sequentially and never finishes.
 */
function isFeedCandidate(model: Record<string, unknown>): boolean {
  const name = String(model.name ?? '');
  const search = `${name} ${model.description ?? ''} ${model.label ?? ''}`.toLowerCase();
  return search.includes('feed') || name === 'creative_insights_data_export';
}

export async function scanClientDatasources(clientSlug: string, token: string): Promise<DatasourceRecord[]> {
  const models = (await listModels(clientSlug, token)).filter((m) => m?.name);
  const limit = pLimit(SAMPLE_CONCURRENCY);

  return Promise.all(
    models.map((model) =>
      limit(async (): Promise<DatasourceRecord> => {
        // Only feed candidates pay the sample+detect cost (network). Every
        // other model is still recorded (superset list) with no media.
        const rows = isFeedCandidate(model) ? await sampleRows(clientSlug, model, token) : [];
        const imageColumns = detectImageColumns(rows);
        return {
          modelName: String(model.name),
          label: model.label != null ? String(model.label) : null,
          type: model.type != null ? String(model.type) : null,
          dimensions: names(model.dimensions),
          measures: names(model.measures),
          hasImage: imageColumns.length > 0,
          hasVideo: false, // PR 4
          imageColumns,
          videoColumns: [], // PR 4
          // Count of sampled rows whose primary image column holds a URL —
          // drives the picker card's "N images" label.
          imageCount: rows.filter((r) => imageColumns[0] && isHttp(r[imageColumns[0]])).length,
          scanVersion: SCAN_VERSION,
        };
      }),
    ),
  );
}

function isHttp(v: unknown): boolean {
  return String(v ?? '').startsWith('http');
}
