import { describe, it, expect, vi, beforeEach } from 'vitest';
import { batchService, type BatchRecord } from '../batches';

/**
 * Step 2.5 of AdLabs v1 plan — batches storage path tracers.
 *
 * Asserts that every write goes to the path-scoped tree
 * (`clients/{slug}/apps/{appId}/batches/...`) and never to the legacy
 * top-level `batches` collection. We mock `firebase/firestore` so we can
 * inspect the path strings the service computes.
 */

const calls: { fn: string; path: string }[] = [];

vi.mock('../../firebase', () => ({
  db: { __mock: 'db' },
}));

vi.mock('firebase/firestore', () => {
  return {
    collection: (_db: unknown, path: string) => {
      calls.push({ fn: 'collection', path });
      return { __collection: path };
    },
    doc: (...args: unknown[]) => {
      // doc(db, path) or doc(collectionRef)
      if (args.length >= 2 && typeof args[1] === 'string') {
        calls.push({ fn: 'doc', path: args[1] as string });
        return { __doc: args[1] };
      }
      const ref = args[0] as { __collection?: string };
      const path = ref?.__collection
        ? `${ref.__collection}/<auto>`
        : '<auto>';
      calls.push({ fn: 'doc', path });
      return { __doc: path };
    },
    addDoc: async (ref: { __collection: string }, data: unknown) => {
      calls.push({ fn: 'addDoc', path: ref.__collection });
      void data;
      return { id: 'auto-batch-id' };
    },
    updateDoc: async (ref: { __doc: string }) => {
      calls.push({ fn: 'updateDoc', path: ref.__doc });
    },
    setDoc: async (ref: { __doc: string }) => {
      calls.push({ fn: 'setDoc', path: ref.__doc });
    },
    getDoc: async () => ({ exists: () => false, id: 'x', data: () => ({}) }),
    getDocs: async () => ({ docs: [] }),
    serverTimestamp: () => '<ts>',
  };
});

beforeEach(() => {
  calls.length = 0;
});

describe('batchService path scoping (Step 2.5 tracer)', () => {
  it('Tracer 1: createBatch writes under clients/{slug}/apps/{appId}/batches', async () => {
    await batchService.createBatch('template-builder', {
      clientSlug: 'ralph_lauren',
      templateId: 't1',
      feedId: 'f1',
      feedName: 'Feed',
      status: 'pending',
      totalVariations: 10,
      completedVariations: 0,
      ratio: '1:1',
    } as Omit<BatchRecord, 'id' | 'appId' | 'createdAt' | 'updatedAt'>);

    const writes = calls.filter((c) => c.fn === 'addDoc');
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe(
      'clients/ralph_lauren/apps/template-builder/batches'
    );
    // Critical: NO call should target the legacy top-level path.
    expect(calls.some((c) => c.path === 'batches')).toBe(false);
  });

  it('Tracer 2: updateBatchStatus targets the scoped doc path', async () => {
    await batchService.updateBatchStatus(
      'ralph_lauren',
      'template-builder',
      'b-001',
      'processing'
    );

    const updates = calls.filter((c) => c.fn === 'updateDoc');
    expect(updates).toHaveLength(1);
    expect(updates[0].path).toBe(
      'clients/ralph_lauren/apps/template-builder/batches/b-001'
    );
  });

  it('Tracer 3: addResult writes under the batch sub-collection in the scoped tree', async () => {
    await batchService.addResult('ralph_lauren', 'template-builder', 'b-001', {
      url: 'https://example.com/x.png',
      feedRowIndex: 0,
    });

    const sets = calls.filter((c) => c.fn === 'setDoc');
    expect(sets).toHaveLength(1);
    expect(sets[0].path).toContain(
      'clients/ralph_lauren/apps/template-builder/batches/b-001/results'
    );
    // Legacy fence: never any path starting with bare "batches/".
    for (const c of calls) {
      expect(c.path.startsWith('batches/')).toBe(false);
      expect(c.path).not.toBe('batches');
    }
  });
});
