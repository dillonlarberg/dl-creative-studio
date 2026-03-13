/**
 * Loads an image as an HTMLImageElement with CORS support.
 * For data: and blob: URLs, crossOrigin is skipped.
 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Only set crossOrigin for http(s) URLs — data/blob URLs don't need it
    if (url.startsWith('http')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url.slice(0, 100)}`));
    img.src = url;
  });
}

/**
 * Applies a mask canvas to the original image to produce a refined foreground.
 *
 * The mask canvas contains white (keep) and black (remove) values.
 * The original image is the FULL pre-extraction image (with background).
 * Each pixel's alpha is set to the mask's luminance value.
 *
 * @param originalImageUrl - CORS-safe URL to the original full image (use proxyUrl())
 * @param maskCanvas - Hidden mask canvas with white=keep, black=remove values
 * @returns data:image/png URL of the refined foreground
 */
export async function applyMaskToAlpha(
  originalImageUrl: string,
  maskCanvas: HTMLCanvasElement,
): Promise<string> {
  const img = await loadImage(originalImageUrl);

  const { naturalWidth: w, naturalHeight: h } = img;

  // Validate dimensions match
  if (maskCanvas.width !== w || maskCanvas.height !== h) {
    throw new Error(
      `Dimension mismatch: image is ${w}×${h} but mask canvas is ${maskCanvas.width}×${maskCanvas.height}`
    );
  }

  // Draw original image onto offscreen canvas
  const offscreen = document.createElement('canvas');
  offscreen.width = w;
  offscreen.height = h;
  const ctx = offscreen.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  // Read pixel data from both canvases
  const imageData = ctx.getImageData(0, 0, w, h);
  const imagePixels = imageData.data;

  const maskCtx = maskCanvas.getContext('2d')!;
  const maskData = maskCtx.getImageData(0, 0, w, h);
  const maskPixels = maskData.data;

  // Apply mask luminance → image alpha
  for (let i = 0; i < imagePixels.length; i += 4) {
    // On a white/black canvas, R=G=B, so read any channel
    const maskLuminance = maskPixels[i]; // red channel
    imagePixels[i + 3] = maskLuminance;  // set alpha
  }

  ctx.putImageData(imageData, 0, 0);
  return offscreen.toDataURL('image/png');
}
