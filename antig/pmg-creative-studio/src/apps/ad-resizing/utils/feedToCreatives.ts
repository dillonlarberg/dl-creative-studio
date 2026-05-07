import type { MockCreative } from '../types';

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

export function feedToCreatives(
  sampleData: Array<Record<string, unknown>>,
  feedName: string,
  imageColumn: string,
): MockCreative[] {
  return sampleData
    .filter(row => String(row[imageColumn] ?? '').startsWith('http'))
    .map((row, i) => {
      const imageUrl = String(row[imageColumn]);
      return {
        id: `feed-${i}-${imageColumn}`,
        name: deriveLabel(row, imageColumn),
        thumbnailUrl: imageUrl,
        width: 1080,
        height: 1080,
        fileType: detectFileType(imageUrl),
        uploadedAt: new Date().toISOString().split('T')[0],
        source: feedName,
        tags: [],
      };
    });
}
