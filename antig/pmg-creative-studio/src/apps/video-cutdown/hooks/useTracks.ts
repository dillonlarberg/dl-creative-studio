import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebase';
import type { TrackView } from '../types';

interface ListTracksResult {
  tracks: TrackView[];
}

/**
 * Fetches the sample music library once on mount via `cutdownListTracks`.
 * Returns the tracks plus loading/error state for the music-picker stage.
 */
export function useTracks(): { tracks: TrackView[]; loading: boolean; error: string | null } {
  const [tracks, setTracks] = useState<TrackView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const listTracks = httpsCallable<unknown, ListTracksResult>(functions, 'cutdownListTracks');
    listTracks()
      .then((r) => {
        if (cancelled) return;
        setTracks(r.data?.tracks ?? []);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { tracks, loading, error };
}
