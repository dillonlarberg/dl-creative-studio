import { db } from '../firebase';
import { collection, addDoc, doc, query, where, getDocs, serverTimestamp, deleteDoc } from 'firebase/firestore';

export interface TemplateRecord {
    id: string;
    name: string;
    clientSlug: string;
    scaffoldId: string;
    config: {
        backgroundColor: string;
        accentColor: string;
        showLogo: boolean;
        showPrice: boolean;
        showCTA: boolean;
        overrideHeadline?: string;
    };
    thumbnailUrl?: string;
    createdAt: any;
    updatedAt: any;
}

export const templateService = {
    async saveTemplate(clientSlug: string, name: string, config: TemplateRecord['config'], scaffoldId: string): Promise<string> {
        const docRef = await addDoc(collection(db, 'templates'), {
            clientSlug,
            name,
            config,
            scaffoldId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        return docRef.id;
    },

    async getTemplates(clientSlug: string): Promise<TemplateRecord[]> {
        const q = query(
            collection(db, 'templates'),
            where('clientSlug', '==', clientSlug)
        );
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TemplateRecord));
    },

    async deleteTemplate(id: string): Promise<void> {
        await deleteDoc(doc(db, 'templates', id));
    }
};
