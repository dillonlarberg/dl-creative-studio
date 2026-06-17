/**
 * sha256 prefix — stable id for a source URL.
 *
 * Cross-app duplicate of src/apps/ad-resizing/utils/sha256.ts (kept local to
 * avoid coupling video-stitch to ad-resizing internals; the function is 10
 * lines and must match the Cloud Function key derivation on both sides).
 * Keep in sync.
 */
export async function sha256Prefix(input: string, len = 16): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(input));
  const bytes = new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex.slice(0, len);
}
