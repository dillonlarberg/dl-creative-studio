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
    // 'partial' is used by ad-resizing when at least one output succeeded but
    // at least one failed permanently. Template-builder treats it the same as
    // 'completed' / 'failed' for its UI (DashboardPage's ACTIVE_STATUSES only
    // surfaces 'pending'|'processing', so 'partial' just falls off the
    // Active Batch Jobs widget — verified for PR-A).
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'partial';
    totalVariations: number;
    completedVariations: number;
    ratio: string;
    createdAt: any;
    updatedAt: any;

    // Optional ad-resizing-specific fields. Populated by the runOutpaintBatch
    // callable; ignored by template-builder.
    errorCount?: number;
    sourceCreative?: {
        creativeId: string;
        originalUrl: string;
        storageRef: string;
        width: number;
        height: number;
        mime: string;
    };
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

    /**
     * Step 4 of AdLabs v1: read all batches under one app for the dashboard's
     * Active Batch Jobs section. Caller filters to {pending, processing} and
     * sorts by createdAt DESC.
     */
    async listActiveBatchesForClient(clientSlug: ClientSlug, appId: AppId): Promise<BatchRecord[]> {
        const snap = await getDocs(collection(db, paths.batches(clientSlug, appId)));
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as BatchRecord));
    },
};
