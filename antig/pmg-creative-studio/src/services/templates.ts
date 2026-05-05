import { db } from '../firebase';
import { collection, addDoc, doc, getDocs, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { paths } from '../platform/firebase/paths';
import type { ClientSlug } from '../platform/firebase/paths';

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
    async saveTemplate(clientSlug: ClientSlug, name: string, config: TemplateRecord['config'], scaffoldId: string): Promise<string> {
        const docRef = await addDoc(collection(db, paths.templates(clientSlug)), {
            clientSlug,
            name,
            config,
            scaffoldId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        return docRef.id;
    },

    async getTemplates(clientSlug: ClientSlug): Promise<TemplateRecord[]> {
        const querySnapshot = await getDocs(collection(db, paths.templates(clientSlug)));
        return querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as TemplateRecord));
    },

    async deleteTemplate(clientSlug: ClientSlug, templateId: string): Promise<void> {
        await deleteDoc(doc(db, paths.template(clientSlug, templateId)));
    },
};
