import sharp from "sharp";

// Nano Banana returns ~1024px native; we crop/resize to exact target dims.
// Strategy: cover (crop center) to preserve a centered subject. Extreme
// aspect ratios may crop edges — accepted tradeoff for v0.
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
