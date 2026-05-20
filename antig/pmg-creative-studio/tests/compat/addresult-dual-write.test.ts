// HISTORICAL COMPAT TEST — the legacy results/ write was dropped from
// batchService.addResult in #thegreatmigration no. 11. This file now pins
// the SINGLE-write contract (peer outputs/ only) so a future regression
// can't silently bring the legacy write back.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((db, path) => ({ path })),
  doc: vi.fn(() => ({ id: 'r-pin', path: 'mocked' })),
  setDoc: vi.fn(async () => undefined),
  addDoc: vi.fn(async () => ({ id: 'r-pin' })),
  getDoc: vi.fn(async () => ({ exists: () => false })),
  getDocs: vi.fn(async () => ({ docs: [] })),
  updateDoc: vi.fn(async () => undefined),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
  collectionGroup: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
}));
vi.mock('../../src/firebase', () => ({ db: {} }));

import { collection, setDoc } from 'firebase/firestore';
import { batchService } from '../../src/services/batches';

beforeEach(() => vi.clearAllMocks());

describe('batchService.addResult — single-write contract (post no. 11)', () => {
  it('does NOT write to the legacy results/ subcollection', async () => {
    await batchService.addResult(
      'acme',
      'template-builder',
      'b-pin',
      {
        url: 'https://x/y.png',
        feedRowIndex: 0,
        metadata: { width: 1080, height: 1080, label: 'square' },
      },
      { createdBy: 'alli-sub-pin', kind: 'image' },
    );

    const collectionPaths = vi.mocked(collection).mock.calls.map((c) => c[1]);
    const legacy = collectionPaths.filter(
      (p) => typeof p === 'string' && p.includes('/results'),
    );
    expect(legacy).toHaveLength(0);
  });

  it('writes exactly one peer OutputDoc to the canonical outputs/ collection', async () => {
    await batchService.addResult(
      'acme',
      'template-builder',
      'b-pin',
      {
        url: 'https://x/y.png',
        feedRowIndex: 0,
        metadata: { width: 1080, height: 1080, label: 'square' },
      },
      { createdBy: 'alli-sub-pin', kind: 'image' },
    );

    expect(vi.mocked(setDoc).mock.calls).toHaveLength(1);
    const payload = vi.mocked(setDoc).mock.calls[0]![1] as Record<string, unknown>;
    expect(payload).toMatchObject({
      clientSlug: 'acme',
      appId: 'template-builder',
      kind: 'image',
      createdBy: 'alli-sub-pin',
    });
  });

  it('refuses to write when createdBy is missing — no silent attribution corruption', async () => {
    await expect(
      batchService.addResult(
        'acme',
        'template-builder',
        'b-pin',
        { url: 'x', feedRowIndex: 0 },
        { createdBy: '', kind: 'image' },
      ),
    ).rejects.toThrow(/createdBy/);
  });
});
