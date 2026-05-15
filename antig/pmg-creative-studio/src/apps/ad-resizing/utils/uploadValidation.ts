const ACCEPTED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_SIZE_BYTES = 50 * 1024 * 1024;

export type ValidationResult =
  | { valid: true }
  | { valid: false; error: string };

export function validateUploadFile(file: File): ValidationResult {
  if (!ACCEPTED_MIME_TYPES.has(file.type)) {
    return { valid: false, error: 'GIF and video files are not supported. Please upload a PNG, JPG, or WebP.' };
  }
  if (file.size > MAX_SIZE_BYTES) {
    return { valid: false, error: `File exceeds the 50 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB).` };
  }
  return { valid: true };
}

export function fileTypeFromMime(mimeType: string): 'PNG' | 'JPG' | 'WEBP' {
  if (mimeType === 'image/png') return 'PNG';
  if (mimeType === 'image/webp') return 'WEBP';
  return 'JPG';
}

export function extFromMime(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}
