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

export function useStorageUrl(storageRef: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() =>
    storageRef ? cache.get(storageRef) ?? null : null,
  );

  useEffect(() => {
    if (!storageRef) {
      setUrl(null);
      return;
    }
    const cached = cache.get(storageRef);
    if (cached) {
      setUrl(cached);
      return;
    }

    let cancelled = false;
    let pending = inflight.get(storageRef);
    if (!pending) {
      pending = getDownloadURL(ref(storage, storageRef)).then((resolved) => {
        cache.set(storageRef, resolved);
        inflight.delete(storageRef);
        return resolved;
      });
      inflight.set(storageRef, pending);
    }

    pending
      .then((resolved) => {
        if (!cancelled) setUrl(resolved);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
        inflight.delete(storageRef);
      });

    return () => {
      cancelled = true;
    };
  }, [storageRef]);

  return url;
}
