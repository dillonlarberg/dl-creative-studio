import { db } from '../firebase';
import { collection, addDoc, updateDoc, doc, getDoc, query, where, getDocs, orderBy, serverTimestamp } from 'firebase/firestore';

export interface CreativeRecord {
    id: string;
    clientSlug: string;
    useCaseId: string;
    status: 'draft' | 'processing' | 'completed' | 'failed';
    stepData: Record<string, any>;
    currentStep: number;
    resultUrls?: string[];
    createdAt: any;
    updatedAt: any;
}

export const creativeService = {
    async createCreative(clientSlug: string, useCaseId: string): Promise<string> {
        const docRef = await addDoc(collection(db, 'creatives'), {
            clientSlug,
            useCaseId,
            status: 'draft',
            stepData: {},
            currentStep: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        return docRef.id;
    },

    async updateCreative(id: string, updates: Partial<CreativeRecord>): Promise<void> {
        const docRef = doc(db, 'creatives', id);
        await updateDoc(docRef, {
            ...updates,
            updatedAt: serverTimestamp()
        });
    },

    async getCreative(id: string): Promise<CreativeRecord | null> {
        const docRef = doc(db, 'creatives', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return { id: docSnap.id, ...docSnap.data() } as CreativeRecord;
        }
        return null;
    },

    async getClientCreatives(clientSlug: string): Promise<CreativeRecord[]> {
        const q = query(
            collection(db, 'creatives'),
            where('clientSlug', '==', clientSlug),
            orderBy('createdAt', 'desc')
        );
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CreativeRecord));
    },

    async simulateGeneration(id: string): Promise<void> {
        await this.updateCreative(id, { status: 'processing' });

        // Simulate background processing
        return new Promise((resolve) => {
            setTimeout(async () => {
                await this.updateCreative(id, {
                    status: 'completed',
                    resultUrls: ['https://picsum.photos/1080/1080'] // Placeholder result
                });
                resolve();
            }, 3000);
        });
    }
};
