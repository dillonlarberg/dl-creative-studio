import { describe, it, expect } from "vitest";
import { frameTimestamps } from "./storyboard.js";
import { FakeStoryboard } from "./fakes.js";

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

describe("FakeStoryboard", () => {
  it("returns one canned path per cut, no ffmpeg", async () => {
    const paths = await new FakeStoryboard().frames("x.mp4", [{ srcIn: 1, len: 2 }, { srcIn: 5, len: 2 }], 100);
    expect(paths).toHaveLength(2); expect(paths[0]).toMatch(/thumb-0/);
  });
});
