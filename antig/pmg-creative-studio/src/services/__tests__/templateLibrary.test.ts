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

import { getDoc, getDocs, addDoc, setDoc, deleteDoc, collection, doc, runTransaction } from 'firebase/firestore';
import { templateLibraryService, _fns } from '../templateLibrary';
import { TemplateNotFoundError, TemplatePermissionError, TemplatePublishedError, TemplateDraftError } from '../templateLibrary.types';

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

describe('templateLibraryService.upsertDraft', () => {
  function mockTransaction(snapData: object | null) {
    vi.mocked(runTransaction).mockImplementation(async (_, fn) => {
      const snap = makeSnap(snapData);
      const transaction = {
        get: vi.fn().mockResolvedValue(snap),
        update: vi.fn(),
        set: vi.fn(),
      };
      await fn(transaction as any);
      return transaction;
    });
  }

  it('throws TemplateNotFoundError if doc does not exist', async () => {
    mockTransaction(null);

    await expect(
      templateLibraryService.upsertDraft('acme', 'tmpl_001', { name: 'Updated' })
    ).rejects.toThrow(TemplateNotFoundError);
  });

  it('throws TemplatePublishedError if doc is published', async () => {
    mockTransaction({ status: 'published', createdByUid: 'firebase_uid_123' });

    await expect(
      templateLibraryService.upsertDraft('acme', 'tmpl_001', { name: 'Updated' })
    ).rejects.toThrow(TemplatePublishedError);
  });

  it('strips immutable fields from the update payload', async () => {
    let updatePayload: Record<string, unknown> = {};
    vi.mocked(runTransaction).mockImplementation(async (_, fn) => {
      const snap = makeSnap({ status: 'draft', createdByUid: 'firebase_uid_123' });
      const transaction = {
        get: vi.fn().mockResolvedValue(snap),
        update: vi.fn((_, data) => { updatePayload = data; }),
        set: vi.fn(),
      };
      await fn(transaction as any);
      return transaction;
    });

    await templateLibraryService.upsertDraft('acme', 'tmpl_001', {
      name: 'Updated',
      createdBy: 'hacker',
      createdByUid: 'hacked_uid',
      createdAt: {} as any,
      id: 'wrong_id',
    });

    expect(updatePayload.createdBy).toBeUndefined();
    expect(updatePayload.createdByUid).toBeUndefined();
    expect(updatePayload.createdAt).toBeUndefined();
    expect(updatePayload.id).toBeUndefined();
    expect(updatePayload.name).toBe('Updated');
  });

  it('sets updatedBy/updatedByUid from auth context, ignoring caller values', async () => {
    let updatePayload: Record<string, unknown> = {};
    vi.mocked(runTransaction).mockImplementation(async (_, fn) => {
      const snap = makeSnap({ status: 'draft', createdByUid: 'firebase_uid_123' });
      const transaction = {
        get: vi.fn().mockResolvedValue(snap),
        update: vi.fn((_, data) => { updatePayload = data; }),
        set: vi.fn(),
      };
      await fn(transaction as any);
      return transaction;
    });

    await templateLibraryService.upsertDraft('acme', 'tmpl_001', {
      updatedBy: 'spoofed_user',
      updatedByUid: 'spoofed_uid',
    });

    expect(updatePayload.updatedBy).toBe('alli_user_123');
    expect(updatePayload.updatedByUid).toBe('firebase_uid_123');
  });

  it('writes a history entry inside the transaction', async () => {
    let setPayload: Record<string, unknown> = {};
    vi.mocked(runTransaction).mockImplementation(async (_, fn) => {
      const snapData = { status: 'draft', createdByUid: 'firebase_uid_123', name: 'Original' };
      const snap = makeSnap(snapData);
      const transaction = {
        get: vi.fn().mockResolvedValue(snap),
        update: vi.fn(),
        set: vi.fn((_, data) => { setPayload = data; }),
      };
      await fn(transaction as any);
      return transaction;
    });

    await templateLibraryService.upsertDraft('acme', 'tmpl_001', { name: 'Updated' });

    expect(setPayload.snapshot).toEqual(
      expect.objectContaining({ status: 'draft', name: 'Original' })
    );
    expect(setPayload.savedBy).toBe('alli_user_123');
    expect(setPayload.savedByUid).toBe('firebase_uid_123');
    expect(setPayload.savedAt).toEqual({ _type: 'serverTimestamp' });
  });
});

describe('templateLibraryService.publish', () => {
  function validDraft() {
    return {
      status: 'draft',
      version: 1,
      scaffoldSnapshot: {
        expectedFields: ['headline', 'image'],
        contentHash: 'abc',
        capturedAt: {},
      },
      datasourceId: 'feed_01',
      feedSnapshot: { columns: ['title', 'image_url'], capturedAt: {} },
      fieldMappings: {
        headline: { source: 'feed', column: 'title' },
        image: { source: 'feed', column: 'image_url' },
      },
      brandOverrides: {},
      createdByUid: 'firebase_uid_123',
      createdBy: 'alli_user_123',
      createdAt: {},
    };
  }

  it('throws TemplatePublishedError if template is already published', async () => {
    vi.mocked(getDoc).mockResolvedValue(
      makeSnap({ ...validDraft(), status: 'published' }) as any
    );

    await expect(
      templateLibraryService.publish('acme', 'tmpl_001')
    ).rejects.toThrow(TemplatePublishedError);
  });

  it('increments version and sets status to published', async () => {
    vi.mocked(getDoc).mockResolvedValue(makeSnap(validDraft()) as any);
    vi.spyOn(_fns, '_fetchLiveFeedColumns').mockResolvedValue(['title', 'image_url']);

    let updatePayload: Record<string, unknown> = {};
    vi.mocked(runTransaction).mockImplementation(async (_, fn) => {
      const snap = makeSnap(validDraft());
      const transaction = {
        get: vi.fn().mockResolvedValue(snap),
        update: vi.fn((_, d) => { updatePayload = d; }),
        set: vi.fn(),
      };
      await fn(transaction as any);
      return transaction;
    });

    await templateLibraryService.publish('acme', 'tmpl_001');

    expect(updatePayload.status).toBe('published');
    expect(updatePayload.version).toBe(2);
    expect(updatePayload.publishedByUid).toBe('firebase_uid_123');
    expect(updatePayload.publishedBy).toBe('alli_user_123');
  });

  it('throws if a required field has no mapping', async () => {
    const draftMissingMapping = {
      ...validDraft(),
      fieldMappings: {
        headline: { source: 'feed', column: 'title' },
        // 'image' is in expectedFields but not in fieldMappings
      },
    };
    vi.mocked(getDoc).mockResolvedValue(makeSnap(draftMissingMapping) as any);
    vi.spyOn(_fns, '_fetchLiveFeedColumns').mockResolvedValue(['title', 'image_url']);

    await expect(
      templateLibraryService.publish('acme', 'tmpl_001')
    ).rejects.toThrow(/unmapped required field/i);
  });

  it('throws if a mapped feed column no longer exists in the live feed', async () => {
    const draftWithStaleMapping = {
      ...validDraft(),
      fieldMappings: {
        headline: { source: 'feed', column: 'old_column' },
        image: { source: 'feed', column: 'image_url' },
      },
    };
    vi.mocked(getDoc).mockResolvedValue(makeSnap(draftWithStaleMapping) as any);
    vi.spyOn(_fns, '_fetchLiveFeedColumns').mockResolvedValue(['image_url', 'title', 'price']);

    await expect(
      templateLibraryService.publish('acme', 'tmpl_001')
    ).rejects.toThrow(/no longer exist/i);
  });

  it('throws if a feed mapping has an empty column', async () => {
    const draftEmptyColumn = {
      ...validDraft(),
      fieldMappings: {
        headline: { source: 'feed', column: '' },
        image: { source: 'feed', column: 'image_url' },
      },
    };
    vi.mocked(getDoc).mockResolvedValue(makeSnap(draftEmptyColumn) as any);
    vi.spyOn(_fns, '_fetchLiveFeedColumns').mockResolvedValue(['image_url', 'title']);

    await expect(
      templateLibraryService.publish('acme', 'tmpl_001')
    ).rejects.toThrow(/column is empty/i);
  });

  it('throws if an upload mapping has an empty assetPath', async () => {
    const draftEmptyAssetPath = {
      ...validDraft(),
      fieldMappings: {
        headline: { source: 'upload', assetPath: '' },
        image: { source: 'feed', column: 'image_url' },
      },
    };
    vi.mocked(getDoc).mockResolvedValue(makeSnap(draftEmptyAssetPath) as any);

    await expect(
      templateLibraryService.publish('acme', 'tmpl_001')
    ).rejects.toThrow(/assetPath is empty/i);
  });

  it('throws if a brand mapping has an empty brandKey', async () => {
    const draftEmptyBrandKey = {
      ...validDraft(),
      fieldMappings: {
        headline: { source: 'brand', brandKey: '' },
        image: { source: 'feed', column: 'image_url' },
      },
    };
    vi.mocked(getDoc).mockResolvedValue(makeSnap(draftEmptyBrandKey) as any);

    await expect(
      templateLibraryService.publish('acme', 'tmpl_001')
    ).rejects.toThrow(/brandKey is empty/i);
  });

  it('writes a history entry inside the transaction', async () => {
    vi.mocked(getDoc).mockResolvedValue(makeSnap(validDraft()) as any);
    vi.spyOn(_fns, '_fetchLiveFeedColumns').mockResolvedValue(['title', 'image_url']);

    let setPayload: Record<string, unknown> = {};
    vi.mocked(runTransaction).mockImplementation(async (_, fn) => {
      const snap = makeSnap(validDraft());
      const transaction = {
        get: vi.fn().mockResolvedValue(snap),
        update: vi.fn(),
        set: vi.fn((_, d) => { setPayload = d; }),
      };
      await fn(transaction as any);
      return transaction;
    });

    await templateLibraryService.publish('acme', 'tmpl_001');

    expect(setPayload.snapshot).toEqual(
      expect.objectContaining({ status: 'draft', version: 1 })
    );
    expect(setPayload.savedBy).toBe('alli_user_123');
    expect(setPayload.savedByUid).toBe('firebase_uid_123');
  });
});

describe('templateLibraryService.updatePublished', () => {
  function publishedDoc() {
    return {
      status: 'published',
      version: 3,
      scaffoldSnapshot: {
        expectedFields: ['headline'],
        contentHash: 'abc',
        capturedAt: {},
      },
      fieldMappings: { headline: { source: 'feed', column: 'title' } },
      datasourceId: 'feed_01',
      feedSnapshot: { columns: ['title'], capturedAt: {} },
      brandOverrides: {},
      createdByUid: 'firebase_uid_123',
      createdBy: 'alli_user_123',
      createdAt: {},
    };
  }

  it('throws TemplateDraftError if template is still a draft', async () => {
    vi.mocked(getDoc).mockResolvedValue(
      makeSnap({ status: 'draft', version: 1, createdByUid: 'firebase_uid_123' }) as any
    );

    await expect(
      templateLibraryService.updatePublished('acme', 'tmpl_001', { name: 'Updated' })
    ).rejects.toThrow(TemplateDraftError);
  });

  it('throws TemplateNotFoundError if doc does not exist', async () => {
    vi.mocked(getDoc).mockResolvedValue(makeSnap(null) as any);

    await expect(
      templateLibraryService.updatePublished('acme', 'tmpl_001', { name: 'Updated' })
    ).rejects.toThrow(TemplateNotFoundError);
  });

  it('increments version on published edit', async () => {
    vi.mocked(getDoc).mockResolvedValue(makeSnap(publishedDoc()) as any);
    vi.spyOn(_fns, '_fetchLiveFeedColumns').mockResolvedValue(['title']);

    let updatePayload: Record<string, unknown> = {};
    vi.mocked(runTransaction).mockImplementation(async (_, fn) => {
      const snap = makeSnap(publishedDoc());
      const transaction = {
        get: vi.fn().mockResolvedValue(snap),
        update: vi.fn((_, d) => { updatePayload = d; }),
        set: vi.fn(),
      };
      await fn(transaction as any);
      return transaction;
    });

    await templateLibraryService.updatePublished('acme', 'tmpl_001', { name: 'Updated' });

    expect(updatePayload.version).toBe(4);
    expect(updatePayload.updatedByUid).toBe('firebase_uid_123');
    expect(updatePayload.updatedBy).toBe('alli_user_123');
  });

  it('writes a history entry inside the transaction', async () => {
    vi.mocked(getDoc).mockResolvedValue(makeSnap(publishedDoc()) as any);
    vi.spyOn(_fns, '_fetchLiveFeedColumns').mockResolvedValue(['title']);

    let setPayload: Record<string, unknown> = {};
    vi.mocked(runTransaction).mockImplementation(async (_, fn) => {
      const snap = makeSnap(publishedDoc());
      const transaction = {
        get: vi.fn().mockResolvedValue(snap),
        update: vi.fn(),
        set: vi.fn((_, d) => { setPayload = d; }),
      };
      await fn(transaction as any);
      return transaction;
    });

    await templateLibraryService.updatePublished('acme', 'tmpl_001', { name: 'Updated' });

    expect(setPayload.snapshot).toEqual(
      expect.objectContaining({ status: 'published', version: 3 })
    );
    expect(setPayload.savedBy).toBe('alli_user_123');
    expect(setPayload.savedByUid).toBe('firebase_uid_123');
  });
});

describe('templateLibraryService.deleteTemplate', () => {
  it('calls deleteDoc with the correct path', async () => {
    vi.mocked(deleteDoc).mockResolvedValue(undefined);

    await templateLibraryService.deleteTemplate('acme', 'tmpl_001');

    expect(vi.mocked(deleteDoc)).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'clients/acme/templateLibrary/tmpl_001' })
    );
  });
});
