/**
 * useStitchTracks — fetch the sample music catalog for the picker.
 *
 * Reuses the `cutdownListTracks` callable: stitch's backend resolves trackId via
 * the SAME FirestoreMusicCatalog as cutdown (functions/src/stitch/deps.ts →
 * ../cutdown/engine/firestoreCatalog), so the trackId space is identical — no
 * separate stitchListTracks needed (eng-review open-Q2).
 */
import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebase';

export interface StitchTrack {
  trackId: string;
  title: string;
  bpm?: number;
  mood?: string;
  genre?: string;
  durationSec?: number;
}

interface ListTracksResult {
  tracks: StitchTrack[];
}

export function useStitchTracks(): { tracks: StitchTrack[]; loading: boolean; error: string | null } {
  const [tracks, setTracks] = useState<StitchTrack[]>([]);
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
