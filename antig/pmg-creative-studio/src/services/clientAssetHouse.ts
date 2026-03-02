import { db, storage } from '../firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export interface AssetHouseItem {
    id: string;
    url: string;
    name: string;
    type: 'logo' | 'color' | 'font' | 'other';
    value?: string;
}

export interface BrandVariable {
    id: string;
    name: string;
    type: 'color' | 'font' | 'number' | 'text';
    value: string;
}

export interface ClientAssetHouse {
    clientSlug: string;
    // Core Brand Standards (Statics for blocking logic)
    primaryColor: string;
    fontPrimary: string;
    logoPrimary?: string; // URL
    logoInverse?: string; // URL
    logoFavicon?: string; // URL
    // Dynamic Brand Standards
    variables: BrandVariable[];
    // Layout Tokens (Static but often useful)
    spacingBase?: string;
    cornerRadius?: string;
    // General Repository
    assets: AssetHouseItem[];
    lastUpdated: string;
}

export const clientAssetHouseService = {
    checkBrandStandards(house: ClientAssetHouse | null): boolean {
        if (!house) return false;
        return !!(
            house.primaryColor &&
            house.fontPrimary &&
            house.logoPrimary &&
            house.logoInverse
        );
    },

    async getAssetHouse(clientSlug: string): Promise<ClientAssetHouse | null> {
        const docRef = doc(db, 'clientAssetHouse', clientSlug);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            return {
                ...data,
                assets: data.assets || [],
                variables: data.variables || []
            } as ClientAssetHouse;
        }
        return null;
    },

    async saveAssetHouse(clientSlug: string, data: Partial<ClientAssetHouse>): Promise<void> {
        const docRef = doc(db, 'clientAssetHouse', clientSlug);
        const existing = await this.getAssetHouse(clientSlug);

        const payload = {
            ...data,
            clientSlug,
            lastUpdated: new Date().toISOString()
        };

        if (existing) {
            await updateDoc(docRef, payload);
        } else {
            await setDoc(docRef, payload);
        }
    },

    async uploadAsset(clientSlug: string, file: File | Blob, path: string, customName?: string): Promise<string> {
        const name = customName || (file as File).name || 'asset';
        const fileRef = ref(storage, `clients/${clientSlug}/assets/${path}/${name}`);
        const snapshot = await uploadBytes(fileRef, file);
        return await getDownloadURL(snapshot.ref);
    },

    loadCustomFont(fontName: string, fontUrl: string) {
        if (!fontName || !fontUrl) return;

        // Check if font is already loaded
        const existingStyle = document.getElementById(`font-${fontName}`);
        if (existingStyle) return;

        const style = document.createElement('style');
        style.id = `font-${fontName}`;
        style.textContent = `
            @font-face {
                font-family: '${fontName}';
                src: url('${fontUrl}');
                font-display: swap;
            }
        `;
        document.head.appendChild(style);
        console.log(`Dynamic font loaded: ${fontName}`);
    }
};
