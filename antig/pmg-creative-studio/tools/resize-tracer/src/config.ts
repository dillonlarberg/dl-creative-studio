// Locked constants — Phase 1 (Gemini 2.5 Pro analysis) + Phase 2 (OpenAI gpt-image-2 edit).
// Phase 1 SDK: @google/genai. Phase 2 SDK: openai.

export const P1_MODEL = "gemini-2.5-pro";
export const OPENAI_P2_MODEL = "gpt-image-2";

// Channel-grouped target presets per PRD §6.5–6.7.
export type Channel = "Social" | "Programmatic" | "Print";

// NOTE: dropped from v0 (relative to the original target list):
//   - "160x600" (1:3.75 — outside gpt-image-2's [1:3, 3:1] aspect range)
//   - "728x90"  (8.09:1 — outside gpt-image-2's [1:3, 3:1] aspect range)
// They can be re-added once we have a downscale-from-3:1 strategy or a
// different model that supports extreme aspects.
export type TargetLabel =
  | "1x1"
  | "9x16"
  | "2x3"
  | "300x250"
  | "300x600"
  | "letter"
  | "4x6";

export interface TargetSpec {
  label: TargetLabel;
  display: string;
  channel: Channel;
  w: number;
  h: number;
}

export const TARGET_PRESETS: Record<TargetLabel, TargetSpec> = {
  // ── Social ───────────────────────────────────────────────────────
  "1x1":     { label: "1x1",     display: "1:1 (1080×1080)",                     channel: "Social",       w: 1080, h: 1080 },
  "9x16":    { label: "9x16",    display: "9:16 (1080×1920) — story / reel",     channel: "Social",       w: 1080, h: 1920 },
  "2x3":     { label: "2x3",     display: "2:3 (1080×1620)",                     channel: "Social",       w: 1080, h: 1620 },
  // ── Programmatic ─────────────────────────────────────────────────
  // 300×250 (6:5) and 300×600 (1:2) both inside gpt-image-2 aspect bounds.
  // 160×600 (1:3.75) and 728×90 (8.09:1) dropped — see comment above.
  "300x250": { label: "300x250", display: "300×250 — Medium Rectangle",          channel: "Programmatic", w: 300,  h: 250  },
  "300x600": { label: "300x600", display: "300×600 — Half Page",                 channel: "Programmatic", w: 300,  h: 600  },
  // ── Print ────────────────────────────────────────────────────────
  "letter":  { label: "letter",  display: "8.5×11 (1275×1650, 150dpi) — Letter", channel: "Print",        w: 1275, h: 1650 },
  "4x6":     { label: "4x6",     display: "4×6 (1200×1800, 300dpi) — 4×6 print", channel: "Print",        w: 1200, h: 1800 },
};

// Working-resolution constraints for gpt-image-2:
//   - dimensions divisible by 16
//   - aspect ratio in [1:3, 3:1]
//   - long edge ≥ 1024 (so the model has resolution to work with;
//     sharp downsamples afterward to the exact target dims)
const GEN_MIN_LONG_EDGE = 1024;
const GEN_DIM_MULTIPLE = 16;
const GEN_MIN_ASPECT = 1 / 3;
const GEN_MAX_ASPECT = 3;

function roundToMultiple(n: number, m: number): number {
  // Round to nearest multiple of m. Always at least m.
  return Math.max(m, Math.round(n / m) * m);
}

/**
 * Compute the canvas dimensions to send to gpt-image-2 for a given target.
 *
 * Decisions:
 *  - Round each dim to the *nearest* multiple of 16 (not always-up). This
 *    minimizes drift from the target aspect; the final sharp pass crops to
 *    exact target dims anyway.
 *  - If the target's long edge is below GEN_MIN_LONG_EDGE, scale both dims
 *    up so the model has working resolution (sharp downsamples later).
 *  - Aspect is clamped to [1:3, 3:1] as a safety guard. Current presets
 *    are already inside that range, so the clamp is a no-op for them.
 */
export function legalGenDims(target: { w: number; h: number }): { w: number; h: number } {
  const aspect = Math.min(GEN_MAX_ASPECT, Math.max(GEN_MIN_ASPECT, target.w / target.h));

  // Pick a working long edge ≥ 1024 (so a 300x250 source still gets a 1024+ canvas).
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

  // Re-check long edge after rounding (rounding-down case).
  if (Math.max(w, h) < GEN_MIN_LONG_EDGE) {
    if (w >= h) {
      w = roundToMultiple(GEN_MIN_LONG_EDGE, GEN_DIM_MULTIPLE);
      h = roundToMultiple(w / aspect, GEN_DIM_MULTIPLE);
    } else {
      h = roundToMultiple(GEN_MIN_LONG_EDGE, GEN_DIM_MULTIPLE);
      w = roundToMultiple(h * aspect, GEN_DIM_MULTIPLE);
    }
  }

  return { w, h };
}
