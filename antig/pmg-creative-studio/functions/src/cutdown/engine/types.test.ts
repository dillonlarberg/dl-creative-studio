import { describe, it, expect } from "vitest";
import {
  AngleSchema,
  SegmentSchema,
  BeatSchema,
  VideoAnalysisSchema,
  PlannedCutSchema,
  CutdownPlanSchema,
} from "./types";

describe("V1 value objects", () => {
  it("AngleSchema accepts the three fixed angles and rejects others", () => {
    for (const a of ["narrative", "highlights", "punchy"]) {
      expect(AngleSchema.parse(a)).toBe(a);
    }
    expect(() => AngleSchema.parse("dramatic")).toThrow();
  });

  it("SegmentSchema allows optional summary/role/why", () => {
    const s = SegmentSchema.parse({
      startSec: 1, endSec: 3, score: 0.8,
      summary: "founder demos the app", role: "reveal", why: "clear product moment",
    });
    expect(s.role).toBe("reveal");
    expect(() => SegmentSchema.parse({ startSec: 1, endSec: 3, score: 0.5 })).not.toThrow();
  });

  it("BeatSchema requires a summary + role on top of a segment", () => {
    expect(() =>
      BeatSchema.parse({ startSec: 0, endSec: 2, score: 0.5 }),
    ).toThrow();
    const b = BeatSchema.parse({ startSec: 0, endSec: 2, score: 0.5, summary: "intro", role: "hook" });
    expect(b.summary).toBe("intro");
  });

  it("VideoAnalysisSchema wraps a theme + beats", () => {
    const a = VideoAnalysisSchema.parse({
      theme: "a product launch",
      beats: [{ startSec: 0, endSec: 2, score: 0.5, summary: "intro", role: "hook" }],
    });
    expect(a.beats).toHaveLength(1);
  });

  it("CutdownPlanSchema carries angle + description + planned cuts", () => {
    const p = CutdownPlanSchema.parse({
      angle: "narrative",
      description: "tells it in order",
      cuts: [{ srcIn: 0, srcOut: 2, len: 2, why: "opens the story", role: "hook" }],
    });
    expect(p.angle).toBe("narrative");
    expect(p.cuts[0].len).toBe(2);
  });
});
