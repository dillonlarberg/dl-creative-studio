import { storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const EXTRACT_API_URL = (import.meta.env.VITE_EXTRACT_API_URL || '').replace(/\/$/, '');

interface ExtractForegroundResponse {
    url: string;
    maskUrl?: string;
}

interface SaveEditedImageResponse {
    url: string;
}

export const imageEditService = {
    /**
     * Calls the Vercel serverless function to remove background via Replicate.
     * Returns a URL to the transparent PNG.
     */
    async extractForeground(imageUrl: string): Promise<ExtractForegroundResponse> {
        if (!EXTRACT_API_URL) {
            throw new Error('VITE_EXTRACT_API_URL is not configured');
        }

        const response = await fetch(`${EXTRACT_API_URL}/api/extract-foreground`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl }),
        });

        if (!response.ok) {
            const detail = await response.text();
            throw new Error(detail || `Extraction failed (${response.status})`);
        }

        return response.json() as Promise<ExtractForegroundResponse>;
    },

    /**
     * Uploads the final composite blob to Firebase Storage and returns the download URL.
     */
    async saveEditedImage(
        blob: Blob,
        meta: { clientSlug: string; imageName: string },
    ): Promise<SaveEditedImageResponse> {
        const fileName = `edited_${Date.now()}_${meta.imageName}`;
        const storageRef = ref(storage, `edit-image/${meta.clientSlug}/${fileName}`);
        await uploadBytes(storageRef, blob);
        const url = await getDownloadURL(storageRef);
        return { url };
    },
};
