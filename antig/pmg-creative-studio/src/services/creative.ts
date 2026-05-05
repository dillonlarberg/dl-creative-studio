import { db } from '../firebase';
import { collection, addDoc, updateDoc, doc, getDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { paths } from '../platform/firebase/paths';
import type { AppId, ClientSlug, CreativeId } from '../platform/firebase/paths';

export interface CreativeRecord {
    id: string;
    clientSlug: string;
    appId: string;
    status: 'draft' | 'processing' | 'completed' | 'failed';
    stepData: Record<string, any>;
    currentStep: number;
    resultUrls?: string[];
    createdAt: any;
    updatedAt: any;
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

    async simulateGeneration(clientSlug: ClientSlug, appId: AppId, creativeId: CreativeId): Promise<void> {
        await this.updateCreative(clientSlug, appId, creativeId, { status: 'processing' });
        const record = await this.getCreative(clientSlug, appId, creativeId);
        const wireframeFile = record?.stepData?.context?.wireframeFile;

        return new Promise((resolve) => {
            setTimeout(async () => {
                const results = wireframeFile
                    ? [`/template_examples/social/${wireframeFile}`]
                    : ['https://picsum.photos/1080/1080'];
                await this.updateCreative(clientSlug, appId, creativeId, {
                    status: 'completed',
                    resultUrls: results,
                });
                resolve();
            }, 3000);
        });
    },
};
