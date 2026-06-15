import { useCallback, useEffect, useRef, useState } from 'react';
import { creativeService } from '../../services/creative';
import type { AppManifest, StepData } from '../../apps/types';

/**
 * Owns the lifecycle of a single creative record:
 *
 *   1. On mount, look up `localStorage[creative_${slug}_${manifestId}]`
 *      (or use a `resumeId` passed in by the caller, e.g. from `?creative=`).
 *      If a record id is present, hydrate `stepData` from Firestore.
 *   2. On the first `mergeStepData` call, lazily create a Firestore creative
 *      record and stash the new id in localStorage.
 *   3. Subsequent `mergeStepData` calls debounce-persist the merged stepData
 *      back to Firestore.
 *
 * Creative records now live at clients/{slug}/apps/{appId}/creatives/{id}.
 * manifest.id is the appId — it is always in scope here, so all three
 * service calls (create / get / update) can resolve the full path without
 * any additional storage in localStorage beyond the creativeId itself.
 */

export const PERSIST_DEBOUNCE_MS = 300;

const storageKey = (slug: string, manifestId: string) =>
  `wiz_${slug}_${manifestId}`;

interface UsePersistedStepDataOptions<S extends StepData> {
  manifest: AppManifest<S>;
  clientSlug: string;
  resumeId?: string | null;
}

interface UsePersistedStepDataResult<S extends StepData> {
  stepData: S;
  mergeStepData: (patch: Partial<S>) => void;
  creativeId: string | null;
  isLoading: boolean;
  reset: () => void;
  discard: () => Promise<void>;
}

export function usePersistedStepData<S extends StepData>({
  manifest,
  clientSlug,
  resumeId = null,
}: UsePersistedStepDataOptions<S>): UsePersistedStepDataResult<S> {
  const [stepData, setStepData] = useState<S>(() => manifest.initialStepData());
  const [creativeId, setCreativeId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestStepDataRef = useRef<S>(stepData);
  const creatingRef = useRef<Promise<string> | null>(null);
  // Tracks the (clientSlug, manifestId, resumeId) triple we've already
  // hydrated for. The hydration effect must only run once per triple — if
  // it re-fires after the user has merged data in (e.g. when clientSlug
  // transitions from a fallback to the resolved slug from useCurrentClient),
  // the wipe branch (`stored === null`) silently clears stepData and the
  // user loses their selectedWireframe / requirements / brand-overrides.
  const hydratedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    latestStepDataRef.current = stepData;
  }, [stepData]);

  // Hydrate from URL ?creative= or localStorage on mount / when slug changes.
  useEffect(() => {
    const hydrationKey = `${clientSlug}::${manifest.id}::${resumeId ?? ''}`;
    if (hydratedKeyRef.current === hydrationKey) {
      // Already hydrated for this triple — do not re-fire. Re-firing would
      // wipe in-memory stepData via the `stored === null` branch below.
      return;
    }
    const isFirstHydration = hydratedKeyRef.current === null;
    // If this is a *re-hydration* (key changed because, e.g., useCurrentClient
    // resolved and clientSlug transitioned from a fallback to the real slug)
    // AND the user has already merged data in or we already have a creativeId,
    // do not wipe in-memory state. The user's writes win over a slug change.
    const userHasInteracted =
      Object.keys(latestStepDataRef.current as object).length > 0 ||
      creativeId !== null ||
      creatingRef.current !== null;
    if (!isFirstHydration && userHasInteracted) {
      hydratedKeyRef.current = hydrationKey;
      return;
    }
    hydratedKeyRef.current = hydrationKey;

    let cancelled = false;
    setIsLoading(true);

    const hydrate = async () => {
      try {
        const stored =
          resumeId ??
          (typeof window !== 'undefined'
            ? window.localStorage.getItem(storageKey(clientSlug, manifest.id))
            : null);

        if (!stored) {
          if (!cancelled) {
            setStepData(manifest.initialStepData());
            setCreativeId(null);
          }
          return;
        }

        // manifest.id is the appId — resolves the full tenanted path
        const record = await creativeService.getCreative(clientSlug, manifest.id, stored);
        if (cancelled) return;

        if (record && record.status !== 'completed') {
          setCreativeId(record.id);
          setStepData({ ...manifest.initialStepData(), ...(record.stepData as S) });
          if (resumeId && typeof window !== 'undefined') {
            window.localStorage.setItem(storageKey(clientSlug, manifest.id), record.id);
          }
        } else {
          if (typeof window !== 'undefined') {
            window.localStorage.removeItem(storageKey(clientSlug, manifest.id));
          }
          setCreativeId(null);
          setStepData(manifest.initialStepData());
        }
      } catch (err) {
        console.error('usePersistedStepData hydrate failed:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientSlug, manifest.id, resumeId]);

  const ensureCreativeId = useCallback(async (): Promise<string> => {
    if (creativeId) return creativeId;
    if (creatingRef.current) return creatingRef.current;

    const promise = (async () => {
      const id = await creativeService.createCreative(clientSlug, manifest.id);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(storageKey(clientSlug, manifest.id), id);
      }
      setCreativeId(id);
      return id;
    })();

    creatingRef.current = promise;
    try {
      return await promise;
    } finally {
      creatingRef.current = null;
    }
  }, [clientSlug, creativeId, manifest.id]);

  const flushPersist = useCallback(async () => {
    try {
      const id = await ensureCreativeId();
      await creativeService.updateCreative(clientSlug, manifest.id, id, {
        stepData: latestStepDataRef.current,
      });
    } catch (err) {
      console.error('usePersistedStepData persist failed:', err);
    }
  }, [clientSlug, ensureCreativeId, manifest.id]);

  const mergeStepData = useCallback(
    (patch: Partial<S>) => {
      setStepData((prev) => {
        const next = { ...prev, ...patch } as S;
        latestStepDataRef.current = next;
        return next;
      });
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void flushPersist();
      }, PERSIST_DEBOUNCE_MS);
    },
    [flushPersist]
  );

  const reset = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(storageKey(clientSlug, manifest.id));
    }
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setCreativeId(null);
    const initial = manifest.initialStepData();
    latestStepDataRef.current = initial;
    setStepData(initial);
  }, [clientSlug, manifest]);

  const discard = useCallback(async () => {
    // Cancel any pending debounced write
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    // Delete Firestore record if it exists
    const id = creativeId;
    if (id) {
      try {
        await creativeService.deleteCreative(clientSlug, manifest.id, id);
      } catch (err) {
        console.error('usePersistedStepData discard failed:', err);
      }
    }
    // Clear localStorage and reset in-memory state
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(storageKey(clientSlug, manifest.id));
    }
    setCreativeId(null);
    const initial = manifest.initialStepData();
    latestStepDataRef.current = initial;
    setStepData(initial);
  }, [clientSlug, creativeId, manifest]);

  // Flush pending writes on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
        void flushPersist();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { stepData, mergeStepData, creativeId, isLoading, reset, discard };
}
