import type { Creative } from '../types';
import { sha256Prefix } from './sha256';

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

export function detectImageColumns(rows: Array<Record<string, unknown>>): string[] {
  if (rows.length === 0) return [];
  const sample = rows.slice(0, Math.min(5, rows.length));
  const columns = Object.keys(rows[0]);

  return columns.filter(col => {
    const imageCount = sample.filter(row => {
      const val = String(row[col] ?? '');
      return val.startsWith('http') && IMAGE_EXTENSIONS.some(ext => val.toLowerCase().includes(ext));
    }).length;
    return imageCount >= Math.ceil(sample.length / 2);
  });
}

function detectFileType(url: string): 'PNG' | 'JPG' | 'GIF' {
  const lower = url.toLowerCase();
  if (lower.includes('.png')) return 'PNG';
  if (lower.includes('.gif')) return 'GIF';
  return 'JPG';
}

function deriveLabel(row: Record<string, unknown>, imageColumn: string): string {
  const nameCandidates = [
    'name', 'title', 'ad_name', 'creative_name', 'product_name',
    'product', 'label', 'description', 'ad_id',
  ];
  for (const candidate of nameCandidates) {
    const val = row[candidate];
    if (typeof val === 'string' && val.trim() && val !== row[imageColumn]) {
      return val.trim().slice(0, 60);
    }
  }
  for (const [key, val] of Object.entries(row)) {
    if (key === imageColumn) continue;
    if (typeof val === 'string' && val.trim() && val.length < 80 && !val.startsWith('http')) {
      return val.trim().slice(0, 60);
    }
  }
  return 'Untitled Creative';
}

export async function feedToCreatives(
  sampleData: Array<Record<string, unknown>>,
  feedName: string,
  imageColumn: string,
): Promise<Creative[]> {
  const filtered = sampleData.filter(row => String(row[imageColumn] ?? '').startsWith('http'));
  return Promise.all(
    filtered.map(async (row) => {
      const imageUrl = String(row[imageColumn]);
      // URL-stable id (codex F10): matches the cache key the Cloud Function
      // derives from the same originalUrl, so re-staging is a no-op.
      const id = await sha256Prefix(imageUrl);
      return {
        id,
        name: deriveLabel(row, imageColumn),
        thumbnailUrl: imageUrl,
        originalUrl: imageUrl,
        // Initial guesstimate; CreativeTile probes the real natural dimensions
        // on <img> load and patches these via onDimensionsResolved (PR-D).
        width: 1080,
        height: 1080,
        fileType: detectFileType(imageUrl),
        uploadedAt: new Date().toISOString().split('T')[0],
        source: feedName,
        tags: [],
      };
    }),
  );
}
