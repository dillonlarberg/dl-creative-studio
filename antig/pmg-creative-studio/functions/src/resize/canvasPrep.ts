// MAINTAINED IN PARALLEL with tools/resize-tracer/src/canvasPrep.ts — see TODO(resize-pipeline-extract).
import sharp from "sharp";
import { legalGenDims } from "./config";
import type { Spec } from "./promptTemplate";

export interface PaddedCanvas {
  imageBuffer: Buffer;
  maskBuffer: Buffer;
  width: number;
  height: number;
  sourceBox: { x: number; y: number; w: number; h: number };
  sourceCoveragePct: number;
  fitRatio: number;
  emptyRegions: string;
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

export async function prepPaddedCanvas(
  source: Buffer,
  sourceSpec: Spec,
  targetSpec: Spec,
): Promise<PaddedCanvas> {
  const { w: canvasW, h: canvasH } = legalGenDims(targetSpec);

  const widthRatio = canvasW / sourceSpec.w;
  const heightRatio = canvasH / sourceSpec.h;
  const fitRatio = Math.min(widthRatio, heightRatio);
  const scaledW = Math.max(1, Math.round(sourceSpec.w * fitRatio));
  const scaledH = Math.max(1, Math.round(sourceSpec.h * fitRatio));
  const offsetX = Math.round((canvasW - scaledW) / 2);
  const offsetY = Math.round((canvasH - scaledH) / 2);

  const scaled = await sharp(source)
    .resize(scaledW, scaledH)
    .ensureAlpha()
    .png()
    .toBuffer();

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
