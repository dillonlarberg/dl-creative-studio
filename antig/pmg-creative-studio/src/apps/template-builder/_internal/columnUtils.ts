export const IMAGE_COLUMN_KEYWORDS = ['image', 'img', 'url', 'link', 'photo', 'pic', 'src', 'thumb', 'media'] as const;
export const CURRENCY_COLUMN_KEYWORDS = ['price', 'cost', 'amount', 'sale', 'msrp', 'value', 'fee', 'regular', 'final'] as const;
// Structural container IDs reported by zone-reporter that should not render as selectable overlay handles
export const SKIP_ZONE_IDS = new Set(['ad', 'base', 'background', 'bg', 'body', 'ad-container', 'wrapper']);

export type ColType = 'image_url' | 'url' | 'numeric' | 'text';

export const COL_TYPE_LABELS: Record<ColType, string> = {
  image_url: 'Image URL',
  url: 'URL',
  numeric: 'Number',
  text: 'Text',
};

export function inferColumnTypes(
  sampleData: Array<Record<string, unknown>>,
  cols: string[]
): Record<string, ColType> {
  const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|svg|avif|bmp)/i;
  const IMAGE_DOMAIN = /(cdn\.|img\.|image\.|photo\.|static\.|media\.)/i;
  const URL_RE = /^https?:\/\//i;
  const NUM_RE = /^[\$€£¥]?[\d,]+\.?\d*[\$€£¥%]?$/;

  const result: Record<string, ColType> = {};
  for (const col of cols) {
    const samples = sampleData
      .map((row) => String(row[col] ?? '').trim())
      .filter((v) => v.length > 0)
      .slice(0, 5);

    // Column-name keyword fallback when sample data is sparse or empty
    const colLower = col.toLowerCase();
    if (samples.length === 0) {
      if (IMAGE_COLUMN_KEYWORDS.some((k) => colLower.includes(k))) result[col] = 'image_url';
      else if (CURRENCY_COLUMN_KEYWORDS.some((k) => colLower.includes(k))) result[col] = 'numeric';
      else result[col] = 'text';
      continue;
    }

    const allUrl = samples.every((v) => URL_RE.test(v));
    const anyImageClue = samples.some((v) => IMAGE_EXT.test(v) || IMAGE_DOMAIN.test(v))
      || IMAGE_COLUMN_KEYWORDS.some((k) => colLower.includes(k));
    const allNumeric = samples.every((v) => NUM_RE.test(v))
      || (samples.length === 0 && CURRENCY_COLUMN_KEYWORDS.some((k) => colLower.includes(k)));

    if (allUrl && anyImageClue) result[col] = 'image_url';
    else if (allUrl) result[col] = 'url';
    else if (allNumeric) result[col] = 'numeric';
    else result[col] = 'text';
  }
  return result;
}

export function groupColumnsByInferredType(
  cols: string[],
  inferredTypes: Record<string, ColType>,
  fieldType: string
): Array<{ groupLabel: string; cols: string[] }> {
  const preferredType: ColType =
    fieldType === 'image' ? 'image_url' :
    fieldType === 'currency' ? 'numeric' :
    'text';

  const groups: Record<ColType, string[]> = { image_url: [], url: [], numeric: [], text: [] };
  for (const col of cols) {
    groups[inferredTypes[col] ?? 'text'].push(col);
  }

  const ordered: ColType[] =
    preferredType === 'image_url' ? ['image_url', 'url', 'text', 'numeric'] :
    preferredType === 'numeric'   ? ['numeric', 'text', 'image_url', 'url'] :
                                    ['text', 'numeric', 'url', 'image_url'];

  return ordered
    .filter((t) => groups[t].length > 0)
    .map((t) => ({ groupLabel: COL_TYPE_LABELS[t], cols: groups[t] }));
}
