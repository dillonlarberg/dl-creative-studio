# Frontend Architecture Integration — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the edit-image frontend to use the Vercel/Replicate extraction API, add Fabric.js mask refinement, replace server-side preview with CSS layering, and use Canvas API for final export at Save.

**Architecture:** `imageEditService.ts` becomes a thin client calling the Vercel extract API. Canvas step gains Fabric.js overlay for mask editing. Preview step composites via CSS (instant, no API). Save step uses Canvas API to produce a downloadable blob. All old FastAPI-dependent code is removed.

**Tech Stack:** React 19, TypeScript, Fabric.js, Canvas API, Tailwind CSS 4

**Spec:** `docs/superpowers/specs/2026-03-11-edit-image-architecture-design.md`
**Depends on:** `docs/superpowers/plans/2026-03-11-vercel-extract-api.md` (Vercel function must be deployed first, but frontend can be built with placeholder fallback)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/services/imageEditService.ts` | Rewrite | New contract: `extractForeground(imageUrl)`, `saveEditedImage(blob, meta)`. Remove old FastAPI methods. |
| `src/components/edit-image/types.ts` | Modify | Remove `RenderVariation` dependency, add `compositeDataUrl` field |
| `src/components/edit-image/steps/CanvasStep.tsx` | Rewrite | Call new `extractForeground(imageUrl)` (no File needed), add Fabric.js mask editor |
| `src/components/edit-image/steps/MaskEditorModal.tsx` | Create | Fabric.js modal: load mask, paintbrush add/remove, confirm/cancel |
| `src/components/edit-image/steps/PreviewStep.tsx` | Rewrite | CSS layering (foreground over background), no API calls, instant |
| `src/components/edit-image/steps/ApproveDownloadStep.tsx` | Rewrite | Canvas API compositing for export blob, direct download |
| `src/components/edit-image/utils/compositeImage.ts` | Create | Canvas API helper: draw background + foreground → blob |

---

## Chunk 1: Service Layer + Types

### Task 1: Refactor imageEditService.ts

**Files:**
- Rewrite: `src/services/imageEditService.ts`

- [ ] **Step 1: Replace the service with the new contract**

```typescript
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
```

Key changes:
- `extractForeground` now takes `imageUrl` (string) instead of `File` — the Vercel function accepts a URL, not a multipart upload
- `saveEditedImage` uploads a composite blob to Firebase Storage
- All old methods removed: `getBackgroundCatalog`, `detectText`, `renderVariations`
- `VITE_EXTRACT_API_URL` replaces `VITE_IMAGE_EDIT_API_URL`

- [ ] **Step 2: Commit**

```bash
git add src/services/imageEditService.ts
git commit -m "refactor: rewrite imageEditService for Vercel/Replicate extraction + Firebase Storage save"
```

---

### Task 2: Update types.ts

**Files:**
- Modify: `src/components/edit-image/types.ts`

- [ ] **Step 1: Replace the types file**

```typescript
import type { ClientAssetHouse } from '../../services/clientAssetHouse';

export type EditType = 'background' | 'text' | 'colors';

export interface EditImageStepData {
  // Step 1 — Select Image
  imageUrl?: string;
  imageName?: string;
  imageSource?: 'alli' | 'upload';
  assetId?: string;
  platform?: string;

  // Step 2 — Edit Type
  editType?: EditType;

  // Step 3 — Canvas (extraction)
  extractedImageUrl?: string;
  extractionMethod?: 'auto' | 'manual';

  // Step 4 — New Background
  selectedBackground?: { type: 'color'; value: string } | { type: 'image'; url: string; name: string };
  customColor?: string;

  // Step 5 — Preview (CSS layering, no server data needed)
  previewReady?: boolean;

  // Step 6 — Save
  compositeDataUrl?: string;
  finalUrl?: string;
  savedToAssetHouse?: boolean;
}

export interface EditImageStepProps {
  stepData: EditImageStepData;
  onStepDataChange: (updates: Partial<EditImageStepData>) => void;
  clientSlug: string;
  assetHouse: ClientAssetHouse | null;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}
```

Key changes:
- Removed `RenderVariation` import and `selectedVariation` field
- Added `previewReady` boolean (set when user views preview)
- Added `compositeDataUrl` for the Canvas API-exported data URL

- [ ] **Step 2: Commit**

```bash
git add src/components/edit-image/types.ts
git commit -m "refactor: update types for CSS preview and Canvas API export"
```

---

### Task 3: Update isNextDisabled in UseCaseWizardPage.tsx

**Files:**
- Modify: `src/pages/use-cases/UseCaseWizardPage.tsx`

- [ ] **Step 1: Update the preview validation**

Change the edit-image validation block from:
```typescript
(steps[currentStep]?.id === 'preview' && !stepData.selectedVariation)
```

To:
```typescript
(steps[currentStep]?.id === 'preview' && !stepData.previewReady)
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/use-cases/UseCaseWizardPage.tsx
git commit -m "fix: update preview validation to use previewReady instead of selectedVariation"
```

---

## Chunk 2: Canvas Step + Mask Editor

### Task 4: Install Fabric.js

- [ ] **Step 1: Install fabric**

```bash
npm install fabric
```

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add fabric.js dependency for mask editing"
```

---

### Task 5: Rewrite CanvasStep.tsx

**Files:**
- Rewrite: `src/components/edit-image/steps/CanvasStep.tsx`

- [ ] **Step 1: Replace with new implementation**

```typescript
import { useState } from 'react';
import { ArrowPathIcon, PencilSquareIcon, ScissorsIcon } from '@heroicons/react/24/outline';
import { cn } from '../../../utils/cn';
import { imageEditService } from '../../../services/imageEditService';
import { MaskEditorModal } from './MaskEditorModal';
import type { EditImageStepProps } from '../types';

export function CanvasStep({
  stepData,
  onStepDataChange,
  setIsLoading,
}: EditImageStepProps) {
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [showMaskEditor, setShowMaskEditor] = useState(false);

  const handleExtract = async () => {
    if (!stepData.imageUrl) return;
    setIsExtracting(true);
    setIsLoading(true);
    setExtractError(null);

    try {
      const result = await imageEditService.extractForeground(stepData.imageUrl);
      onStepDataChange({
        extractedImageUrl: result.url,
        extractionMethod: 'auto',
      });
    } catch (err) {
      // If API is not configured or fails, fall back to original image for UI review
      const message = err instanceof Error ? err.message : 'Extraction failed';
      if (message.includes('VITE_EXTRACT_API_URL')) {
        // API not configured — use placeholder
        onStepDataChange({
          extractedImageUrl: stepData.imageUrl,
          extractionMethod: 'auto',
        });
      } else {
        setExtractError(message);
      }
    } finally {
      setIsExtracting(false);
      setIsLoading(false);
    }
  };

  const handleMaskConfirm = (refinedImageUrl: string) => {
    onStepDataChange({
      extractedImageUrl: refinedImageUrl,
      extractionMethod: 'manual',
    });
    setShowMaskEditor(false);
  };

  const isExtracted = !!stepData.extractedImageUrl;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Canvas area */}
      <div className="relative">
        <div
          className={cn(
            'relative overflow-hidden rounded-2xl border-2 min-h-[320px] flex items-center justify-center',
            isExtracted
              ? 'border-blue-200 bg-[repeating-conic-gradient(#f1f5f9_0%_25%,#fff_0%_50%)_0_0/20px_20px]'
              : 'border-gray-200 bg-gray-50',
          )}
        >
          {stepData.imageUrl && (
            <img
              src={isExtracted ? stepData.extractedImageUrl : stepData.imageUrl}
              alt={stepData.imageName || 'Selected image'}
              className="max-h-[400px] w-auto object-contain"
            />
          )}

          {isExtracting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm">
              <ArrowPathIcon className="h-10 w-10 text-blue-600 animate-spin" />
              <p className="mt-3 text-[10px] font-black text-blue-600 uppercase tracking-widest">
                Extracting foreground...
              </p>
              <p className="mt-1 text-[9px] text-gray-400">This may take a few seconds</p>
            </div>
          )}
        </div>

        {/* Edit button — top right of canvas */}
        <button
          onClick={() => setShowMaskEditor(true)}
          disabled={!isExtracted}
          className={cn(
            'absolute top-3 right-3 flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[9px] font-black uppercase tracking-widest transition-all',
            isExtracted
              ? 'border-gray-300 bg-white/90 text-gray-500 hover:border-blue-300 hover:text-blue-600 backdrop-blur-sm cursor-pointer'
              : 'border-gray-200 bg-gray-100/80 text-gray-300 cursor-not-allowed',
          )}
          title={isExtracted ? 'Edit selection mask' : 'Extract background first'}
        >
          <PencilSquareIcon className="h-3.5 w-3.5" />
          Edit
        </button>
      </div>

      {/* Extract button / status */}
      <div className="text-center">
        {extractError ? (
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-red-500">{extractError}</p>
            <button
              onClick={handleExtract}
              className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-8 py-3 text-xs font-black text-white uppercase tracking-widest hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20"
            >
              <ArrowPathIcon className="h-4 w-4" />
              Retry
            </button>
          </div>
        ) : !isExtracted ? (
          <button
            onClick={handleExtract}
            disabled={isExtracting || !stepData.imageUrl}
            className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-8 py-3 text-xs font-black text-white uppercase tracking-widest hover:bg-blue-700 transition-colors disabled:opacity-40 shadow-lg shadow-blue-600/20"
          >
            <ScissorsIcon className="h-4 w-4" />
            {isExtracting ? 'Extracting...' : 'Extract Background'}
          </button>
        ) : (
          <div className="flex items-center justify-center gap-3">
            <p className="text-[10px] font-black text-green-600 uppercase tracking-widest">
              Background extracted
            </p>
            <button
              onClick={handleExtract}
              disabled={isExtracting}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[10px] font-black text-gray-500 uppercase tracking-widest hover:border-blue-300 hover:text-blue-600 transition-all"
            >
              <ArrowPathIcon className="h-3.5 w-3.5" />
              Re-extract
            </button>
          </div>
        )}
      </div>

      {/* Mask Editor Modal */}
      {showMaskEditor && stepData.imageUrl && stepData.extractedImageUrl && (
        <MaskEditorModal
          originalImageUrl={stepData.imageUrl}
          extractedImageUrl={stepData.extractedImageUrl}
          onConfirm={handleMaskConfirm}
          onCancel={() => setShowMaskEditor(false)}
        />
      )}
    </div>
  );
}
```

Key changes from current:
- Calls `extractForeground(imageUrl)` with a URL string (not File)
- Edit button now opens `MaskEditorModal`
- Error state shown with retry
- Handles missing env var gracefully (falls back to placeholder)

- [ ] **Step 2: Commit**

```bash
git add src/components/edit-image/steps/CanvasStep.tsx
git commit -m "feat: rewrite CanvasStep for Vercel API + Fabric.js mask editor"
```

---

### Task 6: Create MaskEditorModal.tsx

**Files:**
- Create: `src/components/edit-image/steps/MaskEditorModal.tsx`

- [ ] **Step 1: Create the Fabric.js mask editor component**

```typescript
import { useEffect, useRef, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { cn } from '../../../utils/cn';

interface MaskEditorModalProps {
  originalImageUrl: string;
  extractedImageUrl: string;
  onConfirm: (refinedImageUrl: string) => void;
  onCancel: () => void;
}

type BrushMode = 'add' | 'remove';

export function MaskEditorModal({
  originalImageUrl,
  extractedImageUrl,
  onConfirm,
  onCancel,
}: MaskEditorModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<any>(null);
  const [brushMode, setBrushMode] = useState<BrushMode>('remove');
  const [brushSize, setBrushSize] = useState(20);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const initFabric = async () => {
      // Dynamic import to avoid SSR issues and reduce initial bundle
      const fabric = await import('fabric');
      if (cancelled || !canvasRef.current) return;

      const canvas = new fabric.Canvas(canvasRef.current, {
        isDrawingMode: true,
        width: 800,
        height: 600,
      });
      fabricRef.current = canvas;

      // Load the original image as background
      const bgImg = await fabric.FabricImage.fromURL(originalImageUrl, { crossOrigin: 'anonymous' });
      if (cancelled) return;

      // Scale to fit canvas
      const scale = Math.min(800 / bgImg.width!, 600 / bgImg.height!);
      bgImg.scale(scale);
      canvas.backgroundImage = bgImg;

      // Load extracted image as overlay to show current mask
      const fgImg = await fabric.FabricImage.fromURL(extractedImageUrl, { crossOrigin: 'anonymous' });
      if (cancelled) return;

      fgImg.scale(scale);
      fgImg.set({ selectable: false, evented: false, opacity: 0.7 });
      canvas.add(fgImg);

      // Configure brush
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
      canvas.freeDrawingBrush.width = brushSize;
      updateBrushColor(canvas, brushMode);

      canvas.renderAll();
      setIsLoading(false);
    };

    initFabric();

    return () => {
      cancelled = true;
      if (fabricRef.current) {
        fabricRef.current.dispose();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const updateBrushColor = (canvas: any, mode: BrushMode) => {
    if (!canvas?.freeDrawingBrush) return;
    // Green = add to selection (keep), Red = remove from selection (erase)
    canvas.freeDrawingBrush.color = mode === 'add'
      ? 'rgba(0, 255, 0, 0.4)'
      : 'rgba(255, 0, 0, 0.4)';
  };

  useEffect(() => {
    if (fabricRef.current) {
      updateBrushColor(fabricRef.current, brushMode);
    }
  }, [brushMode]);

  useEffect(() => {
    if (fabricRef.current?.freeDrawingBrush) {
      fabricRef.current.freeDrawingBrush.width = brushSize;
    }
  }, [brushSize]);

  const handleConfirm = () => {
    // For now, return the extracted image as-is.
    // Full mask application will be implemented when the backend supports it.
    // The paint strokes are visual — actual mask refinement requires
    // sending the mask data to the extraction API or processing client-side.
    onConfirm(extractedImageUrl);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-[880px] w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">
            Refine Selection
          </h3>
          <button
            onClick={onCancel}
            className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-4 px-6 py-3 bg-gray-50 border-b border-gray-100">
          {/* Brush mode toggle */}
          <div className="flex p-1 bg-gray-200 rounded-xl">
            {(['add', 'remove'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setBrushMode(mode)}
                className={cn(
                  'px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all',
                  brushMode === mode
                    ? mode === 'add'
                      ? 'bg-green-500 text-white shadow-sm'
                      : 'bg-red-500 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700',
                )}
              >
                {mode === 'add' ? 'Keep' : 'Erase'}
              </button>
            ))}
          </div>

          {/* Brush size */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Size</span>
            <input
              type="range"
              min={5}
              max={80}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="w-24 accent-blue-600"
            />
            <span className="text-[9px] font-bold text-gray-400 w-6 text-right">{brushSize}</span>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex items-center justify-center p-6 bg-gray-100 min-h-[400px]">
          {isLoading && (
            <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest animate-pulse">
              Loading editor...
            </p>
          )}
          <canvas
            ref={canvasRef}
            className={cn('rounded-xl shadow-sm', isLoading && 'hidden')}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onCancel}
            className="rounded-xl border border-gray-200 px-6 py-2.5 text-[10px] font-black text-gray-500 uppercase tracking-widest hover:border-gray-300 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="rounded-xl bg-blue-600 px-6 py-2.5 text-[10px] font-black text-white uppercase tracking-widest hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20"
          >
            Apply Refinement
          </button>
        </div>
      </div>
    </div>
  );
}
```

Note: The `handleConfirm` currently returns the extracted image as-is. The actual mask-to-foreground pipeline (applying paint strokes to the alpha channel) is a follow-up task. This gives us the full UI and Fabric.js integration working first.

- [ ] **Step 2: Commit**

```bash
git add src/components/edit-image/steps/MaskEditorModal.tsx
git commit -m "feat: add Fabric.js mask editor modal with brush tools"
```

---

## Chunk 3: Preview (CSS) + Save (Canvas API) + Cleanup

### Task 7: Create compositeImage utility

**Files:**
- Create: `src/components/edit-image/utils/compositeImage.ts`

- [ ] **Step 1: Create the Canvas API compositing helper**

```typescript
/**
 * Composites a foreground PNG over a background (solid color or image) using Canvas API.
 * Returns a Blob of the final PNG.
 */
export async function compositeImage(
  foregroundUrl: string,
  background: { type: 'color'; value: string } | { type: 'image'; url: string; name: string },
): Promise<Blob> {
  const fgImg = await loadImage(foregroundUrl);

  const canvas = document.createElement('canvas');
  canvas.width = fgImg.naturalWidth;
  canvas.height = fgImg.naturalHeight;
  const ctx = canvas.getContext('2d')!;

  // Draw background
  if (background.type === 'color') {
    ctx.fillStyle = background.value;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    const bgImg = await loadImage(background.url);
    // Scale background to cover canvas dimensions
    const scale = Math.max(canvas.width / bgImg.naturalWidth, canvas.height / bgImg.naturalHeight);
    const w = bgImg.naturalWidth * scale;
    const h = bgImg.naturalHeight * scale;
    const x = (canvas.width - w) / 2;
    const y = (canvas.height - h) / 2;
    ctx.drawImage(bgImg, x, y, w, h);
  }

  // Draw foreground on top
  ctx.drawImage(fgImg, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to export canvas to blob'));
    }, 'image/png');
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}
```

- [ ] **Step 2: Commit**

```bash
mkdir -p src/components/edit-image/utils
git add src/components/edit-image/utils/compositeImage.ts
git commit -m "feat: add Canvas API compositeImage utility for final export"
```

---

### Task 8: Rewrite PreviewStep.tsx (CSS layering)

**Files:**
- Rewrite: `src/components/edit-image/steps/PreviewStep.tsx`

- [ ] **Step 1: Replace with CSS layering implementation**

```typescript
import { useEffect } from 'react';
import type { EditImageStepProps } from '../types';

export function PreviewStep({
  stepData,
  onStepDataChange,
}: EditImageStepProps) {
  // Mark preview as ready on mount so Continue is enabled
  useEffect(() => {
    if (!stepData.previewReady) {
      onStepDataChange({ previewReady: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const bg = stepData.selectedBackground;
  const bgStyle: React.CSSProperties = bg?.type === 'color'
    ? { backgroundColor: bg.value }
    : bg?.type === 'image'
      ? { backgroundImage: `url(${bg.url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : { backgroundColor: '#f1f5f9' };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em] text-center">
        Preview
      </h3>

      <div className="grid grid-cols-2 gap-6">
        {/* Original */}
        <div className="space-y-2">
          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest text-center">Original</p>
          <div className="overflow-hidden rounded-2xl border-2 border-gray-200">
            <img src={stepData.imageUrl} alt="Original" className="w-full object-contain" />
          </div>
        </div>

        {/* Edited — CSS layering */}
        <div className="space-y-2">
          <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest text-center">Edited</p>
          <div
            className="relative overflow-hidden rounded-2xl border-2 border-blue-200 ring-2 ring-blue-100"
            style={bgStyle}
          >
            {stepData.extractedImageUrl && (
              <img
                src={stepData.extractedImageUrl}
                alt="Edited"
                className="relative w-full object-contain"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

Key changes:
- Zero API calls — instant rendering
- Background applied via CSS (`backgroundColor` or `backgroundImage`)
- Foreground PNG layered on top (its transparency shows the background through)
- Sets `previewReady: true` on mount for validation

- [ ] **Step 2: Commit**

```bash
git add src/components/edit-image/steps/PreviewStep.tsx
git commit -m "feat: rewrite PreviewStep with CSS layering, no API calls"
```

---

### Task 9: Rewrite ApproveDownloadStep.tsx (Canvas API export)

**Files:**
- Rewrite: `src/components/edit-image/steps/ApproveDownloadStep.tsx`

- [ ] **Step 1: Replace with Canvas API compositing + download**

```typescript
import { useState } from 'react';
import { ArrowDownTrayIcon, CheckCircleIcon, CircleStackIcon } from '@heroicons/react/24/outline';
import { compositeImage } from '../utils/compositeImage';
import { imageEditService } from '../../../services/imageEditService';
import type { EditImageStepProps } from '../types';

export function ApproveDownloadStep({ stepData, onStepDataChange, clientSlug }: EditImageStepProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const bg = stepData.selectedBackground;
  const bgStyle: React.CSSProperties = bg?.type === 'color'
    ? { backgroundColor: bg.value }
    : bg?.type === 'image'
      ? { backgroundImage: `url(${bg.url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : { backgroundColor: '#f1f5f9' };

  const handleDownload = async () => {
    if (!stepData.extractedImageUrl || !stepData.selectedBackground) return;
    setIsExporting(true);
    setExportError(null);

    try {
      // Composite via Canvas API
      const blob = await compositeImage(stepData.extractedImageUrl, stepData.selectedBackground);

      // Download locally
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `edited_${stepData.imageName || 'image'}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Optionally save to Firebase Storage
      try {
        const saved = await imageEditService.saveEditedImage(blob, {
          clientSlug,
          imageName: stepData.imageName || 'image.png',
        });
        onStepDataChange({ finalUrl: saved.url });
      } catch {
        // Storage save is optional — download still succeeded
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="text-center space-y-2">
        <CheckCircleIcon className="h-10 w-10 mx-auto text-green-500" />
        <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">
          Your edited image is ready
        </h3>
      </div>

      {/* Before / After */}
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-2">
          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest text-center">Before</p>
          <div className="overflow-hidden rounded-2xl border border-gray-200 shadow-sm">
            <img src={stepData.imageUrl} alt="Original" className="w-full object-contain" />
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest text-center">After</p>
          <div
            className="overflow-hidden rounded-2xl border-2 border-blue-200 shadow-sm ring-2 ring-blue-100"
            style={bgStyle}
          >
            {stepData.extractedImageUrl && (
              <img src={stepData.extractedImageUrl} alt="Edited" className="w-full object-contain" />
            )}
          </div>
        </div>
      </div>

      {/* Error */}
      {exportError && (
        <p className="text-center text-[10px] font-bold text-red-500">{exportError}</p>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={handleDownload}
          disabled={isExporting || !stepData.extractedImageUrl}
          className="flex items-center gap-2 rounded-2xl bg-blue-600 px-8 py-3 text-xs font-black text-white uppercase tracking-widest hover:bg-blue-700 transition-colors disabled:opacity-40 shadow-lg shadow-blue-600/20"
        >
          <ArrowDownTrayIcon className="h-4 w-4" />
          {isExporting ? 'Exporting...' : 'Download Image'}
        </button>

        <div className="relative group">
          <button
            disabled
            className="flex items-center gap-2 rounded-2xl border-2 border-gray-200 bg-gray-50 px-8 py-3 text-xs font-black text-gray-300 uppercase tracking-widest cursor-not-allowed"
          >
            <CircleStackIcon className="h-4 w-4" />
            Add to Asset House
          </button>
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 rounded-lg bg-gray-900 px-3 py-1 text-[9px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            Coming Soon
          </div>
        </div>
      </div>
    </div>
  );
}
```

Key changes:
- Uses `compositeImage()` utility for Canvas API export
- Downloads the blob directly (no server fetch needed)
- Optionally saves to Firebase Storage via `imageEditService.saveEditedImage()`
- Before/After uses same CSS layering as Preview step

- [ ] **Step 2: Commit**

```bash
git add src/components/edit-image/steps/ApproveDownloadStep.tsx
git commit -m "feat: rewrite Save step with Canvas API compositing and direct download"
```

---

### Task 10: Add environment variable and verify build

**Files:**
- Modify: `.env` or `.env.local`

- [ ] **Step 1: Add the extract API URL env var**

Add to `.env.local` (or `.env`):

```
VITE_EXTRACT_API_URL=https://YOUR_VERCEL_URL_HERE
```

If the Vercel function hasn't been deployed yet, leave it empty — the CanvasStep falls back to placeholder.

- [ ] **Step 2: Verify TypeScript build**

```bash
npx tsc --noEmit
```

Expected: Clean build, zero errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: add VITE_EXTRACT_API_URL env var and verify clean build"
```

---

### Task 11: Update changelog

**Files:**
- Modify: `docs/edit-image-changelog.md`

- [ ] **Step 1: Append architecture integration entry**

Add after the existing "UI Redesign" section:

```markdown
## Architecture Integration — 2026-03-11

### Backend migration
- Retired local FastAPI service (`local-services/image-edit-api/`) dependency
- `imageEditService.ts` rewritten: `extractForeground(imageUrl)` calls Vercel/Replicate, `saveEditedImage(blob, meta)` uploads to Firebase Storage
- Old methods removed: `getBackgroundCatalog`, `detectText`, `renderVariations`
- Environment variable changed: `VITE_IMAGE_EDIT_API_URL` → `VITE_EXTRACT_API_URL`

### Canvas step
- `extractForeground` now sends image URL (not File upload) to Vercel serverless function
- Fabric.js mask editor modal added (Edit button opens it)
- Brush tools: "Keep" (green) and "Erase" (red) with adjustable size
- Mask application is visual-only for now; full pipeline is a follow-up

### Preview step
- Replaced server-side rendering with CSS layering (instant, zero API calls)
- Foreground PNG transparency shows chosen background via CSS `background-color` or `background-image`

### Save step
- Canvas API composites foreground + background into a single PNG blob
- Direct browser download (no server round-trip for the file)
- Optional Firebase Storage upload for persistence

### New files
- `src/components/edit-image/steps/MaskEditorModal.tsx` — Fabric.js mask refinement UI
- `src/components/edit-image/utils/compositeImage.ts` — Canvas API compositing helper

### Dependencies
- Added: `fabric` (Fabric.js for mask editing)
- Removed dependency on: `VITE_IMAGE_EDIT_API_URL`, local FastAPI server

### Pickup point
Architecture integration complete. Vercel function deployment needed to enable real extraction.
```

- [ ] **Step 2: Commit**

```bash
git add docs/edit-image-changelog.md
git commit -m "docs: update changelog with architecture integration details"
```
