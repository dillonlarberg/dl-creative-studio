// Shared outpaint primitive. NOTE: tools/resize-tracer/src/resize.ts keeps a separate prototype copy.
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
