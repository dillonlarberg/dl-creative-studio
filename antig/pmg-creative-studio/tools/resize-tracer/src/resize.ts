import sharp from "sharp";

// Final exact-dimension check. The generated canvas should already be close
// to the target aspect; this normalizes the output to the requested preset.
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
