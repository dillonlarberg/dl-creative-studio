import { describe, it, expect, vi, beforeEach } from 'vitest';
import { creativeService } from '../creative';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((db, path) => ({ path })),
  doc: vi.fn((db, path) => ({ path })),
  addDoc: vi.fn(async (ref) => ({ id: 'new-id' })),
  getDoc: vi.fn(async () => ({ exists: () => false })),
  updateDoc: vi.fn(async () => undefined),
  getDocs: vi.fn(async () => ({ docs: [] })),
  serverTimestamp: vi.fn(() => ({ _type: 'timestamp' })),
}));

vi.mock('../../firebase', () => ({ db: {} }));

import { collection, doc, addDoc, getDoc, updateDoc, getDocs } from 'firebase/firestore';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('creativeService', () => {
  describe('createCreative', () => {
    it('writes to the correct tenant-isolated path', async () => {
      vi.mocked(addDoc).mockResolvedValue({ id: 'c1' } as any);
      await creativeService.createCreative('acme', 'edit-image');
      expect(vi.mocked(collection)).toHaveBeenCalledWith(
        expect.anything(),
        'clients/acme/apps/edit-image/creatives'
      );
    });

    it('returns the new document id', async () => {
      vi.mocked(addDoc).mockResolvedValue({ id: 'c1' } as any);
      const id = await creativeService.createCreative('acme', 'edit-image');
      expect(id).toBe('c1');
    });
  });

  describe('getCreative', () => {
    it('reads from the correct tenant-isolated path', async () => {
      vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as any);
      await creativeService.getCreative('acme', 'edit-image', 'c1');
      expect(vi.mocked(doc)).toHaveBeenCalledWith(
        expect.anything(),
        'clients/acme/apps/edit-image/creatives/c1'
      );
    });

    it('returns null when document does not exist', async () => {
      vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as any);
      const result = await creativeService.getCreative('acme', 'edit-image', 'c1');
      expect(result).toBeNull();
    });

    it('returns the record when document exists', async () => {
      vi.mocked(getDoc).mockResolvedValue({
        exists: () => true,
        id: 'c1',
        data: () => ({ appId: 'edit-image', status: 'draft', stepData: {}, currentStep: 0, createdAt: null, updatedAt: null, clientSlug: 'acme' }),
      } as any);
      const result = await creativeService.getCreative('acme', 'edit-image', 'c1');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('c1');
      expect(result?.appId).toBe('edit-image');
    });
  });

  describe('updateCreative', () => {
    it('updates at the correct tenant-isolated path', async () => {
      await creativeService.updateCreative('acme', 'edit-image', 'c1', { status: 'completed' });
      expect(vi.mocked(doc)).toHaveBeenCalledWith(
        expect.anything(),
        'clients/acme/apps/edit-image/creatives/c1'
      );
      expect(vi.mocked(updateDoc)).toHaveBeenCalled();
    });
  });

  describe('getClientCreatives', () => {
    it('queries the correct tenant-isolated collection', async () => {
      vi.mocked(getDocs).mockResolvedValue({ docs: [] } as any);
      await creativeService.getClientCreatives('acme', 'edit-image');
      expect(vi.mocked(collection)).toHaveBeenCalledWith(
        expect.anything(),
        'clients/acme/apps/edit-image/creatives'
      );
    });

    it('isolates paths per client — acme and ralph_lauren never share a collection', async () => {
      vi.mocked(getDocs).mockResolvedValue({ docs: [] } as any);
      await creativeService.getClientCreatives('acme', 'edit-image');
      const acmePath = vi.mocked(collection).mock.calls[0][1];
      vi.clearAllMocks();
      await creativeService.getClientCreatives('ralph_lauren', 'edit-image');
      const rlPath = vi.mocked(collection).mock.calls[0][1];
      expect(acmePath).not.toBe(rlPath);
    });
  });
});
