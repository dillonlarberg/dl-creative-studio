import { Circle } from 'fabric';
import type { BrushMode } from './types';

// ── Image Loading ────────────────────────────────────────────────────

/** Load an image element, optionally with crossOrigin for CORS-safe pixel access */
export function loadImg(url: string, cors = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors && url.startsWith('http')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${url.slice(0, 80)}`));
    img.src = url;
  });
}

/** Helper: canvas.toBlob() as a Promise */
export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to convert canvas to blob'));
    }, 'image/png');
  });
}

// ── Mask Building ────────────────────────────────────────────────────

/**
 * Build initial mask canvas + red tint overlay from the extracted foreground's alpha.
 * Case B: first edit after API extraction.
 */
export async function buildMaskFromAlpha(
  extractedImg: HTMLImageElement,
  w: number,
  h: number,
): Promise<{ maskCanvas: HTMLCanvasElement; tintBlobUrl: string }> {
  const readCanvas = document.createElement('canvas');
  readCanvas.width = w;
  readCanvas.height = h;
  const readCtx = readCanvas.getContext('2d')!;
  readCtx.drawImage(extractedImg, 0, 0, w, h);
  const extractedData = readCtx.getImageData(0, 0, w, h);
  const pixels = extractedData.data;

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = w;
  maskCanvas.height = h;
  const maskCtx = maskCanvas.getContext('2d')!;
  const maskData = maskCtx.createImageData(w, h);
  const maskPixels = maskData.data;

  const tintCanvas = document.createElement('canvas');
  tintCanvas.width = w;
  tintCanvas.height = h;
  const tintCtx = tintCanvas.getContext('2d')!;
  const tintData = tintCtx.createImageData(w, h);
  const tintPixels = tintData.data;

  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3];
    maskPixels[i] = alpha;
    maskPixels[i + 1] = alpha;
    maskPixels[i + 2] = alpha;
    maskPixels[i + 3] = 255;
    tintPixels[i] = 255;
    tintPixels[i + 1] = 0;
    tintPixels[i + 2] = 0;
    tintPixels[i + 3] = Math.round((1 - alpha / 255) * 102);
  }

  maskCtx.putImageData(maskData, 0, 0);
  tintCtx.putImageData(tintData, 0, 0);

  const tintBlob = await canvasToBlob(tintCanvas);
  const tintBlobUrl = URL.createObjectURL(tintBlob);
  return { maskCanvas, tintBlobUrl };
}

/**
 * Build initial mask canvas + red tint overlay from a saved mask data URL.
 * Case A: re-editing.
 */
export async function buildMaskFromSaved(
  maskImg: HTMLImageElement,
  w: number,
  h: number,
): Promise<{ maskCanvas: HTMLCanvasElement; tintBlobUrl: string }> {
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = w;
  maskCanvas.height = h;
  const maskCtx = maskCanvas.getContext('2d')!;
  maskCtx.drawImage(maskImg, 0, 0, w, h);
  const maskData = maskCtx.getImageData(0, 0, w, h);
  const maskPixels = maskData.data;

  const tintCanvas = document.createElement('canvas');
  tintCanvas.width = w;
  tintCanvas.height = h;
  const tintCtx = tintCanvas.getContext('2d')!;
  const tintData = tintCtx.createImageData(w, h);
  const tintPixels = tintData.data;

  for (let i = 0; i < maskPixels.length; i += 4) {
    const luminance = maskPixels[i];
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

// ── Tint Regeneration ────────────────────────────────────────────────

/**
 * Regenerate the red tint overlay from the current mask canvas state.
 * Returns a blob URL for the tint image.
 */
export async function regenerateTint(
  maskCanvas: HTMLCanvasElement,
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
    const luminance = maskData[i];
    const removedness = 1 - luminance / 255;
    tintImg.data[i] = 255;
    tintImg.data[i + 1] = 0;
    tintImg.data[i + 2] = 0;
    tintImg.data[i + 3] = Math.round(removedness * 102);
  }

  tintCtx.putImageData(tintImg, 0, 0);
  const blob = await canvasToBlob(tintCanvas);
  return URL.createObjectURL(blob);
}

// ── Brush Helpers ────────────────────────────────────────────────────

/**
 * Mirror a Fabric path object onto the hidden mask canvas.
 * Uses custom `data.maskMode` tag instead of brittle color string matching.
 */
export function mirrorPathToMask(
  fabricPath: any,
  maskCanvas: HTMLCanvasElement,
): void {
  const ctx = maskCanvas.getContext('2d')!;
  const isKeep = fabricPath.data?.maskMode === 'keep';
  const opacity = fabricPath.opacity ?? 1;

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = isKeep
    ? `rgba(255,255,255,${opacity})`
    : `rgba(0,0,0,${opacity})`;
  ctx.lineWidth = fabricPath.strokeWidth || 20;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const left = fabricPath.left ?? 0;
  const top = fabricPath.top ?? 0;
  const offsetX = fabricPath.pathOffset?.x ?? 0;
  const offsetY = fabricPath.pathOffset?.y ?? 0;
  ctx.translate(left - offsetX, top - offsetY);

  const pathStr =
    fabricPath.path?.map((seg: any[]) => seg.join(' ')).join(' ') || '';
  const path2D = new Path2D(pathStr);
  ctx.stroke(path2D);
  ctx.restore();
}

/** Update brush appearance based on mode, size, opacity */
export function updateBrush(
  canvas: any,
  mode: BrushMode,
  size: number,
  opacity: number,
): void {
  if (!canvas?.freeDrawingBrush) return;
  const normalizedOpacity = opacity / 100;
  canvas.freeDrawingBrush.color =
    mode === 'keep'
      ? `rgba(0, 255, 0, ${normalizedOpacity * 0.5})`
      : `rgba(255, 0, 0, ${normalizedOpacity * 0.4})`;
  canvas.freeDrawingBrush.width = size;
}

/** Setup brush cursor — a custom Fabric Circle that follows the mouse */
export function setupBrushCursor(canvas: any, mode: BrushMode, size: number): any {
  const cursor = new Circle({
    radius: size / 2,
    fill: 'transparent',
    stroke: mode === 'keep' ? 'rgba(0,255,0,0.6)' : 'rgba(255,0,0,0.6)',
    strokeWidth: 1.5,
    originX: 'center',
    originY: 'center',
    selectable: false,
    evented: false,
    excludeFromExport: true,
  });
  cursor.set('visible', false);
  canvas.add(cursor);

  canvas.defaultCursor = 'none';
  canvas.freeDrawingCursor = 'none';

  canvas.on('mouse:move', (e: any) => {
    const pointer = canvas.getScenePoint(e.e);
    cursor.set({ left: pointer.x, top: pointer.y, visible: true });
    canvas.bringObjectToFront(cursor);
    canvas.renderAll();
  });

  canvas.on('mouse:out', () => {
    cursor.set('visible', false);
    canvas.renderAll();
  });

  return cursor;
}

/** Update brush cursor appearance to match current mode and size */
export function updateBrushCursor(
  cursor: any,
  mode: BrushMode,
  size: number,
): void {
  if (!cursor) return;
  cursor.set({
    radius: size / 2,
    stroke: mode === 'keep' ? 'rgba(0,255,0,0.6)' : 'rgba(255,0,0,0.6)',
  });
}
