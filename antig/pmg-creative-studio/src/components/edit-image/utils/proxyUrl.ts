const EXTRACT_API_URL = (import.meta.env.VITE_EXTRACT_API_URL || '').replace(/\/$/, '');

/**
 * Wraps external image URLs with the CORS proxy endpoint.
 * Data URLs and same-origin URLs pass through unchanged.
 */
export function proxyUrl(url: string): string {
  if (!url) return url;

  // Data URLs are same-origin — no proxy needed
  if (url.startsWith('data:')) return url;

  // Same-origin URLs don't need proxying
  if (url.startsWith('/') || url.startsWith(window.location.origin)) return url;

  // Blob URLs are same-origin
  if (url.startsWith('blob:')) return url;

  // External URL — route through proxy
  if (!EXTRACT_API_URL) {
    console.warn('VITE_EXTRACT_API_URL not configured — cannot proxy external images');
    return url;
  }

  return `${EXTRACT_API_URL}/api/proxy-image?url=${encodeURIComponent(url)}`;
}
