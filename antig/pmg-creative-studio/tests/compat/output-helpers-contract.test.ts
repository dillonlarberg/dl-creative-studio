// COMPAT TEST — keep through the migration. Pins the P0 "createdAt overwrite"
// guarantee documented in plan §self-review (line 1690): split create/update
// makes overwriting createdAt structurally impossible.
//
// What this pins:
//   1. updateOutput's payload to Firestore never contains identity fields
//      or createdAt — they cannot be passed (type guard) AND would not be
//      stamped (impl guard). Both must hold.
//   2. createOutput stamps createdAt via serverTimestamp on insert.
//
// If a future PR (Tasks 6, 7, 9, 10) regresses either invariant, this test
// fails at preflight. Delete after Task 13's smoke test confirms the field
// is preserved end-to-end in dev.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((db, path) => ({ path })),
  setDoc: vi.fn(async () => undefined),
  collection: vi.fn(),
  collectionGroup: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  getDocs: vi.fn(async () => ({ docs: [] })),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
}));
vi.mock('../../src/firebase', () => ({ db: {} }));

import { setDoc } from 'firebase/firestore';
import { createOutput, updateOutput } from '../../src/services/outputs';

beforeEach(() => vi.clearAllMocks());

describe('output helpers — P0 createdAt overwrite guard', () => {
  it('createOutput stamps createdAt with serverTimestamp', async () => {
    await createOutput({} as never, {
      clientSlug: 'apple_services',
      appId: 'ad-resizing',
      outputId: 'o-pin-1',
      batchId: 'b1',
      createdBy: 'alli-sub',
      status: 'pending',
      kind: 'image',
      format: { width: 100, height: 100, label: 'sq' },
    });
    const payload = vi.mocked(setDoc).mock.calls[0][1] as Record<string, unknown>;
    expect(payload.createdAt).toEqual({ _type: 'serverTimestamp' });
  });

  it('updateOutput patch never carries createdAt or identity fields', async () => {
    // The type system already blocks passing them. This test pins the runtime
    // shape so a future refactor that bypasses the type (e.g. `as any` patch)
    // would still get caught.
    await updateOutput({} as never, 'apple_services', 'ad-resizing', 'o-pin-2', {
      status: 'complete',
      storageRef: 'clients/apple_services/apps/ad-resizing/outputs/o-pin-2.png',
      previewUrl: 'https://x/y.png',
    });
    const patch = vi.mocked(setDoc).mock.calls[0][1] as Record<string, unknown>;
    const forbidden = ['createdAt', 'createdBy', 'clientSlug', 'appId', 'outputId', 'kind'];
    for (const k of forbidden) {
      expect(patch).not.toHaveProperty(k);
    }
  });

  it('updateOutput uses merge:true (never replaces the doc)', async () => {
    await updateOutput({} as never, 'apple_services', 'ad-resizing', 'o-pin-3', {
      status: 'processing',
    });
    const opts = vi.mocked(setDoc).mock.calls[0][2];
    expect(opts).toEqual({ merge: true });
  });
});
