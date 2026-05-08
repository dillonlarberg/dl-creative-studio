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

// Channel-grouped target presets — match the AdLabs Target Channels UI.
export type Channel = "Social" | "Programmatic" | "Print" | "Digital" | "Digital Signage";

// gpt-image-2 only accepts aspect ratios in [1:3, 3:1]. Targets outside that
// range (160×600 ≈ 1:3.75, 728×90 ≈ 8.09:1, 320×50 = 6.4:1) still appear in
// the preset list — `legalGenDims` clamps the gen canvas to 3:1 / 1:3 and the
// final sharp pass cover-fits to the exact target dims (extreme crops are an
// accepted v0 tradeoff until we add a downscale-from-3:1 strategy).
export type TargetLabel =
  // Social
  | "social-1x1"
  | "social-9x16"
  | "social-4x5"
  | "social-16x9"
  // Programmatic
  | "prog-300x250"
  | "prog-160x600"
  | "prog-728x90"
  | "prog-300x600"
  | "prog-320x50"
  // Print
  | "print-letter"
  | "print-4x6"
  | "print-5x7"
  // Digital
  | "digital-1920x1080"
  | "digital-1280x720"
  // Digital Signage
  | "signage-1920x1080"
  | "signage-1080x1920";

export interface TargetSpec {
  label: TargetLabel;
  display: string;
  channel: Channel;
  w: number;
  h: number;
}

export const TARGET_PRESETS: Record<TargetLabel, TargetSpec> = {
  // ── Social ───────────────────────────────────────────────────────
  "social-1x1":         { label: "social-1x1",         display: "1:1 (1080×1080)",                     channel: "Social",          w: 1080, h: 1080 },
  "social-9x16":        { label: "social-9x16",        display: "9:16 (1080×1920) — story / reel",     channel: "Social",          w: 1080, h: 1920 },
  "social-4x5":         { label: "social-4x5",         display: "4:5 (1080×1350) — feed portrait",     channel: "Social",          w: 1080, h: 1350 },
  "social-16x9":        { label: "social-16x9",        display: "16:9 (1920×1080) — landscape",        channel: "Social",          w: 1920, h: 1080 },
  // ── Programmatic ─────────────────────────────────────────────────
  // 300×250 (6:5) and 300×600 (1:2) inside [1:3, 3:1]; the others fall back
  // through legalGenDims aspect clamp + sharp cover-fit.
  "prog-300x250":       { label: "prog-300x250",       display: "300×250 — Medium Rectangle",          channel: "Programmatic",    w: 300,  h: 250  },
  "prog-160x600":       { label: "prog-160x600",       display: "160×600 — Wide Skyscraper",           channel: "Programmatic",    w: 160,  h: 600  },
  "prog-728x90":        { label: "prog-728x90",        display: "728×90 — Leaderboard",                channel: "Programmatic",    w: 728,  h: 90   },
  "prog-300x600":       { label: "prog-300x600",       display: "300×600 — Half Page",                 channel: "Programmatic",    w: 300,  h: 600  },
  "prog-320x50":        { label: "prog-320x50",        display: "320×50 — Mobile Banner",              channel: "Programmatic",    w: 320,  h: 50   },
  // ── Print ────────────────────────────────────────────────────────
  "print-letter":       { label: "print-letter",       display: "8.5×11 (1275×1650, 150dpi) — Letter", channel: "Print",           w: 1275, h: 1650 },
  "print-4x6":          { label: "print-4x6",          display: "4×6 (1200×1800, 300dpi) — 4×6 print", channel: "Print",           w: 1200, h: 1800 },
  "print-5x7":          { label: "print-5x7",          display: "5×7 (1500×2100, 300dpi) — 5×7 print", channel: "Print",           w: 1500, h: 2100 },
  // ── Digital ──────────────────────────────────────────────────────
  "digital-1920x1080":  { label: "digital-1920x1080",  display: "1920×1080 — Full HD landscape",       channel: "Digital",         w: 1920, h: 1080 },
  "digital-1280x720":   { label: "digital-1280x720",   display: "1280×720 — HD landscape",             channel: "Digital",         w: 1280, h: 720  },
  // ── Digital Signage ──────────────────────────────────────────────
  "signage-1920x1080":  { label: "signage-1920x1080",  display: "1920×1080 — landscape signage",       channel: "Digital Signage", w: 1920, h: 1080 },
  "signage-1080x1920":  { label: "signage-1080x1920",  display: "1080×1920 — portrait signage",        channel: "Digital Signage", w: 1080, h: 1920 },
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
