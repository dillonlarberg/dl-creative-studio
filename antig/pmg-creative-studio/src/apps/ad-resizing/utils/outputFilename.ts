const APP_SLUGS: Record<string, string> = {
  'ad-resizing': 'resize',
  'template-builder': 'template',
  'video-stitch': 'stitch',
};

/**
 * Build a download filename stem (no extension) following the convention:
 *   {source_basename}_{app_slug}_{w}x{h}
 *
 * Example: "image(2).png" + ad-resizing + 1080x1920 → "image(2)_resize_1080x1920"
 *
 * The caller (downloadImage) appends the format extension.
 */
export function buildOutputFilename(
  sourceName: string,
  appId: string,
  width: number,
  height: number,
): string {
  const basename = sourceName
    .replace(/\.[^/.]+$/, '')               // strip extension
    .replace(/[^a-zA-Z0-9()[\]._-]+/g, '_') // keep parens/brackets; replace other specials
    .replace(/_{2,}/g, '_')                // collapse multiple underscores
    .replace(/^_|_$/g, '');               // trim leading/trailing underscores
  const appSlug = APP_SLUGS[appId] ?? appId;
  return `${basename}_${appSlug}_${width}x${height}`;
}
