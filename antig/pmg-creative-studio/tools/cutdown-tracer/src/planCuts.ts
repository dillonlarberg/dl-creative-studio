/**
 * planCuts — the pure, deterministic heart of the pipeline (PRD #15–#17).
 *
 *   planCuts({ bpm, totalSec, ranked }) → CutPlan
 *
 * THE GRID OWNS TIMING, GEMINI OWNS CONTENT:
 *   - A uniform bar-grid derived from the BPM sets the OUTPUT slot boundaries, so
 *     every cut lands on a bar (= 4 beats) and the reel feels beat-synced.
 *   - The ranked moments (from Gemini) decide WHAT source footage fills each slot.
 *
 * Invariants (pinned by planCuts.test.ts):
 *   - Σ of every cut's `len` === totalSec, EXACTLY (rounded to whole ms).
 *   - All slot boundaries except the final snap fall on bar multiples.
 *   - Overlapping ranked segments are de-duped before filling (smoke-test finding:
 *     Gemini returns overlapping windows; without dedup, slots repeat the same moment).
 *   - More ranked moments than slots → overflow dropped. Fewer → moments are reused
 *     round-robin, and each reuse WALKS THROUGH the moment's footage (distinct
 *     consecutive windows) rather than repeating the same frames, wrapping back to
 *     the moment's start only when the next window would run past its end.
 *
 * No vendor, no interface, no I/O — trivially unit-testable.
 */
import type { Segment, Cut, CutPlan } from "./types.js";

const MS = 1000;
/** Round seconds to whole milliseconds — kills float drift so Σ len is exact. */
const roundMs = (sec: number): number => Math.round(sec * MS) / MS;

export interface PlanCutsInput {
  bpm: number;
  totalSec: number;
  ranked: Segment[];
}

/**
 * Build the OUTPUT slot boundaries from the bar-grid: [0, bar, 2·bar, …, totalSec].
 * The final boundary is always snapped to exactly totalSec. A trailing sliver
 * shorter than half a bar is merged into the previous slot so we never emit a
 * near-zero cut. Degenerate BPMs (≤0, non-finite, or bar ≥ totalSec) collapse to
 * a single full-length slot.
 */
export function barGridBoundaries(bpm: number, totalSec: number): number[] {
  const bar = (60 / bpm) * 4; // seconds per bar (4 beats)
  if (!Number.isFinite(bar) || bar <= 0 || bar >= totalSec) {
    return [0, roundMs(totalSec)];
  }

  const boundaries: number[] = [0];
  for (let k = 1; k * bar < totalSec; k++) {
    boundaries.push(roundMs(k * bar));
  }

  // Merge a trailing sliver (< half a bar) into the previous slot.
  const last = boundaries[boundaries.length - 1];
  if (totalSec - last < bar / 2 && boundaries.length > 1) {
    boundaries.pop();
  }
  boundaries.push(roundMs(totalSec));
  return boundaries;
}

/**
 * Greedily drop overlapping segments, keeping the highest-scored. Returns a new
 * array sorted by score descending (does not mutate the input).
 */
export function dedupRanked(ranked: Segment[]): Segment[] {
  const byScore = [...ranked].sort((a, b) => b.score - a.score);
  const kept: Segment[] = [];
  for (const seg of byScore) {
    const overlaps = kept.some(
      (k) => seg.startSec < k.endSec && k.startSec < seg.endSec,
    );
    if (!overlaps) kept.push(seg);
  }
  return kept;
}

export function planCuts({ bpm, totalSec, ranked }: PlanCutsInput): CutPlan {
  if (ranked.length === 0) {
    throw new Error("planCuts: ranked segments must not be empty");
  }

  const boundaries = barGridBoundaries(bpm, totalSec);
  const moments = dedupRanked(ranked); // highest score first, no overlaps
  const cursors = new Array<number>(moments.length).fill(0); // secs already consumed per moment

  const cuts: Cut[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const len = roundMs(boundaries[i + 1] - boundaries[i]);
    // Fewer moments than slots → reuse round-robin; more → trailing moments dropped.
    const mi = i % moments.length;
    const moment = moments[mi];

    // Walk through the moment so a reused moment shows distinct footage. Wrap to
    // its start when the next window would overrun its end (keeps srcOut in-bounds).
    let offset = cursors[mi];
    if (roundMs(moment.startSec + offset + len) > moment.endSec) offset = 0;

    const srcIn = roundMs(moment.startSec + offset);
    const srcOut = roundMs(srcIn + len); // trim the source to exactly the slot length
    cursors[mi] = roundMs(offset + len);
    cuts.push({ srcIn, srcOut, len });
  }
  return cuts;
}

/** Σ of all cut lengths — used by callers/tests to assert the exact-duration contract. */
export function totalLen(plan: CutPlan): number {
  return roundMs(plan.reduce((sum, c) => sum + c.len, 0));
}

/**
 * Clamp ranked segments to the real source duration. Models can return moments
 * past the end of the video (observed: Gemini returned 345s on a 296s clip);
 * trimming past EOF makes the renderer reject the asset. Drops segments that start
 * at/after the end, clips overshooting ends back to the duration, and drops any
 * that collapse below `minLenSec`. Pure; does not mutate the input.
 */
export function clampSegments(
  segments: Segment[],
  durationSec: number,
  minLenSec = 0.2,
): Segment[] {
  const out: Segment[] = [];
  for (const s of segments) {
    if (s.startSec >= durationSec) continue; // starts past EOF → unusable
    const endSec = roundMs(Math.min(s.endSec, durationSec));
    if (endSec - s.startSec < minLenSec) continue; // collapsed to nothing
    out.push({ startSec: roundMs(s.startSec), endSec, score: s.score });
  }
  return out;
}
