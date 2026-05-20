import { describe, it, expect, vi, beforeEach } from 'vitest';
import { batchService } from '../batches';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((db, path) => ({ path })),
  doc: vi.fn((db, path) => ({ path })),
  addDoc: vi.fn(async () => ({ id: 'b1' })),
  getDoc: vi.fn(async () => ({ exists: () => false })),
  updateDoc: vi.fn(async () => undefined),
  setDoc: vi.fn(async () => undefined),
  getDocs: vi.fn(async () => ({ docs: [] })),
  serverTimestamp: vi.fn(() => ({ _type: 'timestamp' })),
}));

vi.mock('../../firebase', () => ({ db: {} }));

import { collection, doc, addDoc, getDoc, updateDoc, setDoc } from 'firebase/firestore';

beforeEach(() => {
  vi.clearAllMocks();
});

const batchData = {
  templateId: 't1',
  feedId: 'f1',
  feedName: 'Feed 1',
  status: 'pending' as const,
  totalVariations: 10,
  completedVariations: 0,
  ratio: '1:1',
};

describe('batchService', () => {
  describe('createBatch', () => {
    it('writes to the correct tenant-isolated batches path', async () => {
      vi.mocked(addDoc).mockResolvedValue({ id: 'b1' } as any);
      await batchService.createBatch('acme', 'template-builder', batchData);
      expect(vi.mocked(collection)).toHaveBeenCalledWith(
        expect.anything(),
        'clients/acme/apps/template-builder/batches'
      );
    });

    it('returns the new batch id', async () => {
      vi.mocked(addDoc).mockResolvedValue({ id: 'b1' } as any);
      const id = await batchService.createBatch('acme', 'template-builder', batchData);
      expect(id).toBe('b1');
    });
  });

  describe('getBatch', () => {
    it('reads from the correct tenant-isolated batch doc path', async () => {
      vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as any);
      await batchService.getBatch('acme', 'template-builder', 'b1');
      expect(vi.mocked(doc)).toHaveBeenCalledWith(
        expect.anything(),
        'clients/acme/apps/template-builder/batches/b1'
      );
    });

    it('returns null when batch does not exist', async () => {
      vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as any);
      const result = await batchService.getBatch('acme', 'template-builder', 'b1');
      expect(result).toBeNull();
    });
  });

  describe('addResult', () => {
    const ctx = { createdBy: 'alli-sub-xyz', kind: 'image' as const };

    it('does NOT write to the legacy results subcollection (#thegreatmigration no. 11)', async () => {
      vi.mocked(doc).mockReturnValue({ id: 'r1', path: 'outputs/r1' } as any);
      await batchService.addResult('acme', 'template-builder', 'b1', {
        url: 'https://example.com/out.png',
        feedRowIndex: 0,
      }, ctx);
      const legacyCalls = vi.mocked(collection).mock.calls.filter(
        ([, path]) => typeof path === 'string' && path.includes('/results'),
      );
      expect(legacyCalls).toHaveLength(0);
    });

    it('writes a single peer OutputDoc to the outputs collection', async () => {
      vi.mocked(doc).mockReturnValue({ id: 'r1', path: 'outputs/r1' } as any);
      await batchService.addResult('acme', 'template-builder', 'b1', {
        url: 'https://example.com/out.png',
        feedRowIndex: 0,
        metadata: { width: 1080, height: 1080, label: 'square' },
      }, ctx);
      // Single setDoc call: peer outputs only (legacy write dropped).
      expect(vi.mocked(setDoc).mock.calls).toHaveLength(1);
      const peerPayload = vi.mocked(setDoc).mock.calls[0]![1] as Record<string, unknown>;
      expect(peerPayload).toMatchObject({
        clientSlug: 'acme',
        appId: 'template-builder',
        createdBy: 'alli-sub-xyz',
        kind: 'image',
        status: 'complete',
        format: { width: 1080, height: 1080, label: 'square' },
      });
    });

    it('targets the outputs collection (not results) when generating the id', async () => {
      vi.mocked(doc).mockReturnValue({ id: 'r1', path: 'outputs/r1' } as any);
      await batchService.addResult('acme', 'template-builder', 'b1', {
        url: 'https://example.com/out.png',
        feedRowIndex: 0,
      }, ctx);
      expect(vi.mocked(collection)).toHaveBeenCalledWith(
        expect.anything(),
        'clients/acme/apps/template-builder/outputs',
      );
    });

    it('defaults format dimensions when metadata is missing', async () => {
      vi.mocked(doc).mockReturnValue({ id: 'r1', path: 'outputs/r1' } as any);
      await batchService.addResult('acme', 'template-builder', 'b1', {
        url: 'https://example.com/out.png',
        feedRowIndex: 0,
      }, ctx);
      const fmt = (vi.mocked(setDoc).mock.calls[0]![1] as { format: { width: number; height: number; label: string } }).format;
      expect(fmt.width).toBe(1080);
      expect(fmt.height).toBe(1080);
      expect(fmt.label).toBe('1080x1080');
    });

    it('throws when ctx.createdBy is missing (no silent attribution)', async () => {
      await expect(
        batchService.addResult(
          'acme',
          'template-builder',
          'b1',
          { url: 'x', feedRowIndex: 0 },
          { createdBy: '', kind: 'image' },
        ),
      ).rejects.toThrow(/createdBy/);
    });
  });

  describe('updateBatchStatus', () => {
    it('updates the correct batch doc', async () => {
      await batchService.updateBatchStatus('acme', 'template-builder', 'b1', 'completed', 10);
      expect(vi.mocked(doc)).toHaveBeenCalledWith(
        expect.anything(),
        'clients/acme/apps/template-builder/batches/b1'
      );
      expect(vi.mocked(updateDoc)).toHaveBeenCalled();
    });
  });

  describe('path isolation', () => {
    it('acme and ralph_lauren batch collections are distinct paths', async () => {
      vi.mocked(addDoc).mockResolvedValue({ id: 'x' } as any);
      await batchService.createBatch('acme', 'template-builder', batchData);
      const acmePath = vi.mocked(collection).mock.calls[0][1];
      vi.clearAllMocks();
      await batchService.createBatch('ralph_lauren', 'template-builder', batchData);
      const rlPath = vi.mocked(collection).mock.calls[0][1];
      expect(acmePath).not.toBe(rlPath);
    });
  });
});
