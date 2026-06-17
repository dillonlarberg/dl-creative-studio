/**
 * useStitchSource — load the client's creative library for the picker.
 *
 * Slice 1 sources directly from `creative_insights_data_export` with `media:'all'`
 * (build-step-0 smoke: that's where all Nike/RL video lives, as direct .mp4). This
 * deliberately bypasses `useDatasources`' scan/registry path — no scan, just the
 * sample query (which still needs the Alli session token; token loss surfaces as
 * an error the picker shows + Retry). `runId` guards against a client switch
 * resolving an old request over a new one.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchFeedSample } from '../../../platform/datasources';
import { datasourceToAssets } from '../utils/datasourceToAssets';
import type { PickedAsset } from '../types';

export const SOURCE_MODEL = 'creative_insights_data_export';

interface UseStitchSource {
  assets: PickedAsset[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useStitchSource(clientSlug: string): UseStitchSource {
  const [assets, setAssets] = useState<PickedAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const runId = useRef(0);

  const load = useCallback(async () => {
    const myId = ++runId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchFeedSample({ clientSlug, feed: SOURCE_MODEL, media: 'all' });
      if (runId.current !== myId) return;
      const errEnvelope = (res.metadata as { error?: { recommendation?: string } } | null)?.error;
      if (errEnvelope) {
        setAssets([]);
        setError(errEnvelope.recommendation ?? 'Couldn’t reach your creative library.');
        return;
      }
      const mapped = await datasourceToAssets(res.sampleData, SOURCE_MODEL);
      if (runId.current !== myId) return;
      setAssets(mapped);
    } catch (e) {
      if (runId.current !== myId) return;
      setAssets([]);
      setError((e as Error)?.message ?? 'Couldn’t reach your creative library.');
    } finally {
      if (runId.current === myId) setLoading(false);
    }
  }, [clientSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  return { assets, loading, error, reload: () => void load() };
}
