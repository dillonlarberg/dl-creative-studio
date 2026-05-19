// COMPAT TEST — keep through the dual-write window. Delete when Task 10
// removes the legacy results/ write from addResult.
//
// Pins: batchService.addResult must write to BOTH the legacy results/
// subcollection AND the canonical outputs/ collection in a single call.
// If a future PR (#thegreatmigration no. 09 — reader cutover) breaks the
// dual-write before backfill completes, readers split: some clients see
// results/, some see outputs/, and the migration corrupts mid-flight.
//
// This test runs on every preflight and fails loudly if either path is
// missing or if the peer write omits parity fields.

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

describe('batchService.addResult — dual-write contract', () => {
  it('writes BOTH the legacy results/ subcollection AND the canonical outputs/ collection', async () => {
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

    const paths = vi.mocked(collection).mock.calls.map((c) => c[1]);
    // Legacy path (nested under the batch).
    expect(paths).toContain('clients/acme/apps/template-builder/batches/b-pin/results');

    // The peer write goes through paths.output(...) which calls
    // doc(db, '<full path>') directly, not through collection(). Verify the
    // peer write happened by inspecting setDoc calls for the canonical shape.
    const peerWrite = vi
      .mocked(setDoc)
      .mock.calls.find((call) => {
        const payload = call[1] as Record<string, unknown>;
        return (
          payload?.clientSlug === 'acme' &&
          payload?.appId === 'template-builder' &&
          payload?.kind === 'image' &&
          payload?.createdBy === 'alli-sub-pin'
        );
      });
    expect(peerWrite).toBeDefined();
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
