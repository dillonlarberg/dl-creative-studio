/**
 * Per-seam contract tests against the Fakes. These pin each seam's external
 * behavior (inputs → output shape), independent of any provider. They assert the
 * contract, never internal call shapes.
 */
import { describe, it, expect } from "vitest";
import {
  FakeEvenSpacedSelector,
  FakeFixedBpm,
  FakeMusicCatalog,
  FakeReelRenderer,
  FakeClipExtractor,
  FakeCutdownBrain,
} from "./fakes";
import { SegmentSchema, SampleMusicTrackSchema, CutdownPlanSchema } from "./types";
import type { CutPlan } from "./types";

describe("FakeEvenSpacedSelector (VideoMomentSelector contract)", () => {
  it("returns well-formed, in-bounds, schema-valid segments", async () => {
    const sel = new FakeEvenSpacedSelector(70, 8, 2);
    const segs = await sel.select({ path: "x.mp4" }, { budgetSec: 15 });
    expect(segs).toHaveLength(8);
    for (const s of segs) {
      expect(() => SegmentSchema.parse(s)).not.toThrow();
      expect(s.startSec).toBeGreaterThanOrEqual(0);
      expect(s.endSec).toBeLessThanOrEqual(70);
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(1);
    }
  });

  it("ranks segments by descending score (first = best)", async () => {
    const segs = await new FakeEvenSpacedSelector().select({ path: "x.mp4" }, { budgetSec: 15 });
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i - 1].score).toBeGreaterThanOrEqual(segs[i].score);
    }
  });
});

describe("FakeFixedBpm (TempoDetector contract)", () => {
  it("returns a positive BPM", async () => {
    const { bpm } = await new FakeFixedBpm().detect("fake://music/x.mp3");
    expect(bpm).toBeGreaterThan(0);
  });

  it("honors a configured BPM", async () => {
    const { bpm } = await new FakeFixedBpm(90).detect("fake://music/x.mp3");
    expect(bpm).toBe(90);
  });
});

describe("FakeMusicCatalog (MusicCatalog contract)", () => {
  it("lists schema-valid tracks", async () => {
    const tracks = await new FakeMusicCatalog().list();
    expect(tracks.length).toBeGreaterThan(0);
    for (const t of tracks) {
      expect(() => SampleMusicTrackSchema.parse(t)).not.toThrow();
    }
  });

  it("fetches a known track's url + bpm", async () => {
    const { url, bpm } = await new FakeMusicCatalog().fetch("pulse-120");
    expect(url).toMatch(/^fake:\/\//);
    expect(bpm).toBe(120);
  });

  it("throws on an unknown trackId", async () => {
    await expect(new FakeMusicCatalog().fetch("nope")).rejects.toThrow(/unknown trackId/);
  });
});

describe("FakeReelRenderer (ReelRenderer contract)", () => {
  it("accepts a ReelComposition and returns a local mp4Path", async () => {
    const { mp4Path } = await new FakeReelRenderer().render({
      clipPaths: ["/tmp/clip-0.mp4"],
      musicPath: "/tmp/music.mp3",
      totalSec: 15,
    });
    expect(mp4Path).toMatch(/^\/fake\/reel-/);
    expect(mp4Path).toContain("1-cuts");
  });
});

describe("FakeClipExtractor (ClipExtractor contract)", () => {
  it("reports a positive duration", async () => {
    expect(await new FakeClipExtractor(296).probeDurationSec("x.mp4")).toBe(296);
  });

  it("returns one local clip path per cut, in order", async () => {
    const cuts: CutPlan = [
      { srcIn: 0, srcOut: 2, len: 2 },
      { srcIn: 10, srcOut: 12, len: 2 },
    ];
    const paths = await new FakeClipExtractor().extractClips("x.mp4", cuts, 300);
    expect(paths).toHaveLength(2);
    expect(paths[0]).toContain("clip-0");
    expect(paths[1]).toContain("clip-1");
  });
});

describe("FakeCutdownBrain", () => {
  it("returns 3 schema-valid angled plans with no network", async () => {
    const brain = new FakeCutdownBrain();
    const track = {
      trackId: "t", title: "T", url: "fake://t.mp3", format: "mp3" as const,
      durationSec: 120, bpm: 120, provider: "fake", licenseRef: "x",
    };
    const plans = await brain.cutdown({ path: "x.mp4" }, track, { targetSec: 15, durationSec: 120 });
    expect(plans.map((p) => p.angle)).toEqual(["narrative", "highlights", "punchy"]);
    for (const p of plans) expect(() => CutdownPlanSchema.parse(p)).not.toThrow();
  });
});
