# Selection Tools V2 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the existing structured selection tools (magic wand, brush, pipeline), add the Text Selection Tool, add Invert Selection, add Vitest unit tests, and apply all fixes from the CEO plan review.

**Prior work:** Commit `25b2ab0` on `new_layers` branch implemented the initial magic wand + pipeline + brush extraction. This plan builds on top of that.

**Specs:**
- `docs/superpowers/specs/2026-03-16-structured-selection-tools-design.md`
- `docs/superpowers/specs/2026-03-16-text-selection-tool-design.md`

**Tech Stack:** React 19, TypeScript, Fabric.js 7.2, magic-wand-tool, tesseract.js (new), Vitest (new), Canvas2D API

**Review decisions incorporated:** 12 decisions from CEO plan review (2026-03-17)

---

## File Structure

```
src/components/edit-image/steps/
  MaskEditorModal.tsx                  <- MODIFY: add TextTool integration, fixes, invert
  mask-editor/
    types.ts                           <- MODIFY: widen SelectionTool interface, add TextRegion
    marchingAnts.ts                    <- EXISTS (unchanged)
    SelectionPipeline.ts               <- MODIFY: add invertSelection(), reduce undo depth
    MagicWandTool.ts                   <- MODIFY: add resetDrag()
    BrushTool.ts                       <- EXISTS (unchanged)
    maskUtils.ts                       <- EXISTS (unchanged)
    TextTool.ts                        <- CREATE: Tesseract OCR + word highlight + bbox selection
    __tests__/
      SelectionPipeline.test.ts        <- CREATE: unit tests
      MagicWandTool.test.ts            <- CREATE: unit tests
      bboxToMask.test.ts               <- CREATE: unit tests
```

---

## Decision Reference

| # | Decision | Task |
|---|---|---|
| D1 | Widen `SelectionTool` interface: `activate({ imageData, overlayCanvas })` | Task 1 |
| D2 | Try/catch + toast on `handleTintUpdate` | Task 2 |
| D3 | 30s timeout on Tesseract recognition | Task 5 |
| D4 | `resetDrag()` on MagicWandTool, called on commit/cancel | Task 3 |
| D5 | `canvas.insertAt(fabricTint, 0)` instead of add+moveTo | Task 2 |
| D6 | Add Vitest for core modules | Task 8 |
| D7 | Reduce MAX_UNDO_DEPTH to 10 | Task 3 |
| D8 | Build "Invert Selection" in MVP | Task 4 |
| D9-12 | Deferred items → TODOS.md | Task 9 |

---

## Chunk 1: Hardening & Interface Fixes (on existing code)

### Task 1: Widen SelectionTool Interface (D1)

**Files:**
- Modify: `src/components/edit-image/steps/mask-editor/types.ts`
- Modify: `src/components/edit-image/steps/mask-editor/MagicWandTool.ts`
- Modify: `src/components/edit-image/steps/MaskEditorModal.tsx`

**Why:** The current `SelectionTool.activate(imageData)` signature is too narrow for TextTool (which needs the overlay canvas for highlight rendering). Widening the interface enables polymorphic dispatch and prevents if/else branches for each new tool.

- [ ] **Step 1: Update types.ts — widen SelectionTool interface**

Replace the current `SelectionTool` interface with a config-object-based activation:

```ts
/** Configuration passed to selection tools on activation */
export interface SelectionToolConfig {
  imageData: ImageData;
  overlayCanvas: HTMLCanvasElement;
  imageWidth: number;
  imageHeight: number;
}

/**
 * Common interface for all selection tools.
 * All tools receive the same config; each tool uses what it needs.
 */
export interface SelectionTool {
  activate(config: SelectionToolConfig): void;
  deactivate(): void;
  onEvent(event: CanvasEvent): BinaryMask | null;
  /** Reset any in-progress interaction (e.g., drag state) */
  resetDrag?(): void;
}
```

Also add the `TextRegion` interface (needed by Task 5):

```ts
/** A detected text region from Tesseract OCR */
export interface TextRegion {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  confidence: number;
}
```

- [ ] **Step 2: Update MagicWandTool to match new interface**

Change `activate(imageData: ImageData)` to `activate(config: SelectionToolConfig)`:

```ts
activate(config: SelectionToolConfig): void {
  const { imageData } = config;
  this.state.imageData = imageData;
  this.state.image = {
    data: new Uint8Array(imageData.data.buffer),
    width: imageData.width,
    height: imageData.height,
    bytes: 4,
  };
  this.state.isActive = true;
}
```

MagicWandTool ignores `overlayCanvas` — it only needs `imageData`.

- [ ] **Step 3: Update MaskEditorModal init to pass config object**

Change line ~201 from:
```ts
magicWandRef.current.activate(originalImageDataRef.current!);
```
To:
```ts
magicWandRef.current.activate({
  imageData: originalImageDataRef.current!,
  overlayCanvas: overlayCanvasRef.current!,
  imageWidth: w,
  imageHeight: h,
});
```

- [ ] **Step 4: Extract coordinate conversion helper**

Create a `toImageCoords` utility in MaskEditorModal (or a small helper) to DRY up the offsetX/fitScale clamping that will be shared between magic wand and text tool event handling:

```ts
function toCanvasEvent(
  e: React.MouseEvent<HTMLCanvasElement>,
  dims: DisplayDims,
): CanvasEvent {
  return {
    type: e.type === 'mousedown' ? 'mousedown' : e.type === 'mousemove' ? 'mousemove' : 'mouseup',
    x: Math.min(Math.max(e.nativeEvent.offsetX / dims.fitScale, 0), dims.w - 1),
    y: Math.min(Math.max(e.nativeEvent.offsetY / dims.fitScale, 0), dims.h - 1),
    shiftKey: e.shiftKey,
    altKey: e.altKey,
    nativeEvent: e.nativeEvent,
  };
}
```

- [ ] **Step 5: Verify build compiles**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 6: Commit**

```
feat: widen SelectionTool interface for polymorphic tool dispatch
```

---

### Task 2: Fix handleTintUpdate + tint z-ordering (D2, D5)

**Files:**
- Modify: `src/components/edit-image/steps/MaskEditorModal.tsx`

**Why:** `handleTintUpdate` is async with no error handling — a failure silently kills tint updates for the session. Also, `canvas.add()` + `canvas.moveTo(0)` causes a brief visual flash.

- [ ] **Step 1: Wrap handleTintUpdate in try/catch**

```ts
const handleTintUpdate = useCallback(async () => {
  if (!maskCanvasRef.current || !fabricRef.current) return;
  const canvas = fabricRef.current;

  try {
    if (tintBlobUrlRef.current) URL.revokeObjectURL(tintBlobUrlRef.current);

    const newTintUrl = await regenerateTint(maskCanvasRef.current);
    tintBlobUrlRef.current = newTintUrl;

    if (tintObjRef.current) {
      canvas.remove(tintObjRef.current);
    }

    const { FabricImage } = await import('fabric');
    const tintImg = await loadImg(newTintUrl);
    const fabricTint = new FabricImage(tintImg, {
      left: 0,
      top: 0,
      originX: 'left',
      originY: 'top',
      selectable: false,
      evented: false,
    });

    // D5: Insert at index 0 directly instead of add+moveTo to avoid visual flash
    canvas.insertAt(fabricTint, 0);
    tintObjRef.current = fabricTint;
    canvas.renderAll();
  } catch (err) {
    console.error('[MaskEditor] Tint update failed:', err);
    setError('Tint preview failed — mask still saved. Try committing again.');
  }
}, []);
```

**Note:** Uses `setError` for the toast since this codebase doesn't have a toast system. The error banner is non-blocking (doesn't prevent Apply Refinement).

- [ ] **Step 2: Remove dead `canApply` state variable**

Delete line 63: `const [canApply] = useState(true);`

Update the Apply Refinement button's `disabled` prop from `disabled={isApplying || !canApply}` to `disabled={isApplying}`.

- [ ] **Step 3: Rename `brushMode` → `selectionMode`**

Replace all occurrences of `brushMode` with `selectionMode` and `setBrushMode` with `setSelectionMode` in MaskEditorModal.tsx. This name better reflects that the mode applies to all tools, not just brush.

- [ ] **Step 4: Verify build compiles**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```
fix: add error handling to tint update, fix z-ordering flash
```

---

### Task 3: MagicWandTool resetDrag + Pipeline hardening (D4, D7)

**Files:**
- Modify: `src/components/edit-image/steps/mask-editor/MagicWandTool.ts`
- Modify: `src/components/edit-image/steps/mask-editor/SelectionPipeline.ts`
- Modify: `src/components/edit-image/steps/MaskEditorModal.tsx`

**Why:** Pressing Enter/Escape/Cmd+Z during a drag leaves `downPoint` set, causing surprise selections on next mouse move. Also, undo stack of 20 can consume 240 MB on large images.

- [ ] **Step 1: Add resetDrag() to MagicWandTool**

```ts
/** Reset drag state — called on pipeline commit/cancel to prevent stale downPoint */
resetDrag(): void {
  this.state.downPoint = null;
}
```

- [ ] **Step 2: Reduce MAX_UNDO_DEPTH from 20 to 10 in SelectionPipeline.ts**

Change line 4:
```ts
const MAX_UNDO_DEPTH = 10;
```

- [ ] **Step 3: Call resetDrag from keyboard handler in MaskEditorModal**

Update the keyboard handler to call `resetDrag()` on the active tool after commit/cancel/undo:

```ts
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    const activeMagicWand = activeTool === 'magicwand' ? magicWandRef.current : null;
    const activeTextTool = activeTool === 'text' ? textToolRef.current : null;

    if (e.key === 'Enter') {
      e.preventDefault();
      pipelineRef.current?.commit(selectionMode);
      activeMagicWand?.resetDrag();
      setHasPendingSelection(false);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      pipelineRef.current?.cancel();
      activeMagicWand?.resetDrag();
      setHasPendingSelection(false);
    } else if (e.key === 'x' || e.key === 'X') {
      setSelectionMode((prev) => (prev === 'keep' ? 'erase' : 'keep'));
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
      e.preventDefault();
      if (activeTool === 'brush') {
        brushToolRef.current?.undo();
      } else {
        pipelineRef.current?.undo();
        activeMagicWand?.resetDrag();
      }
    }
  };
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [activeTool, selectionMode]);
```

- [ ] **Step 4: Verify build compiles**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```
fix: reset drag state on commit/cancel, reduce undo depth to 10
```

---

### Task 4: Invert Selection (D8)

**Files:**
- Modify: `src/components/edit-image/steps/mask-editor/SelectionPipeline.ts`
- Modify: `src/components/edit-image/steps/MaskEditorModal.tsx`

**Why:** When analysts magic-wand the background, they often want to keep the foreground (the inverse). "Invert" flips the pending mask before committing — saves a multi-step workflow.

- [ ] **Step 1: Add invertSelection() to SelectionPipeline**

```ts
/** Invert the pending selection — flip 0s and 1s */
invertSelection(): void {
  if (!this.pendingMask) return;

  const { data, width, height } = this.pendingMask;
  const inverted = new Uint8Array(width * height);
  let minX = width, minY = height, maxX = 0, maxY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      inverted[idx] = data[idx] === 1 ? 0 : 1;
      if (inverted[idx] === 1) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  const invertedMask: BinaryMask = {
    data: inverted,
    width,
    height,
    bounds: minX <= maxX
      ? { minX, minY, maxX, maxY }
      : { minX: 0, minY: 0, maxX: 0, maxY: 0 },
  };

  this.setPendingMask(invertedMask);
}
```

- [ ] **Step 2: Add Invert button to MaskEditorModal toolbar**

Add next to the "Apply Selection (Enter)" button in the footer, visible only when there's a pending selection:

```tsx
{hasPendingSelection && (
  <>
    <button
      onClick={() => {
        pipelineRef.current?.invertSelection();
      }}
      className="rounded-xl border border-purple-300 bg-purple-50 px-4 py-2.5 text-[10px] font-black text-purple-600 uppercase tracking-widest hover:bg-purple-100 transition-all"
    >
      Invert (⌘⇧I)
    </button>
    <button
      onClick={() => {
        pipelineRef.current?.commit(selectionMode);
        setHasPendingSelection(false);
      }}
      className="rounded-xl border border-blue-300 bg-blue-50 px-6 py-2.5 text-[10px] font-black text-blue-600 uppercase tracking-widest hover:bg-blue-100 transition-all"
    >
      Apply Selection (Enter)
    </button>
  </>
)}
```

- [ ] **Step 3: Add Cmd+Shift+I keyboard shortcut**

In the keyboard handler:
```ts
} else if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'i' || e.key === 'I')) {
  e.preventDefault();
  pipelineRef.current?.invertSelection();
}
```

**Important:** Place this BEFORE the Cmd+Z handler to avoid conflicts.

- [ ] **Step 4: Add hint to keyboard shortcuts bar**

Add `⌘⇧I: invert` to the keyboard hints in the toolbar.

- [ ] **Step 5: Verify build compiles**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 6: Commit**

```
feat: add invert selection with Cmd+Shift+I shortcut
```

---

## Chunk 2: Text Selection Tool (D1, D3)

### Task 5: Create TextTool.ts

**Files:**
- Create: `src/components/edit-image/steps/mask-editor/TextTool.ts`

**Why:** Analysts need structured text selection for background removal — rectangle-based detection via Tesseract OCR, feeding into the existing SelectionPipeline.

- [ ] **Step 1: Install tesseract.js**

```bash
npm install tesseract.js
```

- [ ] **Step 2: Create TextTool.ts**

```ts
import type { BinaryMask, CanvasEvent, SelectionTool, SelectionToolConfig, TextRegion } from './types';

type DetectionStatus = 'idle' | 'loading' | 'ready' | 'error';
const DETECTION_TIMEOUT_MS = 30_000;

const HIGHLIGHT_COLORS = {
  default: { fill: 'rgba(59, 130, 246, 0.25)', stroke: 'rgba(59, 130, 246, 0.6)' },
  hovered: { fill: 'rgba(59, 130, 246, 0.4)', stroke: 'rgba(59, 130, 246, 0.8)' },
  selectedKeep: { fill: 'rgba(34, 197, 94, 0.35)', stroke: 'rgba(34, 197, 94, 0.7)' },
  selectedErase: { fill: 'rgba(239, 68, 68, 0.35)', stroke: 'rgba(239, 68, 68, 0.7)' },
};

export class TextTool implements SelectionTool {
  private overlayCanvas: HTMLCanvasElement | null = null;
  private imageWidth = 0;
  private imageHeight = 0;
  private regions: TextRegion[] = [];
  private hoveredIndex = -1;
  private status: DetectionStatus = 'idle';
  private worker: any = null;
  private isActive = false;
  private onStatusChange: ((status: DetectionStatus, wordCount: number) => void) | null = null;

  /** Register a callback for detection status changes */
  setStatusCallback(cb: (status: DetectionStatus, wordCount: number) => void): void {
    this.onStatusChange = cb;
  }

  activate(config: SelectionToolConfig): void {
    this.overlayCanvas = config.overlayCanvas;
    this.imageWidth = config.imageWidth;
    this.imageHeight = config.imageHeight;
    this.isActive = true;
    if (this.status === 'ready') {
      this.renderHighlights();
    }
  }

  deactivate(): void {
    this.isActive = false;
    this.hoveredIndex = -1;
    this.clearOverlay();
  }

  /** Start background OCR detection. Call once during modal init. */
  async detect(imageCanvas: HTMLCanvasElement): Promise<void> {
    if (this.status === 'loading' || this.status === 'ready') return;

    this.status = 'loading';
    this.onStatusChange?.('loading', 0);

    try {
      const Tesseract = await import('tesseract.js');

      // D3: Race recognition against 30s timeout
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('OCR detection timed out')), DETECTION_TIMEOUT_MS),
      );

      this.worker = await Tesseract.createWorker('eng');
      const result = await Promise.race([
        this.worker.recognize(imageCanvas),
        timeoutPromise,
      ]);

      // Extract word-level bounding boxes, filter low confidence
      this.regions = (result.data.words || [])
        .filter((w: any) => w.confidence >= 50)
        .map((w: any): TextRegion => ({
          text: w.text,
          bbox: w.bbox,
          confidence: w.confidence / 100,
        }));

      // Terminate worker to free memory
      await this.worker.terminate();
      this.worker = null;

      this.status = 'ready';
      this.onStatusChange?.('ready', this.regions.length);

      // If tool is already active, render highlights
      if (this.isActive) {
        this.renderHighlights();
      }
    } catch (err) {
      console.error('[TextTool] Detection failed:', err);
      this.status = 'error';
      this.onStatusChange?.('error', 0);

      if (this.worker) {
        try { await this.worker.terminate(); } catch { /* ignore */ }
        this.worker = null;
      }
    }
  }

  onEvent(event: CanvasEvent): BinaryMask | null {
    if (!this.isActive || this.status !== 'ready') return null;

    if (event.type === 'mousemove') {
      this.updateHover(event.x, event.y);
      return null;
    }

    if (event.type === 'mousedown') {
      const hitIndex = this.hitTest(event.x, event.y);
      if (hitIndex === -1) return null;
      return this.bboxToMask(this.regions[hitIndex].bbox);
    }

    return null;
  }

  /** Optional resetDrag (no drag state for text tool, but satisfies interface) */
  resetDrag(): void {
    // No-op: text tool has no drag state
  }

  getRegions(): TextRegion[] {
    return this.regions;
  }

  getStatus(): DetectionStatus {
    return this.status;
  }

  /** Clean up worker if detection is in progress */
  destroy(): void {
    this.isActive = false;
    if (this.worker) {
      try { this.worker.terminate(); } catch { /* ignore */ }
      this.worker = null;
    }
  }

  // ── Private methods ───────────────────────────────────────────

  private hitTest(x: number, y: number): number {
    for (let i = 0; i < this.regions.length; i++) {
      const { x0, y0, x1, y1 } = this.regions[i].bbox;
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return i;
    }
    return -1;
  }

  private updateHover(x: number, y: number): void {
    const newIndex = this.hitTest(x, y);
    if (newIndex === this.hoveredIndex) return;
    this.hoveredIndex = newIndex;
    this.renderHighlights();
  }

  private renderHighlights(): void {
    if (!this.overlayCanvas) return;
    const ctx = this.overlayCanvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);

    for (let i = 0; i < this.regions.length; i++) {
      const { x0, y0, x1, y1 } = this.regions[i].bbox;
      const w = x1 - x0;
      const h = y1 - y0;

      const colors = i === this.hoveredIndex
        ? HIGHLIGHT_COLORS.hovered
        : HIGHLIGHT_COLORS.default;

      ctx.fillStyle = colors.fill;
      ctx.fillRect(x0, y0, w, h);
      ctx.strokeStyle = colors.stroke;
      ctx.lineWidth = 1;
      ctx.strokeRect(x0, y0, w, h);
    }
  }

  private clearOverlay(): void {
    if (!this.overlayCanvas) return;
    const ctx = this.overlayCanvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
  }

  private bboxToMask(bbox: { x0: number; y0: number; x1: number; y1: number }): BinaryMask {
    const padding = 2;
    const x0 = Math.max(0, bbox.x0 - padding);
    const y0 = Math.max(0, bbox.y0 - padding);
    const x1 = Math.min(this.imageWidth - 1, bbox.x1 + padding);
    const y1 = Math.min(this.imageHeight - 1, bbox.y1 + padding);

    const data = new Uint8Array(this.imageWidth * this.imageHeight);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        data[y * this.imageWidth + x] = 1;
      }
    }

    return {
      data,
      width: this.imageWidth,
      height: this.imageHeight,
      bounds: { minX: x0, minY: y0, maxX: x1, maxY: y1 },
    };
  }
}
```

- [ ] **Step 3: Verify build compiles**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```
feat: add TextTool with Tesseract OCR detection and word selection
```

---

### Task 6: Integrate TextTool into MaskEditorModal

**Files:**
- Modify: `src/components/edit-image/steps/MaskEditorModal.tsx`

**Why:** Wire TextTool into the modal: toolbar button, detection trigger, event routing, overlay canvas sharing.

- [ ] **Step 1: Expand ActiveTool type**

```ts
type ActiveTool = 'magicwand' | 'text' | 'brush';
```

- [ ] **Step 2: Add TextTool state**

```ts
import { TextTool } from './mask-editor/TextTool';

// Inside the component:
const textToolRef = useRef<TextTool | null>(null);
const [textDetectionStatus, setTextDetectionStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
const [detectedWordCount, setDetectedWordCount] = useState(0);
```

- [ ] **Step 3: Initialize TextTool in init effect**

After the magic wand initialization (~line 200), add:

```ts
// Initialize text tool (detection starts immediately in background)
const textTool = new TextTool();
textTool.setStatusCallback((status, count) => {
  if (cancelled) return;
  setTextDetectionStatus(status);
  setDetectedWordCount(count);
});
textToolRef.current = textTool;

// Start background detection using a canvas with the original image
const detectCanvas = document.createElement('canvas');
detectCanvas.width = w;
detectCanvas.height = h;
const detectCtx = detectCanvas.getContext('2d')!;
detectCtx.drawImage(origImg, 0, 0);
textTool.detect(detectCanvas);
```

- [ ] **Step 4: Update cleanup effect**

Add to the cleanup function:
```ts
textToolRef.current?.destroy();
```

- [ ] **Step 5: Update switchTool to handle text tool**

```ts
const switchTool = useCallback(
  (tool: ActiveTool) => {
    if (tool === activeTool) return;

    // Cancel any pending selection
    pipelineRef.current?.cancel();
    setHasPendingSelection(false);

    // Deactivate current tool
    if (activeTool === 'brush') {
      brushToolRef.current?.deactivate();
      pipelineRef.current?.snapshotInitialMask();
    } else if (activeTool === 'text') {
      textToolRef.current?.deactivate();
    }

    // Activate new tool
    if (tool === 'brush') {
      brushToolRef.current?.activate(selectionMode, brushSize, brushOpacity);
    } else if (tool === 'text' && textToolRef.current) {
      textToolRef.current.activate({
        imageData: originalImageDataRef.current!,
        overlayCanvas: overlayCanvasRef.current!,
        imageWidth: displayDims.w,
        imageHeight: displayDims.h,
      });
    }

    setActiveTool(tool);
  },
  [activeTool, selectionMode, brushSize, brushOpacity, displayDims],
);
```

- [ ] **Step 6: Update overlay canvas pointer-events**

Change the overlay canvas style from:
```ts
pointerEvents: activeTool === 'magicwand' ? 'auto' : 'none',
```
To:
```ts
pointerEvents: (activeTool === 'magicwand' || activeTool === 'text') ? 'auto' : 'none',
cursor: activeTool === 'text' ? 'pointer' : 'crosshair',
```

- [ ] **Step 7: Update handleOverlayPointerEvent to route to text tool**

```ts
const handleOverlayPointerEvent = useCallback(
  (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!pipelineRef.current) return;

    const canvasEvent = toCanvasEvent(e, displayDims);
    let mask: BinaryMask | null = null;

    if (activeTool === 'magicwand' && magicWandRef.current) {
      mask = magicWandRef.current.onEvent(canvasEvent);
      if (mask) setThreshold(magicWandRef.current.getThreshold());
    } else if (activeTool === 'text' && textToolRef.current) {
      mask = textToolRef.current.onEvent(canvasEvent);
    }

    if (mask) {
      if (canvasEvent.shiftKey && canvasEvent.type === 'mousedown') {
        pipelineRef.current.addToSelection(mask);
      } else if (canvasEvent.altKey && canvasEvent.type === 'mousedown') {
        pipelineRef.current.subtractFromSelection(mask);
      } else {
        pipelineRef.current.setPendingMask(mask);
      }
      setHasPendingSelection(true);
    }
  },
  [activeTool, displayDims],
);
```

- [ ] **Step 8: Re-render text highlights after commit/cancel**

When `hasPendingSelection` goes from `true` to `false` and the text tool is active, re-render highlights (since ants just cleared the overlay canvas). Add to the commit/cancel handlers:

```ts
// After commit or cancel, if text tool is active, re-render highlights
if (activeTool === 'text') {
  textToolRef.current?.activate({
    imageData: originalImageDataRef.current!,
    overlayCanvas: overlayCanvasRef.current!,
    imageWidth: displayDims.w,
    imageHeight: displayDims.h,
  });
}
```

- [ ] **Step 9: Add Text button to toolbar**

Between the magic wand button and keep/erase toggle:

```tsx
<button
  onClick={() => switchTool('text')}
  disabled={textDetectionStatus === 'error' || (textDetectionStatus === 'ready' && detectedWordCount === 0)}
  className={cn(
    'px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all',
    activeTool === 'text'
      ? 'bg-blue-600 text-white shadow-sm'
      : textDetectionStatus === 'loading'
        ? 'text-gray-400 animate-pulse'
        : textDetectionStatus === 'error' || detectedWordCount === 0
          ? 'text-gray-300 cursor-not-allowed'
          : 'text-gray-500 hover:text-gray-700',
  )}
>
  {textDetectionStatus === 'loading'
    ? 'Detecting...'
    : textDetectionStatus === 'ready'
      ? `Text (${detectedWordCount})`
      : textDetectionStatus === 'error'
        ? 'Text (error)'
        : 'Text'}
</button>
```

- [ ] **Step 10: Verify build compiles**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 11: Commit**

```
feat: integrate TextTool into MaskEditorModal with toolbar and event routing
```

---

## Chunk 3: Testing

### Task 7: Setup Vitest (D6)

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install Vitest + happy-dom**

```bash
npm install -D vitest happy-dom
```

- [ ] **Step 2: Create vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Add test script to package.json**

Add to `scripts`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Verify vitest runs (no tests yet)**

```bash
npm test
```

Expected: "No test files found" or similar.

- [ ] **Step 5: Commit**

```
chore: add Vitest test framework with happy-dom
```

---

### Task 8: Write unit tests (D6)

**Files:**
- Create: `src/components/edit-image/steps/mask-editor/__tests__/SelectionPipeline.test.ts`
- Create: `src/components/edit-image/steps/mask-editor/__tests__/MagicWandTool.test.ts`
- Create: `src/components/edit-image/steps/mask-editor/__tests__/bboxToMask.test.ts`

- [ ] **Step 1: Create SelectionPipeline tests**

Test cases:
- `commit()` with no pending mask → no-op
- `commit()` writes mask to canvas (check pixel values)
- `undo()` restores to initial state
- `undo()` replays remaining stack entries
- `undo()` with empty stack → no-op
- `addToSelection()` merges two masks (OR)
- `subtractFromSelection()` subtracts mask (AND NOT)
- `invertSelection()` flips all bits
- `invertSelection()` with no pending → no-op
- `cancel()` clears pending mask
- `snapshotInitialMask()` resets undo stack
- MAX_UNDO_DEPTH is 10 (shift behavior)

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { SelectionPipeline } from '../SelectionPipeline';
import type { BinaryMask } from '../types';

function createMockCanvas(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  // Fill with white (keep all)
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(w, h);
  for (let i = 0; i < imgData.data.length; i += 4) {
    imgData.data[i] = 255;
    imgData.data[i + 1] = 255;
    imgData.data[i + 2] = 255;
    imgData.data[i + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

function createMask(w: number, h: number, selectedPixels: [number, number][]): BinaryMask {
  const data = new Uint8Array(w * h);
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (const [x, y] of selectedPixels) {
    data[y * w + x] = 1;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return {
    data, width: w, height: h,
    bounds: selectedPixels.length > 0
      ? { minX, minY, maxX, maxY }
      : { minX: 0, minY: 0, maxX: 0, maxY: 0 },
  };
}

describe('SelectionPipeline', () => {
  let maskCanvas: HTMLCanvasElement;
  let overlayCanvas: HTMLCanvasElement;
  let pipeline: SelectionPipeline;
  let tintUpdateCount: number;

  beforeEach(() => {
    maskCanvas = createMockCanvas(10, 10);
    overlayCanvas = createMockCanvas(10, 10);
    tintUpdateCount = 0;
    const initialMaskData = maskCanvas.getContext('2d')!.getImageData(0, 0, 10, 10);
    pipeline = new SelectionPipeline({
      overlayCanvas,
      maskCanvas,
      initialMaskData,
      onTintUpdate: () => { tintUpdateCount++; },
    });
  });

  it('commit with no pending mask is a no-op', () => {
    pipeline.commit('keep');
    expect(tintUpdateCount).toBe(0);
  });

  it('commit writes mask to canvas and calls onTintUpdate', () => {
    const mask = createMask(10, 10, [[2, 3], [4, 5]]);
    pipeline.setPendingMask(mask);
    pipeline.commit('erase');
    expect(tintUpdateCount).toBe(1);

    const ctx = maskCanvas.getContext('2d')!;
    const pixel = ctx.getImageData(2, 3, 1, 1).data;
    // Erase mode → black pixel
    expect(pixel[0]).toBe(0);
  });

  it('undo restores initial state after one commit', () => {
    const mask = createMask(10, 10, [[0, 0]]);
    pipeline.setPendingMask(mask);
    pipeline.commit('erase');

    pipeline.undo();

    const ctx = maskCanvas.getContext('2d')!;
    const pixel = ctx.getImageData(0, 0, 1, 1).data;
    // Should be restored to white (initial)
    expect(pixel[0]).toBe(255);
  });

  it('undo with empty stack is a no-op', () => {
    pipeline.undo();
    expect(tintUpdateCount).toBe(0);
  });

  it('cancel clears pending mask', () => {
    const mask = createMask(10, 10, [[0, 0]]);
    pipeline.setPendingMask(mask);
    expect(pipeline.hasPending()).toBe(true);
    pipeline.cancel();
    expect(pipeline.hasPending()).toBe(false);
  });

  it('invertSelection flips mask bits', () => {
    // Select just pixel (0,0)
    const mask = createMask(10, 10, [[0, 0]]);
    pipeline.setPendingMask(mask);
    pipeline.invertSelection();

    const pending = pipeline.getPendingMask();
    expect(pending).not.toBeNull();
    // (0,0) should now be 0
    expect(pending!.data[0]).toBe(0);
    // (1,0) should now be 1
    expect(pending!.data[1]).toBe(1);
  });

  it('respects MAX_UNDO_DEPTH of 10', () => {
    for (let i = 0; i < 15; i++) {
      const mask = createMask(10, 10, [[i % 10, 0]]);
      pipeline.setPendingMask(mask);
      pipeline.commit('keep');
    }
    // Should only be able to undo 10 times
    expect(pipeline.canUndo()).toBe(true);
    for (let i = 0; i < 10; i++) {
      pipeline.undo();
    }
    expect(pipeline.canUndo()).toBe(false);
  });
});
```

- [ ] **Step 2: Create bboxToMask tests**

Export the `bboxToMask` function from TextTool (or extract to a separate utility) and test:

```ts
import { describe, it, expect } from 'vitest';

// Note: bboxToMask is a private method on TextTool.
// For testing, extract it to a standalone exported function in TextTool.ts
// or create a testable wrapper.

describe('bboxToMask', () => {
  it('creates mask with correct bounds including padding', () => {
    // Test with a 10x10 image, bbox from (2,2) to (5,5)
    // With 2px padding: (0,0) to (7,7)
    // Verify data[0*10+0] = 1 (padded into)
    // Verify data[9*10+9] = 0 (outside)
  });

  it('clamps bbox to image bounds', () => {
    // Test with bbox extending past image edges
    // bbox (0,0) to (12,12) on a 10x10 image
    // Should clamp to (0,0) to (9,9)
  });

  it('handles zero-size image gracefully', () => {
    // Width or height = 0 should return empty mask
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npm test
```

All tests should pass.

- [ ] **Step 4: Commit**

```
test: add unit tests for SelectionPipeline and bboxToMask
```

---

## Chunk 4: Cleanup & Documentation

### Task 9: Create TODOS.md + update CLAUDE.md

**Files:**
- Create: `TODOS.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Create TODOS.md with deferred items**

```md
# TODOS

## Selection Tools — Deferred Enhancements

### Select All Text button
**Priority:** P2 | **Size:** S
One-click to select all detected text regions. Iterates TextRegion[], creates merged BinaryMask from all bboxes, feeds to pipeline. ~10 min.

### Magic wand threshold slider
**Priority:** P3 | **Size:** S
Editable input or slider as alternative to drag-to-adjust threshold. ~20 min.

### Selection fill preview
**Priority:** P2 | **Size:** S
Semi-transparent fill (10-20% opacity blue) inside marching ants selection. Makes non-contiguous selections visually clearer. Modify drawHatch to fill interior pixels. ~20 min.

### First-use shortcut hints overlay
**Priority:** P3 | **Size:** S
Translucent overlay on canvas area showing interaction hints. Auto-dismiss after 5s or first interaction. localStorage flag for "seen". ~15 min.

## Post-MVP Tools

### Pen Tool (polygon + Bezier)
**Priority:** P2 | **Size:** L
Spec in `docs/superpowers/specs/2026-03-16-structured-selection-tools-design.md`. Implements SelectionTool interface. Click places vertices, drag creates Bezier control handles. Rasterizes closed path to BinaryMask.

### Color Pick Tool
**Priority:** P2 | **Size:** M
Click picks reference color, scans all pixels by Euclidean RGB distance, marks matching pixels. Drag adjusts tolerance. Same interaction model as magic wand.

## Architecture Improvements

### Decompose MaskEditorModal
**Priority:** P3 | **Size:** L
Extract toolbar, canvas area, and footer into separate components. Use custom hooks for tool state management. Target: orchestrator < 200 lines.

### Compressed undo entries
**Priority:** P3 | **Size:** M
Store only bounds-region data in undo stack instead of full-image Uint8Arrays. ~95% memory reduction for large images.
```

- [ ] **Step 2: Update CLAUDE.md — add test command and text tool note**

Add to the Build & Dev Commands section:
```
npm run test         # Run Vitest unit tests
npm run test:watch   # Run Vitest in watch mode
```

Update the "No test framework" note to:
```
Vitest is configured for unit tests. Run `npm test` to execute. E2E tests are not yet configured.
```

- [ ] **Step 3: Commit**

```
docs: add TODOS.md with deferred enhancements, update CLAUDE.md for Vitest
```

---

### Task 10: Manual testing checklist

**No files changed — verification only.**

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Magic wand flow**

1. Navigate to edit-image → select an image → extract background → open mask editor
2. Click on a region → marching ants should appear
3. Drag to adjust tolerance → ants should update live, threshold label updates
4. Shift+click another region → ants expand (additive)
5. Alt+click inside selection → ants shrink (subtractive)
6. Click "Invert" button (or Cmd+Shift+I) → ants invert
7. Press Enter → tint updates, ants disappear
8. Press Cmd+Z → previous selection undone, tint reverts
9. Press Escape during a selection → ants disappear, no commit

- [ ] **Step 3: Text tool flow**

1. Observe "Detecting..." label on Text button during init
2. Wait for detection to complete → button shows "Text (N)" with word count
3. Click Text button → word highlights appear on overlay
4. Hover over a word → highlight brightens
5. Click a word → marching ants around word bbox
6. Shift+click another word → ants expand
7. Enter to commit → tint updates
8. Switch back to magic wand → highlights disappear
9. Switch to text → highlights reappear instantly (cached)

- [ ] **Step 4: Brush flow (advanced)**

1. Click "Advanced" → brush tool activates
2. Paint a stroke → mask updates
3. Press X → mode toggles
4. Press Cmd+Z → last stroke undone
5. Click "Hide Advanced" → switches back to magic wand

- [ ] **Step 5: Edge cases**

1. Press Enter during a drag → selection commits, NO surprise new selection on move
2. Close modal during text detection → no console errors
3. Open modal on image with no text → Text button disabled: "Text (0)"
4. Apply Refinement → output image has correct foreground

- [ ] **Step 6: Run unit tests**

```bash
npm test
```

All tests should pass.

---

## Summary

| Task | Description | Decisions | Est. Effort |
|------|-------------|-----------|-------------|
| 1 | Widen SelectionTool interface | D1 | 20 min |
| 2 | Fix handleTintUpdate + z-ordering | D2, D5 | 15 min |
| 3 | resetDrag + undo depth reduction | D4, D7 | 15 min |
| 4 | Invert Selection | D8 | 15 min |
| 5 | Create TextTool.ts | D1, D3 | 45 min |
| 6 | Integrate TextTool into modal | — | 45 min |
| 7 | Setup Vitest | D6 | 10 min |
| 8 | Write unit tests | D6 | 30 min |
| 9 | TODOS.md + CLAUDE.md | D9-12 | 10 min |
| 10 | Manual testing | — | 30 min |

**Dependency order:** Task 1 → Tasks 2, 3, 4 (parallel) → Tasks 5, 7 (parallel) → Task 6 (needs 5) → Task 8 (needs 7) → Task 9 → Task 10
