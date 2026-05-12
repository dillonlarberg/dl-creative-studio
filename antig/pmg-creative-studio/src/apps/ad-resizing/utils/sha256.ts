/**
 * Browser-side sha256 prefix used as a stable cache key for source URLs.
 * Must match the Cloud Function helper `deriveSourceKey(originalUrl)` in
 * functions/src/resize/storage.ts so the same URL hashes to the same key
 * on both sides of the wire (lets the function short-circuit on repeat
 * source-staging).
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
