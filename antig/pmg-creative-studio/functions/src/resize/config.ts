// MAINTAINED IN PARALLEL with tools/resize-tracer/src/config.ts — see TODO(resize-pipeline-extract).
// Locked constants — Phase 1 (Gemini 2.5 Pro analysis) + Phase 2 (OpenAI gpt-image-2 edit).
// Phase 1 SDK: @google/genai. Phase 2 SDK: openai.

export const P1_MODEL = "gemini-2.5-pro";
export const OPENAI_P2_MODEL = "gpt-image-2";
export const P2_QUALITIES = ["medium", "high"] as const;
export type P2Quality = (typeof P2_QUALITIES)[number];
export const DEFAULT_P2_QUALITY: P2Quality = "medium";

export function parseP2Quality(value: unknown): P2Quality {
  return P2_QUALITIES.includes(value as P2Quality) ? (value as P2Quality) : DEFAULT_P2_QUALITY;
}

export type Channel = "Social" | "Programmatic" | "Print" | "Digital" | "Digital Signage";

export interface TargetSpec {
  label: string;
  display?: string;
  channel?: Channel | string;
  w: number;
  h: number;
}

// Working-resolution constraints for gpt-image-2 (per OpenAI docs):
//   - both edges multiples of 16
//   - long:short aspect ≤ 3:1
//   - max edge ≤ 3840
//   - total pixels in [655,360, 8,294,400]
// We additionally floor the long edge at 1024 so in-band aspects keep
// a roomy baseline; sharp downsamples to exact target dims afterward.
const GEN_MIN_LONG_EDGE = 1024;
const GEN_DIM_MULTIPLE = 16;
const GEN_MIN_ASPECT = 1 / 3;
const GEN_MAX_ASPECT = 3;

function roundToMultiple(n: number, m: number): number {
  return Math.max(m, Math.round(n / m) * m);
}

export function legalGenDims(target: { w: number; h: number }): { w: number; h: number } {
  if (target.w <= 0 || target.h <= 0) {
    throw new Error(`legalGenDims: invalid target ${target.w}×${target.h}`);
  }

  const aspect = Math.min(GEN_MAX_ASPECT, Math.max(GEN_MIN_ASPECT, target.w / target.h));

  let longEdge: number;
  let shortEdge: number;
  if (aspect >= 1) {
    longEdge = Math.max(target.w, GEN_MIN_LONG_EDGE);
    shortEdge = longEdge / aspect;
  } else {
    longEdge = Math.max(target.h, GEN_MIN_LONG_EDGE);
    shortEdge = longEdge * aspect;
  }

  const wRaw = aspect >= 1 ? longEdge : shortEdge;
  const hRaw = aspect >= 1 ? shortEdge : longEdge;

  let w = roundToMultiple(wRaw, GEN_DIM_MULTIPLE);
  let h = roundToMultiple(hRaw, GEN_DIM_MULTIPLE);

  if (Math.max(w, h) < GEN_MIN_LONG_EDGE) {
    if (w >= h) {
      w = roundToMultiple(GEN_MIN_LONG_EDGE, GEN_DIM_MULTIPLE);
      h = roundToMultiple(w / aspect, GEN_DIM_MULTIPLE);
    } else {
      h = roundToMultiple(GEN_MIN_LONG_EDGE, GEN_DIM_MULTIPLE);
      w = roundToMultiple(h * aspect, GEN_DIM_MULTIPLE);
    }
  }

  for (let i = 0; i < 4 && w / h > GEN_MAX_ASPECT; i++) h += GEN_DIM_MULTIPLE;
  for (let i = 0; i < 4 && h / w > GEN_MAX_ASPECT; i++) w += GEN_DIM_MULTIPLE;

  const MIN_PIXELS = 655_360;
  if (w * h < MIN_PIXELS) {
    const scale = Math.sqrt(MIN_PIXELS / (w * h));
    w = Math.ceil((w * scale) / GEN_DIM_MULTIPLE) * GEN_DIM_MULTIPLE;
    h = Math.ceil((h * scale) / GEN_DIM_MULTIPLE) * GEN_DIM_MULTIPLE;
  }

  return { w, h };
}
