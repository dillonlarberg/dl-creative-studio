import { db } from '../firebase';
import { collection, addDoc, updateDoc, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { paths } from '../platform/firebase/paths';
import type { AppId, ClientSlug } from '../platform/firebase/paths';

export interface BatchRecord {
    id: string;
    clientSlug: string;
    appId: string;
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

export const batchService = {
    async createBatch(clientSlug: ClientSlug, appId: AppId, data: Omit<BatchRecord, 'id' | 'clientSlug' | 'appId' | 'createdAt' | 'updatedAt'>): Promise<string> {
        const docRef = await addDoc(collection(db, paths.batches(clientSlug, appId)), {
            ...data,
            clientSlug,
            appId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        return docRef.id;
    },

    async updateBatchStatus(clientSlug: ClientSlug, appId: AppId, batchId: string, status: BatchRecord['status'], completedCount?: number): Promise<void> {
        const updates: any = { status, updatedAt: serverTimestamp() };
        if (completedCount !== undefined) updates.completedVariations = completedCount;
        await updateDoc(doc(db, paths.batch(clientSlug, appId, batchId)), updates);
    },

    async addResult(clientSlug: ClientSlug, appId: AppId, batchId: string, result: Omit<BatchResult, 'id' | 'batchId'>): Promise<void> {
        const resultRef = doc(collection(db, paths.batchResults(clientSlug, appId, batchId)));
        await setDoc(resultRef, { ...result, batchId, createdAt: serverTimestamp() });
    },

    async getBatch(clientSlug: ClientSlug, appId: AppId, batchId: string): Promise<BatchRecord | null> {
        const docSnap = await getDoc(doc(db, paths.batch(clientSlug, appId, batchId)));
        if (docSnap.exists()) return { id: docSnap.id, ...docSnap.data() } as BatchRecord;
        return null;
    },

    async getBatchResults(clientSlug: ClientSlug, appId: AppId, batchId: string): Promise<BatchResult[]> {
        const querySnapshot = await getDocs(collection(db, paths.batchResults(clientSlug, appId, batchId)));
        return querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as BatchResult));
    },
};
