// src/apps/ad-resizing/hooks/useDatasources.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getScanMarker,
  getDatasources,
  scanDatasources,
  EXPECTED_SCAN_VERSION,
  type DatasourceRecord,
} from '../../../platform/datasources';

interface UseDatasources {
  feeds: DatasourceRecord[];
  loading: boolean; // initial registry read
  scanning: boolean; // a (lazy or manual) scan is running
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Reads the persisted datasource registry for the ad-resizing picker. On the
 * very first visit for a client (no marker) or after a SCAN_VERSION bump
 * (stale marker), it triggers a one-time server scan, then reads. Every later
 * visit is a pure Firestore read — no Alli round-trips in the hot path.
 */
export function useDatasources(clientSlug: string): UseDatasources {
  const [feeds, setFeeds] = useState<DatasourceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runId = useRef(0);

  const load = useCallback(
    async (forceScan: boolean) => {
      const myId = ++runId.current;
      setError(null);
      try {
        const marker = forceScan ? null : await getScanMarker(clientSlug);
        if (runId.current !== myId) return;
        const stale = !marker || marker.datasourcesScanVersion < EXPECTED_SCAN_VERSION;
        if (stale) {
          setScanning(true);
          await scanDatasources(clientSlug);
          if (runId.current !== myId) return;
        }
        const records = await getDatasources(clientSlug, { media: 'image' });
        if (runId.current !== myId) return;
        setFeeds(records);
      } catch (e) {
        if (runId.current !== myId) return;
        setError((e as Error)?.message ?? 'Failed to load data sources');
      } finally {
        // Always clear scanning — even if this run was superseded mid-scan
        // (a client switch) — so the flag can't leak `true` into the new run.
        setScanning(false);
        if (runId.current === myId) setLoading(false);
      }
    },
    [clientSlug],
  );

  useEffect(() => {
    setLoading(true);
    void load(false);
  }, [load]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await load(true);
  }, [load]);

  return { feeds, loading, scanning, error, refresh };
}
