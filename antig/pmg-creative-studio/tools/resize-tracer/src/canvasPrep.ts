import sharp from "sharp";
import { legalGenDims } from "./config.js";
import type { Spec } from "./promptTemplate.js";

export interface PaddedCanvas {
  // Source content placed on a transparent canvas at max-fit position.
  // RGBA PNG. Pixels outside the source region are fully transparent.
  imageBuffer: Buffer;
  // Mask PNG (RGBA). Opaque WHITE (255,255,255,255) over the source region
  // = "preserve" per OpenAI's mask convention. Transparent (alpha=0) over
  // the rest = "paint here." Same dims as imageBuffer.
  maskBuffer: Buffer;
  width: number;
  height: number; // both = legalGenDims(target)
  // Where the source landed inside the canvas (normalized 0-1).
  sourceBox: { x: number; y: number; w: number; h: number };
  sourceCoveragePct: number;
  // Scale factor applied to source. >1 = upscaled, <1 = shrunk, 1 = native.
  fitRatio: number;
  // For prompt construction.
  emptyRegions: string;
  // Pixel-level offsets/dims of the scaled source on the canvas.
  // Needed by post-composite to extract + paste back at the correct location.
  scaledW: number;
  scaledH: number;
  offsetX: number;
  offsetY: number;
}

function describeEmptyRegions(box: PaddedCanvas["sourceBox"]): string {
  const parts: string[] = [];
  if (box.y > 0.02) parts.push(`above (top ${(box.y * 100).toFixed(0)}%)`);
  const bottomGap = 1 - (box.y + box.h);
  if (bottomGap > 0.02) parts.push(`below (bottom ${(bottomGap * 100).toFixed(0)}%)`);
  if (box.x > 0.02) parts.push(`left (left ${(box.x * 100).toFixed(0)}%)`);
  const rightGap = 1 - (box.x + box.w);
  if (rightGap > 0.02) parts.push(`right (right ${(rightGap * 100).toFixed(0)}%)`);
  return parts.length === 0 ? "no empty regions (source already fills canvas)" : parts.join(", ");
}

/**
 * Build the (image, mask) pair to send to gpt-image-2 `images.edit`.
 *
 * Canvas dims = legalGenDims(targetSpec). Source is max-fit (CSS contain
 * semantics) onto the transparent canvas. The mask marks the source region
 * as PRESERVE (opaque white) and everything else as PAINT (transparent).
 *
 * OpenAI mask convention: alpha=0 → paint, alpha=255 (opaque) → preserve.
 * Both buffers MUST be RGBA PNGs so alpha survives upload.
 */
export async function prepPaddedCanvas(
  source: Buffer,
  sourceSpec: Spec,
  targetSpec: Spec,
): Promise<PaddedCanvas> {
  const { w: canvasW, h: canvasH } = legalGenDims(targetSpec);

  // Max-fit (object-fit: contain). Both shrink AND upscale allowed —
  // a tiny source on a large canvas leads to too much hallucination space.
  const widthRatio = canvasW / sourceSpec.w;
  const heightRatio = canvasH / sourceSpec.h;
  const fitRatio = Math.min(widthRatio, heightRatio);
  const scaledW = Math.max(1, Math.round(sourceSpec.w * fitRatio));
  const scaledH = Math.max(1, Math.round(sourceSpec.h * fitRatio));
  const offsetX = Math.round((canvasW - scaledW) / 2);
  const offsetY = Math.round((canvasH - scaledH) / 2);

  // Force RGBA on the resized source so the canvas PNG keeps an alpha channel.
  const scaled = await sharp(source)
    .resize(scaledW, scaledH)
    .ensureAlpha()
    .png()
    .toBuffer();

  // Image PNG: transparent RGBA canvas, source composited at offset.
  const imageBuffer = await sharp({
    create: {
      width: canvasW,
      height: canvasH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: scaled, top: offsetY, left: offsetX }])
    .png()
    .toBuffer();

  // Mask PNG: transparent RGBA canvas, opaque-white rect of size scaledW×scaledH at offset.
  const whiteRect = await sharp({
    create: {
      width: scaledW,
      height: scaledH,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  const maskBuffer = await sharp({
    create: {
      width: canvasW,
      height: canvasH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: whiteRect, top: offsetY, left: offsetX }])
    .png()
    .toBuffer();

  const sourceBox = {
    x: offsetX / canvasW,
    y: offsetY / canvasH,
    w: scaledW / canvasW,
    h: scaledH / canvasH,
  };

  return {
    imageBuffer,
    maskBuffer,
    width: canvasW,
    height: canvasH,
    sourceBox,
    sourceCoveragePct: Math.round(sourceBox.w * sourceBox.h * 100),
    fitRatio,
    emptyRegions: describeEmptyRegions(sourceBox),
    scaledW,
    scaledH,
    offsetX,
    offsetY,
  };
}
