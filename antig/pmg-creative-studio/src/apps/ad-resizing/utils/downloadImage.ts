export type DownloadFormat = 'png' | 'jpg' | 'webp';

const MIME: Record<DownloadFormat, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
};

export async function downloadImage(
  imageUrl: string,
  filename: string,
  format: DownloadFormat
): Promise<void> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = imageUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d')!;

  // JPG doesn't support transparency — fill white before drawing
  if (format === 'jpg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0);

  const quality = format === 'jpg' ? 0.92 : format === 'webp' ? 0.9 : undefined;
  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.${format}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, MIME[format], quality);
}
