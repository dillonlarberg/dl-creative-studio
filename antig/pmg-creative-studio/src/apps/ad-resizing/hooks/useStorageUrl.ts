import { useEffect, useState } from 'react';
import { getDownloadURL, ref } from 'firebase/storage';
import { storage } from '../../../firebase';

/**
 * Resolve a Firebase Storage `gs://`-style path (or bare prefix) to a signed
 * HTTPS download URL using the current user's credentials (plan Q6 / U.4).
 *
 * Returns `null` while resolving and on error so callers can render a
 * skeleton. Memoised per ref string — repeat renders for the same path do
 * NOT trigger duplicate `getDownloadURL` calls.
 */
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

/**
 * `version` busts the cache when the underlying file is overwritten at the
 * same storage path (e.g. re-crop). Pass `completedAt.toMillis()` from the
 * output doc; the cache key becomes `storageRef|version` so a re-crop's new
 * completedAt forces a fresh getDownloadURL fetch.
 */
export function useStorageUrl(
  storageRef: string | null | undefined,
  version?: number | string | null,
): string | null {
  const cacheKey = storageRef ? `${storageRef}|${version ?? ''}` : null;
  const [url, setUrl] = useState<string | null>(() =>
    cacheKey ? cache.get(cacheKey) ?? null : null,
  );

  useEffect(() => {
    if (!storageRef || !cacheKey) {
      setUrl(null);
      return;
    }
    const cached = cache.get(cacheKey);
    if (cached) {
      setUrl(cached);
      return;
    }

    let cancelled = false;
    let pending = inflight.get(cacheKey);
    if (!pending) {
      pending = getDownloadURL(ref(storage, storageRef)).then((resolved) => {
        cache.set(cacheKey, resolved);
        inflight.delete(cacheKey);
        return resolved;
      });
      inflight.set(cacheKey, pending);
    }

    pending
      .then((resolved) => {
        if (!cancelled) setUrl(resolved);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
        inflight.delete(cacheKey);
      });

    return () => {
      cancelled = true;
    };
  }, [storageRef, cacheKey]);

  return url;
}
