import { describe, it, expect } from "vitest";
import { frameTimestamps } from "./storyboard.js";

describe("frameTimestamps", () => {
  it("returns the midpoint of each cut window", () => {
    expect(frameTimestamps([{ srcIn: 4, len: 6 }, { srcIn: 84, len: 6 }], 200)).toEqual([7, 87]);
  });
  it("clamps a midpoint past the source duration", () => {
    const [t] = frameTimestamps([{ srcIn: 198, len: 6 }], 200);
    expect(t).toBeLessThan(200); expect(t).toBeGreaterThan(0);
  });
  it("never returns a negative timestamp", () => {
    expect(frameTimestamps([{ srcIn: 0, len: 0.2 }], 200)).toEqual([0.1]);
  });
});
