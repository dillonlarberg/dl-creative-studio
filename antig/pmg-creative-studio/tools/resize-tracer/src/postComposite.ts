import sharp from "sharp";
import type { PaddedCanvas } from "./canvasPrep.js";

/**
 * Strict post-composite: paste the original source pixels back over the
 * preserve region of the model output, bytewise. Guarantees pixel-perfect
 * subject/copy preservation regardless of what the model did in that
 * region. Neutralizes gpt-image-2's known "regenerates whole image" bug.
 *
 * Implementation: re-extract the scaled source pixels from canvas.imageBuffer
 * (we already placed them there at the correct size+position during prep)
 * and composite them onto modelOutput at the same offset.
 */
export async function strictPostComposite(
  modelOutput: Buffer,
  canvas: PaddedCanvas,
): Promise<Buffer> {
  const { scaledW, scaledH, offsetX, offsetY } = canvas;

  // Pull the source-region pixels straight off the prep canvas.
  const sourceRegion = await sharp(canvas.imageBuffer)
    .extract({ left: offsetX, top: offsetY, width: scaledW, height: scaledH })
    .png()
    .toBuffer();

  // Resize model output to canvas dims defensively in case the model
  // returned anything off-by-a-pixel, then paste source pixels on top.
  const composited = await sharp(modelOutput)
    .resize(canvas.width, canvas.height, { fit: "fill" })
    .composite([{ input: sourceRegion, top: offsetY, left: offsetX }])
    .png()
    .toBuffer();

  console.log(
    `[post-composite] pasted source ${scaledW}×${scaledH} at (${offsetX},${offsetY}) over model output`,
  );
  return composited;
}
