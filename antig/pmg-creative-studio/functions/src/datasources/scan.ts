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
 */
export const SCAN_VERSION = 1;

const SAMPLE_LIMIT = 25;

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

/** Fetch up to SAMPLE_LIMIT rows for a model, trying discovered dims/measures. */
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
  const attempts: Array<{ dimensions?: string[]; measures?: string[]; limit: number }> = [];
  if (dims.length || meas.length) attempts.push({ dimensions: dims, measures: meas, limit: SAMPLE_LIMIT });
  if (dims.length) attempts.push({ dimensions: dims, limit: SAMPLE_LIMIT });
  if (dims.length) attempts.push({ dimensions: [dims[0]], limit: SAMPLE_LIMIT });
  for (const body of attempts) {
    try {
      const rows = await executeQuery(clientSlug, modelName, body, token);
      if (rows.length) return rows;
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
