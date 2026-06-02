// functions/src/datasources/scan.ts
import { logger } from 'firebase-functions';
import { listModels, getModelMetadata, executeQuery } from './alliClient';
import { detectImageColumns } from './detect';

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
  sampleCount: number;
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

export async function scanClientDatasources(clientSlug: string, token: string): Promise<DatasourceRecord[]> {
  const models = await listModels(clientSlug, token);
  const records: DatasourceRecord[] = [];
  for (const model of models) {
    if (!model?.name) continue;
    const rows = await sampleRows(clientSlug, model, token);
    const imageColumns = detectImageColumns(rows);
    records.push({
      modelName: String(model.name),
      label: model.label != null ? String(model.label) : null,
      type: model.type != null ? String(model.type) : null,
      dimensions: names(model.dimensions),
      measures: names(model.measures),
      hasImage: imageColumns.length > 0,
      hasVideo: false, // PR 4
      imageColumns,
      videoColumns: [], // PR 4
      sampleCount: rows.filter((r) => imageColumns[0] && isHttp(r[imageColumns[0]])).length,
      scanVersion: SCAN_VERSION,
    });
  }
  return records;
}

function isHttp(v: unknown): boolean {
  return String(v ?? '').startsWith('http');
}
