import { describe, it, expect } from "vitest";
import { planStitch, MAX_ASSETS } from "./planStitch";

const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);

describe("planStitch", () => {
  it("splits targetSec evenly across N assets on the beat grid, summing EXACTLY to totalSec", () => {
    // 120 BPM → 0.5s beat. 15s = 30 beats. 4 assets → 8,8,7,7 beats = 4,4,3.5,3.5.
    const plan = planStitch({ count: 4, bpm: 120, targetSec: 15 });
    expect(plan.slots.map((s) => s.durationSec)).toEqual([4, 4, 3.5, 3.5]);
    expect(sum(plan.slots.map((s) => s.durationSec))).toBe(15);
    expect(plan.totalSec).toBe(15);
  });

  it("Σ slot durations === plan.totalSec for any inputs (the renderer -t invariant)", () => {
    for (const count of [2, 3, 5, 7, 8]) {
      for (const bpm of [90, 110, 128]) {
        for (const targetSec of [15, 30]) {
          const plan = planStitch({ count, bpm, targetSec });
          expect(plan.slots).toHaveLength(count);
          expect(sum(plan.slots.map((s) => s.durationSec))).toBeCloseTo(plan.totalSec, 6);
        }
      }
    }
  });

  it("every slot duration is a whole number of beats", () => {
    const plan = planStitch({ count: 3, bpm: 100, targetSec: 15 });
    for (const s of plan.slots) {
      const beats = s.durationSec / plan.beatSec;
      expect(beats).toBeCloseTo(Math.round(beats), 6);
      expect(s.beats).toBe(Math.round(beats));
    }
  });

  it("preserves order (slot.index ascending 0..N-1)", () => {
    const plan = planStitch({ count: 5, bpm: 120, targetSec: 15 });
    expect(plan.slots.map((s) => s.index)).toEqual([0, 1, 2, 3, 4]);
  });

  it("never produces a slot below the min floor (no strobe)", () => {
    const plan = planStitch({ count: 8, bpm: 120, targetSec: 15, minSlotSec: 1 });
    for (const s of plan.slots) expect(s.durationSec).toBeGreaterThanOrEqual(1);
  });

  it("rejects > MAX_ASSETS", () => {
    expect(() => planStitch({ count: MAX_ASSETS + 1, bpm: 120, targetSec: 15 })).toThrow(/max/i);
  });

  it("rejects < 1 asset and non-positive bpm/target", () => {
    expect(() => planStitch({ count: 0, bpm: 120, targetSec: 15 })).toThrow();
    expect(() => planStitch({ count: 3, bpm: 0, targetSec: 15 })).toThrow();
    expect(() => planStitch({ count: 3, bpm: 120, targetSec: 0 })).toThrow();
  });

  it("throws when the target can't give every asset the min slot (too many assets)", () => {
    // 8 assets × 1s min = 8s needed; 4s target can't fit → caller should pick fewer.
    expect(() => planStitch({ count: 8, bpm: 120, targetSec: 4, minSlotSec: 1 })).toThrow(/min/i);
  });
});
