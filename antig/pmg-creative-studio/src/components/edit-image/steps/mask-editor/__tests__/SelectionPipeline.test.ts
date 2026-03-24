import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SelectionPipeline } from '../SelectionPipeline';
import type { BinaryMask } from '../types';

// Mock marchingAnts
vi.mock('../marchingAnts', () => ({
  startMarchingAnts: () => ({
    updateMask: vi.fn(),
    stop: vi.fn(),
  }),
}));

/**
 * happy-dom doesn't support Canvas2D, so we create a mock canvas
 * with a fake context that stores pixel data in a flat Uint8ClampedArray.
 */
function createMockCanvas(w: number, h: number): HTMLCanvasElement {
  const pixelData = new Uint8ClampedArray(w * h * 4);
  // Fill white
  for (let i = 0; i < pixelData.length; i += 4) {
    pixelData[i] = 255;
    pixelData[i + 1] = 255;
    pixelData[i + 2] = 255;
    pixelData[i + 3] = 255;
  }

  const fakeCtx = {
    getImageData(_sx: number, _sy: number, sw: number, sh: number) {
      // Return a copy of the backing store
      const out = new Uint8ClampedArray(sw * sh * 4);
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const srcIdx = ((y + _sy) * w + (x + _sx)) * 4;
          const dstIdx = (y * sw + x) * 4;
          out[dstIdx] = pixelData[srcIdx];
          out[dstIdx + 1] = pixelData[srcIdx + 1];
          out[dstIdx + 2] = pixelData[srcIdx + 2];
          out[dstIdx + 3] = pixelData[srcIdx + 3];
        }
      }
      return { data: out, width: sw, height: sh };
    },
    putImageData(imgData: { data: Uint8ClampedArray; width: number; height: number }, dx: number, dy: number) {
      for (let y = 0; y < imgData.height; y++) {
        for (let x = 0; x < imgData.width; x++) {
          const srcIdx = (y * imgData.width + x) * 4;
          const dstIdx = ((y + dy) * w + (x + dx)) * 4;
          pixelData[dstIdx] = imgData.data[srcIdx];
          pixelData[dstIdx + 1] = imgData.data[srcIdx + 1];
          pixelData[dstIdx + 2] = imgData.data[srcIdx + 2];
          pixelData[dstIdx + 3] = imgData.data[srcIdx + 3];
        }
      }
    },
    createImageData(iw: number, ih: number) {
      return { data: new Uint8ClampedArray(iw * ih * 4), width: iw, height: ih };
    },
    clearRect() {},
  };

  const canvas = {
    width: w,
    height: h,
    getContext: () => fakeCtx,
    // Expose backing store for test assertions
    _pixelData: pixelData,
  } as unknown as HTMLCanvasElement & { _pixelData: Uint8ClampedArray };

  return canvas;
}

/** Helper to read a pixel from our mock canvas */
function readPixel(canvas: HTMLCanvasElement, x: number, y: number): number[] {
  const ctx = canvas.getContext('2d')!;
  const d = ctx.getImageData(x, y, 1, 1).data;
  return [d[0], d[1], d[2], d[3]];
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

  // ── commit ──────────────────────────────────────────────────────

  it('commit with no pending mask is a no-op', () => {
    pipeline.commit('keep');
    expect(tintUpdateCount).toBe(0);
  });

  it('commit writes erase mask to canvas (black pixels)', () => {
    const mask = createMask(10, 10, [[2, 3], [4, 5]]);
    pipeline.setPendingMask(mask);
    pipeline.commit('erase');
    expect(tintUpdateCount).toBe(1);

    const pixel = readPixel(maskCanvas, 2, 3);
    expect(pixel).toEqual([0, 0, 0, 255]);
  });

  it('commit writes keep mask to canvas (white pixels)', () => {
    // Erase then keep back
    const eraseMask = createMask(10, 10, [[0, 0]]);
    pipeline.setPendingMask(eraseMask);
    pipeline.commit('erase');

    const keepMask = createMask(10, 10, [[0, 0]]);
    pipeline.setPendingMask(keepMask);
    pipeline.commit('keep');

    const pixel = readPixel(maskCanvas, 0, 0);
    expect(pixel).toEqual([255, 255, 255, 255]);
  });

  it('commit clears pending mask', () => {
    const mask = createMask(10, 10, [[0, 0]]);
    pipeline.setPendingMask(mask);
    expect(pipeline.hasPending()).toBe(true);
    pipeline.commit('erase');
    expect(pipeline.hasPending()).toBe(false);
  });

  // ── cancel ──────────────────────────────────────────────────────

  it('cancel clears pending mask', () => {
    const mask = createMask(10, 10, [[0, 0]]);
    pipeline.setPendingMask(mask);
    expect(pipeline.hasPending()).toBe(true);
    pipeline.cancel();
    expect(pipeline.hasPending()).toBe(false);
  });

  // ── undo ────────────────────────────────────────────────────────

  it('undo restores initial state after one commit', () => {
    const mask = createMask(10, 10, [[0, 0]]);
    pipeline.setPendingMask(mask);
    pipeline.commit('erase');

    pipeline.undo();

    const pixel = readPixel(maskCanvas, 0, 0);
    expect(pixel[0]).toBe(255); // restored to white
  });

  it('undo with empty stack is a no-op', () => {
    pipeline.undo();
    expect(tintUpdateCount).toBe(0);
  });

  it('undo replays remaining stack entries', () => {
    const mask1 = createMask(10, 10, [[0, 0]]);
    pipeline.setPendingMask(mask1);
    pipeline.commit('erase');

    const mask2 = createMask(10, 10, [[1, 0]]);
    pipeline.setPendingMask(mask2);
    pipeline.commit('erase');

    // Undo second commit
    pipeline.undo();

    expect(readPixel(maskCanvas, 0, 0)[0]).toBe(0);   // still erased
    expect(readPixel(maskCanvas, 1, 0)[0]).toBe(255);  // restored
  });

  it('canUndo reflects stack state', () => {
    expect(pipeline.canUndo()).toBe(false);

    const mask = createMask(10, 10, [[0, 0]]);
    pipeline.setPendingMask(mask);
    pipeline.commit('erase');
    expect(pipeline.canUndo()).toBe(true);

    pipeline.undo();
    expect(pipeline.canUndo()).toBe(false);
  });

  // ── addToSelection / subtractFromSelection ──────────────────────

  it('addToSelection merges two masks (OR)', () => {
    pipeline.addToSelection(createMask(10, 10, [[0, 0]]));
    pipeline.addToSelection(createMask(10, 10, [[1, 1]]));

    const pending = pipeline.getPendingMask()!;
    expect(pending.data[0 * 10 + 0]).toBe(1);
    expect(pending.data[1 * 10 + 1]).toBe(1);
  });

  it('subtractFromSelection removes pixels (AND NOT)', () => {
    pipeline.setPendingMask(createMask(10, 10, [[0, 0], [1, 0], [2, 0]]));
    pipeline.subtractFromSelection(createMask(10, 10, [[1, 0]]));

    const pending = pipeline.getPendingMask()!;
    expect(pending.data[0]).toBe(1); // kept
    expect(pending.data[1]).toBe(0); // subtracted
    expect(pending.data[2]).toBe(1); // kept
  });

  it('subtractFromSelection with no pending is a no-op', () => {
    pipeline.subtractFromSelection(createMask(10, 10, [[0, 0]]));
    expect(pipeline.hasPending()).toBe(false);
  });

  // ── invertSelection ─────────────────────────────────────────────

  it('invertSelection flips mask bits', () => {
    pipeline.setPendingMask(createMask(10, 10, [[0, 0]]));
    pipeline.invertSelection();

    const pending = pipeline.getPendingMask()!;
    expect(pending.data[0]).toBe(0);   // was 1 → 0
    expect(pending.data[1]).toBe(1);   // was 0 → 1
    expect(pending.data[10]).toBe(1);  // was 0 → 1
  });

  it('invertSelection with no pending is a no-op', () => {
    pipeline.invertSelection();
    expect(pipeline.hasPending()).toBe(false);
  });

  it('invertSelection updates bounds correctly', () => {
    pipeline.setPendingMask(createMask(10, 10, [[0, 0]]));
    pipeline.invertSelection();

    const pending = pipeline.getPendingMask()!;
    expect(pending.bounds).toEqual({ minX: 0, minY: 0, maxX: 9, maxY: 9 });
  });

  // ── MAX_UNDO_DEPTH ─────────────────────────────────────────────

  it('respects MAX_UNDO_DEPTH of 10', () => {
    for (let i = 0; i < 15; i++) {
      pipeline.setPendingMask(createMask(10, 10, [[i % 10, 0]]));
      pipeline.commit('keep');
    }
    expect(pipeline.canUndo()).toBe(true);
    for (let i = 0; i < 10; i++) {
      pipeline.undo();
    }
    expect(pipeline.canUndo()).toBe(false);
  });

  // ── snapshotInitialMask ─────────────────────────────────────────

  it('snapshotInitialMask resets undo stack', () => {
    pipeline.setPendingMask(createMask(10, 10, [[0, 0]]));
    pipeline.commit('erase');
    expect(pipeline.canUndo()).toBe(true);

    pipeline.snapshotInitialMask();
    expect(pipeline.canUndo()).toBe(false);
  });

  // ── destroy ─────────────────────────────────────────────────────

  it('destroy clears pending and undo stack', () => {
    pipeline.setPendingMask(createMask(10, 10, [[0, 0]]));
    pipeline.commit('erase');
    pipeline.setPendingMask(createMask(10, 10, [[1, 1]]));

    pipeline.destroy();
    expect(pipeline.hasPending()).toBe(false);
    expect(pipeline.canUndo()).toBe(false);
  });
});
