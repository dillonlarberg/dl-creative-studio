import type { Creative } from '../types';
import { sha256Prefix } from './sha256';

const DATE_COLUMNS = [
  'created_at', 'updated_at', 'date_modified', 'date_created',
  'last_updated', 'published_at', 'upload_date', 'date', 'timestamp',
  'start_date', 'reporting_date', 'ad_date',
];

function detectUploadDate(row: Record<string, unknown>): string {
  for (const col of DATE_COLUMNS) {
    const val = row[col];
    if (typeof val === 'string' && val.trim()) {
      const parsed = new Date(val);
      if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
    }
  }
  return '';
}

function detectFileType(url: string): 'PNG' | 'JPG' | 'WEBP' {
  const lower = url.toLowerCase();
  if (lower.includes('.png')) return 'PNG';
  if (lower.includes('.webp')) return 'WEBP';
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

// Keep in sync with VIDEO_EXTENSIONS in functions/src/datasources/detect.ts
// (cross-package duplicate — can't share a module across src/ ↔ functions/).
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm', '.m3u8'];

/** Ad Resize is images-only; this guards video URLs out of the outpaint pipeline. */
export function isVideoUrl(value: unknown): boolean {
  const v = String(value ?? '').toLowerCase();
  return v.startsWith('http') && VIDEO_EXTENSIONS.some((ext) => v.includes(ext));
}

export interface FeedToCreativesResult {
  creatives: Creative[];
  /** Rows skipped because the chosen column held a video URL (Ad Resize is images-only). */
  skippedVideo: number;
  /** Rows skipped because image_type === 'thumbnail'. */
  skippedThumbnail: number;
}

export async function feedToCreatives(
  sampleData: Array<Record<string, unknown>>,
  feedName: string,
  imageColumn: string,
): Promise<FeedToCreativesResult> {
  const withUrl = sampleData.filter(row => String(row[imageColumn] ?? '').startsWith('http'));
  const nonThumbnail = withUrl.filter(row => String(row['image_type'] ?? '').toLowerCase() !== 'thumbnail');
  const skippedThumbnail = withUrl.length - nonThumbnail.length;
  const images = nonThumbnail.filter(row => !isVideoUrl(row[imageColumn]));
  const skippedVideo = nonThumbnail.length - images.length;
  const creatives = await Promise.all(
    images.map(async (row) => {
      const imageUrl = String(row[imageColumn]);
      const id = await sha256Prefix(imageUrl);
      return {
        id,
        name: deriveLabel(row, imageColumn),
        thumbnailUrl: imageUrl,
        originalUrl: imageUrl,
        width: 1080,
        height: 1080,
        fileType: detectFileType(imageUrl),
        uploadedAt: detectUploadDate(row),
        source: feedName,
        sourceKind: 'alli' as const,
        tags: [],
      };
    }),
  );
  return { creatives, skippedVideo, skippedThumbnail };
}
