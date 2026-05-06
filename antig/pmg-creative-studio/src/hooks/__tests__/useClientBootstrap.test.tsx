import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { clientAssetHouseService } from '../../services/clientAssetHouse';
import { alliService } from '../../services/alli';
import { useClientBootstrap } from '../useClientBootstrap';

vi.mock('../../services/clientAssetHouse', () => ({
  clientAssetHouseService: {
    getAssetHouse: vi.fn(),
    checkBrandStandards: vi.fn(),
  },
}));

vi.mock('../../services/alli', () => ({
  alliService: {
    getCreativeAssets: vi.fn(),
  },
}));

function installFakeLocalStorage(seed?: Record<string, string>) {
  const store = new Map<string, string>(Object.entries(seed ?? {}));
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
  vi.mocked(clientAssetHouseService.getAssetHouse).mockResolvedValue(null);
  vi.mocked(clientAssetHouseService.checkBrandStandards).mockReturnValue(false);
  vi.mocked(alliService.getCreativeAssets).mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
});

describe('useClientBootstrap (Step 0.5 tracer)', () => {
  it('Tracer 1a: resolves client from localStorage and fires both side effects exactly once', async () => {
    installFakeLocalStorage({
      selectedClient: JSON.stringify({ slug: 'ralph_lauren', name: 'Ralph Lauren' }),
    });
    vi.mocked(clientAssetHouseService.checkBrandStandards).mockReturnValue(true);

    const { result } = renderHook(() => useClientBootstrap());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(clientAssetHouseService.getAssetHouse).toHaveBeenCalledTimes(1);
    expect(clientAssetHouseService.getAssetHouse).toHaveBeenCalledWith(
      'ralph_lauren'
    );
    expect(alliService.getCreativeAssets).toHaveBeenCalledTimes(1);
    expect(alliService.getCreativeAssets).toHaveBeenCalledWith('ralph_lauren');

    expect(result.current.client?.slug).toBe('ralph_lauren');
    expect(result.current.isReady).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('Tracer 1b: URL slug wins over a mismatched localStorage client', async () => {
    installFakeLocalStorage({
      selectedClient: JSON.stringify({ slug: 'apple', name: 'Apple' }),
    });

    const { result } = renderHook(() =>
      useClientBootstrap({ urlSlug: 'ralph_lauren' })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(clientAssetHouseService.getAssetHouse).toHaveBeenCalledWith(
      'ralph_lauren'
    );
    expect(alliService.getCreativeAssets).toHaveBeenCalledWith('ralph_lauren');
    expect(result.current.client?.slug).toBe('ralph_lauren');
  });

  it('Tracer 2: getAssetHouse rejection sets error, does not crash, cache warm still fires', async () => {
    installFakeLocalStorage({
      selectedClient: JSON.stringify({ slug: 'ralph_lauren', name: 'Ralph Lauren' }),
    });
    const failure = new Error('firestore down');
    vi.mocked(clientAssetHouseService.getAssetHouse).mockRejectedValue(failure);

    const { result } = renderHook(() => useClientBootstrap());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe(failure);
    expect(result.current.isReady).toBe(false);
    expect(result.current.client?.slug).toBe('ralph_lauren');
    // Critical: cache-warm runs regardless of asset-house outcome.
    expect(alliService.getCreativeAssets).toHaveBeenCalledTimes(1);
  });

  it('Tracer 2b: cache-warm rejection does NOT block asset-house read or set hook error', async () => {
    installFakeLocalStorage({
      selectedClient: JSON.stringify({ slug: 'ralph_lauren', name: 'Ralph Lauren' }),
    });
    vi.mocked(alliService.getCreativeAssets).mockRejectedValue(new Error('alli down'));
    vi.mocked(clientAssetHouseService.checkBrandStandards).mockReturnValue(true);

    const { result } = renderHook(() => useClientBootstrap());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(clientAssetHouseService.getAssetHouse).toHaveBeenCalledTimes(1);
    expect(result.current.isReady).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('Tracer 3: empty localStorage + no urlSlug → client null, no Firestore/Alli reads', async () => {
    installFakeLocalStorage();

    const { result } = renderHook(() => useClientBootstrap());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.client).toBeNull();
    expect(clientAssetHouseService.getAssetHouse).not.toHaveBeenCalled();
    expect(alliService.getCreativeAssets).not.toHaveBeenCalled();
  });

  it('Tracer 4: localStorage with malformed JSON does not throw — treated as empty', async () => {
    installFakeLocalStorage({ selectedClient: '{not valid json' });

    const { result } = renderHook(() => useClientBootstrap());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.client).toBeNull();
    expect(result.current.error).toBeNull();
    expect(clientAssetHouseService.getAssetHouse).not.toHaveBeenCalled();
  });
});
