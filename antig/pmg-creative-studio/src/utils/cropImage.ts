import type { Area } from 'react-easy-crop';

const PROXY_BASE = 'https://us-central1-automated-creative-e10d7.cloudfunctions.net';

/** Route Alli CDN URLs through our image proxy to avoid CORS issues. */
const resolveImageUrl = (url: string): string => {
    try {
        const parsed = new URL(url);
        if (parsed.hostname.includes('alliplatform.com')) {
            return `${PROXY_BASE}/imageProxy?url=${encodeURIComponent(url)}`;
        }
    } catch { /* not a valid URL, pass through */ }
    return url;
};

const createImage = async (url: string): Promise<HTMLImageElement> => {
    const resolved = resolveImageUrl(url);
    const response = await fetch(resolved);
    if (!response.ok) throw new Error(`Failed to fetch image (${response.status})`);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    return new Promise((resolve, reject) => {
        const image = new Image();
        image.addEventListener('load', () => {
            URL.revokeObjectURL(blobUrl);
            resolve(image);
        });
        image.addEventListener('error', () => {
            URL.revokeObjectURL(blobUrl);
            reject(new Error(`Failed to decode image from: ${url.slice(0, 100)}`));
        });
        image.src = blobUrl;
    });
};

export async function getCroppedImg(
    imageSrc: string,
    croppedAreaPixels: Area,
    outputWidth: number = 1080,
    outputHeight: number = 1920,
    quality: number = 0.92
): Promise<Blob> {
    const image = await createImage(imageSrc);

    // Extract the cropped region
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = croppedAreaPixels.width;
    cropCanvas.height = croppedAreaPixels.height;
    const cropCtx = cropCanvas.getContext('2d');
    if (!cropCtx) throw new Error('Could not get canvas context');

    cropCtx.drawImage(
        image,
        croppedAreaPixels.x,
        croppedAreaPixels.y,
        croppedAreaPixels.width,
        croppedAreaPixels.height,
        0,
        0,
        croppedAreaPixels.width,
        croppedAreaPixels.height
    );

    // Scale to target output dimensions
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = outputWidth;
    outputCanvas.height = outputHeight;
    const outCtx = outputCanvas.getContext('2d');
    if (!outCtx) throw new Error('Could not get output canvas context');

    outCtx.drawImage(cropCanvas, 0, 0, outputWidth, outputHeight);

    const blob = await new Promise<Blob | null>((resolve) => {
        outputCanvas.toBlob(resolve, 'image/jpeg', quality);
    });
    if (!blob) throw new Error('Failed to export cropped image');
    return blob;
}

/**
 * Checks whether the crop area extends beyond the source image bounds.
 * Returns true if the image fully covers the crop frame (no gaps).
 */
export function doesImageCoverCrop(
    imageWidth: number,
    imageHeight: number,
    croppedAreaPixels: Area
): boolean {
    return (
        croppedAreaPixels.x >= 0 &&
        croppedAreaPixels.y >= 0 &&
        croppedAreaPixels.x + croppedAreaPixels.width <= imageWidth &&
        croppedAreaPixels.y + croppedAreaPixels.height <= imageHeight
    );
}
