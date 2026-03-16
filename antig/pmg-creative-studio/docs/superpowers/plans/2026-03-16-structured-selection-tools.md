# Structured Selection Tools Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace freehand brush as the primary mask editor tool with a magic wand (flood-fill selection) tool, keeping the brush behind an "Advanced" toggle.

**Architecture:** Tool-per-component with shared SelectionPipeline. Each tool produces a `BinaryMask`. The pipeline handles marching ants preview, Enter/Escape commit/cancel, and replay-based undo. Three stacked canvases: Fabric display, selection overlay (ants), hidden mask.

**Tech Stack:** React 19, TypeScript, Fabric.js 7.2, magic-wand-tool (new), Canvas2D API

**Spec:** `docs/superpowers/specs/2026-03-16-structured-selection-tools-design.md`

**Current code reference:** `src/components/edit-image/steps/MaskEditorModal.tsx` (600 lines, monolithic)

**Note:** No test framework is configured in this project. Steps include manual verification instead of automated tests. If a test framework is added later, unit tests should be backfilled for the pipeline and tool modules.

---

## File Structure

```
src/components/edit-image/steps/
  MaskEditorModal.tsx                  <- MODIFY: slim down to orchestrator (~250 lines)
  mask-editor/
    types.ts                           <- CREATE: BinaryMask, CanvasEvent, SelectionTool interface
    marchingAnts.ts                    <- CREATE: pixel-based hatch rendering on overlay canvas
    SelectionPipeline.ts               <- CREATE: pending mask, commit/cancel, undo stack, ants coordination
    MagicWandTool.ts                   <- CREATE: flood-fill selection via magic-wand-tool
    BrushTool.ts                       <- CREATE: extracted brush logic from MaskEditorModal
    maskUtils.ts                       <- CREATE: extracted helpers (loadImg, buildMaskFromAlpha, buildMaskFromSaved, mirrorPathToMask, canvasToBlob)
```

---

## Chunk 1: Foundation (types, utilities, dependency)

### Task 1: Install magic-wand-tool

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the npm package**

```bash
npm install magic-wand-tool
```

- [ ] **Step 2: Verify installation**

```bash
node -e "const MagicWand = require('magic-wand-tool'); console.log(typeof MagicWand.floodFill)"
```

Expected: `function`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install magic-wand-tool dependency"
```

---

### Task 2: Create types.ts

**Files:**
- Create: `src/components/edit-image/steps/mask-editor/types.ts`

- [ ] **Step 1: Create the types file**

```ts
/** Binary selection mask — matches magic-wand-tool output format */
export interface BinaryMask {
  data: Uint8Array;
  width: number;
  height: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

/** Normalized canvas event with image-space coordinates */
export interface CanvasEvent {
  type: 'mousedown' | 'mousemove' | 'mouseup';
  x: number;
  y: number;
  shiftKey: boolean;
  altKey: boolean;
  nativeEvent: MouseEvent;
}

/** Brush mode — shared across tools */
export type BrushMode = 'keep' | 'erase';

/**
 * Common interface for all selection tools.
 * Note: Simplified from spec (which included fabric.Canvas param in activate).
 * MVP tools only need ImageData. Post-MVP PenTool will extend this interface
 * to accept a Fabric canvas reference if needed.
 */
export interface SelectionTool {
  activate(imageData: ImageData): void;
  deactivate(): void;
  onEvent(event: CanvasEvent): BinaryMask | null;
}

/** Display dimensions computed during init */
export interface DisplayDims {
  w: number;
  h: number;
  fitScale: number;
  displayW: number;
  displayH: number;
}

/** Undo entry for replay-based undo */
export interface UndoEntry {
  mask: BinaryMask;
  mode: BrushMode;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/components/edit-image/steps/mask-editor/types.ts
git commit -m "feat: add core types for structured selection tools"
```

---

### Task 3: Extract maskUtils.ts

Extract the pure helper functions from MaskEditorModal.tsx (lines 21–223) into a shared utility file. These functions are unchanged in behavior — just relocated.

**Files:**
- Create: `src/components/edit-image/steps/mask-editor/maskUtils.ts`
- Reference: `src/components/edit-image/steps/MaskEditorModal.tsx` lines 21–223

- [ ] **Step 1: Create maskUtils.ts with extracted functions**

**Copy** (not move yet — MaskEditorModal stays functional until Task 8) these functions from MaskEditorModal.tsx:
- `loadImg()` (lines 24–32)
- `canvasToBlob()` (lines 35–42)
- `buildMaskFromAlpha()` (lines 48–93)
- `buildMaskFromSaved()` (lines 99–131)
- `mirrorPathToMask()` (lines 137–163)
- `updateBrush()` (lines 166–178)
- `setupBrushCursor()` (lines 181–214) — **Important:** update signature to use static `import { Circle } from 'fabric'` instead of accepting the `fabric` module as a parameter. Replace `new fabric.Circle(...)` with `new Circle(...)`.
- `updateBrushCursor()` (lines 217–223)

Add a new function needed by the pipeline:

```ts
/**
 * Regenerate the red tint overlay from the current mask canvas state.
 * Returns a blob URL for the tint image.
 */
export async function regenerateTint(
  maskCanvas: HTMLCanvasElement
): Promise<string> {
  const w = maskCanvas.width;
  const h = maskCanvas.height;
  const maskCtx = maskCanvas.getContext('2d')!;
  const maskData = maskCtx.getImageData(0, 0, w, h).data;

  const tintCanvas = document.createElement('canvas');
  tintCanvas.width = w;
  tintCanvas.height = h;
  const tintCtx = tintCanvas.getContext('2d')!;
  const tintImg = tintCtx.createImageData(w, h);

  for (let i = 0; i < maskData.length; i += 4) {
    const luminance = maskData[i]; // R channel = luminance (white=keep, black=remove)
    const removedness = 1 - luminance / 255;
    tintImg.data[i] = 255;     // R
    tintImg.data[i + 1] = 0;   // G
    tintImg.data[i + 2] = 0;   // B
    tintImg.data[i + 3] = Math.round(removedness * 102); // A
  }

  tintCtx.putImageData(tintImg, 0, 0);
  const blob = await canvasToBlob(tintCanvas);
  return URL.createObjectURL(blob);
}
```

Import Fabric types/classes as needed: `import { Circle, PencilBrush } from 'fabric'` (static imports are fine since Fabric is already bundled by Vite). The extracted functions are self-contained — `proxyUrl` and `applyMaskToAlpha` are NOT needed here (callers wrap URLs before passing to these functions).

- [ ] **Step 2: Update imports in maskUtils.ts**

Ensure all imports point to correct relative paths from the new location (`mask-editor/`):
- `import { proxyUrl } from '../../utils/proxyUrl';`
- Fabric types imported from `fabric` package

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run build 2>&1 | head -40
```

Note: MaskEditorModal.tsx is NOT modified in this task — functions are copied, not moved. The originals are removed in Task 8 when MaskEditorModal is refactored. This keeps the build green between commits.

- [ ] **Step 4: Commit**

```bash
git add src/components/edit-image/steps/mask-editor/maskUtils.ts
git commit -m "refactor: extract mask utility functions to mask-editor/maskUtils"
```

---

## Chunk 2: Marching Ants + Selection Pipeline

### Task 4: Create marchingAnts.ts

**Files:**
- Create: `src/components/edit-image/steps/mask-editor/marchingAnts.ts`

- [ ] **Step 1: Create the marching ants renderer**

```ts
import type { BinaryMask } from './types';

const HATCH_LENGTH = 4;
const TICK_INTERVAL_MS = 300;

interface MarchingAntsState {
  intervalId: number | null;
  hatchOffset: number;
  cacheInd: number[];
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

/**
 * Start marching ants animation on the overlay canvas for the given mask.
 * Returns a handle to stop/update the animation.
 */
export function startMarchingAnts(
  overlayCanvas: HTMLCanvasElement,
  mask: BinaryMask
): MarchingAntsHandle {
  const state: MarchingAntsState = {
    intervalId: null,
    hatchOffset: 0,
    cacheInd: [],
    canvas: overlayCanvas,
    width: overlayCanvas.width,
    height: overlayCanvas.height,
  };

  state.cacheInd = computeBorderIndices(mask);
  drawHatch(state);
  state.intervalId = window.setInterval(() => {
    state.hatchOffset = (state.hatchOffset + 1) % (HATCH_LENGTH * 2);
    drawHatch(state);
  }, TICK_INTERVAL_MS);

  return {
    updateMask(newMask: BinaryMask) {
      state.cacheInd = computeBorderIndices(newMask);
      drawHatch(state);
    },
    stop() {
      if (state.intervalId !== null) {
        clearInterval(state.intervalId);
        state.intervalId = null;
      }
      const ctx = state.canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, state.width, state.height);
    },
  };
}

export interface MarchingAntsHandle {
  updateMask(newMask: BinaryMask): void;
  stop(): void;
}

/**
 * Compute border pixel indices from a BinaryMask.
 * A pixel is on the border if it is selected (1) and has at least one
 * unselected neighbor (0) in the 4-connected neighborhood, OR if it is
 * at the mask boundary edge.
 */
function computeBorderIndices(mask: BinaryMask): number[] {
  const { data, width, height, bounds } = mask;
  const indices: number[] = [];

  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const idx = y * width + x;
      if (data[idx] === 0) continue;

      // Check 4-connected neighbors
      const top = y > 0 ? data[(y - 1) * width + x] : 0;
      const bottom = y < height - 1 ? data[(y + 1) * width + x] : 0;
      const left = x > 0 ? data[y * width + (x - 1)] : 0;
      const right = x < width - 1 ? data[y * width + (x + 1)] : 0;

      if (top === 0 || bottom === 0 || left === 0 || right === 0) {
        indices.push(idx);
      }
    }
  }

  return indices;
}

/**
 * Draw the hatch pattern on the overlay canvas.
 * Alternating black/white pixels along border indices.
 */
function drawHatch(state: MarchingAntsState): void {
  const { canvas, width, height, cacheInd, hatchOffset } = state;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, width, height);
  const imgData = ctx.createImageData(width, height);
  const res = imgData.data;

  for (let j = 0; j < cacheInd.length; j++) {
    const i = cacheInd[j];
    const x = i % width;
    const y = (i - x) / width;
    const k = (y * width + x) * 4;

    if ((x + y + hatchOffset) % (HATCH_LENGTH * 2) < HATCH_LENGTH) {
      // Black pixel (just set alpha, RGB defaults to 0)
      res[k + 3] = 255;
    } else {
      // White pixel
      res[k] = 255;
      res[k + 1] = 255;
      res[k + 2] = 255;
      res[k + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/components/edit-image/steps/mask-editor/marchingAnts.ts
git commit -m "feat: add marching ants renderer for selection preview"
```

---

### Task 5: Create SelectionPipeline.ts

**Files:**
- Create: `src/components/edit-image/steps/mask-editor/SelectionPipeline.ts`

- [ ] **Step 1: Create the selection pipeline**

```ts
import type { BinaryMask, BrushMode, UndoEntry } from './types';
import { startMarchingAnts, type MarchingAntsHandle } from './marchingAnts';

const MAX_UNDO_DEPTH = 20;

export interface SelectionPipelineConfig {
  overlayCanvas: HTMLCanvasElement;
  maskCanvas: HTMLCanvasElement;
  initialMaskData: ImageData;
  onTintUpdate: () => void; // called after commit so host can regenerate tint
}

export class SelectionPipeline {
  private pendingMask: BinaryMask | null = null;
  private undoStack: UndoEntry[] = [];
  private antsHandle: MarchingAntsHandle | null = null;
  private config: SelectionPipelineConfig;

  constructor(config: SelectionPipelineConfig) {
    this.config = config;
  }

  /** Get the current pending mask (for display purposes) */
  getPendingMask(): BinaryMask | null {
    return this.pendingMask;
  }

  /** Set a new pending selection — starts marching ants */
  setPendingMask(mask: BinaryMask): void {
    this.pendingMask = mask;
    if (this.antsHandle) {
      this.antsHandle.updateMask(mask);
    } else {
      this.antsHandle = startMarchingAnts(this.config.overlayCanvas, mask);
    }
  }

  /** Add to the current pending selection (Shift+click) */
  addToSelection(newMask: BinaryMask): void {
    if (!this.pendingMask) {
      this.setPendingMask(newMask);
      return;
    }
    const merged = concatMasks(this.pendingMask, newMask);
    this.setPendingMask(merged);
  }

  /** Subtract from the current pending selection (Alt+click) */
  subtractFromSelection(newMask: BinaryMask): void {
    if (!this.pendingMask) return;
    const result = subtractMasks(this.pendingMask, newMask);
    this.setPendingMask(result);
  }

  /** Commit the pending selection to the mask canvas (Enter) */
  commit(mode: BrushMode): void {
    if (!this.pendingMask) return;

    // Push undo entry
    if (this.undoStack.length >= MAX_UNDO_DEPTH) {
      this.undoStack.shift();
    }
    this.undoStack.push({ mask: this.pendingMask, mode });

    // Write to mask canvas
    this.writeMaskToCanvas(this.pendingMask, mode);

    // Clear pending state
    this.clearPending();

    // Notify host to regenerate tint
    this.config.onTintUpdate();
  }

  /** Cancel the pending selection (Escape) */
  cancel(): void {
    this.clearPending();
  }

  /** Undo the last committed selection (Cmd+Z) */
  undo(): void {
    if (this.undoStack.length === 0) return;

    // Cancel any pending selection first
    this.clearPending();

    // Pop last entry
    this.undoStack.pop();

    // Restore mask canvas from initial state
    const maskCtx = this.config.maskCanvas.getContext('2d')!;
    maskCtx.putImageData(this.config.initialMaskData, 0, 0);

    // Replay remaining entries
    for (const entry of this.undoStack) {
      this.writeMaskToCanvas(entry.mask, entry.mode);
    }

    // Notify host to regenerate tint
    this.config.onTintUpdate();
  }

  /** Check if there are entries to undo */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /** Check if there is a pending selection */
  hasPending(): boolean {
    return this.pendingMask !== null;
  }

  /** Reset undo stack and snapshot new initial mask (called on tool switch from brush) */
  snapshotInitialMask(): void {
    const maskCtx = this.config.maskCanvas.getContext('2d')!;
    const w = this.config.maskCanvas.width;
    const h = this.config.maskCanvas.height;
    this.config.initialMaskData = maskCtx.getImageData(0, 0, w, h);
    this.undoStack = [];
  }

  /** Clean up interval on unmount */
  destroy(): void {
    this.clearPending();
    this.undoStack = [];
  }

  private clearPending(): void {
    this.pendingMask = null;
    if (this.antsHandle) {
      this.antsHandle.stop();
      this.antsHandle = null;
    }
  }

  private writeMaskToCanvas(mask: BinaryMask, mode: BrushMode): void {
    const ctx = this.config.maskCanvas.getContext('2d')!;
    const w = this.config.maskCanvas.width;
    const imgData = ctx.getImageData(0, 0, this.config.maskCanvas.width, this.config.maskCanvas.height);
    const pixels = imgData.data;
    const { data, bounds, width: maskW } = mask;

    for (let y = bounds.minY; y <= bounds.maxY; y++) {
      for (let x = bounds.minX; x <= bounds.maxX; x++) {
        if (data[y * maskW + x] === 0) continue;
        const k = (y * w + x) * 4;
        if (mode === 'keep') {
          // White = keep
          pixels[k] = 255;
          pixels[k + 1] = 255;
          pixels[k + 2] = 255;
          pixels[k + 3] = 255;
        } else {
          // Black = erase
          pixels[k] = 0;
          pixels[k + 1] = 0;
          pixels[k + 2] = 0;
          pixels[k + 3] = 255;
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }
}

/** Merge two masks (OR operation) — selected in either = selected in result */
function concatMasks(a: BinaryMask, b: BinaryMask): BinaryMask {
  const w = a.width;
  const h = a.height;
  const result = new Uint8Array(w * h);
  const bounds = {
    minX: Math.min(a.bounds.minX, b.bounds.minX),
    minY: Math.min(a.bounds.minY, b.bounds.minY),
    maxX: Math.max(a.bounds.maxX, b.bounds.maxX),
    maxY: Math.max(a.bounds.maxY, b.bounds.maxY),
  };

  // Copy all of mask A
  for (let y = a.bounds.minY; y <= a.bounds.maxY; y++) {
    for (let x = a.bounds.minX; x <= a.bounds.maxX; x++) {
      const idx = y * w + x;
      result[idx] = a.data[idx];
    }
  }

  // OR in mask B
  for (let y = b.bounds.minY; y <= b.bounds.maxY; y++) {
    for (let x = b.bounds.minX; x <= b.bounds.maxX; x++) {
      const idx = y * w + x;
      if (b.data[idx] === 1) result[idx] = 1;
    }
  }

  return { data: result, width: w, height: h, bounds };
}

/** Subtract mask B from mask A: result = A AND NOT(B) */
function subtractMasks(a: BinaryMask, b: BinaryMask): BinaryMask {
  const w = a.width;
  const h = a.height;
  const result = new Uint8Array(w * h);

  // Copy A, then zero out where B is selected
  for (let y = a.bounds.minY; y <= a.bounds.maxY; y++) {
    for (let x = a.bounds.minX; x <= a.bounds.maxX; x++) {
      const idx = y * w + x;
      result[idx] = a.data[idx];
    }
  }

  for (let y = b.bounds.minY; y <= b.bounds.maxY; y++) {
    for (let x = b.bounds.minX; x <= b.bounds.maxX; x++) {
      const idx = y * w + x;
      if (b.data[idx] === 1) result[idx] = 0;
    }
  }

  // Recompute bounds
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (result[y * w + x] === 1) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  return {
    data: result,
    width: w,
    height: h,
    bounds: minX <= maxX ? { minX, minY, maxX, maxY } : { minX: 0, minY: 0, maxX: 0, maxY: 0 },
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/components/edit-image/steps/mask-editor/SelectionPipeline.ts
git commit -m "feat: add SelectionPipeline with commit/cancel/undo and mask operations"
```

---

## Chunk 3: Magic Wand Tool

### Task 6: Create MagicWandTool.ts

**Files:**
- Create: `src/components/edit-image/steps/mask-editor/MagicWandTool.ts`

- [ ] **Step 1: Create the magic wand tool**

```ts
import MagicWand from 'magic-wand-tool';
import type { BinaryMask, CanvasEvent, SelectionTool } from './types';

const DEFAULT_THRESHOLD = 15;
const BLUR_RADIUS = 5;

interface MagicWandState {
  imageData: ImageData | null;
  image: { data: Uint8Array; width: number; height: number; bytes: number } | null;
  downPoint: { x: number; y: number } | null;
  currentThreshold: number;
  isActive: boolean;
}

export class MagicWandTool implements SelectionTool {
  private state: MagicWandState = {
    imageData: null,
    image: null,
    downPoint: null,
    currentThreshold: DEFAULT_THRESHOLD,
    isActive: false,
  };

  activate(imageData: ImageData): void {
    this.state.imageData = imageData;
    this.state.image = {
      data: new Uint8Array(imageData.data.buffer),
      width: imageData.width,
      height: imageData.height,
      bytes: 4,
    };
    this.state.isActive = true;
  }

  deactivate(): void {
    this.state.isActive = false;
    this.state.downPoint = null;
    this.state.currentThreshold = DEFAULT_THRESHOLD;
  }

  onEvent(event: CanvasEvent): BinaryMask | null {
    if (!this.state.isActive || !this.state.image) return null;

    switch (event.type) {
      case 'mousedown':
        return this.handleMouseDown(event);
      case 'mousemove':
        return this.handleMouseMove(event);
      case 'mouseup':
        return this.handleMouseUp();
      default:
        return null;
    }
  }

  /** Get the current threshold (for UI display) */
  getThreshold(): number {
    return this.state.currentThreshold;
  }

  private handleMouseDown(event: CanvasEvent): BinaryMask | null {
    this.state.downPoint = { x: Math.round(event.x), y: Math.round(event.y) };
    this.state.currentThreshold = DEFAULT_THRESHOLD;
    return this.computeMask(this.state.downPoint.x, this.state.downPoint.y);
  }

  private handleMouseMove(event: CanvasEvent): BinaryMask | null {
    if (!this.state.downPoint) return null;

    const p = { x: Math.round(event.x), y: Math.round(event.y) };
    if (p.x === this.state.downPoint.x && p.y === this.state.downPoint.y) return null;

    const dx = p.x - this.state.downPoint.x;
    const dy = p.y - this.state.downPoint.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    const sign = adx > ady ? dx / adx : dy / ady;
    const scaledSign = sign < 0 ? sign / 5 : sign / 3;

    const newThreshold = Math.min(
      Math.max(DEFAULT_THRESHOLD + Math.floor(scaledSign * len), 1),
      255
    );

    if (newThreshold === this.state.currentThreshold) return null;

    this.state.currentThreshold = newThreshold;
    return this.computeMask(this.state.downPoint.x, this.state.downPoint.y);
  }

  private handleMouseUp(): BinaryMask | null {
    // Selection stays pending — don't clear downPoint until next mousedown
    // Return null because the mask hasn't changed
    this.state.downPoint = null;
    return null;
  }

  private computeMask(x: number, y: number): BinaryMask | null {
    if (!this.state.image) return null;

    let mask = MagicWand.floodFill(
      this.state.image,
      x,
      y,
      this.state.currentThreshold,
      null,
      true // return mask with bounds
    );

    if (!mask) return null;

    mask = MagicWand.gaussBlurOnlyBorder(mask, BLUR_RADIUS);

    return {
      data: mask.data,
      width: mask.width,
      height: mask.height,
      bounds: mask.bounds,
    };
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build 2>&1 | head -20
```

Note: If `magic-wand-tool` has no TypeScript declarations, create a minimal declaration file:

```ts
// src/types/magic-wand-tool.d.ts
declare module 'magic-wand-tool' {
  interface MagicWandImage {
    data: Uint8Array;
    width: number;
    height: number;
    bytes: number;
  }
  interface MagicWandMask {
    data: Uint8Array;
    width: number;
    height: number;
    bounds: { minX: number; minY: number; maxX: number; maxY: number };
  }
  const MagicWand: {
    floodFill(
      image: MagicWandImage,
      x: number,
      y: number,
      threshold: number,
      oldMask?: Uint8Array | null,
      returnMask?: boolean
    ): MagicWandMask | null;
    gaussBlurOnlyBorder(
      mask: MagicWandMask,
      radius: number,
      oldMask?: Uint8Array | null
    ): MagicWandMask;
    getBorderIndices(mask: MagicWandMask): number[];
    traceContours(mask: MagicWandMask): Array<{
      inner: boolean;
      points: Array<{ x: number; y: number }>;
    }>;
    simplifyContours(
      contours: Array<{ inner: boolean; points: Array<{ x: number; y: number }> }>,
      tolerant: number,
      count: number
    ): Array<{ inner: boolean; points: Array<{ x: number; y: number }> }>;
  };
  export default MagicWand;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/edit-image/steps/mask-editor/MagicWandTool.ts
git add src/types/magic-wand-tool.d.ts  # if created
git commit -m "feat: add MagicWandTool with flood-fill and drag-to-adjust tolerance"
```

---

## Chunk 4: Brush Tool Extraction

### Task 7: Create BrushTool.ts

Extract the brush-related logic from MaskEditorModal.tsx into a standalone module. This module manages Fabric's PencilBrush, the custom cursor, and direct mask writing.

**Files:**
- Create: `src/components/edit-image/steps/mask-editor/BrushTool.ts`
- Reference: `src/components/edit-image/steps/MaskEditorModal.tsx` lines 166–223 (brush helpers), 345–370 (brush setup + path:created), 398–404 (brush sync effect), 423–443 (undo)

- [ ] **Step 1: Create BrushTool.ts**

This module wraps the existing brush behavior into a class:

```ts
import { PencilBrush, Circle } from 'fabric';
import type { Canvas as FabricCanvas, FabricObject } from 'fabric';
import type { BrushMode } from './types';
import { mirrorPathToMask, updateBrush, setupBrushCursor, updateBrushCursor } from './maskUtils';

export interface BrushToolConfig {
  fabricCanvas: FabricCanvas;
  maskCanvas: HTMLCanvasElement;
  initialMaskData: ImageData;
}

export class BrushTool {
  private config: BrushToolConfig;
  private cursor: Circle | null = null;
  private mode: BrushMode = 'keep';
  private size: number = 20;
  private opacity: number = 100;
  private pathCreatedHandler: ((e: { path: FabricObject }) => void) | null = null;

  constructor(config: BrushToolConfig) {
    this.config = config;
  }

  activate(mode: BrushMode, size: number, opacity: number): void {
    this.mode = mode;
    this.size = size;
    this.opacity = opacity;

    const canvas = this.config.fabricCanvas;
    canvas.isDrawingMode = true;

    // Setup PencilBrush (static import — Fabric is already bundled by Vite)
    canvas.freeDrawingBrush = new PencilBrush(canvas);
    updateBrush(canvas, this.mode, this.size, this.opacity);

    // Setup cursor
    this.cursor = setupBrushCursor(canvas, this.mode, this.size);

    // Attach path:created handler
    this.pathCreatedHandler = (e: { path: FabricObject }) => {
      const path = e.path;
      if (path && path.data == null) path.data = {};
      if (path) path.data.maskMode = this.mode;
      mirrorPathToMask(path, this.config.maskCanvas);
    };
    canvas.on('path:created', this.pathCreatedHandler);
  }

  deactivate(): void {
    const canvas = this.config.fabricCanvas;
    canvas.isDrawingMode = false;

    if (this.cursor) {
      canvas.remove(this.cursor);
      this.cursor = null;
    }

    if (this.pathCreatedHandler) {
      canvas.off('path:created', this.pathCreatedHandler);
      this.pathCreatedHandler = null;
    }
  }

  updateSettings(mode: BrushMode, size: number, opacity: number): void {
    this.mode = mode;
    this.size = size;
    this.opacity = opacity;
    updateBrush(this.config.fabricCanvas, mode, size, opacity);
    if (this.cursor) {
      updateBrushCursor(this.cursor, mode, size);
    }
  }

  undo(): void {
    const canvas = this.config.fabricCanvas;
    const objects = canvas.getObjects();
    const paths = objects.filter((o: FabricObject) => o.type === 'path');
    if (paths.length === 0) return;

    // Remove last path from display
    const lastPath = paths[paths.length - 1];
    canvas.remove(lastPath);

    // Restore mask from initial state
    const maskCtx = this.config.maskCanvas.getContext('2d')!;
    maskCtx.putImageData(this.config.initialMaskData, 0, 0);

    // Replay remaining paths
    const remainingPaths = paths.slice(0, -1);
    for (const p of remainingPaths) {
      mirrorPathToMask(p, this.config.maskCanvas);
    }

    canvas.renderAll();
  }
}
```

Note: The exact Fabric imports and `require` call will need adjustment based on how the existing code dynamically imports Fabric. Match the existing pattern in MaskEditorModal.tsx line 311: `const fabric = await import('fabric');`

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/components/edit-image/steps/mask-editor/BrushTool.ts
git commit -m "feat: extract BrushTool from MaskEditorModal"
```

---

## Chunk 5: Refactor MaskEditorModal

### Task 8: Refactor MaskEditorModal.tsx to orchestrate tools

This is the largest task. The modal becomes a thin orchestrator that:
- Creates the three-canvas stack (Fabric + overlay + hidden mask)
- Manages which tool is active (magic wand vs brush)
- Converts pointer events to `CanvasEvent` and delegates to active tool / pipeline
- Handles keyboard shortcuts (Enter, Escape, X, Cmd+Z)
- Renders the toolbar with tool switcher

**Files:**
- Modify: `src/components/edit-image/steps/MaskEditorModal.tsx` (rewrite from ~600 lines to ~300 lines)

- [ ] **Step 1: Read the current MaskEditorModal.tsx in full**

Read the entire file to understand all current behavior before modifying.

- [ ] **Step 2: Rewrite MaskEditorModal.tsx**

Key changes:

**Imports:** Replace inline helpers with imports from `mask-editor/` modules:
```ts
import type { BrushMode, CanvasEvent, DisplayDims } from './mask-editor/types';
import { loadImg, buildMaskFromAlpha, buildMaskFromSaved, regenerateTint } from './mask-editor/maskUtils';
import { SelectionPipeline } from './mask-editor/SelectionPipeline';
import { MagicWandTool } from './mask-editor/MagicWandTool';
import { BrushTool } from './mask-editor/BrushTool';
import { proxyUrl } from '../utils/proxyUrl';
import { applyMaskToAlpha } from '../utils/applyMaskToAlpha';
```

**New state:**
```ts
const [activeTool, setActiveTool] = useState<'magicwand' | 'brush'>('magicwand');
const [showAdvanced, setShowAdvanced] = useState(false);
const [threshold, setThreshold] = useState(15); // read-only display
```

**New refs:**
```ts
const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
const pipelineRef = useRef<SelectionPipeline | null>(null);
const magicWandRef = useRef<MagicWandTool | null>(null);
const brushToolRef = useRef<BrushTool | null>(null);
const originalImageDataRef = useRef<ImageData | null>(null);
const tintBlobUrlRef = useRef<string | null>(null); // manages tint blob URL lifecycle (was closure-local)
const tintObjRef = useRef<FabricImage | null>(null); // reference to tint FabricImage on display canvas
```

**Removed state/refs** (no longer needed):
- `currentBrushModeRef` — BrushTool stores mode internally
- Brush-related state remains (`brushMode`, `brushSize`, `brushOpacity`) but is passed to BrushTool via `updateSettings()`

**Initialization useEffect changes (detailed):**

The existing init flow is preserved through step 6 (create Fabric canvas). Key changes:

**a) Set `isDrawingMode: false`** during Fabric canvas creation (was `true` — magic wand is now the default tool, not brush):
```ts
const canvas = new fabric.Canvas(displayCanvasRef.current, {
  width: w, height: h,
  isDrawingMode: false, // <-- CHANGED from true
  selection: false,
});
```

**b) Cache tint object ref** — when adding the tint FabricImage, store it in `tintObjRef`:
```ts
tintObjRef.current = fabricTint;
```

**c) Cache original image data** — after drawing background image, read raw pixels for selection tools:
```ts
const tempCanvas = document.createElement('canvas');
tempCanvas.width = w;
tempCanvas.height = h;
const tempCtx = tempCanvas.getContext('2d')!;
tempCtx.drawImage(originalImg, 0, 0);
originalImageDataRef.current = tempCtx.getImageData(0, 0, w, h);
```

**d) Store tint blob URL in ref** — the tint blob URL from `buildMaskFromAlpha`/`buildMaskFromSaved` goes into `tintBlobUrlRef` instead of a closure-local variable:
```ts
tintBlobUrlRef.current = tintBlobUrl;
```

**e) Create pipeline and magic wand** — after Fabric setup:
```ts
// Pipeline needs: overlay canvas, mask canvas, initial mask snapshot, tint update callback
const initialMaskData = maskCanvasRef.current!.getContext('2d')!
  .getImageData(0, 0, w, h);

pipelineRef.current = new SelectionPipeline({
  overlayCanvas: overlayCanvasRef.current!,
  maskCanvas: maskCanvasRef.current!,
  initialMaskData,
  onTintUpdate: handleTintUpdate,
});

magicWandRef.current = new MagicWandTool();
magicWandRef.current.activate(originalImageDataRef.current!);

brushToolRef.current = new BrushTool({
  fabricCanvas: canvas,
  maskCanvas: maskCanvasRef.current!,
  initialMaskData,
});
// BrushTool is created but NOT activated — magic wand is default
```

**f) Cleanup function** — add pipeline and tool cleanup:
```ts
return () => {
  pipelineRef.current?.destroy();
  magicWandRef.current?.deactivate();
  brushToolRef.current?.deactivate();
  if (tintBlobUrlRef.current) URL.revokeObjectURL(tintBlobUrlRef.current);
  // ... existing Fabric dispose, ref nulling
};
```

**Note:** The overlay canvas is NOT created in the useEffect — it's a JSX element with `ref={overlayCanvasRef}`, positioned via CSS in the render. The `useEffect` just reads the ref.

**onTintUpdate callback (complete implementation):**
```ts
async function handleTintUpdate() {
  if (!maskCanvasRef.current || !fabricRef.current) return;
  const canvas = fabricRef.current;

  // Revoke old blob URL
  if (tintBlobUrlRef.current) URL.revokeObjectURL(tintBlobUrlRef.current);

  // Generate new tint from current mask state
  const newTintUrl = await regenerateTint(maskCanvasRef.current);
  tintBlobUrlRef.current = newTintUrl;

  // Remove old tint object from Fabric canvas
  if (tintObjRef.current) {
    canvas.remove(tintObjRef.current);
  }

  // Load new tint and add to Fabric canvas
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
  canvas.add(fabricTint);
  tintObjRef.current = fabricTint;

  // Ensure tint is above background but below brush strokes
  // Background is index 0, tint should be index 1
  const objects = canvas.getObjects();
  if (objects.length > 1) {
    canvas.moveTo(fabricTint, 1);
  }
  canvas.renderAll();
}
```

**Event handling on overlay canvas:**
```ts
function handleOverlayPointerEvent(e: React.MouseEvent<HTMLCanvasElement>) {
  if (activeTool !== 'magicwand') return;
  const rect = e.currentTarget.getBoundingClientRect();
  const fitScale = displayDims.fitScale;
  const canvasEvent: CanvasEvent = {
    type: e.type === 'mousedown' ? 'mousedown' : e.type === 'mousemove' ? 'mousemove' : 'mouseup',
    x: Math.min(Math.max(e.nativeEvent.offsetX / fitScale, 0), displayDims.w - 1),
    y: Math.min(Math.max(e.nativeEvent.offsetY / fitScale, 0), displayDims.h - 1),
    shiftKey: e.shiftKey,
    altKey: e.altKey,
    nativeEvent: e.nativeEvent,
  };

  const mask = magicWandRef.current!.onEvent(canvasEvent);
  if (mask) {
    if (canvasEvent.shiftKey) {
      pipelineRef.current!.addToSelection(mask);
    } else if (canvasEvent.altKey) {
      pipelineRef.current!.subtractFromSelection(mask);
    } else if (canvasEvent.type === 'mousedown') {
      pipelineRef.current!.setPendingMask(mask);
    } else {
      // mousemove during drag — update pending mask
      pipelineRef.current!.setPendingMask(mask);
    }
    setThreshold(magicWandRef.current!.getThreshold());
  }
}
```

**Keyboard handler update:**
```ts
function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault();
    pipelineRef.current?.commit(brushMode);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    pipelineRef.current?.cancel();
  } else if (e.key === 'x' || e.key === 'X') {
    setBrushMode(prev => prev === 'keep' ? 'erase' : 'keep');
  } else if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
    e.preventDefault();
    if (activeTool === 'brush') {
      brushToolRef.current?.undo();
    } else {
      pipelineRef.current?.undo();
    }
  }
}
```

**Tool switching:**
```ts
function switchTool(tool: 'magicwand' | 'brush') {
  if (tool === activeTool) return;

  // Cancel any pending selection
  pipelineRef.current?.cancel();

  if (activeTool === 'brush') {
    brushToolRef.current?.deactivate();
    // Snapshot mask state so pipeline undo doesn't cross brush work
    pipelineRef.current?.snapshotInitialMask();
  }

  if (tool === 'brush') {
    brushToolRef.current?.activate(brushMode, brushSize, brushOpacity);
  }

  setActiveTool(tool);
}
```

**JSX changes to toolbar:**
Replace the brush controls section with:
```tsx
{/* Tool selector */}
<div className="flex items-center gap-2">
  <button
    onClick={() => switchTool('magicwand')}
    className={cn('px-3 py-1.5 rounded text-sm font-medium', activeTool === 'magicwand' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700')}
  >
    Magic Wand
  </button>
  <div className="flex items-center gap-2">
    {/* Keep/Erase toggle — same as current */}
  </div>
</div>

{/* Threshold display (magic wand) */}
{activeTool === 'magicwand' && (
  <span className="text-xs text-gray-500">Threshold: {threshold}</span>
)}

{/* Advanced toggle */}
<button
  onClick={() => { setShowAdvanced(!showAdvanced); if (!showAdvanced) switchTool('brush'); }}
  className="text-xs text-gray-500 underline"
>
  {showAdvanced ? 'Hide Advanced' : 'Advanced'}
</button>

{/* Brush controls (shown when advanced) */}
{showAdvanced && activeTool === 'brush' && (
  <div className="flex items-center gap-4">
    {/* Size slider — same as current */}
    {/* Opacity slider — same as current */}
  </div>
)}
```

**Canvas area JSX:**
Add the overlay canvas inside the inner scaled div, stacked on top of the Fabric canvas:
```tsx
<div style={{ /* inner div with transform: scale(fitScale) */ }}>
  <canvas ref={displayCanvasRef} />
  <canvas
    ref={overlayCanvasRef}
    width={displayDims.w}
    height={displayDims.h}
    style={{
      position: 'absolute',
      top: 0,
      left: 0,
      pointerEvents: activeTool === 'magicwand' ? 'auto' : 'none',
    }}
    onMouseDown={handleOverlayPointerEvent}
    onMouseMove={handleOverlayPointerEvent}
    onMouseUp={handleOverlayPointerEvent}
  />
</div>
```

**Footer:** Add "Apply Selection" button visible when pipeline has pending mask:
```tsx
{pipelineRef.current?.hasPending() && (
  <button onClick={() => pipelineRef.current?.commit(brushMode)} className="...">
    Apply Selection (Enter)
  </button>
)}
```

- [ ] **Step 3: Remove helper functions that were moved to maskUtils.ts**

Delete lines 21–223 from MaskEditorModal.tsx (loadImg, canvasToBlob, buildMaskFromAlpha, buildMaskFromSaved, mirrorPathToMask, updateBrush, setupBrushCursor, updateBrushCursor). These now live in `mask-editor/maskUtils.ts`.

- [ ] **Step 4: Verify build compiles**

```bash
npm run build 2>&1 | head -60
```

Fix any TypeScript errors. Common issues:
- Import paths need adjustment
- Fabric type imports may need updating
- The `require('fabric')` in BrushTool may need to match the dynamic import pattern

- [ ] **Step 5: Commit**

```bash
git add src/components/edit-image/steps/MaskEditorModal.tsx
git commit -m "refactor: slim MaskEditorModal to orchestrator, integrate selection tools"
```

---

## Chunk 6: Manual Testing + Polish

### Task 9: Manual testing checklist

**Files:** None (testing only)

Run the dev server and test each scenario:

```bash
npm run dev
```

- [ ] **Step 1: Test magic wand basic flow**
  - Open edit-image use case, upload an image, extract background
  - Click "Refine Mask" to open the modal
  - Click on a background region — marching ants should appear around the flood-filled area
  - Drag from click point — threshold should increase/decrease, ants update in real-time
  - Release mouse — ants keep animating
  - Press Enter — red tint fills the selection, ants disappear
  - Press Cmd+Z — tint reverts to previous state

- [ ] **Step 2: Test selection modifiers**
  - Click to make a selection (ants visible)
  - Shift+click another area — selection should expand (ants update)
  - Alt+click inside the selection — area should be subtracted (ants update)
  - Press Escape — selection cancels, ants disappear

- [ ] **Step 3: Test keep/erase mode**
  - Toggle to "Erase" mode (click button or press X)
  - Click with magic wand — selection should work the same
  - Press Enter — selected area should be marked for removal (black on mask, red tint appears)
  - Toggle to "Keep" mode
  - Click with magic wand on a tinted area — press Enter — tint should clear (white on mask)

- [ ] **Step 4: Test brush tool (advanced)**
  - Click "Advanced" toggle — brush controls should appear
  - Paint with brush — direct mask editing, no marching ants
  - Press Cmd+Z — last stroke undone
  - Switch back to magic wand — brush deactivates
  - Cmd+Z should now undo pipeline selections, not brush strokes

- [ ] **Step 5: Test Apply Refinement**
  - Make several selections with magic wand
  - Click "Apply Refinement" — modal should close
  - Preview step should show the refined foreground correctly

- [ ] **Step 6: Fix any issues found during testing**

Address bugs as they arise. Common issues to watch for:
- Coordinate mismatch between overlay canvas and image (check fitScale division)
- Tint not updating after commit (check regenerateTint + FabricImage swap)
- Magic wand returning null on certain regions (check image data caching)
- Marching ants not clearing on commit/cancel (check handle lifecycle)

### Task 10: Final commit

- [ ] **Step 1: Verify build is clean**

```bash
npm run build
npm run lint
```

- [ ] **Step 2: Commit all remaining changes**

```bash
git add -A
git commit -m "feat: structured selection tools with magic wand and selection pipeline

- Magic wand tool as primary selection method with drag-to-adjust tolerance
- Selection pipeline with marching ants preview, Enter/Escape, Shift/Alt modifiers
- Brush tool demoted behind Advanced toggle
- Replay-based undo for pipeline selections
- Three-canvas stack: Fabric display, selection overlay, hidden mask"
```

---

## Task Dependency Graph

```
Task 1 (install magic-wand-tool)
  └──▶ Task 6 (MagicWandTool)

Task 2 (types.ts)
  ├──▶ Task 4 (marchingAnts)
  ├──▶ Task 5 (SelectionPipeline)
  ├──▶ Task 6 (MagicWandTool)
  └──▶ Task 7 (BrushTool)

Task 3 (maskUtils extraction)
  └──▶ Task 7 (BrushTool)
  └──▶ Task 8 (MaskEditorModal refactor)

Task 4 (marchingAnts)
  └──▶ Task 5 (SelectionPipeline)

Task 5 (SelectionPipeline)
  └──▶ Task 8 (MaskEditorModal refactor)

Task 6 (MagicWandTool)
  └──▶ Task 8 (MaskEditorModal refactor)

Task 7 (BrushTool)
  └──▶ Task 8 (MaskEditorModal refactor)

Task 8 (MaskEditorModal refactor)
  └──▶ Task 9 (Manual testing)
  └──▶ Task 10 (Final commit)
```

**Parallelizable groups:**
- Tasks 1, 2, 3 can run in parallel (no dependencies on each other)
- Tasks 4, 6, 7 can run in parallel (all depend on Task 2 only)
- Task 5 depends on Task 4
- Task 8 depends on Tasks 3, 5, 6, 7 (all modules must exist)
- Tasks 9, 10 are sequential
