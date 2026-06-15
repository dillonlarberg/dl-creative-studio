import { alliService } from '../../services/alli';
import type { SelectedFeed } from './types';

/**
 * Diagnostic envelope returned from {@link fetchFeedSample} when every
 * progressive query attempt fails. Mirrors the shape the monolith stuffs
 * into `feedMetadata.error` (UseCaseWizardPage.tsx lines 825-867).
 */
export interface FeedSampleErrorInfo {
  clientSlug: string;
  modelName: string;
  error: string;
  category: string;
  proxyStatus: string;
  recommendation: string;
  type: string;
  stack: string;
}

export interface FeedSampleResult {
  sampleData: Array<Record<string, unknown>>;
  metadata: unknown | { error: FeedSampleErrorInfo } | null;
  stressMap?: { shortest: Record<string, unknown>; longest: Record<string, unknown> };
}

// Module-level session caches — survive component remounts, cleared on
// explicit rescan or page reload (which also clears the Alli auth session).
const _dataSourceCache = new Map<string, { feeds: SelectedFeed[]; error?: string }>();
const _feedSampleCache = new Map<string, FeedSampleResult>();

export function getCachedDataSources(clientSlug: string) {
  return _dataSourceCache.get(clientSlug) ?? null;
}

export function getCachedFeedSample(clientSlug: string, feedName: string) {
  return _feedSampleCache.get(`${clientSlug}:${feedName}`) ?? null;
}

export function clearFeedCache(clientSlug?: string) {
  if (clientSlug) {
    _dataSourceCache.delete(clientSlug);
    for (const key of Array.from(_feedSampleCache.keys())) {
      if (key.startsWith(`${clientSlug}:`)) _feedSampleCache.delete(key);
    }
  } else {
    _dataSourceCache.clear();
    _feedSampleCache.clear();
  }
}

/**
 * Port of UseCaseWizardPage.tsx lines 723-871. Runs a progressive-fallback
 * ladder of `executeQuery` calls against an Alli model and returns the
 * sample rows plus inferred metadata. On total failure returns a
 * `metadata.error` object describing the diagnostic envelope.
 *
 * Plain async function — no closure dependencies on monolith state.
 */
export async function fetchFeedSample(opts: {
  clientSlug: string;
  feed: SelectedFeed | string;
}): Promise<FeedSampleResult> {
  const feed = opts.feed;
  const modelName = typeof feed === 'string' ? feed : feed.name;
  const cacheKey = `${opts.clientSlug}:${modelName}`;
  if (_feedSampleCache.has(cacheKey)) return _feedSampleCache.get(cacheKey)!;
  const feedObj = typeof feed === 'string' ? null : feed;

  let dimensions: string[] = [];
  let measures: string[] = [];
  let metadata: unknown = null;

  try {
    if (feedObj) {
      dimensions = (feedObj.dimensions || [])
        .map((d) => (typeof d === 'string' ? d : d.name))
        .filter(Boolean) as string[];
      measures = (feedObj.measures || [])
        .map((m) => (typeof m === 'string' ? m : m.name))
        .filter(Boolean) as string[];
    }

    if (dimensions.length === 0 && measures.length === 0) {
      try {
        const meta = await alliService.getModelMetadata(opts.clientSlug, modelName);
        metadata = meta;
        // Some models return dimensions/measures as objects with .name; some
        // are nested under .schema or .dataSchema; some return plain string
        // arrays. Try every known shape before giving up.
        const extract = (raw: unknown): string[] => {
          if (!Array.isArray(raw)) return [];
          return (raw as Array<unknown>)
            .map((d) => {
              if (typeof d === 'string') return d;
              if (d && typeof d === 'object') {
                const obj = d as Record<string, unknown>;
                return (obj.name ?? obj.id ?? obj.sql ?? '') as string;
              }
              return '';
            })
            .filter((s): s is string => typeof s === 'string' && s.length > 0);
        };
        const m = meta as Record<string, unknown>;
        const schema = (m.schema ?? m.dataSchema ?? {}) as Record<string, unknown>;
        dimensions =
          extract(m.dimensions) ||
          extract(schema.dimensions) ||
          extract(m.columns) ||
          extract(schema.columns) ||
          [];
        measures = extract(m.measures) || extract(schema.measures) || [];
        console.log('[FeedSample] Metadata discovery for', modelName, '→', {
          dimensions: dimensions.length,
          measures: measures.length,
          rawKeys: Object.keys(m),
        });
      } catch (metaErr) {
        console.warn('[FeedSample] Metadata discovery skipped:', metaErr);
      }
    } else if (feedObj) {
      metadata = feedObj;
    }

    const attempts: Array<{ dims: string[]; meas: string[] }> = [];
    if (dimensions.length > 0 || measures.length > 0) {
      attempts.push({ dims: dimensions, meas: measures });
    }
    if (dimensions.length > 0) {
      attempts.push({ dims: dimensions, meas: [] });
    }

    if (modelName === 'creative_insights_data_export') {
      attempts.unshift({
        dims: ['ad_id', 'url', 'creative_type', 'brand_visuals'],
        meas: ['cpm', 'ctr'],
      });
      attempts.push({ dims: ['ad_id', 'url'], meas: [] });
      attempts.push({ dims: ['ad_id'], meas: [] });
    } else if (dimensions.length > 0) {
      attempts.push({ dims: [dimensions[0]], meas: [] });
    }

    // CRITICAL: the upstream Alli API schema (SemanticQueryRequest) requires
    // at least one of `measures` or `dimensions` (anyOf) — see
    // /api-docs/openapi.json. If schema discovery yielded nothing AND we have
    // no model-specific hardcoded fallback, every attempt would be empty and
    // the API would reject every request with a cryptic 400. Fail fast with
    // a clear error instead.
    if (attempts.length === 0) {
      throw new Error(
        `Schema discovery failed for "${modelName}". The Alli model returned no dimensions or measures, and no hardcoded fallback is available for this model. The data-explorer query API (POST /models/${modelName}/execute-query) requires at least one of "measures" or "dimensions" in the request body.`
      );
    }

    let data: Array<Record<string, unknown>> = [];
    let lastError: unknown = null;
    let stressMap:
      | { shortest: Record<string, unknown>; longest: Record<string, unknown> }
      | undefined;

    for (const attempt of attempts) {
      // Skip attempts that would violate the upstream schema's anyOf
      // (measures-or-dimensions required). They'd 400 with the cryptic
      // "request.body should match some schema in anyOf" message.
      if (attempt.dims.length === 0 && attempt.meas.length === 0) continue;

      // Build the body conditionally — only include keys we have. Empty
      // arrays still satisfy `required` so we'd pass schema, but Cube's
      // semantics treat presence-with-empty-value differently than absence,
      // and the prod monolith always omits empty keys here.
      const body: Record<string, unknown> = {};
      if (attempt.dims.length > 0) body.dimensions = attempt.dims;
      if (attempt.meas.length > 0) body.measures = attempt.meas;

      try {
        console.log('[FeedSample] Attempting query for', modelName, body);
        const result = await alliService.executeQuery(
          opts.clientSlug,
          modelName,
          body as { dimensions?: string[]; measures?: string[]; limit?: number }
        );
        data =
          result.results ||
          result.rows ||
          result.data ||
          (Array.isArray(result) ? result : []);
        if (data.length > 0 || (result.results && result.results.length === 0)) {
          if (data.length > 0) {
            const shortest: Record<string, unknown> = {};
            const longest: Record<string, unknown> = {};
            const allCols = Object.keys(data[0] || {});
            allCols.forEach((col) => {
              let minIdx = 0;
              let maxIdx = 0;
              data.forEach((row, idx) => {
                const val = String(row[col] ?? '');
                if (val.length < String(data[minIdx][col] ?? '').length) minIdx = idx;
                if (val.length > String(data[maxIdx][col] ?? '').length) maxIdx = idx;
              });
              shortest[col] = data[minIdx][col];
              longest[col] = data[maxIdx][col];
            });
            stressMap = { shortest, longest };
          }
          break;
        }
      } catch (err) {
        console.warn('[FeedSample] Attempt failed:', err);
        lastError = err;
      }
    }

    if (data.length === 0 && lastError) {
      throw lastError;
    }

    let processedData = data;
    if (modelName === 'creative_insights_data_export') {
      processedData = data.filter((row) => {
        const ct =
          row.creative_type ||
          row.creative_insights_data_export__creative_type;
        return String(ct ?? '').toLowerCase() !== 'video';
      });
    }

    const result: FeedSampleResult = { sampleData: processedData, metadata, stressMap };
    _feedSampleCache.set(cacheKey, result);
    return result;
  } catch (err) {
    const errorMessage = (err as Error)?.message || String(err);
    const isFailedToFetch = errorMessage.toLowerCase().includes('failed to fetch');

    let errorCategory = 'API Error';
    let recommendation =
      'The Alli API returned an error for this specific query. Try a different source or retry with common fields.';
    if (isFailedToFetch) {
      errorCategory = 'Proxy Connectivity';
      recommendation =
        'Could not reach the PMG Proxy server. Check VPN and internet connection. If you are on PMG-Corp, ensure you have proxy access.';
    } else if (errorMessage.includes('403')) {
      errorCategory = 'Unauthorized';
      recommendation =
        "You do not have permission to query this model. Ensure your Alli account has access to this client's data.";
    } else if (errorMessage.toLowerCase().includes('timeout')) {
      errorCategory = 'Network Timeout';
      recommendation =
        'The query took too long to execute. This model might be too large for a live preview.';
    }

    let proxyStatus = 'Unknown';
    try {
      const proxyBase = 'https://us-central1-automated-creative-e10d7.cloudfunctions.net';
      const ping = await fetch(`${proxyBase}/helloWorld`, { mode: 'no-cors' });
      proxyStatus = ping.type === 'opaque' || ping.ok ? 'Reachable' : 'Unreachable';
    } catch {
      proxyStatus = 'Unreachable';
    }

    const debugInfo: FeedSampleErrorInfo = {
      clientSlug: opts.clientSlug,
      modelName,
      error: errorMessage,
      category: errorCategory,
      proxyStatus,
      recommendation,
      type: (err as Error)?.name || 'Error',
      stack: (err as Error)?.stack || 'No stack trace available',
    };
    return { sampleData: [], metadata: { error: debugInfo } };
  }
}

/**
 * Port of UseCaseWizardPage.tsx lines 675-710. Fetches data sources for
 * the client and applies the "feed" name/description filter, falling back
 * to all models if no feed-named ones exist.
 */
export async function fetchDataSources(opts: {
  clientSlug: string;
}): Promise<{ feeds: SelectedFeed[]; error?: string }> {
  if (!opts.clientSlug) {
    return { feeds: [], error: 'No client slug' };
  }
  if (_dataSourceCache.has(opts.clientSlug)) return _dataSourceCache.get(opts.clientSlug)!;
  try {
    const models = (await alliService.getDataSources(opts.clientSlug)) as Array<
      Record<string, unknown>
    >;

    let feeds = models.filter((m) => {
      const searchStr = `${m.name || ''} ${m.description || ''} ${m.title || ''}`
        .toString()
        .toLowerCase();
      return searchStr.includes('feed') || m.name === 'creative_insights_data_export';
    });

    if (feeds.length === 0) {
      return {
        feeds: [],
        error:
          'No models found for this client. Check permissions or try another brand.',
      };
    }

    const result = { feeds: feeds as SelectedFeed[] };
    _dataSourceCache.set(opts.clientSlug, result);
    return result;
  } catch (err) {
    return {
      feeds: [],
      error: (err as Error)?.message || String(err),
    };
  }
}
