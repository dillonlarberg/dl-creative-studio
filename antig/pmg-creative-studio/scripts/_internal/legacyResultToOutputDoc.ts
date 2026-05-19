/**
 * Pure transformer used by the backfill-outputs-from-results script.
 *
 * Lives in its own file (no firebase-admin import) so the test can run in
 * standard preflight without standing up the admin SDK. The walker script
 * imports both this transformer and firebase-admin.
 */

interface LegacyResultData {
  url?: string;
  feedRowIndex?: number;
  metadata?: Record<string, unknown>;
  createdAt?: unknown;
  [key: string]: unknown;
}

export interface BackfilledOutputDoc {
  outputId: string;
  batchId: string;
  clientSlug: string;
  appId: string;
  createdBy: 'legacy-backfill';
  createdAt: unknown;
  status: 'complete';
  kind: 'image';
  format: { width: number; height: number; label: string };
  previewUrl?: string;
}

/**
 * Map a legacy `results/{id}` doc to a canonical OutputDoc shape.
 *
 * Defaults:
 *  - format dims → 1080×1080 if metadata is missing them. Matches addResult's
 *    default so backfilled docs look like newly dual-written docs.
 *  - createdAt → falls back to the caller-supplied sentinel (typically
 *    FieldValue.serverTimestamp() at script runtime).
 *  - previewUrl → only set if the legacy doc had a non-empty URL string.
 *  - createdBy → ALWAYS `legacy-backfill`. Historical author is unknown
 *    and we refuse to guess; the future "your generations" view will
 *    surface these under a synthetic creator filter.
 */
export function legacyResultToOutputDoc(args: {
  resultId: string;
  batchId: string;
  clientSlug: string;
  appId: string;
  legacy: LegacyResultData;
  fallbackCreatedAt: unknown;
}): BackfilledOutputDoc {
  const meta = (args.legacy.metadata ?? {}) as Record<string, unknown>;
  const num = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
  const str = (v: unknown, fallback: string) =>
    typeof v === 'string' && v.length > 0 ? v : fallback;

  const width = num(meta.width, 1080);
  const height = num(meta.height, 1080);
  const label = str(meta.label, `${width}x${height}`);

  const url =
    typeof args.legacy.url === 'string' && args.legacy.url.length > 0
      ? args.legacy.url
      : undefined;

  const doc: BackfilledOutputDoc = {
    outputId: args.resultId,
    batchId: args.batchId,
    clientSlug: args.clientSlug,
    appId: args.appId,
    createdBy: 'legacy-backfill',
    createdAt: args.legacy.createdAt ?? args.fallbackCreatedAt,
    status: 'complete',
    kind: 'image',
    format: { width, height, label },
  };
  if (url) doc.previewUrl = url;
  return doc;
}
