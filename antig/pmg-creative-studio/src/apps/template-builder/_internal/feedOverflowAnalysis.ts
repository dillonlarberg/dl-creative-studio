/**
 * Feed-aware overflow analysis.
 *
 * Uses an offscreen canvas to estimate whether each feed row's text value
 * will overflow its zone at the current font size. Runs synchronously but is
 * expected to be called inside a debounced effect.
 *
 * Coordinate space: all widths/heights and font sizes are in adSize pixels
 * (the native template coordinate system, e.g. 0–1024 for a 1024px ad).
 */

export interface ZoneOverflowRisk {
  slotId: string;
  fieldLabel: string;
  overflowRows: number;
  totalRows: number;
  currentFontSize: number;
  /** Largest fontSize where <5% of rows overflow. Undefined if even size 8 overflows >5%. */
  suggestedFontSize?: number;
}

export type FeedOverflowRiskMap = Record<string, ZoneOverflowRisk>;

export interface ZoneAnalysisInput {
  slotId: string;
  fieldLabel: string;
  zoneW: number;
  zoneH: number;
  fontSize: number;
  fontFamily: string;
  feedValues: string[];
}

/**
 * Analyze overflow risk for a list of zones. Returns a map of slotId →
 * ZoneOverflowRisk for any zone where at least one row overflows.
 */
export function analyzeFeedOverflow(zones: ZoneAnalysisInput[]): FeedOverflowRiskMap {
  const result: FeedOverflowRiskMap = {};
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return result;

  for (const zone of zones) {
    const risk = analyzeZone(ctx, zone);
    if (risk) result[zone.slotId] = risk;
  }
  return result;
}

function analyzeZone(ctx: CanvasRenderingContext2D, input: ZoneAnalysisInput): ZoneOverflowRisk | null {
  const { slotId, fieldLabel, zoneW, zoneH, fontSize, fontFamily, feedValues } = input;
  if (feedValues.length === 0 || zoneW <= 0 || zoneH <= 0 || fontSize <= 0) return null;

  const overflowRows = countOverflowing(ctx, fontSize, fontFamily, zoneW, zoneH, feedValues);
  if (overflowRows === 0) return null;

  // Binary search: find the largest font size where <5% of rows overflow.
  let suggested: number | undefined;
  let lo = 8;
  let hi = fontSize - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const cnt = countOverflowing(ctx, mid, fontFamily, zoneW, zoneH, feedValues);
    if (cnt / feedValues.length < 0.05) {
      suggested = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return { slotId, fieldLabel, overflowRows, totalRows: feedValues.length, currentFontSize: fontSize, suggestedFontSize: suggested };
}

function countOverflowing(
  ctx: CanvasRenderingContext2D,
  fontSize: number,
  fontFamily: string,
  zoneW: number,
  zoneH: number,
  values: string[],
): number {
  const lineHeight = fontSize * 1.4;
  const maxLines = Math.max(1, Math.floor(zoneH / lineHeight));
  ctx.font = `${fontSize}px ${fontFamily}`;
  let count = 0;
  for (const val of values) {
    if (estimateLines(ctx, val, zoneW) > maxLines) count++;
  }
  return count;
}

function estimateLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): number {
  const words = text.split(/\s+/);
  let lines = 1;
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line !== '') {
      lines++;
      line = word;
    } else {
      line = test;
    }
  }
  return lines;
}
