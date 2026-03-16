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

export interface MarchingAntsHandle {
  updateMask(newMask: BinaryMask): void;
  stop(): void;
}

/**
 * Start marching ants animation on the overlay canvas for the given mask.
 * Returns a handle to stop/update the animation.
 */
export function startMarchingAnts(
  overlayCanvas: HTMLCanvasElement,
  mask: BinaryMask,
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

/**
 * Compute border pixel indices from a BinaryMask.
 * A pixel is on the border if it is selected (1) and has at least one
 * unselected neighbor (0) in the 4-connected neighborhood.
 */
function computeBorderIndices(mask: BinaryMask): number[] {
  const { data, width, height, bounds } = mask;
  const indices: number[] = [];

  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const idx = y * width + x;
      if (data[idx] === 0) continue;

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
      // Black pixel (RGB defaults to 0, just set alpha)
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
