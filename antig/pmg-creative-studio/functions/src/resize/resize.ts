// MAINTAINED IN PARALLEL with tools/resize-tracer/src/resize.ts — see TODO(resize-pipeline-extract).
import sharp from "sharp";

export async function resizeToTarget(
  raw: Buffer,
  w: number,
  h: number,
): Promise<Buffer> {
  return sharp(raw)
    .resize({ width: w, height: h, fit: "cover", position: "center" })
    .png()
    .toBuffer();
}
