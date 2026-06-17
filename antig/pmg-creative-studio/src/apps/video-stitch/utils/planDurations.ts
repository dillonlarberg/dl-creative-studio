/**
 * planDurations — frontend display mirror of functions/src/stitch/engine/planStitch.ts.
 *
 * DISPLAY ONLY. The backend `planStitch` is authoritative for the render; this
 * reproduces its exact algorithm so the Arrange-screen beat ruler shows the same
 * split the user will get. Cross-package duplicate (src/ ↔ functions/ can't share
 * a module) — keep in sync with planStitch.
 *
 *   targetSec ──► totalBeats ──► even split (±1 beat) ──► per-slot seconds
 *     15s @120bpm    30 beats      [8,8,7,7] for N=4       [4,4,3.5,3.5]s
 *
 * Invariant: Σ slot.durationSec === totalSec EXACTLY (each slot is a whole number
 * of beats). Returns null instead of throwing when the inputs can't tile (caller
 * gates N first); display code can render an empty ruler.
 */

export const DEFAULT_BPM = 120;
export const DEFAULT_TARGET_SEC = 15;

export interface DurationSlot {
  index: number;
  beats: number;
  durationSec: number;
}

export interface DurationPlan {
  slots: DurationSlot[];
  totalSec: number;
  beatSec: number;
}

export interface PlanDurationsOpts {
  count: number;
  bpm?: number;
  targetSec?: number;
  /** Shortest a single asset may stay on screen (anti-strobe). Default 1s. */
  minSlotSec?: number;
}

export function planDurations(opts: PlanDurationsOpts): DurationPlan | null {
  const bpm = opts.bpm ?? DEFAULT_BPM;
  const targetSec = opts.targetSec ?? DEFAULT_TARGET_SEC;
  const minSlotSec = opts.minSlotSec ?? 1;
  const { count } = opts;

  if (!Number.isInteger(count) || count < 1) return null;
  if (!(bpm > 0) || !(targetSec > 0)) return null;

  const beatSec = 60 / bpm;
  const totalBeats = Math.round(targetSec / beatSec);
  const minBeats = Math.max(1, Math.ceil(minSlotSec / beatSec));

  // Can't give every asset its minimum slot — caller should gate N before here.
  if (count * minBeats > totalBeats) return null;

  const base = Math.floor(totalBeats / count);
  const extra = totalBeats - base * count;

  const slots: DurationSlot[] = Array.from({ length: count }, (_, index) => {
    const beats = base + (index < extra ? 1 : 0);
    return { index, beats, durationSec: beats * beatSec };
  });

  return { slots, totalSec: totalBeats * beatSec, beatSec };
}
