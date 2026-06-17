import { describe, it, expect } from 'vitest';
import { planDurations } from '../planDurations';

describe('planDurations', () => {
  it('mirrors planStitch for N=4 @120bpm/15s → [8,8,7,7] beats, [4,4,3.5,3.5]s', () => {
    const plan = planDurations({ count: 4 });
    expect(plan).not.toBeNull();
    expect(plan!.beatSec).toBe(0.5);
    expect(plan!.totalSec).toBe(15);
    expect(plan!.slots.map((s) => s.beats)).toEqual([8, 8, 7, 7]);
    expect(plan!.slots.map((s) => s.durationSec)).toEqual([4, 4, 3.5, 3.5]);
  });

  it('Σ durationSec === totalSec exactly for N=2..8', () => {
    for (let n = 2; n <= 8; n++) {
      const plan = planDurations({ count: n })!;
      const sum = plan.slots.reduce((a, s) => a + s.durationSec, 0);
      expect(sum).toBeCloseTo(plan.totalSec, 10);
      expect(plan.totalSec).toBe(15);
      expect(plan.slots).toHaveLength(n);
    }
  });

  it('N=2 → [15,15] beats (7.5s each)', () => {
    const plan = planDurations({ count: 2 })!;
    expect(plan.slots.map((s) => s.beats)).toEqual([15, 15]);
    expect(plan.slots.map((s) => s.durationSec)).toEqual([7.5, 7.5]);
  });

  it('N=8 → front-loaded extra beats [4×6, 3×2]', () => {
    const plan = planDurations({ count: 8 })!;
    expect(plan.slots.map((s) => s.beats)).toEqual([4, 4, 4, 4, 4, 4, 3, 3]);
  });

  it('respects a custom bpm', () => {
    const plan = planDurations({ count: 2, bpm: 90, targetSec: 15 })!;
    // beatSec = 0.6667, totalBeats = round(15/0.6667)=22 (wait: 15/0.6667=22.5→23)
    expect(plan.beatSec).toBeCloseTo(60 / 90, 10);
    const sum = plan.slots.reduce((a, s) => a + s.durationSec, 0);
    expect(sum).toBeCloseTo(plan.totalSec, 10);
  });

  it('returns null for invalid inputs', () => {
    expect(planDurations({ count: 0 })).toBeNull();
    expect(planDurations({ count: 1.5 })).toBeNull();
    expect(planDurations({ count: 4, bpm: 0 })).toBeNull();
    expect(planDurations({ count: 4, targetSec: 0 })).toBeNull();
  });

  it('returns null when assets cannot each get their min slot', () => {
    // 8 assets, 3s @120bpm: 6 beats total, min 2 beats each → 16 > 6.
    expect(planDurations({ count: 8, targetSec: 3 })).toBeNull();
  });
});
