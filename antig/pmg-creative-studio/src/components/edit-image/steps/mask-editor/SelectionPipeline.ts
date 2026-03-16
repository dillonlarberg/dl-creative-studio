import type { BinaryMask, BrushMode, UndoEntry } from './types';
import { startMarchingAnts, type MarchingAntsHandle } from './marchingAnts';

const MAX_UNDO_DEPTH = 20;

export interface SelectionPipelineConfig {
  overlayCanvas: HTMLCanvasElement;
  maskCanvas: HTMLCanvasElement;
  initialMaskData: ImageData;
  onTintUpdate: () => void;
}

export class SelectionPipeline {
  private pendingMask: BinaryMask | null = null;
  private undoStack: UndoEntry[] = [];
  private antsHandle: MarchingAntsHandle | null = null;
  private config: SelectionPipelineConfig;

  constructor(config: SelectionPipelineConfig) {
    this.config = config;
  }

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

    if (this.undoStack.length >= MAX_UNDO_DEPTH) {
      this.undoStack.shift();
    }
    this.undoStack.push({ mask: this.pendingMask, mode });

    this.writeMaskToCanvas(this.pendingMask, mode);
    this.clearPending();
    this.config.onTintUpdate();
  }

  /** Cancel the pending selection (Escape) */
  cancel(): void {
    this.clearPending();
  }

  /** Undo the last committed selection (Cmd+Z) */
  undo(): void {
    if (this.undoStack.length === 0) return;

    this.clearPending();
    this.undoStack.pop();

    // Restore mask canvas from initial state
    const maskCtx = this.config.maskCanvas.getContext('2d')!;
    maskCtx.putImageData(this.config.initialMaskData, 0, 0);

    // Replay remaining entries
    for (const entry of this.undoStack) {
      this.writeMaskToCanvas(entry.mask, entry.mode);
    }

    this.config.onTintUpdate();
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

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
    const h = this.config.maskCanvas.height;
    const imgData = ctx.getImageData(0, 0, w, h);
    const pixels = imgData.data;
    const { data, bounds, width: maskW } = mask;

    for (let y = bounds.minY; y <= bounds.maxY; y++) {
      for (let x = bounds.minX; x <= bounds.maxX; x++) {
        if (data[y * maskW + x] === 0) continue;
        const k = (y * w + x) * 4;
        if (mode === 'keep') {
          pixels[k] = 255;
          pixels[k + 1] = 255;
          pixels[k + 2] = 255;
          pixels[k + 3] = 255;
        } else {
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

/** Merge two masks (OR operation) */
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

  for (let y = a.bounds.minY; y <= a.bounds.maxY; y++) {
    for (let x = a.bounds.minX; x <= a.bounds.maxX; x++) {
      const idx = y * w + x;
      result[idx] = a.data[idx];
    }
  }

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

  let minX = w,
    minY = h,
    maxX = 0,
    maxY = 0;
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
    bounds:
      minX <= maxX
        ? { minX, minY, maxX, maxY }
        : { minX: 0, minY: 0, maxX: 0, maxY: 0 },
  };
}
