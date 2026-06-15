import { db } from '../firebase';
import { Timestamp, collection, addDoc, updateDoc, deleteDoc, doc, getDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { paths } from '../platform/firebase/paths';
import type { AppId, ClientSlug, CreativeId } from '../platform/firebase/paths';

export interface CreativeRecord {
    id: string;
    clientSlug: string;
    appId: string;
    status: 'draft' | 'processing' | 'completed' | 'failed';
    stepData: Record<string, any>;
    currentStep: number;
    createdAt: any;
    updatedAt: any;
    expiresAt?: any;
}

export const creativeService = {
    async createCreative(clientSlug: ClientSlug, appId: AppId): Promise<CreativeId> {
        const docRef = await addDoc(collection(db, paths.creatives(clientSlug, appId)), {
            clientSlug,
            appId,
            status: 'draft',
            stepData: {},
            currentStep: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            expiresAt: Timestamp.fromMillis(Date.now() + 72 * 60 * 60 * 1000),
        });
        return docRef.id;
    },

    async getCreative(clientSlug: ClientSlug, appId: AppId, creativeId: CreativeId): Promise<CreativeRecord | null> {
        const docRef = doc(db, paths.creative(clientSlug, appId, creativeId));
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return { id: docSnap.id, ...docSnap.data() } as CreativeRecord;
        }
        return null;
    },

    async updateCreative(clientSlug: ClientSlug, appId: AppId, creativeId: CreativeId, updates: Partial<CreativeRecord>): Promise<void> {
        const docRef = doc(db, paths.creative(clientSlug, appId, creativeId));
        await updateDoc(docRef, {
            ...updates,
            updatedAt: serverTimestamp(),
            expiresAt: Timestamp.fromMillis(Date.now() + 72 * 60 * 60 * 1000),
        });
    },

    async getClientCreatives(clientSlug: ClientSlug, appId: AppId): Promise<CreativeRecord[]> {
        const querySnapshot = await getDocs(collection(db, paths.creatives(clientSlug, appId)));
        const items = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as CreativeRecord));
        return items.sort((a, b) => {
            const timeA = a.createdAt?.seconds ?? 0;
            const timeB = b.createdAt?.seconds ?? 0;
            return timeB - timeA;
        });
    },

    async deleteCreative(clientSlug: ClientSlug, appId: AppId, creativeId: CreativeId): Promise<void> {
        const docRef = doc(db, paths.creative(clientSlug, appId, creativeId));
        await deleteDoc(docRef);
    },
};
