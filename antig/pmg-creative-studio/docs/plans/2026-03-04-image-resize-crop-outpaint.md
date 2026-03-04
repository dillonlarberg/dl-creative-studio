# Image Resize: Interactive Crop & AI Outpaint — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the auto-crop image resize with an interactive drag+zoom crop editor (react-easy-crop) and add AI outpainting via Google Imagen when the source image is too small to fill the 1080×1920 Instagram Story frame.

**Architecture:** Client-side crop editor using react-easy-crop feeds `croppedAreaPixels` into a Canvas export. When the image doesn't cover the frame, a Cloud Function calls Google Imagen to outpaint the gaps. The result replaces the source image in the editor for final positioning.

**Tech Stack:** react-easy-crop, HTML Canvas, Google Imagen API (via @google/generative-ai), Firebase Cloud Functions, Firebase Storage

---

### Task 1: Install react-easy-crop

**Files:**
- Modify: `package.json`

**Step 1: Install the dependency**

Run: `npm install react-easy-crop`

**Step 2: Verify it installed**

Run: `npm ls react-easy-crop`
Expected: `react-easy-crop@x.x.x`

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add react-easy-crop dependency"
```

---

### Task 2: Create getCroppedImg utility

**Files:**
- Create: `src/utils/cropImage.ts`

**Step 1: Create the utility file**

```typescript
// src/utils/cropImage.ts
import type { Area } from 'react-easy-crop';

const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.src = url;
        image.onload = () => resolve(image);
        image.onerror = (error) => reject(error);
    });

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
```

**Step 2: Verify build passes**

Run: `npm run build`
Expected: No errors

**Step 3: Commit**

```bash
git add src/utils/cropImage.ts
git commit -m "feat: add getCroppedImg and doesImageCoverCrop utilities"
```

---

### Task 3: Update wizard steps and add crop state variables

**Files:**
- Modify: `src/pages/use-cases/UseCaseWizardPage.tsx` (lines 19-23, 150-163)

**Step 1: Update WIZARD_STEPS for image-resize**

Change lines 19-23 from:
```typescript
'image-resize': [
    { id: 'upload', name: 'Select Image' },
    { id: 'preview', name: 'Instagram Story Preview' },
    { id: 'download', name: 'Download' },
],
```
To:
```typescript
'image-resize': [
    { id: 'upload', name: 'Select Image' },
    { id: 'crop', name: 'Crop & Position' },
    { id: 'preview', name: 'Story Preview' },
    { id: 'download', name: 'Download' },
],
```

**Step 2: Add imports at top of file**

Add after existing imports (line ~15):
```typescript
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { getCroppedImg, doesImageCoverCrop } from '../../utils/cropImage';
```

**Step 3: Add crop state variables**

Add after `const [localImageOutputUrl, ...]` (around line 161):
```typescript
const [crop, setCrop] = useState({ x: 0, y: 0 });
const [zoom, setZoom] = useState(1);
const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
const [sourceImageDimensions, setSourceImageDimensions] = useState<{ width: number; height: number } | null>(null);
const [isOutpainting, setIsOutpainting] = useState(false);
```

**Step 4: Remove the `resizeToInstagramStoryBlob` function**

Delete lines 90-136 (the old `resizeToInstagramStoryBlob` function). It is no longer needed since the crop utility replaces it.

**Step 5: Add a useEffect to load source image dimensions when entering the crop step**

Add after the existing `useEffect` blocks (around line 243):
```typescript
// Load source image dimensions when entering crop step
useEffect(() => {
    if (useCaseId !== 'image-resize') return;
    if (steps[currentStep]?.id !== 'crop') return;

    const imageUrl = stepData.imageUrl || creative?.stepData?.upload?.imageUrl;
    if (!imageUrl) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
        setSourceImageDimensions({ width: img.width, height: img.height });
    };
    img.src = imageUrl;
}, [useCaseId, currentStep, stepData.imageUrl, creative?.stepData?.upload?.imageUrl]);
```

**Step 6: Verify build passes**

Run: `npm run build`
Expected: May have unused-variable warnings for crop imports until Task 4; that's acceptable.

**Step 7: Commit**

```bash
git add src/pages/use-cases/UseCaseWizardPage.tsx
git commit -m "feat: add crop step to image-resize wizard and crop state variables"
```

---

### Task 4: Build the crop step UI

**Files:**
- Modify: `src/pages/use-cases/UseCaseWizardPage.tsx` (insert after line ~1110, where `upload` step rendering ends)

**Step 1: Add the crop step rendering block**

Insert after the upload step's closing `)}` (around line 1110) and before the existing `preview` step block:

```tsx
{steps[currentStep].id === 'crop' && (
    <div className="space-y-4">
        <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">
                Drag to position · Scroll or use slider to zoom
            </p>
        </div>

        {/* Crop editor container */}
        <div className="relative mx-auto w-full max-w-sm" style={{ height: 480 }}>
            <Cropper
                image={
                    stepData.outpaintedImageUrl ||
                    stepData.imageUrl ||
                    creative?.stepData?.upload?.imageUrl ||
                    ''
                }
                crop={crop}
                zoom={zoom}
                aspect={9 / 16}
                objectFit="contain"
                showGrid={true}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, pixelArea) => setCroppedAreaPixels(pixelArea)}
                style={{
                    containerStyle: { borderRadius: '1rem', overflow: 'hidden' },
                }}
            />
        </div>

        {/* Zoom slider */}
        <div className="mx-auto max-w-sm space-y-2">
            <div className="flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Zoom</span>
                <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">{zoom.toFixed(1)}x</span>
            </div>
            <input
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full accent-blue-600"
            />
        </div>

        {/* Coverage indicator + AI Expand button */}
        {sourceImageDimensions && croppedAreaPixels && (
            <div className="mx-auto max-w-sm">
                {doesImageCoverCrop(
                    sourceImageDimensions.width,
                    sourceImageDimensions.height,
                    croppedAreaPixels
                ) ? (
                    <div className="rounded-xl border border-green-100 bg-green-50/50 p-3 text-center">
                        <p className="text-[10px] font-black uppercase tracking-widest text-green-700">
                            Image fully covers frame
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3 text-center">
                            <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">
                                Image doesn't fully cover the frame — gaps will be visible
                            </p>
                        </div>
                        <button
                            onClick={async () => {
                                // TODO: Task 6 — wire up outpainting
                            }}
                            disabled={isOutpainting}
                            className="w-full rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 transition-all"
                        >
                            {isOutpainting ? (
                                <span className="flex items-center justify-center gap-2">
                                    <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                    Expanding with AI...
                                </span>
                            ) : (
                                <span className="flex items-center justify-center gap-2">
                                    <SparklesIcon className="h-4 w-4" />
                                    Expand with AI
                                </span>
                            )}
                        </button>
                    </div>
                )}
            </div>
        )}
    </div>
)}
```

**Step 2: Verify build passes**

Run: `npm run build`
Expected: PASS

**Step 3: Manual test**

Run: `npm run dev`
- Navigate to image-resize wizard
- Select an image
- Click Next — you should now see the crop editor on step 2
- Drag to reposition, use slider to zoom
- Coverage indicator should show green (covers) or amber (gaps)

**Step 4: Commit**

```bash
git add src/pages/use-cases/UseCaseWizardPage.tsx
git commit -m "feat: add interactive crop & position editor UI with react-easy-crop"
```

---

### Task 5: Wire up handleNext for crop step

**Files:**
- Modify: `src/pages/use-cases/UseCaseWizardPage.tsx` (inside the `if (useCaseId === 'image-resize')` block, around lines 562-676)

**Step 1: Rewrite the image-resize handleNext logic**

Replace the entire `if (useCaseId === 'image-resize') { ... }` block (lines 562-677) with:

```typescript
if (useCaseId === 'image-resize') {
    const currentStepId = steps[currentStep].id;

    if (currentStepId === 'upload') {
        // Validate an image is selected
        const sourceImageUrl =
            currentStepData.imageUrl ||
            updatedStepData.upload?.imageUrl ||
            creative?.stepData?.upload?.imageUrl;

        if (!sourceImageUrl && !uploadedImageBlob) {
            alert('Please upload an image first.');
            setCurrentStep(nextStep - 1);
            return;
        }

        // If user uploaded a local blob, upload to Storage first for the crop step
        if (uploadedImageBlob && !sourceImageUrl) {
            try {
                const uploadPath = `uploads/${client.slug}/${activeCreativeId}/source_${Date.now()}.jpg`;
                const uploadRef = ref(storage, uploadPath);
                await uploadBytes(uploadRef, uploadedImageBlob, { contentType: 'image/jpeg' });
                const url = await getDownloadURL(uploadRef);
                const uploadStepData = { ...currentStepData, imageUrl: url };
                setStepData(uploadStepData);
                updatedStepData.upload = uploadStepData;
                setUploadedImageBlob(null);
            } catch (err) {
                console.error('[Image-Resize] Failed to upload source:', err);
                alert('Failed to upload image. Please try again.');
                setCurrentStep(nextStep - 1);
                return;
            }
        }

        // Reset crop state for the incoming crop step
        setCrop({ x: 0, y: 0 });
        setZoom(1);
        setCroppedAreaPixels(null);
        setSourceImageDimensions(null);
        setLocalImageOutputUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
        });

        await creativeService.updateCreative(activeCreativeId!, {
            currentStep: nextStep,
            stepData: updatedStepData,
        });

    } else if (currentStepId === 'crop') {
        // Generate the cropped output
        if (!croppedAreaPixels) {
            alert('Please adjust the crop before continuing.');
            setCurrentStep(nextStep - 1);
            return;
        }

        const imageUrl =
            stepData.outpaintedImageUrl ||
            stepData.imageUrl ||
            updatedStepData.upload?.imageUrl ||
            creative?.stepData?.upload?.imageUrl;

        if (!imageUrl) {
            alert('No source image found.');
            setCurrentStep(nextStep - 1);
            return;
        }

        try {
            const outputBlob = await getCroppedImg(
                imageUrl,
                croppedAreaPixels,
                INSTAGRAM_STORY_WIDTH,
                INSTAGRAM_STORY_HEIGHT
            );

            const localOutputUrl = URL.createObjectURL(outputBlob);
            setLocalImageOutputUrl((prev) => {
                if (prev) URL.revokeObjectURL(prev);
                return localOutputUrl;
            });

            const persistedPreviewData = {
                sourceImageUrl: imageUrl,
                crop,
                zoom,
                croppedAreaPixels,
                wasOutpainted: !!stepData.outpaintedImageUrl,
                outpaintedImageUrl: stepData.outpaintedImageUrl || undefined,
                outputUrl: '',
                width: INSTAGRAM_STORY_WIDTH,
                height: INSTAGRAM_STORY_HEIGHT,
                format: 'jpeg',
            };

            const seededStepData = {
                ...updatedStepData,
                crop: persistedPreviewData,
                preview: persistedPreviewData,
                download: persistedPreviewData,
            };

            await creativeService.updateCreative(activeCreativeId!, {
                currentStep: nextStep,
                stepData: seededStepData,
            });
            setStepData({ ...persistedPreviewData, localOutputUrl });

            // Background upload
            void (async () => {
                try {
                    const outputPath = `results/${client.slug}/${activeCreativeId}/story_${Date.now()}.jpg`;
                    const outputRef = ref(storage, outputPath);
                    await uploadBytes(outputRef, outputBlob, { contentType: 'image/jpeg' });
                    const outputUrl = await getDownloadURL(outputRef);

                    const uploadedData = { ...persistedPreviewData, outputUrl };
                    const finalStepData = {
                        ...seededStepData,
                        preview: uploadedData,
                        download: uploadedData,
                    };

                    await creativeService.updateCreative(activeCreativeId!, {
                        stepData: finalStepData,
                    });
                    setStepData((prev) => ({ ...prev, outputUrl }));
                    const refreshed = await creativeService.getCreative(activeCreativeId!);
                    if (refreshed) setCreative(refreshed);
                } catch (err) {
                    console.error('[Image-Resize] Failed to upload cropped output:', err);
                }
            })();
        } catch (err) {
            console.error('[Image-Resize] Crop failed:', err);
            alert(`Crop failed: ${err instanceof Error ? err.message : String(err)}`);
            setCurrentStep(nextStep - 1);
            return;
        }

    } else if (currentStepId === 'preview') {
        const downloadData = updatedStepData.preview || currentStepData;
        if (!downloadData.outputUrl && !downloadData.localOutputUrl && !localImageOutputUrl) {
            alert('Preview is still generating. Please wait a moment and try again.');
            setCurrentStep(nextStep - 1);
            return;
        }
        const persistedDownloadData = { ...downloadData };
        delete persistedDownloadData.localOutputUrl;
        const finalStepData = {
            ...updatedStepData,
            download: persistedDownloadData,
        };

        await creativeService.updateCreative(activeCreativeId!, {
            currentStep: nextStep,
            status: 'completed',
            stepData: finalStepData,
        });
        const refreshed = await creativeService.getCreative(activeCreativeId!);
        if (refreshed) setCreative(refreshed);
        setStepData(downloadData);
        await fetchHistory();
    }
}
```

**Step 2: Update isNextDisabled to handle crop step**

Find the `isNextDisabled` check for `image-resize` (around line 705) and replace:
```typescript
(
    useCaseId === 'image-resize' && (
        steps[currentStep]?.id === 'upload' && !stepData.imageUrl
    )
)
```
With:
```typescript
(
    useCaseId === 'image-resize' && (
        (steps[currentStep]?.id === 'upload' && !stepData.imageUrl) ||
        (steps[currentStep]?.id === 'crop' && !croppedAreaPixels)
    )
)
```

**Step 3: Verify build passes**

Run: `npm run build`
Expected: PASS

**Step 4: Manual test**

Run: `npm run dev`
- Select an image → Next → Crop editor appears
- Adjust crop/zoom → Next → Preview shows cropped result at 1080×1920
- Next → Download page with download link

**Step 5: Commit**

```bash
git add src/pages/use-cases/UseCaseWizardPage.tsx
git commit -m "feat: wire crop step into handleNext with Canvas export and background upload"
```

---

### Task 6: Create outpaintImage Cloud Function

**Files:**
- Create: `functions/src/image.ts`
- Modify: `functions/src/index.ts` (add export)

**Step 1: Create the Cloud Function**

```typescript
// functions/src/image.ts
import * as functions from "firebase-functions";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const outpaintImage = functions
    .runWith({
        secrets: ["GEMINI_API_KEY"],
        timeoutSeconds: 120,
        memory: "1GB",
    })
    .https.onCall(async (data: {
        imageBase64: string;
        maskBase64: string;
        prompt?: string;
    }) => {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

        const { imageBase64, maskBase64, prompt } = data;
        if (!imageBase64 || !maskBase64) {
            throw new functions.https.HttpsError(
                "invalid-argument",
                "Missing imageBase64 or maskBase64."
            );
        }

        const editPrompt = prompt ||
            "Extend the image naturally, maintaining consistent style, lighting, colors, and content. Fill the masked areas seamlessly.";

        try {
            functions.logger.info("Starting Imagen outpaint request");

            const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

            const result = await model.generateContent({
                contents: [{
                    role: "user",
                    parts: [
                        { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
                        { inlineData: { mimeType: "image/png", data: maskBase64 } },
                        { text: `This is an image with a mask. The black areas in the mask indicate regions that need to be filled with generated content. ${editPrompt}` },
                    ],
                }],
                generationConfig: {
                    temperature: 0.4,
                    maxOutputTokens: 8192,
                },
            });

            // Extract the generated image from the response
            const response = result.response;
            const parts = response.candidates?.[0]?.content?.parts;

            if (!parts) {
                throw new Error("No parts in Gemini response");
            }

            // Look for inline image data in the response
            const imagePart = parts.find(
                (p: any) => p.inlineData?.mimeType?.startsWith("image/")
            );

            if (imagePart && imagePart.inlineData) {
                return {
                    status: "success",
                    imageBase64: imagePart.inlineData.data,
                    mimeType: imagePart.inlineData.mimeType,
                };
            }

            // If no image returned, the model may have returned text instead
            const textPart = parts.find((p: any) => p.text);
            throw new Error(
                `Gemini did not return an image. Response: ${textPart?.text || "empty"}`
            );
        } catch (err: any) {
            functions.logger.error("Imagen Outpaint Failed", err);
            throw new functions.https.HttpsError(
                "internal",
                `Outpaint failed: ${err.message}`
            );
        }
    });
```

> **Note:** This uses `gemini-2.0-flash-exp` which supports image generation. If this model isn't available or doesn't return images reliably, you may need to swap to the Imagen API via `@google-cloud/aiplatform`. The function structure stays the same — only the API call changes. Test this early and adjust the model name as needed.

**Step 2: Add export to index.ts**

In `functions/src/index.ts`, add after line 9:
```typescript
export * from "./image";
```

**Step 3: Verify functions build**

Run: `npm --prefix functions run build`
Expected: PASS

**Step 4: Commit**

```bash
git add functions/src/image.ts functions/src/index.ts
git commit -m "feat: add outpaintImage Cloud Function using Gemini"
```

---

### Task 7: Create imageService client-side service

**Files:**
- Create: `src/services/imageService.ts`

**Step 1: Create the service**

```typescript
// src/services/imageService.ts
import { functions } from "../firebase";
import { httpsCallable } from "firebase/functions";

export const imageService = {
    /**
     * Call the Cloud Function to outpaint an image using Gemini.
     * @param imageBase64 - The composite image with gaps (base64, no data: prefix)
     * @param maskBase64 - The mask: white = keep, black = fill (base64 PNG, no data: prefix)
     * @param prompt - Optional prompt to guide the outpainting
     * @returns Base64 string of the outpainted image
     */
    async outpaintImage(
        imageBase64: string,
        maskBase64: string,
        prompt?: string
    ): Promise<{ imageBase64: string; mimeType: string }> {
        const outpaint = httpsCallable(functions, "outpaintImage", {
            timeout: 180000,
        });
        const result = await outpaint({ imageBase64, maskBase64, prompt });
        const data = result.data as any;

        if (data.status === "success") {
            return {
                imageBase64: data.imageBase64,
                mimeType: data.mimeType,
            };
        }
        throw new Error("Outpainting failed.");
    },
};
```

**Step 2: Verify build passes**

Run: `npm run build`
Expected: PASS

**Step 3: Commit**

```bash
git add src/services/imageService.ts
git commit -m "feat: add imageService with outpaintImage client call"
```

---

### Task 8: Wire up the "Expand with AI" button

**Files:**
- Modify: `src/pages/use-cases/UseCaseWizardPage.tsx`

**Step 1: Add import for imageService**

Add near the other service imports (around line 12):
```typescript
import { imageService } from '../../services/imageService';
```

**Step 2: Add the compositeAndMask helper function**

Add after the existing imports and before the `WIZARD_STEPS` constant (around line 17):

```typescript
/**
 * Composites the source image at a given crop position onto a 1080×1920 canvas
 * and generates a mask (white = image, black = gap).
 * Returns both as base64 strings (without data: prefix).
 */
async function compositeAndMask(
    imageUrl: string,
    crop: { x: number; y: number },
    zoom: number,
    targetWidth: number,
    targetHeight: number
): Promise<{ compositeBase64: string; maskBase64: string }> {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.crossOrigin = 'anonymous';
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Failed to load image'));
        el.src = imageUrl;
    });

    // react-easy-crop positions the image such that the crop area is the "viewport".
    // The image's natural size scaled by zoom determines its drawn size.
    // crop.x and crop.y represent the offset of the crop area from the image center.
    const scaledW = img.width * zoom;
    const scaledH = img.height * zoom;
    const drawX = (targetWidth / 2) - (scaledW / 2) - crop.x;
    const drawY = (targetHeight / 2) - (scaledH / 2) - crop.y;

    // Composite canvas
    const compCanvas = document.createElement('canvas');
    compCanvas.width = targetWidth;
    compCanvas.height = targetHeight;
    const compCtx = compCanvas.getContext('2d')!;
    compCtx.fillStyle = '#000000';
    compCtx.fillRect(0, 0, targetWidth, targetHeight);
    compCtx.drawImage(img, drawX, drawY, scaledW, scaledH);

    // Mask canvas: white where image is, black where gaps are
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = targetWidth;
    maskCanvas.height = targetHeight;
    const maskCtx = maskCanvas.getContext('2d')!;
    maskCtx.fillStyle = '#000000';
    maskCtx.fillRect(0, 0, targetWidth, targetHeight);
    maskCtx.fillStyle = '#ffffff';
    // Clamp the drawn rectangle to canvas bounds for the mask
    const mx = Math.max(0, drawX);
    const my = Math.max(0, drawY);
    const mw = Math.min(drawX + scaledW, targetWidth) - mx;
    const mh = Math.min(drawY + scaledH, targetHeight) - my;
    if (mw > 0 && mh > 0) {
        maskCtx.fillRect(mx, my, mw, mh);
    }

    const compositeBase64 = compCanvas.toDataURL('image/jpeg', 0.92).split(',')[1];
    const maskBase64 = maskCanvas.toDataURL('image/png').split(',')[1];

    return { compositeBase64, maskBase64 };
}
```

**Step 3: Wire the onClick handler for the "Expand with AI" button**

In the crop step UI (Task 4), replace the `onClick` TODO:
```typescript
onClick={async () => {
    // TODO: Task 6 — wire up outpainting
}}
```
With:
```typescript
onClick={async () => {
    const imageUrl =
        stepData.imageUrl ||
        creative?.stepData?.upload?.imageUrl;
    if (!imageUrl) {
        alert('No source image found.');
        return;
    }

    setIsOutpainting(true);
    try {
        const { compositeBase64, maskBase64 } = await compositeAndMask(
            imageUrl,
            crop,
            zoom,
            INSTAGRAM_STORY_WIDTH,
            INSTAGRAM_STORY_HEIGHT
        );

        const result = await imageService.outpaintImage(
            compositeBase64,
            maskBase64
        );

        // Convert returned base64 to a blob URL for the cropper
        const byteChars = atob(result.imageBase64);
        const byteArray = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) {
            byteArray[i] = byteChars.charCodeAt(i);
        }
        const outpaintedBlob = new Blob([byteArray], { type: result.mimeType });

        // Upload to Storage for persistence
        const outpaintPath = `uploads/${client.slug}/${creativeId}/outpainted_${Date.now()}.jpg`;
        const outpaintRef = ref(storage, outpaintPath);
        await uploadBytes(outpaintRef, outpaintedBlob, { contentType: result.mimeType });
        const outpaintedUrl = await getDownloadURL(outpaintRef);

        // Replace the source image in the cropper with the expanded version
        setStepData((prev) => ({
            ...prev,
            outpaintedImageUrl: outpaintedUrl,
        }));

        // Reset crop/zoom since the image is now different
        setCrop({ x: 0, y: 0 });
        setZoom(1);
        setCroppedAreaPixels(null);
        setSourceImageDimensions(null); // will be recalculated by useEffect
    } catch (err) {
        console.error('[Outpaint] Failed:', err);
        alert(`AI expansion failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
        setIsOutpainting(false);
    }
}}
```

**Step 4: Verify build passes**

Run: `npm run build`
Expected: PASS

**Step 5: Commit**

```bash
git add src/pages/use-cases/UseCaseWizardPage.tsx
git commit -m "feat: wire AI outpaint button to Gemini Cloud Function"
```

---

### Task 9: End-to-end manual testing

**Files:** None (testing only)

**Step 1: Deploy the Cloud Function**

Run: `npm --prefix functions run deploy`

> If you don't have deploy permissions, use: `npm --prefix functions run serve` for local emulator testing instead.

**Step 2: Test the standard crop flow (large image)**

1. Run `npm run dev`
2. Navigate to Create → Resize Image
3. Select a large image (> 1080×1920) from Alli or upload
4. Click Next → Crop editor appears
5. Drag to reposition, adjust zoom
6. Verify green "Image fully covers frame" indicator
7. Click Next → Preview shows correctly cropped 9:16 output
8. Click Next → Download link works

**Step 3: Test the outpaint flow (small image)**

1. Upload a small image (e.g., 500×500)
2. Click Next → Crop editor appears
3. Verify amber "doesn't fully cover" warning appears
4. Click "Expand with AI"
5. Wait for Gemini response (~10-30s)
6. Verify the cropper updates with the expanded image
7. Adjust crop if needed → Next → Preview → Download

**Step 4: Test edge cases**

- Upload a local file (not Alli) → verify it works through the full flow
- Try going back from crop step to upload → re-select image → verify crop resets
- Reload the page mid-flow → verify the creative resumes correctly from Firestore

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during e2e testing"
```

---

## Summary of files changed

| Action | File |
|--------|------|
| Install | `react-easy-crop` (npm) |
| Create | `src/utils/cropImage.ts` |
| Create | `src/services/imageService.ts` |
| Create | `functions/src/image.ts` |
| Modify | `functions/src/index.ts` (add export) |
| Modify | `src/pages/use-cases/UseCaseWizardPage.tsx` (wizard steps, state, crop UI, handleNext, outpaint wiring) |
