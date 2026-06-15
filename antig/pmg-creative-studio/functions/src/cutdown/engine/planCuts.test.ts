import { describe, it, expect } from "vitest";
import { planCuts, barGridBoundaries, dedupRanked, totalLen, clampSegments } from "./planCuts";
import { CutSchema } from "./types";
import type { Segment } from "./types";

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

describe("clampSegments", () => {
  it("drops segments that start at or past the source end", () => {
    const segs: Segment[] = [
      { startSec: 10, endSec: 12, score: 0.9 },
      { startSec: 300, endSec: 305, score: 1 }, // past EOF (296s clip)
    ];
    const out = clampSegments(segs, 296);
    expect(out).toHaveLength(1);
    expect(out[0].startSec).toBe(10);
  });

  it("clips an overshooting end back to the duration", () => {
    const out = clampSegments([{ startSec: 294, endSec: 305, score: 1 }], 296);
    expect(out[0]).toMatchObject({ startSec: 294, endSec: 296 });
  });

  it("preserves segment metadata (why) through clamping", () => {
    const out = clampSegments([{ startSec: 294, endSec: 305, score: 1, why: "the payoff" }], 296);
    expect(out[0].why).toBe("the payoff");
  });

  it("drops segments that collapse below the minimum length", () => {
    // starts at 295.9 on a 296s clip → 0.1s < 0.2 min → dropped
    expect(clampSegments([{ startSec: 295.9, endSec: 320, score: 1 }], 296)).toHaveLength(0);
  });

  it("passes through in-bounds segments unchanged and does not mutate input", () => {
    const segs: Segment[] = [{ startSec: 4, endSec: 6, score: 0.5 }];
    const copy = JSON.parse(JSON.stringify(segs));
    const out = clampSegments(segs, 296);
    expect(out).toEqual(segs);
    expect(segs).toEqual(copy);
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

  it("reuses moments round-robin when there are fewer moments than slots", () => {
    // Two short (2s) moments, 2s slots → each reuse wraps immediately, so footage
    // stays at the two moment starts but every slot is still filled to exactly 15s.
    const plan = planCuts({ bpm: 120, totalSec: TOTAL, ranked: ranked(2) });
    expect(plan.length).toBeGreaterThan(2);
    expect(totalLen(plan)).toBe(TOTAL);
    expect(new Set(plan.map((c) => c.srcIn))).toEqual(new Set([0, 6]));
  });

  it("slices one long moment into distinct consecutive windows (no repeated frames)", () => {
    // A single surviving 10s moment fills all 8 slots → footage should WALK forward:
    // 0–2, 2–4, 4–6, … rather than repeating 0–2 eight times.
    const plan = planCuts({
      bpm: 120,
      totalSec: TOTAL,
      ranked: [{ startSec: 0, endSec: 10, score: 1 }],
    });
    expect(plan[0]).toMatchObject({ srcIn: 0, srcOut: 2 });
    expect(plan[1]).toMatchObject({ srcIn: 2, srcOut: 4 });
    expect(plan[2]).toMatchObject({ srcIn: 4, srcOut: 6 });
    expect(new Set(plan.map((c) => c.srcIn)).size).toBeGreaterThan(1); // distinct, not repeated
  });

  it("wraps slicing back to the moment start when a window would overrun its end", () => {
    // 4s moment, 2s slots → 0–2, 2–4, then wrap: 0–2, 2–4, … always within [0,4].
    const plan = planCuts({
      bpm: 120,
      totalSec: TOTAL,
      ranked: [{ startSec: 0, endSec: 4, score: 1 }],
    });
    for (const c of plan) {
      expect(c.srcIn).toBeGreaterThanOrEqual(0);
      expect(c.srcOut).toBeLessThanOrEqual(4); // never reads past the moment's end
    }
  });

  it("de-dups overlapping ranked moments before filling — footage stays within the survivor", () => {
    const segs: Segment[] = [
      { startSec: 0, endSec: 8, score: 0.9 },
      { startSec: 1, endSec: 9, score: 0.8 }, // overlaps → dropped
      { startSec: 2, endSec: 10, score: 0.7 }, // overlaps → dropped
    ];
    const plan = planCuts({ bpm: 120, totalSec: TOTAL, ranked: segs });
    // Only the highest-scored survivor [0,8] feeds the plan → all footage in-bounds.
    for (const c of plan) {
      expect(c.srcIn).toBeGreaterThanOrEqual(0);
      expect(c.srcOut).toBeLessThanOrEqual(8);
    }
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

describe("planCuts — V1 metadata + ordering", () => {
  const ranked = [
    { startSec: 0, endSec: 4, score: 0.5, summary: "intro", role: "hook", why: "sets it up" },
    { startSec: 10, endSec: 14, score: 0.9, summary: "reveal", role: "reveal", why: "the moment" },
    { startSec: 20, endSec: 24, score: 0.7, summary: "react", role: "reaction", why: "payoff" },
  ];

  it("copies source segment metadata onto the cut it fills", () => {
    const cuts = planCuts({ bpm: 120, totalSec: 6, ranked });
    expect(cuts[0].role).toBe("reveal");
    expect(cuts[0].why).toBe("the moment");
    expect(cuts[0].score).toBe(0.9);
  });

  it("preserveOrder=true fills slots in the given order, not by score", () => {
    const cuts = planCuts({ bpm: 120, totalSec: 6, ranked, preserveOrder: true });
    expect(cuts[0].role).toBe("hook");
    expect(cuts[1].role).toBe("reveal");
    expect(cuts[2].role).toBe("reaction"); // round-robin under preserveOrder keeps input order
  });
});
