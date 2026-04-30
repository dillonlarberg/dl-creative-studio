import type { ImageAnalysis, ScorecardData } from '../types';

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function toFaceArray(value: unknown): ImageAnalysis['faces'] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      joyLikelihood: typeof item.joyLikelihood === 'string' ? item.joyLikelihood : 'UNKNOWN',
      angerLikelihood: typeof item.angerLikelihood === 'string' ? item.angerLikelihood : 'UNKNOWN',
      sorrowLikelihood: typeof item.sorrowLikelihood === 'string' ? item.sorrowLikelihood : 'UNKNOWN',
      surpriseLikelihood: typeof item.surpriseLikelihood === 'string' ? item.surpriseLikelihood : 'UNKNOWN',
    }));
}

function toColorArray(value: unknown): ImageAnalysis['colors'] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      hexColor: typeof item.hexColor === 'string' ? item.hexColor : '',
      imagePercentage:
        typeof item.imagePercentage === 'number'
          ? item.imagePercentage
          : Number.parseFloat(String(item.imagePercentage ?? 0)),
    }))
    .filter((item) => item.hexColor.length > 0 && Number.isFinite(item.imagePercentage));
}

export function parseImageAnalysis(raw: string): ImageAnalysis | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    return {
      colors: toColorArray(parsed.colors),
      labels: toStringArray(parsed.labels),
      objects: toStringArray(parsed.objects),
      text: toStringArray(parsed.text),
      faces: toFaceArray(parsed.faces),
      links: toStringArray(parsed.links),
    };
  } catch {
    return null;
  }
}

function parseNullableNumber(value: string | undefined): number | null {
  if (!value || value === 'null') {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseScorecard(row: Record<string, string>): ScorecardData {
  return {
    brandVisuals: row.brand_visuals === 'true',
    callToActionText: row.call_to_action_text === 'true',
    fatigueStatus: row.fatigue_status === 'null' || !row.fatigue_status ? null : row.fatigue_status,
    ctr: parseNullableNumber(row.ctr),
    cpm: parseNullableNumber(row.cpm),
  };
}
