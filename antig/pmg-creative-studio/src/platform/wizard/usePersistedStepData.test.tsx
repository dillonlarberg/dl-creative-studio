import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup, waitFor } from '@testing-library/react';
import { usePersistedStepData } from './usePersistedStepData';
import { creativeService } from '../../services/creative';
import type { AppManifest } from '../../apps/types';

vi.mock('../../services/creative', () => ({
  creativeService: {
    createCreative: vi.fn(async () => 'creative-new'),
    updateCreative: vi.fn(async () => undefined),
    getCreative: vi.fn(async () => null),
  },
}));

interface FakeData {
  selectedWireframe?: string;
  foo?: number;
}

const manifest: AppManifest<FakeData> = {
  id: 'ad-resizing',
  basePath: 'fake',
  title: 'Fake App',
  steps: [],
  initialStepData: () => ({}),
};

function installFakeLocalStorage() {
  const store = new Map<string, string>();
  const ls: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => {
      store.delete(k);
    },
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
  };
  Object.defineProperty(window, 'localStorage', {
    value: ls,
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  installFakeLocalStorage();
  vi.mocked(creativeService.createCreative).mockResolvedValue('creative-new');
  vi.mocked(creativeService.updateCreative).mockResolvedValue(undefined);
  vi.mocked(creativeService.getCreative).mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
});

describe('usePersistedStepData', () => {
  /**
   * Regression test for the wireframe-loss bug: when a step writes to stepData
   * via mergeStepData, the hydration effect must NOT re-fire and wipe that
   * write. In the production app, clientSlug starts as a fallback ('test-client')
   * while useCurrentClient resolves, then transitions to the real slug. If the
   * hydration effect's wipe branch (stored === null) re-runs after a user has
   * already merged data in, the in-memory selectedWireframe is lost — which is
   * what caused MappingStep to fall back to the Generative Asset Constructor.
   */
  it('preserves merged stepData across a clientSlug change after the user has interacted', async () => {
    const { result, rerender } = renderHook(
      ({ clientSlug }) =>
        usePersistedStepData<FakeData>({ manifest, clientSlug, resumeId: null }),
      { initialProps: { clientSlug: 'test-client' } }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Simulate ContextStep: user picks a wireframe.
    act(() => {
      result.current.mergeStepData({ selectedWireframe: 'square_v1' });
    });

    expect(result.current.stepData.selectedWireframe).toBe('square_v1');

    // Simulate useCurrentClient resolving: clientSlug transitions to the real
    // slug. The hydration effect re-runs with the new slug. Without the
    // hasHydratedRef guard, the wipe branch fires and selectedWireframe is lost.
    rerender({ clientSlug: 'acme' });

    // Give the hydration effect a tick to run.
    await waitFor(() => {
      expect(result.current.stepData.selectedWireframe).toBe('square_v1');
    });
  });

  it('does not wipe in-memory stepData on duplicate effect runs (StrictMode-like)', async () => {
    const { result, rerender } = renderHook(
      ({ slug }) =>
        usePersistedStepData<FakeData>({
          manifest,
          clientSlug: slug,
          resumeId: null,
        }),
      { initialProps: { slug: 'acme' } }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.mergeStepData({ selectedWireframe: 'square_v1', foo: 7 });
    });

    expect(result.current.stepData).toEqual({
      selectedWireframe: 'square_v1',
      foo: 7,
    });

    // Force a rerender with same props — no hydration triggers should re-run
    // the wipe branch and clear our merged data.
    rerender({ slug: 'acme' });
    await waitFor(() => {
      expect(result.current.stepData).toEqual({
        selectedWireframe: 'square_v1',
        foo: 7,
      });
    });
  });
});
