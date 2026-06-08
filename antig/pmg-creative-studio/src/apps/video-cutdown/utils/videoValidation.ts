const ACCEPTED_MIME_TYPES = new Set(['video/mp4', 'video/quicktime']);
const MAX_SIZE_BYTES = 500 * 1024 * 1024;

export type VideoValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

export function validateVideoFile(file: File): VideoValidationResult {
  if (!ACCEPTED_MIME_TYPES.has(file.type)) {
    return { ok: false, reason: 'Unsupported file type. Please upload an MP4 or MOV (QuickTime) video.' };
  }
  if (file.size > MAX_SIZE_BYTES) {
    return { ok: false, reason: `File exceeds the 500 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB).` };
  }
  return { ok: true };
}
