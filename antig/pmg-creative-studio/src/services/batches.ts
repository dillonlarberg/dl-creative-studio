import { db } from '../firebase';
import { collection, addDoc, updateDoc, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';

export interface BatchRecord {
    id: string;
    clientSlug: string;
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
    async createBatch(data: Omit<BatchRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
        const docRef = await addDoc(collection(db, 'batches'), {
            ...data,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        return docRef.id;
    },

    async updateBatchStatus(id: string, status: BatchRecord['status'], completedCount?: number): Promise<void> {
        const docRef = doc(db, 'batches', id);
        const updates: any = {
            status,
            updatedAt: serverTimestamp()
        };
        if (completedCount !== undefined) {
            updates.completedVariations = completedCount;
        }
        await updateDoc(docRef, updates);
    },

    async addResult(batchId: string, result: Omit<BatchResult, 'id' | 'batchId'>): Promise<void> {
        // Results are stored in a sub-collection to avoid document size limits
        const resultRef = doc(collection(db, 'batches', batchId, 'results'));
        await setDoc(resultRef, {
            ...result,
            batchId,
            createdAt: serverTimestamp()
        });
    },

    async getBatch(id: string): Promise<BatchRecord | null> {
        const docRef = doc(db, 'batches', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return { id: docSnap.id, ...docSnap.data() } as BatchRecord;
        }
        return null;
    },

    async getBatchResults(batchId: string): Promise<BatchResult[]> {
        const querySnapshot = await getDocs(collection(db, 'batches', batchId, 'results'));
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BatchResult));
    }
};
