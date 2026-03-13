# Mask Editor Refinement — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the MaskEditorModal functional — users can refine the API's foreground extraction using a Photoshop-style Quick Mask with Keep/Erase brushes, producing an updated foreground PNG with correct alpha transparency.

**Architecture:** Dual-canvas approach (visible Fabric.js display canvas + hidden mask canvas). CORS solved via Vercel image proxy. Mask-to-alpha applied client-side using Canvas API pixel manipulation. All images stay PNG end-to-end.

**Tech Stack:** React 19, Fabric.js 7.2, Canvas API, Vercel serverless functions (separate repo)

**Spec:** `docs/superpowers/specs/2026-03-12-mask-editor-refinement-design.md`

**Note:** No test framework is configured in this project. Verification uses `npm run build` (TypeScript type checking) and manual browser testing via `npm run dev`.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/components/edit-image/utils/proxyUrl.ts` | Create | CORS proxy URL helper — wraps external URLs with Vercel proxy prefix |
| `src/components/edit-image/utils/applyMaskToAlpha.ts` | Create | Reads mask canvas + original image → produces refined foreground data URL |
| `src/components/edit-image/types.ts` | Modify | Add `maskDataUrl` field to `EditImageStepData` |
| `src/components/edit-image/steps/MaskEditorModal.tsx` | Rewrite | Dual-canvas Quick Mask editor with Keep/Erase brushes, opacity, undo |
| `src/components/edit-image/steps/CanvasStep.tsx` | Modify | Update `handleMaskConfirm` signature, pass `maskDataUrl` to modal |

---

## Chunk 1: Foundation Utilities

### Task 1: Create `proxyUrl` helper

**Files:**
- Create: `src/components/edit-image/utils/proxyUrl.ts`

- [ ] **Step 1: Create the proxyUrl utility**

```typescript
// src/components/edit-image/utils/proxyUrl.ts

const EXTRACT_API_URL = (import.meta.env.VITE_EXTRACT_API_URL || '').replace(/\/$/, '');

/**
 * Wraps external image URLs with the CORS proxy endpoint.
 * Data URLs and same-origin URLs pass through unchanged.
 */
export function proxyUrl(url: string): string {
  if (!url) return url;

  // Data URLs are same-origin — no proxy needed
  if (url.startsWith('data:')) return url;

  // Same-origin URLs don't need proxying
  if (url.startsWith('/') || url.startsWith(window.location.origin)) return url;

  // Blob URLs are same-origin
  if (url.startsWith('blob:')) return url;

  // External URL — route through proxy
  if (!EXTRACT_API_URL) {
    console.warn('VITE_EXTRACT_API_URL not configured — cannot proxy external images');
    return url;
  }

  return `${EXTRACT_API_URL}/api/proxy-image?url=${encodeURIComponent(url)}`;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build, no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/edit-image/utils/proxyUrl.ts
git commit -m "feat: add proxyUrl helper for CORS image proxying"
```

---

### Task 2: Create `applyMaskToAlpha` utility

**Files:**
- Create: `src/components/edit-image/utils/applyMaskToAlpha.ts`

- [ ] **Step 1: Create the image loading helper**

We need a CORS-safe image loader. Create the full file:

```typescript
// src/components/edit-image/utils/applyMaskToAlpha.ts

/**
 * Loads an image as an HTMLImageElement with CORS support.
 * For data: and blob: URLs, crossOrigin is skipped.
 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Only set crossOrigin for http(s) URLs — data/blob URLs don't need it
    if (url.startsWith('http')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url.slice(0, 100)}`));
    img.src = url;
  });
}

/**
 * Applies a mask canvas to the original image to produce a refined foreground.
 *
 * The mask canvas contains white (keep) and black (remove) values.
 * The original image is the FULL pre-extraction image (with background).
 * Each pixel's alpha is set to the mask's luminance value.
 *
 * @param originalImageUrl - CORS-safe URL to the original full image (use proxyUrl())
 * @param maskCanvas - Hidden mask canvas with white=keep, black=remove values
 * @returns data:image/png URL of the refined foreground
 */
export async function applyMaskToAlpha(
  originalImageUrl: string,
  maskCanvas: HTMLCanvasElement,
): Promise<string> {
  const img = await loadImage(originalImageUrl);

  const { naturalWidth: w, naturalHeight: h } = img;

  // Validate dimensions match
  if (maskCanvas.width !== w || maskCanvas.height !== h) {
    throw new Error(
      `Dimension mismatch: image is ${w}×${h} but mask canvas is ${maskCanvas.width}×${maskCanvas.height}`
    );
  }

  // Draw original image onto offscreen canvas
  const offscreen = document.createElement('canvas');
  offscreen.width = w;
  offscreen.height = h;
  const ctx = offscreen.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  // Read pixel data from both canvases
  const imageData = ctx.getImageData(0, 0, w, h);
  const imagePixels = imageData.data;

  const maskCtx = maskCanvas.getContext('2d')!;
  const maskData = maskCtx.getImageData(0, 0, w, h);
  const maskPixels = maskData.data;

  // Apply mask luminance → image alpha
  for (let i = 0; i < imagePixels.length; i += 4) {
    // On a white/black canvas, R=G=B, so read any channel
    const maskLuminance = maskPixels[i]; // red channel
    imagePixels[i + 3] = maskLuminance;  // set alpha
  }

  ctx.putImageData(imageData, 0, 0);
  return offscreen.toDataURL('image/png');
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build, no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/edit-image/utils/applyMaskToAlpha.ts
git commit -m "feat: add applyMaskToAlpha utility for client-side mask refinement"
```

---

### Task 3: Add `maskDataUrl` to types

**Files:**
- Modify: `src/components/edit-image/types.ts:17-19`

- [ ] **Step 1: Add maskDataUrl field to EditImageStepData**

In `src/components/edit-image/types.ts`, add after line 18 (`extractionMethod`):

```typescript
  maskDataUrl?: string;
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build. Adding an optional field to an interface is non-breaking.

- [ ] **Step 3: Commit**

```bash
git add src/components/edit-image/types.ts
git commit -m "feat: add maskDataUrl field to EditImageStepData"
```

> **Note:** CanvasStep changes (`handleMaskConfirm` signature, `maskDataUrl` prop on `<MaskEditorModal>`) are deferred to Task 4 so they can be committed together with the MaskEditorModal rewrite. This avoids a broken build between commits.

---

## Chunk 2: MaskEditorModal Rewrite

### Task 4: Rewrite MaskEditorModal

**Files:**
- Rewrite: `src/components/edit-image/steps/MaskEditorModal.tsx`

This is the largest task. The modal is a full rewrite from the current decorative-only implementation to a functional dual-canvas Quick Mask editor.

**Key references from spec:**
- Section 2: Layer stack, initial state, brush controls, undo, brush cursor
- Section 3: Dual canvas architecture, stroke mirroring, sync safety

- [ ] **Step 1: Write the new MaskEditorModal interface and imports**

Replace the entire file. Start with the interface and imports:

```typescript
// src/components/edit-image/steps/MaskEditorModal.tsx

import { useEffect, useRef, useState, useCallback } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { cn } from '../../../utils/cn';
import { proxyUrl } from '../utils/proxyUrl';
import { applyMaskToAlpha } from '../utils/applyMaskToAlpha';

interface MaskEditorModalProps {
  originalImageUrl: string;
  extractedImageUrl: string;
  maskDataUrl?: string;
  onConfirm: (refinedImageUrl: string, maskDataUrl: string) => void;
  onCancel: () => void;
}

type BrushMode = 'keep' | 'erase';

// Max display dimensions for the canvas within the modal
const MAX_DISPLAY_WIDTH = 800;
const MAX_DISPLAY_HEIGHT = 550;
```

- [ ] **Step 2: Write the image loading and canvas initialization helpers**

These are module-level helper functions that load images and build the initial mask/tint from the extracted foreground's alpha channel:

```typescript
/** Load an image element, optionally with crossOrigin for CORS-safe pixel access */
function loadImg(url: string, cors = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors && url.startsWith('http')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${url.slice(0, 80)}`));
    img.src = url;
  });
}

/**
 * Build initial mask canvas + red tint overlay from the extracted foreground's alpha.
 * Case B in the spec: first edit after API extraction.
 */
async function buildMaskFromAlpha(
  extractedImg: HTMLImageElement,
  w: number,
  h: number,
): Promise<{ maskCanvas: HTMLCanvasElement; tintBlobUrl: string }> {
  // Read alpha channel from extracted foreground
  const readCanvas = document.createElement('canvas');
  readCanvas.width = w;
  readCanvas.height = h;
  const readCtx = readCanvas.getContext('2d')!;
  readCtx.drawImage(extractedImg, 0, 0, w, h);
  const extractedData = readCtx.getImageData(0, 0, w, h);
  const pixels = extractedData.data;

  // Build mask canvas (white=keep, black=remove)
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = w;
  maskCanvas.height = h;
  const maskCtx = maskCanvas.getContext('2d')!;
  const maskData = maskCtx.createImageData(w, h);
  const maskPixels = maskData.data;

  // Build red tint overlay
  const tintCanvas = document.createElement('canvas');
  tintCanvas.width = w;
  tintCanvas.height = h;
  const tintCtx = tintCanvas.getContext('2d')!;
  const tintData = tintCtx.createImageData(w, h);
  const tintPixels = tintData.data;

  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3];

    // Mask: alpha → luminance (0→black, 255→white)
    maskPixels[i] = alpha;
    maskPixels[i + 1] = alpha;
    maskPixels[i + 2] = alpha;
    maskPixels[i + 3] = 255;

    // Tint: inverted alpha → red overlay
    tintPixels[i] = 255;     // R
    tintPixels[i + 1] = 0;   // G
    tintPixels[i + 2] = 0;   // B
    tintPixels[i + 3] = Math.round((1 - alpha / 255) * 102); // ~40% where removed
  }

  maskCtx.putImageData(maskData, 0, 0);
  tintCtx.putImageData(tintData, 0, 0);

  // Use blob URL instead of toDataURL for better performance with large images
  const tintBlob = await canvasToBlob(tintCanvas);
  const tintBlobUrl = URL.createObjectURL(tintBlob);

  return { maskCanvas, tintBlobUrl };
}

/**
 * Build initial mask canvas + red tint overlay from a saved mask data URL.
 * Case A in the spec: re-editing.
 */
async function buildMaskFromSaved(
  maskImg: HTMLImageElement,
  w: number,
  h: number,
): Promise<{ maskCanvas: HTMLCanvasElement; tintBlobUrl: string }> {
  // Restore mask canvas from saved image
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = w;
  maskCanvas.height = h;
  const maskCtx = maskCanvas.getContext('2d')!;
  maskCtx.drawImage(maskImg, 0, 0, w, h);
  const maskData = maskCtx.getImageData(0, 0, w, h);
  const maskPixels = maskData.data;

  // Build red tint from mask (inverted: black→red, white→clear)
  const tintCanvas = document.createElement('canvas');
  tintCanvas.width = w;
  tintCanvas.height = h;
  const tintCtx = tintCanvas.getContext('2d')!;
  const tintData = tintCtx.createImageData(w, h);
  const tintPixels = tintData.data;

  for (let i = 0; i < maskPixels.length; i += 4) {
    const luminance = maskPixels[i]; // R channel (R=G=B on grayscale)
    tintPixels[i] = 255;
    tintPixels[i + 1] = 0;
    tintPixels[i + 2] = 0;
    tintPixels[i + 3] = Math.round((1 - luminance / 255) * 102);
  }

  tintCtx.putImageData(tintData, 0, 0);

  const tintBlob = await canvasToBlob(tintCanvas);
  const tintBlobUrl = URL.createObjectURL(tintBlob);

  return { maskCanvas, tintBlobUrl };
}

/** Helper: canvas.toBlob() as a Promise */
function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to convert canvas to blob'));
    }, 'image/png');
  });
}
```

- [ ] **Step 3: Write the main component with initialization effect**

```typescript
export function MaskEditorModal({
  originalImageUrl,
  extractedImageUrl,
  maskDataUrl: savedMaskDataUrl,
  onConfirm,
  onCancel,
}: MaskEditorModalProps) {
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<any>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const initialMaskRef = useRef<ImageData | null>(null);
  const cursorRef = useRef<any>(null);
  // Ref to track current brush mode for path:created tagging (avoids stale closure)
  const currentBrushModeRef = useRef<BrushMode>('erase');

  const [brushMode, setBrushMode] = useState<BrushMode>('erase');
  const [brushSize, setBrushSize] = useState(20);
  const [brushOpacity, setBrushOpacity] = useState(100);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [canApply, setCanApply] = useState(true);

  // Track natural image dimensions for the coordinate space
  const imageDimsRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  // Track the CSS scale factor for display
  const displayScaleRef = useRef(1);

  useEffect(() => {
    let cancelled = false;
    let tintBlobUrl = ''; // Declared in effect scope so cleanup can revoke it

    const init = async () => {
      try {
        // Load original image through proxy for CORS-safe pixel access
        const origImg = await loadImg(proxyUrl(originalImageUrl), true);
        if (cancelled) return;

        const w = origImg.naturalWidth;
        const h = origImg.naturalHeight;
        imageDimsRef.current = { w, h };

        // Calculate display scale to fit modal
        const scale = Math.min(MAX_DISPLAY_WIDTH / w, MAX_DISPLAY_HEIGHT / h, 1);
        displayScaleRef.current = scale;

        // Build mask canvas + tint from either saved mask or extracted alpha
        let maskCanvas: HTMLCanvasElement;

        if (savedMaskDataUrl) {
          const maskImg = await loadImg(savedMaskDataUrl);
          if (cancelled) return;
          ({ maskCanvas, tintBlobUrl } = await buildMaskFromSaved(maskImg, w, h));
        } else {
          const extractedImg = await loadImg(proxyUrl(extractedImageUrl), true);
          if (cancelled) return;
          ({ maskCanvas, tintBlobUrl } = await buildMaskFromAlpha(extractedImg, w, h));
        }

        maskCanvasRef.current = maskCanvas;

        // Save initial mask state for undo replay
        const maskCtx = maskCanvas.getContext('2d')!;
        initialMaskRef.current = maskCtx.getImageData(0, 0, w, h);

        // Initialize Fabric.js display canvas
        const fabric = await import('fabric');
        if (cancelled || !displayCanvasRef.current) return;

        const canvas = new fabric.Canvas(displayCanvasRef.current, {
          isDrawingMode: true,
          width: w,
          height: h,
          selection: false,
        });
        fabricRef.current = canvas;

        // Layer 1: Original image as background
        const bgFabric = new fabric.FabricImage(origImg);
        canvas.backgroundImage = bgFabric;

        // Layer 2: Red tint overlay
        const tintImg = await loadImg(tintBlobUrl);
        if (cancelled) return;
        const tintFabric = new fabric.FabricImage(tintImg);
        tintFabric.set({ selectable: false, evented: false });
        canvas.add(tintFabric);

        // Configure initial brush
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
        canvas.freeDrawingBrush.width = brushSize;
        updateBrush(canvas, 'erase', brushSize, brushOpacity);

        // Setup custom brush cursor (Circle that follows mouse)
        const cursor = setupBrushCursor(canvas, fabric);
        cursorRef.current = cursor;
        updateBrushCursor(cursor, 'erase', brushSize);

        // Stroke mirroring: path:created → tag with mode, then mirror to mask canvas
        canvas.on('path:created', (e: any) => {
          const path = e.path;
          if (!path || !maskCanvasRef.current) return;

          // Tag the path with the current brush mode (avoids brittle color matching)
          path.data = { maskMode: currentBrushModeRef.current };

          // Sync safety assertion
          const mc = maskCanvasRef.current;
          if (mc.width !== w || mc.height !== h) {
            console.error('Mask canvas dimension mismatch — disabling Apply');
            setCanApply(false);
            return;
          }

          mirrorPathToMask(path, mc);
        });

        canvas.renderAll();
        setIsLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to initialize editor');
          setIsLoading(false);
        }
      }
    };

    init();

    return () => {
      cancelled = true;
      // Revoke blob URLs to free memory
      if (tintBlobUrl) URL.revokeObjectURL(tintBlobUrl);
      if (fabricRef.current) {
        fabricRef.current.dispose();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ... (continued in next steps)
```

- [ ] **Step 4: Write the stroke mirroring, brush update, and brush cursor functions**

Add these before the component as module-level functions:

```typescript
/**
 * Mirror a Fabric path object onto the hidden mask canvas.
 * Uses custom `data.maskMode` on the path (set at stroke creation) instead of
 * brittle color string matching.
 * Applies Fabric's transform (left/top/pathOffset) to correctly position the stroke.
 */
function mirrorPathToMask(
  fabricPath: any,
  maskCanvas: HTMLCanvasElement,
): void {
  const ctx = maskCanvas.getContext('2d')!;

  // Read mode from custom data (set in path:created handler)
  const isKeep = fabricPath.data?.maskMode === 'keep';

  const opacity = fabricPath.opacity ?? 1;

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = isKeep ? `rgba(255,255,255,${opacity})`
                           : `rgba(0,0,0,${opacity})`;
  ctx.lineWidth = fabricPath.strokeWidth || 20;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Apply Fabric's position transform.
  // Fabric stores path objects with left/top offset and pathOffset.
  // We need to translate the 2D context to account for this.
  const left = fabricPath.left ?? 0;
  const top = fabricPath.top ?? 0;
  const offsetX = fabricPath.pathOffset?.x ?? 0;
  const offsetY = fabricPath.pathOffset?.y ?? 0;
  ctx.translate(left - offsetX, top - offsetY);

  // Build SVG path string from Fabric's path array
  const pathStr = fabricPath.path?.map((seg: any[]) => seg.join(' ')).join(' ') || '';
  const path2D = new Path2D(pathStr);
  ctx.stroke(path2D);
  ctx.restore();
}

/** Update brush appearance based on mode, size, opacity */
function updateBrush(
  canvas: any,
  mode: BrushMode,
  size: number,
  opacity: number,
): void {
  if (!canvas?.freeDrawingBrush) return;
  const normalizedOpacity = opacity / 100;
  // Keep = green strokes (erases red tint visually), Erase = red strokes (adds red tint)
  canvas.freeDrawingBrush.color = mode === 'keep'
    ? `rgba(0, 255, 0, ${normalizedOpacity * 0.5})`
    : `rgba(255, 0, 0, ${normalizedOpacity * 0.4})`;
  canvas.freeDrawingBrush.width = size;
}

/**
 * Setup brush cursor — a custom Fabric Circle that follows the mouse.
 * Shows brush size and mode (green=keep, red=erase).
 * Replaces Fabric's default crosshair which doesn't convey size/mode.
 */
function setupBrushCursor(canvas: any, fabric: any): any {
  const cursor = new fabric.Circle({
    radius: 10,
    fill: 'transparent',
    stroke: 'rgba(255,0,0,0.6)',
    strokeWidth: 1.5,
    originX: 'center',
    originY: 'center',
    selectable: false,
    evented: false,
    excludeFromExport: true,
  });
  cursor.set('visible', false);
  canvas.add(cursor);

  // Hide native cursor over canvas
  canvas.defaultCursor = 'none';
  canvas.freeDrawingCursor = 'none';

  canvas.on('mouse:move', (e: any) => {
    const pointer = canvas.getViewportPoint(e.e);
    cursor.set({ left: pointer.x, top: pointer.y, visible: true });
    cursor.bringToFront();
    canvas.renderAll();
  });

  canvas.on('mouse:out', () => {
    cursor.set('visible', false);
    canvas.renderAll();
  });

  return cursor;
}

/** Update brush cursor appearance to match current mode and size */
function updateBrushCursor(cursor: any, mode: BrushMode, size: number): void {
  if (!cursor) return;
  cursor.set({
    radius: size / 2,
    stroke: mode === 'keep' ? 'rgba(0,255,0,0.6)' : 'rgba(255,0,0,0.6)',
  });
}
```

- [ ] **Step 5: Write the brush control effects and undo handler**

Inside the component, after the init effect:

```typescript
  // Update brush when mode/size/opacity changes
  useEffect(() => {
    currentBrushModeRef.current = brushMode;
    if (fabricRef.current) {
      updateBrush(fabricRef.current, brushMode, brushSize, brushOpacity);
      updateBrushCursor(cursorRef.current, brushMode, brushSize);
    }
  }, [brushMode, brushSize, brushOpacity]);

  // Keyboard shortcut: X to toggle mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'x' || e.key === 'X') {
        setBrushMode(prev => prev === 'keep' ? 'erase' : 'keep');
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUndo = useCallback(() => {
    const canvas = fabricRef.current;
    const mc = maskCanvasRef.current;
    if (!canvas || !mc || !initialMaskRef.current) return;

    // Get all path objects (skip the tint image at index 0)
    const objects = canvas.getObjects();
    const paths = objects.filter((o: any) => o.type === 'path');
    if (paths.length === 0) return;

    // Remove last path from display canvas
    const lastPath = paths[paths.length - 1];
    canvas.remove(lastPath);
    canvas.renderAll();

    // Reset mask canvas to initial state
    const { w, h } = imageDimsRef.current;
    const maskCtx = mc.getContext('2d')!;
    maskCtx.putImageData(initialMaskRef.current, 0, 0);

    // Replay remaining paths onto mask
    const remainingPaths = paths.slice(0, -1);
    for (const path of remainingPaths) {
      mirrorPathToMask(path, mc);
    }
  }, []);
```

- [ ] **Step 6: Write the handleConfirm and the JSX render**

```typescript
  const handleConfirm = async () => {
    if (!maskCanvasRef.current) return;
    setIsApplying(true);
    setError(null);

    try {
      const maskDataUrl = maskCanvasRef.current.toDataURL('image/png');
      const refinedForeground = await applyMaskToAlpha(
        proxyUrl(originalImageUrl),
        maskCanvasRef.current,
      );
      onConfirm(refinedForeground, maskDataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply refinement');
      setIsApplying(false);
    }
  };

  const { w, h } = imageDimsRef.current;
  const scale = displayScaleRef.current;

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
        <div className="flex items-center gap-4 px-6 py-3 bg-gray-50 border-b border-gray-100 flex-wrap">
          {/* Brush mode toggle */}
          <div className="flex p-1 bg-gray-200 rounded-xl">
            {(['keep', 'erase'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setBrushMode(mode)}
                className={cn(
                  'px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all',
                  brushMode === mode
                    ? mode === 'keep'
                      ? 'bg-green-500 text-white shadow-sm'
                      : 'bg-red-500 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700',
                )}
              >
                {mode === 'keep' ? 'Keep' : 'Erase'}
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

          {/* Brush opacity */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Opacity</span>
            <input
              type="range"
              min={1}
              max={100}
              value={brushOpacity}
              onChange={(e) => setBrushOpacity(Number(e.target.value))}
              className="w-24 accent-blue-600"
            />
            <span className="text-[9px] font-bold text-gray-400 w-8 text-right">{brushOpacity}%</span>
          </div>

          {/* Keyboard hints */}
          <div className="ml-auto flex items-center gap-2 text-[8px] text-gray-400 font-bold uppercase tracking-widest">
            <span>X: toggle mode</span>
            <span>⌘Z: undo</span>
          </div>
        </div>

        {/* Canvas area */}
        <div className="flex items-center justify-center p-6 bg-gray-100 overflow-hidden"
             style={{ minHeight: '400px' }}>
          {isLoading && !error && (
            <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest animate-pulse">
              Loading editor...
            </p>
          )}
          {error && !isLoading && (
            <div className="text-center space-y-2">
              <p className="text-[10px] font-bold text-red-500">{error}</p>
              <p className="text-[9px] text-gray-400">Check network connection and try again</p>
            </div>
          )}
          <div
            style={{
              width: w * scale,
              height: h * scale,
              overflow: 'hidden',
            }}
            className={cn(isLoading && 'hidden')}
          >
            {/* Explicit wrapper div for CSS scaling — avoids depending on Fabric's internal DOM */}
            <div
              style={{
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
                width: w || undefined,
                height: h || undefined,
              }}
            >
              <canvas
                ref={displayCanvasRef}
                className="rounded-xl shadow-sm"
              />
            </div>
          </div>
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
            disabled={isApplying || !canApply}
            className="rounded-xl bg-blue-600 px-6 py-2.5 text-[10px] font-black text-white uppercase tracking-widest hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20 disabled:opacity-40"
          >
            {isApplying ? 'Applying...' : 'Apply Refinement'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Update CanvasStep to match new MaskEditorModal interface**

In `src/components/edit-image/steps/CanvasStep.tsx`, replace `handleMaskConfirm`:

```typescript
  const handleMaskConfirm = (refinedImageUrl: string, maskDataUrl: string) => {
    onStepDataChange({
      extractedImageUrl: refinedImageUrl,
      extractionMethod: 'manual',
      maskDataUrl,
    });
    setShowMaskEditor(false);
  };
```

And update the `<MaskEditorModal>` JSX to pass `maskDataUrl`:

```tsx
      {showMaskEditor && stepData.imageUrl && stepData.extractedImageUrl && (
        <MaskEditorModal
          originalImageUrl={stepData.imageUrl}
          extractedImageUrl={stepData.extractedImageUrl}
          maskDataUrl={stepData.maskDataUrl}
          onConfirm={handleMaskConfirm}
          onCancel={() => setShowMaskEditor(false)}
        />
      )}
```

- [ ] **Step 8: Verify build**

Run: `npm run build`
Expected: Clean build. All types should resolve — `proxyUrl`, `applyMaskToAlpha`, updated `MaskEditorModalProps` with `maskDataUrl`, CanvasStep's updated `handleMaskConfirm`.

- [ ] **Step 9: Manual test — open mask editor**

Run: `npm run dev`
Navigate to edit-image → select image → extract background → click "Edit" button.

Verify:
1. Modal opens without "Loading editor..." getting stuck
2. Original image fills the canvas area proportionally (not tiny in top-left)
3. Red tint visible over removed background areas
4. Subject area is clear (no red tint)
5. Custom brush cursor (circle) follows the mouse, showing brush size
6. Cursor is red for Erase mode, green for Keep mode
7. Can paint with Erase brush (red strokes appear)
8. Can switch to Keep brush and paint (green strokes clear red)
9. X key toggles between modes (cursor color changes too)
10. Size slider works (cursor resizes to match)
11. Opacity slider works
12. Ctrl+Z / ⌘+Z undoes last stroke

- [ ] **Step 10: Manual test — apply refinement**

1. Paint some strokes (add back an area, remove an area)
2. Click "Apply Refinement"
3. Modal closes, Canvas step shows the refined foreground
4. Checkerboard background should show updated transparency
5. Proceed to New Background → Preview → Save → Download works

- [ ] **Step 11: Manual test — re-edit**

1. After applying refinement, click "Edit" again
2. Modal should load with previous mask state (red tint matches last refinement)
3. Paint additional strokes
4. Apply again — cumulative refinement

- [ ] **Step 12: Commit**

```bash
git add src/components/edit-image/steps/MaskEditorModal.tsx src/components/edit-image/steps/CanvasStep.tsx
git commit -m "feat: rewrite MaskEditorModal with dual-canvas Quick Mask editor

- Photoshop-style Quick Mask: original image + red tint overlay
- Keep/Erase brushes with size and opacity controls
- Hidden mask canvas for clean pixel reads (no color blending)
- path:created stroke mirroring with sync safety assertions
- applyMaskToAlpha produces refined foreground data URL
- Re-edit support via maskDataUrl persistence
- Keyboard shortcuts: X (toggle mode), Cmd+Z (undo)
- Error handling: keeps modal open on failure for retry"
```

---

## Chunk 3: CORS Proxy (Vercel Repo)

> **Note:** This task is in the separate `edit-image-api` Vercel repo, NOT this repo. The user will create this endpoint. This chunk documents what needs to be built there.

### Task 5: Create `/api/proxy-image` endpoint in Vercel repo

**Files:**
- Create: `api/proxy-image.ts` (in the `edit-image-api` Vercel repo)

- [ ] **Step 1: Create the proxy endpoint**

```typescript
// api/proxy-image.ts (Vercel serverless function)

import type { VercelRequest, VercelResponse } from '@vercel/node';

const ALLOWED_DOMAINS = [
  'creative-insights-images-prod.creative.alliplatform.com',
  'replicate.delivery',
  'pbxt.replicate.delivery',
];

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const imageUrl = req.query.url as string;
  if (!imageUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  // Validate against allowlist
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(imageUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  if (!ALLOWED_DOMAINS.includes(parsedUrl.hostname)) {
    return res.status(403).json({ error: `Domain not allowed: ${parsedUrl.hostname}` });
  }

  try {
    const upstream = await fetch(imageUrl);
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Upstream error: ${upstream.status}` });
    }

    const contentLength = upstream.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > MAX_SIZE) {
      return res.status(413).json({ error: 'Image exceeds 10MB limit' });
    }

    const contentType = upstream.headers.get('content-type') || 'image/png';
    const buffer = Buffer.from(await upstream.arrayBuffer());

    if (buffer.length > MAX_SIZE) {
      return res.status(413).json({ error: 'Image exceeds 10MB limit' });
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache 24h
    return res.send(buffer);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch image' });
  }
}
```

- [ ] **Step 2: Add CORS preflight support**

Browsers may send OPTIONS preflight requests. Add to the same file, at the top of the handler:

```typescript
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
```

- [ ] **Step 3: Deploy and test**

```bash
# In the edit-image-api repo
vercel deploy

# Test with a known image URL
curl -I "https://edit-image-api.vercel.app/api/proxy-image?url=https://replicate.delivery/test.png"
# Should return 200 with Access-Control-Allow-Origin: *

# Test with non-allowlisted domain
curl -I "https://edit-image-api.vercel.app/api/proxy-image?url=https://evil.com/image.png"
# Should return 403
```

- [ ] **Step 4: Commit (in Vercel repo)**

```bash
git add api/proxy-image.ts
git commit -m "feat: add CORS image proxy with domain allowlist"
```

---

## Execution Order

1. **Chunk 3 (Task 5)** should be deployed first since the frontend depends on the proxy being live
2. **Chunk 1 (Tasks 1-3)** builds the foundation utilities
3. **Chunk 2 (Task 4)** is the main rewrite that brings everything together

However, Tasks 1-3 can be developed and committed without the proxy being live — they'll just fail gracefully at runtime until the proxy is deployed. So the chunks can be developed in parallel if needed.

## Verification Checklist

After all tasks are complete:

- [ ] `npm run build` passes cleanly
- [ ] Modal opens with image filling the canvas (not tiny/mispositioned)
- [ ] Red tint visible over removed areas, subject area clear
- [ ] Keep brush erases red tint, Erase brush paints red tint
- [ ] Opacity slider affects brush transparency
- [ ] X key toggles mode, ⌘Z undoes strokes
- [ ] "Apply Refinement" produces a refined foreground with correct alpha
- [ ] Download button works with refined foreground
- [ ] Re-opening editor restores previous mask state
- [ ] No console errors during normal operation

## Known Limitations

- If the user skips mask refinement (uses the raw API extraction URL) and picks an external background image, the Save step's `compositeImage.ts` will fail due to CORS on the external URLs. This is deferred — the mask editor prototype does not require it. Future fix: route external URLs through `proxyUrl()` in `compositeImage.ts`.
- No zoom/pan — users must work at the default scale. Large images may be hard to refine at fine detail.
- Brush opacity slider min is 1% (not 0%) since a 0% opacity brush is functionally useless.
