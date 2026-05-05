import { db } from '../firebase';
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { paths, type AppId, type ClientSlug } from '../platform/firebase/paths';

/**
 * Step 2.5 of AdLabs v1 plan: batches storage path migration.
 *
 * Batch documents now live under the path-scoped tree:
 *   clients/{slug}/apps/{appId}/batches/{batchId}
 *   clients/{slug}/apps/{appId}/batches/{batchId}/results/{resultId}
 *
 * The legacy top-level `/batches/{batchId}` collection is migrated by
 * scripts/migrate-batches-to-scoped-paths.ts. Step 4's dashboard query
 * reads from the new path.
 *
 * All public methods take `clientSlug` and `appId` so the writer is the
 * single source of truth — no readers may target the legacy path.
 */

export interface BatchRecord {
  id: string;
  appId: AppId;
  clientSlug: ClientSlug;
  templateId: string;
  feedId: string;
  feedName: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  totalVariations: number;
  completedVariations: number;
  ratio: string;
  createdAt: any;
  updatedAt: any;
}

export interface BatchResult {
  id: string;
  batchId: string;
  url: string;
  feedRowIndex: number;
  metadata?: Record<string, any>;
}

function batchesCollection(clientSlug: ClientSlug, appId: AppId) {
  return collection(db, `${paths.app(clientSlug, appId)}/batches`);
}

function batchDoc(clientSlug: ClientSlug, appId: AppId, batchId: string) {
  return doc(db, `${paths.app(clientSlug, appId)}/batches/${batchId}`);
}

function resultsCollection(
  clientSlug: ClientSlug,
  appId: AppId,
  batchId: string
) {
  return collection(
    db,
    `${paths.app(clientSlug, appId)}/batches/${batchId}/results`
  );
}

export const batchService = {
  async createBatch(
    appId: AppId,
    data: Omit<BatchRecord, 'id' | 'appId' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    const docRef = await addDoc(batchesCollection(data.clientSlug, appId), {
      ...data,
      appId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  },

  async updateBatchStatus(
    clientSlug: ClientSlug,
    appId: AppId,
    id: string,
    status: BatchRecord['status'],
    completedCount?: number
  ): Promise<void> {
    const updates: any = {
      status,
      updatedAt: serverTimestamp(),
    };
    if (completedCount !== undefined) {
      updates.completedVariations = completedCount;
    }
    await updateDoc(batchDoc(clientSlug, appId, id), updates);
  },

  async addResult(
    clientSlug: ClientSlug,
    appId: AppId,
    batchId: string,
    result: Omit<BatchResult, 'id' | 'batchId'>
  ): Promise<void> {
    const resultRef = doc(resultsCollection(clientSlug, appId, batchId));
    await setDoc(resultRef, {
      ...result,
      batchId,
      createdAt: serverTimestamp(),
    });
  },

  async getBatch(
    clientSlug: ClientSlug,
    appId: AppId,
    id: string
  ): Promise<BatchRecord | null> {
    const docSnap = await getDoc(batchDoc(clientSlug, appId, id));
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as BatchRecord;
    }
    return null;
  },

  async getBatchResults(
    clientSlug: ClientSlug,
    appId: AppId,
    batchId: string
  ): Promise<BatchResult[]> {
    const querySnapshot = await getDocs(
      resultsCollection(clientSlug, appId, batchId)
    );
    return querySnapshot.docs.map(
      (d) => ({ id: d.id, ...d.data() } as BatchResult)
    );
  },

  async listActiveBatchesForClient(
    clientSlug: ClientSlug,
    appId: AppId
  ): Promise<BatchRecord[]> {
    const snap = await getDocs(batchesCollection(clientSlug, appId));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as BatchRecord));
  },
};
