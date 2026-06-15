/**
 * Pure-builder tests for the clip extractor args. `extractClips` now normalizes
 * every clip to the OUTPUT contract (1080×1920 / 30fps / yuv420p) so the reel
 * renderer can concat them with `-c copy`. These assert the normalization filter
 * + deterministic encode without spawning ffmpeg.
 */
import { describe, it, expect } from "vitest";
import { buildExtractClipArgs } from "./ffmpeg";
import { OUTPUT } from "./types";

describe("buildExtractClipArgs", () => {
  const args = buildExtractClipArgs({
    srcPath: "/src.mp4",
    srcIn: 3.2,
    len: 2.5,
    outPath: "/out/clip.mp4",
  });

  it("input-seeks to srcIn, bounds the window to len, strips source audio", () => {
    expect(args[args.indexOf("-ss") + 1]).toBe("3.2");
    expect(args[args.indexOf("-t") + 1]).toBe("2.5");
    expect(args).toContain("-an"); // music is laid on later by the reel renderer
  });

  it("normalizes to OUTPUT dims / 30fps / yuv420p via -vf (concat-copy byte-compatibility)", () => {
    const vf = args[args.indexOf("-vf") + 1];
    expect(vf).toContain(`scale=${OUTPUT.width}:${OUTPUT.height}:force_original_aspect_ratio=increase`);
    expect(vf).toContain(`crop=${OUTPUT.width}:${OUTPUT.height}`);
    expect(vf).toContain("setsar=1");
    expect(vf).toContain("fps=30");
    expect(vf).toContain("format=yuv420p");
  });

  it("re-encodes deterministically (libx264, fixed preset + crf) and writes faststart", () => {
    expect(args[args.indexOf("-c:v") + 1]).toBe("libx264");
    expect(args[args.indexOf("-preset") + 1]).toBe("veryfast");
    expect(args[args.indexOf("-crf") + 1]).toBe("23");
    expect(args[args.indexOf("-movflags") + 1]).toBe("+faststart");
    expect(args[args.length - 1]).toBe("/out/clip.mp4");
  });
});
