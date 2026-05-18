import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((db, path) => ({ path })),
  setDoc: vi.fn(async () => undefined),
  collection: vi.fn((db, path) => ({ path })),
  collectionGroup: vi.fn((db, id) => ({ groupId: id })),
  query: vi.fn((...args) => ({ args })),
  where: vi.fn((field, op, value) => ({ field, op, value })),
  orderBy: vi.fn((field, dir) => ({ field, dir })),
  getDocs: vi.fn(async () => ({ docs: [] })),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
}));

vi.mock('../../firebase', () => ({ db: {} }));

import { doc, setDoc, collection, collectionGroup, where, getDocs } from 'firebase/firestore';
import {
  createOutput,
  updateOutput,
  getOutputsForBatch,
  getOutputsForClient,
} from '../outputs';

beforeEach(() => {
  vi.clearAllMocks();
});

const validInput = {
  clientSlug: 'apple_services',
  appId: 'ad-resizing' as const,
  outputId: 'o1',
  batchId: 'b1',
  createdBy: 'alli-sub-xyz',
  status: 'pending' as const,
  kind: 'image' as const,
  format: { width: 1280, height: 720, label: 'digital-1280x720' },
};

describe('createOutput', () => {
  it('writes to the canonical outputs path', async () => {
    await createOutput({} as never, validInput);
    expect(vi.mocked(doc)).toHaveBeenCalledWith(
      expect.anything(),
      'clients/apple_services/apps/ad-resizing/outputs/o1'
    );
    expect(vi.mocked(setDoc)).toHaveBeenCalled();
  });

  it('stamps createdAt with serverTimestamp', async () => {
    await createOutput({} as never, validInput);
    const [, payload] = vi.mocked(setDoc).mock.calls[0];
    expect((payload as { createdAt: unknown }).createdAt).toEqual({ _type: 'serverTimestamp' });
  });

  it('stamps completedAt only when status=complete on insert', async () => {
    await createOutput({} as never, validInput);
    const pendingPayload = vi.mocked(setDoc).mock.calls[0][1] as Record<string, unknown>;
    expect(pendingPayload.completedAt).toBeUndefined();

    vi.clearAllMocks();
    await createOutput({} as never, { ...validInput, outputId: 'o2', status: 'complete' });
    const completePayload = vi.mocked(setDoc).mock.calls[0][1] as Record<string, unknown>;
    expect(completePayload.completedAt).toEqual({ _type: 'serverTimestamp' });
  });

  it('rejects an input missing required fields (createdBy)', async () => {
    const { createdBy: _omit, ...bad } = validInput;
    await expect(createOutput({} as never, bad as never)).rejects.toThrow(/createdBy/);
  });

  it('rejects unknown kind', async () => {
    await expect(
      createOutput({} as never, { ...validInput, kind: 'audio' as never })
    ).rejects.toThrow();
  });

  it('does NOT use merge:true (insert semantics, not upsert)', async () => {
    await createOutput({} as never, validInput);
    const opts = vi.mocked(setDoc).mock.calls[0][2];
    expect(opts).toBeUndefined();
  });
});

describe('updateOutput', () => {
  it('writes to the canonical output doc path with merge:true', async () => {
    await updateOutput({} as never, 'apple_services', 'ad-resizing', 'o3', {
      status: 'processing',
    });
    expect(vi.mocked(doc)).toHaveBeenCalledWith(
      expect.anything(),
      'clients/apple_services/apps/ad-resizing/outputs/o3'
    );
    const [, patch, opts] = vi.mocked(setDoc).mock.calls[0];
    expect(patch).toMatchObject({ status: 'processing' });
    expect(opts).toEqual({ merge: true });
  });

  it('does NOT touch createdAt — identity fields are absent from the patch', async () => {
    await updateOutput({} as never, 'apple_services', 'ad-resizing', 'o3', {
      status: 'complete',
      storageRef: 'clients/apple_services/apps/ad-resizing/outputs/o3.png',
    });
    const patch = vi.mocked(setDoc).mock.calls[0][1] as Record<string, unknown>;
    expect(patch).not.toHaveProperty('createdAt');
    expect(patch).not.toHaveProperty('createdBy');
    expect(patch).not.toHaveProperty('clientSlug');
    expect(patch).not.toHaveProperty('appId');
    expect(patch).not.toHaveProperty('outputId');
    expect(patch).not.toHaveProperty('kind');
  });

  it('stamps completedAt when status transitions to complete', async () => {
    await updateOutput({} as never, 'apple_services', 'ad-resizing', 'o3', {
      status: 'complete',
    });
    const patch = vi.mocked(setDoc).mock.calls[0][1] as Record<string, unknown>;
    expect(patch.completedAt).toEqual({ _type: 'serverTimestamp' });
  });

  it('does NOT stamp completedAt for non-complete updates', async () => {
    await updateOutput({} as never, 'apple_services', 'ad-resizing', 'o3', {
      status: 'processing',
    });
    const patch = vi.mocked(setDoc).mock.calls[0][1] as Record<string, unknown>;
    expect(patch.completedAt).toBeUndefined();
  });
});

describe('getOutputsForBatch', () => {
  it('queries the outputs collection filtered by batchId, ordered by createdAt', async () => {
    await getOutputsForBatch({} as never, 'apple_services', 'ad-resizing', 'b1');
    expect(vi.mocked(collection)).toHaveBeenCalledWith(
      expect.anything(),
      'clients/apple_services/apps/ad-resizing/outputs'
    );
    expect(vi.mocked(where)).toHaveBeenCalledWith('batchId', '==', 'b1');
    expect(vi.mocked(getDocs)).toHaveBeenCalled();
  });
});

describe('getOutputsForClient', () => {
  it('uses collectionGroup("outputs") + clientSlug filter', async () => {
    await getOutputsForClient({} as never, 'apple_services');
    expect(vi.mocked(collectionGroup)).toHaveBeenCalledWith(expect.anything(), 'outputs');
    expect(vi.mocked(where)).toHaveBeenCalledWith('clientSlug', '==', 'apple_services');
  });

  it('appends appId / createdBy / batchId filters when supplied', async () => {
    await getOutputsForClient({} as never, 'apple_services', {
      appId: 'ad-resizing',
      createdBy: 'alli-sub-xyz',
      batchId: 'b1',
    });
    expect(vi.mocked(where)).toHaveBeenCalledWith('appId', '==', 'ad-resizing');
    expect(vi.mocked(where)).toHaveBeenCalledWith('createdBy', '==', 'alli-sub-xyz');
    expect(vi.mocked(where)).toHaveBeenCalledWith('batchId', '==', 'b1');
  });
});
