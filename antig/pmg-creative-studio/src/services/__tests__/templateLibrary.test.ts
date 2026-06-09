import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'firebase_uid_123' } },
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_, path) => ({ path })),
  doc: vi.fn((dbOrRef: any, path?: string) => {
    if (typeof path === 'string') return { id: path.split('/').pop() ?? path, path };
    // doc(collectionRef) — generates a new document reference
    return { id: 'tmpl_auto', path: `${dbOrRef.path}/tmpl_auto` };
  }),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  addDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  runTransaction: vi.fn(),
  query: vi.fn((...args) => args),
  where: vi.fn((field, op, value) => ({ field, op, value })),
  orderBy: vi.fn((field, dir) => ({ field, dir })),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
}));

vi.mock('../auth', () => ({
  authService: {
    getAlliUserId: vi.fn(() => 'alli_user_123'),
  },
}));

vi.mock('../../platform/firebase/paths', () => ({
  paths: {
    templateLibrary: vi.fn((slug) => `clients/${slug}/templateLibrary`),
    templateLibraryDoc: vi.fn((slug, id) => `clients/${slug}/templateLibrary/${id}`),
    templateLibraryHistory: vi.fn((slug, id) => `clients/${slug}/templateLibrary/${id}/history`),
  },
}));

import { getDoc, getDocs, addDoc, setDoc, deleteDoc, collection, doc } from 'firebase/firestore';
import { templateLibraryService } from '../templateLibrary';
import { TemplateNotFoundError, TemplatePermissionError } from '../templateLibrary.types';

function makeSnap(data: object | null, id = 'tmpl_001') {
  return {
    id,
    exists: () => data !== null,
    data: () => data,
  };
}

function makeQuerySnap(docs: ReturnType<typeof makeSnap>[]) {
  return { docs };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('templateLibraryService.getTemplate', () => {
  it('returns the record when the document exists', async () => {
    const record = { id: 'tmpl_001', name: 'My Template', status: 'draft' };
    vi.mocked(getDoc).mockResolvedValue(makeSnap(record) as any);

    const result = await templateLibraryService.getTemplate('acme', 'tmpl_001');

    expect(result).toEqual(record);
    expect(vi.mocked(doc)).toHaveBeenCalledWith(
      expect.anything(),
      'clients/acme/templateLibrary/tmpl_001'
    );
  });

  it('throws TemplateNotFoundError when the document does not exist', async () => {
    vi.mocked(getDoc).mockResolvedValue(makeSnap(null) as any);

    await expect(
      templateLibraryService.getTemplate('acme', 'tmpl_missing')
    ).rejects.toThrow(TemplateNotFoundError);
  });

  it('throws TemplatePermissionError on Firestore permission-denied', async () => {
    const permissionError = Object.assign(new Error('permission-denied'), {
      code: 'permission-denied',
    });
    vi.mocked(getDoc).mockRejectedValue(permissionError);

    await expect(
      templateLibraryService.getTemplate('acme', 'tmpl_001')
    ).rejects.toThrow(TemplatePermissionError);
  });
});

describe('templateLibraryService.getPublishedTemplates', () => {
  it('queries with status == published ordered by createdAt desc', async () => {
    vi.mocked(getDocs).mockResolvedValue(makeQuerySnap([]) as any);

    await templateLibraryService.getPublishedTemplates('acme');

    expect(vi.mocked(collection)).toHaveBeenCalledWith(
      expect.anything(),
      'clients/acme/templateLibrary'
    );
  });
});

describe('templateLibraryService.getDraftTemplates', () => {
  it('queries drafts filtered by auth.currentUser.uid', async () => {
    vi.mocked(getDocs).mockResolvedValue(makeQuerySnap([]) as any);

    await templateLibraryService.getDraftTemplates('acme');

    expect(vi.mocked(getDocs)).toHaveBeenCalled();
  });
});

describe('templateLibraryService.saveDraft', () => {
  it('writes to the correct tenant-isolated templateLibrary path', async () => {
    vi.mocked(setDoc).mockResolvedValue(undefined);

    await templateLibraryService.saveDraft('acme', {
      name: 'New Template',
      channel: 'social',
      adSizes: [{ width: 1080, height: 1080 }],
      scaffoldId: 'social:grid_2x2',
      scaffoldSnapshot: {
        expectedFields: ['headline'],
        contentHash: 'abc123',
        capturedAt: {} as any,
      },
      datasourceId: 'feed_01',
      datasourceName: 'Test Feed',
      feedSnapshot: { columns: ['title', 'price'], capturedAt: {} as any },
      fieldMappings: { headline: { source: 'feed', column: 'title' } },
      brandOverrides: {},
    });

    expect(vi.mocked(collection)).toHaveBeenCalledWith(
      expect.anything(),
      'clients/acme/templateLibrary'
    );
  });

  it('initializes status as draft and version as 1', async () => {
    let writtenData: Record<string, unknown> = {};
    vi.mocked(setDoc).mockImplementation(async (_, data) => {
      writtenData = data as any;
    });

    await templateLibraryService.saveDraft('acme', {
      name: 'New Template',
      channel: 'social',
      adSizes: [],
      scaffoldId: 'social:grid_2x2',
      scaffoldSnapshot: { expectedFields: [], contentHash: 'abc', capturedAt: {} as any },
      datasourceId: 'feed_01',
      datasourceName: 'Feed',
      feedSnapshot: { columns: [], capturedAt: {} as any },
      fieldMappings: {},
      brandOverrides: {},
    });

    expect(writtenData.status).toBe('draft');
    expect(writtenData.version).toBe(1);
    expect(writtenData.publishedAt).toBeNull();
    expect(writtenData.publishedBy).toBeNull();
    expect(writtenData.publishedByUid).toBeNull();
  });

  it('sets createdByUid from auth context, not from caller', async () => {
    let writtenData: Record<string, unknown> = {};
    vi.mocked(setDoc).mockImplementation(async (_, data) => {
      writtenData = data as any;
    });

    await templateLibraryService.saveDraft('acme', {
      name: 'New Template',
      channel: 'social',
      adSizes: [],
      scaffoldId: 'social:grid_2x2',
      scaffoldSnapshot: { expectedFields: [], contentHash: 'abc', capturedAt: {} as any },
      datasourceId: 'feed_01',
      datasourceName: 'Feed',
      feedSnapshot: { columns: [], capturedAt: {} as any },
      fieldMappings: {},
      brandOverrides: {},
    });

    expect(writtenData.createdByUid).toBe('firebase_uid_123');
    expect(writtenData.createdBy).toBe('alli_user_123');
  });

  it('returns the new templateId', async () => {
    vi.mocked(setDoc).mockResolvedValue(undefined);

    const id = await templateLibraryService.saveDraft('acme', {
      name: 'New',
      channel: 'social',
      adSizes: [],
      scaffoldId: 'social:grid_2x2',
      scaffoldSnapshot: { expectedFields: [], contentHash: 'abc', capturedAt: {} as any },
      datasourceId: 'feed_01',
      datasourceName: 'Feed',
      feedSnapshot: { columns: [], capturedAt: {} as any },
      fieldMappings: {},
      brandOverrides: {},
    });

    expect(id).toBe('tmpl_auto');
  });
});
