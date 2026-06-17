/**
 * planStitch — the pure, deterministic duration planner for video-stitch v1.
 *
 * Given N curated assets (in the user's order), a track BPM, and a target length,
 * it assigns each asset a beat-snapped on-screen duration. v1 has ZERO AI here:
 * the human owns order + selection; this just tiles the timeline on the beat grid.
 *
 *   targetSec ──► totalBeats ──► even split (±1 beat) ──► per-slot durations
 *                  (30 beats)      (8,8,7,7 beats)         (4,4,3.5,3.5 s)
 *
 * Invariant: Σ slot durations === plan.totalSec EXACTLY (every duration is a whole
 * number of beats, so the sum is totalBeats×beatSec). The renderer's `-t totalSec`
 * mux bound is fed `plan.totalSec`, NOT the nominal target, so they can't drift.
 */

/** v1 caps assets per reel: a 15s budget can't give more than ~8 a non-strobe slot,
 *  and it bounds the (slow) outpaint prepare cost. */
export const MAX_ASSETS = 8;

export interface StitchSlot {
  /** 0-based position in the user's order. */
  index: number;
  /** On-screen length in seconds (a whole number of beats). */
  durationSec: number;
  /** That length expressed in beats. */
  beats: number;
}

export interface StitchPlan {
  slots: StitchSlot[];
  /** Σ of slot durations — what the renderer receives as totalSec. */
  totalSec: number;
  /** Seconds per beat (60 / bpm). */
  beatSec: number;
}

export interface PlanStitchOpts {
  count: number;
  bpm: number;
  targetSec: number;
  /** Shortest a single asset may stay on screen (anti-strobe). Default 1s. */
  minSlotSec?: number;
}

export function planStitch(opts: PlanStitchOpts): StitchPlan {
  const { count, bpm, targetSec } = opts;
  const minSlotSec = opts.minSlotSec ?? 1;

  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError(`planStitch: count must be a positive integer, got ${count}`);
  }
  if (count > MAX_ASSETS) {
    throw new RangeError(`planStitch: count ${count} exceeds max of ${MAX_ASSETS} assets`);
  }
  if (!(bpm > 0)) throw new RangeError(`planStitch: bpm must be > 0, got ${bpm}`);
  if (!(targetSec > 0)) throw new RangeError(`planStitch: targetSec must be > 0, got ${targetSec}`);

  const beatSec = 60 / bpm;
  const totalBeats = Math.round(targetSec / beatSec);
  const minBeats = Math.max(1, Math.ceil(minSlotSec / beatSec));

  if (count * minBeats > totalBeats) {
    throw new RangeError(
      `planStitch: ${count} assets need a minimum of ${minSlotSec}s each (${count * minBeats} beats) ` +
        `but ${targetSec}s only has ${totalBeats} beats — pick fewer assets or a longer target`,
    );
  }

  // Even split on the beat grid: every slot gets `base` beats; the first `extra`
  // slots get one more, so Σ beats === totalBeats exactly.
  const base = Math.floor(totalBeats / count);
  const extra = totalBeats - base * count;

  const slots: StitchSlot[] = Array.from({ length: count }, (_, index) => {
    const beats = base + (index < extra ? 1 : 0);
    return { index, beats, durationSec: beats * beatSec };
  });

  return { slots, totalSec: totalBeats * beatSec, beatSec };
}
