// functions/src/datasources/detect.ts
//
// Server-canonical media detection. Mirrors the heuristic previously in
// src/apps/ad-resizing/utils/feedToCreatives.ts (which the client sheds).

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

export function isImageUrl(value: unknown): boolean {
  const v = String(value ?? "").toLowerCase();
  return (
    v.startsWith("http") && IMAGE_EXTENSIONS.some((ext) => v.includes(ext))
  );
}

/** Columns where >=50% of the first 5 sampled rows hold image URLs. */
export function detectImageColumns(
  rows: Array<Record<string, unknown>>,
): string[] {
  if (rows.length === 0) return [];
  const sample = rows.slice(0, Math.min(20, rows.length));
  const columns = Object.keys(rows[0]);
  return columns.filter((col) => {
    const hits = sample.filter((row) => isImageUrl(row[col])).length;
    return hits >= Math.ceil(sample.length / 2);
  });
}
