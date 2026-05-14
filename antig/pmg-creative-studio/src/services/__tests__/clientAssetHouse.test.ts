import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clientAssetHouseService } from '../clientAssetHouse';

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, path) => ({ path })),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => undefined })),
  setDoc: vi.fn(async () => undefined),
  updateDoc: vi.fn(async () => undefined),
}));

vi.mock('firebase/storage', () => ({
  ref: vi.fn((_storage, path) => ({ path })),
  uploadBytes: vi.fn(async () => ({ ref: { path: 'x' } })),
  getDownloadURL: vi.fn(async () => 'https://example/download'),
}));

vi.mock('../../firebase', () => ({ db: {}, storage: {} }));

import { doc, getDoc, setDoc } from 'firebase/firestore';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('clientAssetHouseService — path-scoped writes (issue #10)', () => {
  it('reads from clients/{slug}, not the legacy clientAssetHouse/{slug}', async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as never);
    await clientAssetHouseService.getAssetHouse('ralph_lauren');
    expect(vi.mocked(doc)).toHaveBeenCalledWith(
      expect.anything(),
      'clients/ralph_lauren'
    );
  });

  it('writes to clients/{slug}, not the legacy clientAssetHouse/{slug}', async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as never);
    await clientAssetHouseService.saveAssetHouse('ralph_lauren', {
      primaryColor: '#000',
    });
    expect(vi.mocked(doc)).toHaveBeenCalledWith(
      expect.anything(),
      'clients/ralph_lauren'
    );
    expect(vi.mocked(setDoc)).toHaveBeenCalled();
    const writtenPath = (vi.mocked(doc).mock.results[0]!.value as { path: string }).path;
    expect(writtenPath).toBe('clients/ralph_lauren');
    expect(writtenPath).not.toMatch(/^clientAssetHouse\//);
  });
});
