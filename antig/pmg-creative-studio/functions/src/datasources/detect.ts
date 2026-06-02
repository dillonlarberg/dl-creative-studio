// functions/src/datasources/detect.ts
//
// Server-canonical media detection. Mirrors the heuristic previously in
// src/apps/ad-resizing/utils/feedToCreatives.ts (which the client shed).

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
// Keep in sync with VIDEO_EXTENSIONS in
// src/apps/ad-resizing/utils/feedToCreatives.ts (cross-package duplicate — the
// client guard can't import from functions/).
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm', '.m3u8'];

export function isImageUrl(value: unknown): boolean {
  const v = String(value ?? '').toLowerCase();
  return v.startsWith('http') && IMAGE_EXTENSIONS.some((ext) => v.includes(ext));
}

export function isVideoUrl(value: unknown): boolean {
  const v = String(value ?? '').toLowerCase();
  return v.startsWith('http') && VIDEO_EXTENSIONS.some((ext) => v.includes(ext));
}

/**
 * Columns where >=50% of the first 20 sampled rows satisfy `pred`. Uses the
 * union of keys across the sample — Alli omits null columns per row, so row 0
 * alone can miss columns that only appear later in the sample.
 */
function detectColumns(
  rows: Array<Record<string, unknown>>,
  pred: (value: unknown) => boolean,
): string[] {
  if (rows.length === 0) return [];
  const sample = rows.slice(0, Math.min(20, rows.length));
  const columns = [...new Set(sample.flatMap((r) => Object.keys(r)))];
  return columns.filter((col) => {
    const hits = sample.filter((row) => pred(row[col])).length;
    return hits >= Math.ceil(sample.length / 2);
  });
}

export function detectImageColumns(rows: Array<Record<string, unknown>>): string[] {
  return detectColumns(rows, isImageUrl);
}

export function detectVideoColumns(rows: Array<Record<string, unknown>>): string[] {
  return detectColumns(rows, isVideoUrl);
}
