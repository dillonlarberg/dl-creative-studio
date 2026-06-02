// src/platform/datasources/types.ts

/**
 * An Alli (Cube.js) model the user can pick as a datasource. Canonical home
 * for this type — `template-builder/types.ts` re-exports it for back-compat.
 */
export interface SelectedFeed {
  name: string;
  dimensions?: Array<string | { name: string }>;
  measures?: Array<string | { name: string }>;
  [k: string]: unknown;
}

/**
 * One persisted datasource in clients/{slug}/datasources/{modelName}.
 * Written only by the scanDatasources Cloud Function. The doc id is modelName.
 * Mirror of the server-side shape in functions/src/datasources/scan.ts
 * (the two packages cannot share a module).
 */
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

/** Scan marker fields stored on the clients/{slug} doc. */
export interface ScanMarker {
  datasourcesScannedAt: number | null; // epoch ms (resolved from Timestamp on read)
  datasourcesScanVersion: number;
  datasourcesFeedCount: number;
}
