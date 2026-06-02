import { describe, it, expect, vi, beforeEach } from 'vitest';

const getDocs = vi.fn();
const getDoc = vi.fn();
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(),
  collection: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  getDocs: (...a: unknown[]) => getDocs(...a),
  getDoc: (...a: unknown[]) => getDoc(...a),
}));
vi.mock('../../firebase', () => ({ db: {} }));

import { getDatasources, getScanMarker } from './registry';

beforeEach(() => {
  getDocs.mockReset();
  getDoc.mockReset();
});

describe('getDatasources', () => {
  it('returns image records from the registry', async () => {
    getDocs.mockResolvedValue({
      docs: [
        { data: () => ({ modelName: 'product_feed', hasImage: true, imageColumns: ['hero'], imageCount: 3 }) },
      ],
    });
    const feeds = await getDatasources('nike_na', { media: 'image' });
    expect(feeds).toHaveLength(1);
    expect(feeds[0].modelName).toBe('product_feed');
  });

  it('sorts records by modelName', async () => {
    getDocs.mockResolvedValue({
      docs: [
        { data: () => ({ modelName: 'zeta' }) },
        { data: () => ({ modelName: 'alpha' }) },
      ],
    });
    const feeds = await getDatasources('nike_na');
    expect(feeds.map((f) => f.modelName)).toEqual(['alpha', 'zeta']);
  });
});

describe('getScanMarker', () => {
  it('returns null when the client doc has no marker', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({}) });
    expect(await getScanMarker('nike_na')).toBeNull();
  });

  it('returns null when the client doc does not exist', async () => {
    getDoc.mockResolvedValue({ exists: () => false, data: () => ({}) });
    expect(await getScanMarker('nike_na')).toBeNull();
  });

  it('reads marker fields when present', async () => {
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ datasourcesScanVersion: 1, datasourcesFeedCount: 4, datasourcesScannedAt: { toMillis: () => 123 } }),
    });
    const m = await getScanMarker('nike_na');
    expect(m).toEqual({ datasourcesScanVersion: 1, datasourcesFeedCount: 4, datasourcesScannedAt: 123 });
  });
});
