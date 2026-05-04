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
 * Mirrors the localStorage key pattern + lazy-create flow that
 * UseCaseWizardPage.tsx (lines 1111, 1124, 1141, 1161, 1175) used in the
 * monolith, so the new wizard inherits the existing UX for free.
 */

export const PERSIST_DEBOUNCE_MS = 300;

const storageKey = (slug: string, manifestId: string) =>
  `creative_${slug}_${manifestId}`;

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

  useEffect(() => {
    latestStepDataRef.current = stepData;
  }, [stepData]);

  // Hydrate from URL ?creative= or localStorage on mount / when slug changes.
  useEffect(() => {
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

        const record = await creativeService.getCreative(stored);
        if (cancelled) return;

        if (record && record.status !== 'completed') {
          setCreativeId(record.id);
          setStepData({ ...manifest.initialStepData(), ...(record.stepData as S) });
          if (resumeId && typeof window !== 'undefined') {
            window.localStorage.setItem(
              storageKey(clientSlug, manifest.id),
              record.id
            );
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
      await creativeService.updateCreative(id, {
        stepData: latestStepDataRef.current,
      });
    } catch (err) {
      console.error('usePersistedStepData persist failed:', err);
    }
  }, [ensureCreativeId]);

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

  return { stepData, mergeStepData, creativeId, isLoading, reset };
}
