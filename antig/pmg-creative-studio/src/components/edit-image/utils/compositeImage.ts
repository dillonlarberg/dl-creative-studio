/**
 * Composites a foreground PNG over a background (solid color or image) using Canvas API.
 * Returns a Blob of the final PNG.
 */
export async function compositeImage(
  foregroundUrl: string,
  background: { type: 'color'; value: string } | { type: 'image'; url: string; name: string },
): Promise<Blob> {
  const fgImg = await loadImage(foregroundUrl);

  const canvas = document.createElement('canvas');
  canvas.width = fgImg.naturalWidth;
  canvas.height = fgImg.naturalHeight;
  const ctx = canvas.getContext('2d')!;

  // Draw background
  if (background.type === 'color') {
    ctx.fillStyle = background.value;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    const bgImg = await loadImage(background.url);
    // Scale background to cover canvas dimensions
    const scale = Math.max(canvas.width / bgImg.naturalWidth, canvas.height / bgImg.naturalHeight);
    const w = bgImg.naturalWidth * scale;
    const h = bgImg.naturalHeight * scale;
    const x = (canvas.width - w) / 2;
    const y = (canvas.height - h) / 2;
    ctx.drawImage(bgImg, x, y, w, h);
  }

  // Draw foreground on top
  ctx.drawImage(fgImg, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to export canvas to blob'));
    }, 'image/png');
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}
