import { describe, it, expect } from "vitest";
import { planCuts, barGridBoundaries, dedupRanked, totalLen } from "./planCuts.js";
import { CutSchema } from "./types.js";
import type { Segment } from "./types.js";

const TOTAL = 15;

/** Build N ranked, non-overlapping segments with descending scores. */
function ranked(n: number, segLen = 2, gap = 6): Segment[] {
  return Array.from({ length: n }, (_, i) => ({
    startSec: i * gap,
    endSec: i * gap + segLen,
    score: 1 - i / n,
  }));
}

describe("barGridBoundaries", () => {
  it("places interior boundaries on bar multiples (120 BPM → 2.0s bars)", () => {
    // bar = (60/120)*4 = 2.0s. Interior boundaries: 2,4,6,8,10,12,14.
    const b = barGridBoundaries(120, TOTAL);
    expect(b[0]).toBe(0);
    expect(b[b.length - 1]).toBe(TOTAL);
    for (let i = 1; i < b.length - 1; i++) {
      expect(b[i] % 2).toBeCloseTo(0, 9);
    }
  });

  it("always starts at 0 and ends at exactly totalSec", () => {
    for (const bpm of [60, 75, 90, 100, 128, 140]) {
      const b = barGridBoundaries(bpm, TOTAL);
      expect(b[0]).toBe(0);
      expect(b[b.length - 1]).toBe(TOTAL);
    }
  });

  it("collapses to a single full-length slot for degenerate BPMs", () => {
    for (const bpm of [0, -10, NaN, Infinity]) {
      expect(barGridBoundaries(bpm, TOTAL)).toEqual([0, TOTAL]);
    }
    // bar ≥ total (very slow tempo) → one slot too.
    expect(barGridBoundaries(10, TOTAL)).toEqual([0, TOTAL]); // bar = 24s
  });

  it("merges a trailing sliver shorter than half a bar", () => {
    // bar = (60/100)*4 = 2.4s. Multiples < 15: 2.4,4.8,7.2,9.6,12,14.4.
    // 15 - 14.4 = 0.6 < 1.2 (half bar) → 14.4 dropped, last slot = 15-12 = 3.0s.
    const b = barGridBoundaries(100, TOTAL);
    expect(b).not.toContain(14.4);
    expect(b[b.length - 1]).toBe(15);
    expect(b[b.length - 2]).toBe(12);
  });
});

describe("dedupRanked", () => {
  it("drops overlapping segments, keeping the highest score", () => {
    const segs: Segment[] = [
      { startSec: 0, endSec: 5, score: 0.5 },
      { startSec: 2, endSec: 6, score: 0.9 }, // overlaps the first; higher score wins
      { startSec: 10, endSec: 12, score: 0.7 },
    ];
    const out = dedupRanked(segs);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ startSec: 2, score: 0.9 });
    expect(out[1]).toMatchObject({ startSec: 10 });
  });

  it("does not mutate the input array", () => {
    const segs = ranked(4);
    const copy = JSON.parse(JSON.stringify(segs));
    dedupRanked(segs);
    expect(segs).toEqual(copy);
  });

  it("keeps all segments when none overlap", () => {
    expect(dedupRanked(ranked(5))).toHaveLength(5);
  });
});

describe("planCuts", () => {
  it("produces cuts that sum to EXACTLY totalSec", () => {
    for (const bpm of [60, 75, 90, 100, 120, 128, 140]) {
      const plan = planCuts({ bpm, totalSec: TOTAL, ranked: ranked(12) });
      expect(totalLen(plan)).toBe(TOTAL);
    }
  });

  it("emits schema-valid cuts (srcOut > srcIn, len > 0)", () => {
    const plan = planCuts({ bpm: 120, totalSec: TOTAL, ranked: ranked(8) });
    for (const cut of plan) {
      expect(() => CutSchema.parse(cut)).not.toThrow();
    }
  });

  it("trims each chosen moment to its slot length", () => {
    // 120 BPM → interior bars of 2.0s. First slot is a full bar → len 2.0.
    const plan = planCuts({ bpm: 120, totalSec: TOTAL, ranked: ranked(8) });
    expect(plan[0].len).toBe(2);
    expect(plan[0].srcOut - plan[0].srcIn).toBeCloseTo(plan[0].len, 9);
  });

  it("fills slots in score order — best moment first", () => {
    const segs: Segment[] = [
      { startSec: 50, endSec: 52, score: 0.2 },
      { startSec: 4, endSec: 6, score: 0.95 }, // best
      { startSec: 20, endSec: 22, score: 0.6 },
    ];
    const plan = planCuts({ bpm: 120, totalSec: TOTAL, ranked: segs });
    expect(plan[0].srcIn).toBe(4); // highest score fills the first slot
  });

  it("drops overflow when there are more moments than slots", () => {
    // 120 BPM over 15s → ~8 slots. 30 moments → trailing ones unused.
    const plan = planCuts({ bpm: 120, totalSec: TOTAL, ranked: ranked(30) });
    const slots = barGridBoundaries(120, TOTAL).length - 1;
    expect(plan).toHaveLength(slots);
    const usedStarts = new Set(plan.map((c) => c.srcIn));
    expect(usedStarts.size).toBeLessThanOrEqual(slots);
  });

  it("cycles moments when there are fewer moments than slots", () => {
    // Only 2 moments, ~8 slots → moments repeat, every slot still filled.
    const plan = planCuts({ bpm: 120, totalSec: TOTAL, ranked: ranked(2) });
    expect(plan.length).toBeGreaterThan(2);
    expect(totalLen(plan)).toBe(TOTAL);
    const distinct = new Set(plan.map((c) => c.srcIn));
    expect(distinct.size).toBe(2); // cycled between the two
  });

  it("de-dups overlapping ranked moments before filling", () => {
    const segs: Segment[] = [
      { startSec: 0, endSec: 8, score: 0.9 },
      { startSec: 1, endSec: 9, score: 0.8 }, // overlaps → dropped
      { startSec: 2, endSec: 10, score: 0.7 }, // overlaps → dropped
    ];
    const plan = planCuts({ bpm: 120, totalSec: TOTAL, ranked: segs });
    // Only one distinct moment survives dedup → all slots use srcIn 0.
    expect(new Set(plan.map((c) => c.srcIn))).toEqual(new Set([0]));
  });

  it("handles a single full-slot plan for a degenerate BPM", () => {
    const plan = planCuts({ bpm: 0, totalSec: TOTAL, ranked: ranked(4) });
    expect(plan).toHaveLength(1);
    expect(plan[0].len).toBe(TOTAL);
    expect(totalLen(plan)).toBe(TOTAL);
  });

  it("throws on empty ranked input", () => {
    expect(() => planCuts({ bpm: 120, totalSec: TOTAL, ranked: [] })).toThrow(/empty/);
  });
});
