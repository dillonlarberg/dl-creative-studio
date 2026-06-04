import { describe, it, expect } from "vitest";
import { ANGLES, angleGuidance, orderSegments } from "./angles.js";
import type { Segment } from "./types.js";

const segs: Segment[] = [
  { startSec: 30, endSec: 33, score: 0.6, role: "reaction" },
  { startSec: 5, endSec: 8, score: 0.95, role: "reveal" },
  { startSec: 50, endSec: 53, score: 0.8, role: "payoff" },
];

describe("angles", () => {
  it("exposes exactly the three fixed angles", () => {
    expect(ANGLES).toEqual(["narrative", "highlights", "punchy"]);
  });

  it("angleGuidance returns non-empty prompt text per angle", () => {
    for (const a of ANGLES) expect(angleGuidance(a).length).toBeGreaterThan(20);
  });

  it("narrative orders chronologically by startSec", () => {
    const out = orderSegments("narrative", segs);
    expect(out.map((s) => s.startSec)).toEqual([5, 30, 50]);
  });

  it("highlights orders by score descending", () => {
    const out = orderSegments("highlights", segs);
    expect(out.map((s) => s.score)).toEqual([0.95, 0.8, 0.6]);
  });

  it("punchy puts the single strongest segment first, rest follow by score", () => {
    const out = orderSegments("punchy", segs);
    expect(out[0].score).toBe(0.95);
    expect(out.map((s) => s.score)).toEqual([0.95, 0.8, 0.6]);
  });

  it("does not mutate the input", () => {
    const copy = [...segs];
    orderSegments("narrative", segs);
    expect(segs).toEqual(copy);
  });
});
