export interface ImageTextDetection {
    id: string;
    text: string;
    confidence: number;
    x: number;
    y: number;
    width: number;
    height: number;
    isBrandTerm: boolean;
    fontFamily?: string;
    fontFallbackApplied?: boolean;
}

export interface BackgroundCatalogItem {
    id: string;
    name: string;
    type: 'solid' | 'image';
    value: string;
    previewUrl?: string;
}

export interface RenderVariation {
    id: string;
    fileName: string;
    url: string;
    downloadUrl: string;
    backgroundId: string;
}

interface DetectTextResponse {
    detections: ImageTextDetection[];
    image: { width: number; height: number };
    ocrEngine: string;
}

interface RenderVariationsResponse {
    variations: RenderVariation[];
}

const BASE_URL = (import.meta.env.VITE_IMAGE_EDIT_API_URL || 'http://127.0.0.1:8001').replace(/\/$/, '');

async function parseResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Request failed (${response.status})`);
    }
    return response.json() as Promise<T>;
}

export const imageEditService = {
    async getBackgroundCatalog(): Promise<BackgroundCatalogItem[]> {
        const response = await fetch(`${BASE_URL}/assets/backgrounds`);
        const data = await parseResponse<{ backgrounds: BackgroundCatalogItem[] }>(response);
        return data.backgrounds;
    },

    async detectText(file: File, options: { brandTerms: string[]; brandFonts: string[] }): Promise<DetectTextResponse> {
        const form = new FormData();
        form.append('file', file);
        form.append('payload', JSON.stringify(options));

        const response = await fetch(`${BASE_URL}/detect-text`, {
            method: 'POST',
            body: form,
        });

        return parseResponse<DetectTextResponse>(response);
    },

    async renderVariations(file: File, payload: {
        backgroundId: string;
        variationCount: number;
        sourceName: string;
        confirmedDetections: Array<{
            id: string;
            text: string;
            x: number;
            y: number;
            width: number;
            height: number;
            fontFamily?: string;
            color?: string;
            include?: boolean;
        }>;
    }): Promise<RenderVariationsResponse> {
        const form = new FormData();
        form.append('file', file);
        form.append('payload', JSON.stringify(payload));

        const response = await fetch(`${BASE_URL}/render-variations`, {
            method: 'POST',
            body: form,
        });

        return parseResponse<RenderVariationsResponse>(response);
    },
};
