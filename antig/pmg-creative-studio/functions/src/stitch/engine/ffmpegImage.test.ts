import { describe, it, expect } from "vitest";
import { buildZoompanArgs, buildBlurredFillArgs, buildScaleNormalizeArgs } from "./ffmpegImage";
import { OUTPUT } from "../../cutdown/engine/types";

/** The codec params that MUST be identical across every stitch normalize path for
 *  a `-c copy` concat to hold. Asserted on both builders to lock the invariant. */
function assertEncodeInvariant(args: string[]): void {
  const s = args.join(" ");
  expect(s).toContain("-an"); // no audio stream
  expect(s).toContain("-c:v libx264");
  expect(s).toContain("-crf 23");
  expect(s).toContain("-preset veryfast");
  expect(s).toContain("-movflags +faststart");
  expect(s).toContain("setsar=1");
  expect(s).toContain("format=yuv420p");
  // output size appears as either WxH (zoompan s=) or W:H (scale=)
  const hasOutputSize =
    s.includes(`${OUTPUT.width}x${OUTPUT.height}`) || s.includes(`${OUTPUT.width}:${OUTPUT.height}`);
  expect(hasOutputSize).toBe(true);
}

describe("buildZoompanArgs", () => {
  it("emits the shared encode invariant", () => {
    assertEncodeInvariant(
      buildZoompanArgs({ stillPath: "in.png", durationSec: 3, outPath: "out.mp4" }),
    );
  });

  it("loops the still and bounds it with -t to the requested duration", () => {
    const a = buildZoompanArgs({ stillPath: "in.png", durationSec: 2.5, outPath: "out.mp4" });
    expect(a).toContain("-loop");
    expect(a[a.indexOf("-t") + 1]).toBe("2.5");
  });

  it("upscales before zoompan (jitter fix) and renders at the output size", () => {
    const a = buildZoompanArgs({ stillPath: "in.png", durationSec: 1, outPath: "out.mp4" }).join(" ");
    // 3x upscale present, zoompan output s=1080x1920
    expect(a).toContain(`${OUTPUT.width * 3}:${OUTPUT.height * 3}`);
    expect(a).toContain(`s=${OUTPUT.width}x${OUTPUT.height}`);
  });

  it("derives a per-frame zoom step that reaches zoomTo over the clip", () => {
    const a = buildZoompanArgs({ stillPath: "in.png", durationSec: 1, outPath: "o.mp4", fps: 30, zoomTo: 1.3 }).join(" ");
    // 0.3 over 30 frames = 0.01 step, capped at 1.3
    expect(a).toContain("min(zoom+0.01,1.3)");
  });
});

describe("buildBlurredFillArgs", () => {
  it("emits the shared encode invariant", () => {
    assertEncodeInvariant(
      buildBlurredFillArgs({ srcPath: "in.mp4", durationSec: 3, outPath: "out.mp4" }),
    );
  });

  it("scales the foreground to FIT (no crop of subject) over a blurred fill", () => {
    const a = buildBlurredFillArgs({ srcPath: "in.mp4", durationSec: 2, outPath: "out.mp4" }).join(" ");
    expect(a).toContain("force_original_aspect_ratio=decrease"); // fg fits, never cropped
    expect(a).toContain("boxblur="); // blurred background
    expect(a).toContain("overlay=(W-w)/2:(H-h)/2"); // centered
  });

  it("bounds the clip to the requested duration", () => {
    const a = buildBlurredFillArgs({ srcPath: "in.mp4", durationSec: 4, outPath: "out.mp4" });
    expect(a[a.indexOf("-t") + 1]).toBe("4");
  });
});

describe("buildScaleNormalizeArgs", () => {
  it("emits the shared encode invariant", () => {
    assertEncodeInvariant(
      buildScaleNormalizeArgs({ srcPath: "in.mp4", isStill: false, durationSec: 3, outPath: "out.mp4" }),
    );
  });

  it("pads (never crops) to the output size", () => {
    const a = buildScaleNormalizeArgs({ srcPath: "in.jpg", isStill: true, durationSec: 2, outPath: "o.mp4" }).join(" ");
    expect(a).toContain("force_original_aspect_ratio=decrease"); // fit, not crop
    expect(a).toContain(`pad=${OUTPUT.width}:${OUTPUT.height}`);
    expect(a).not.toContain("crop=");
  });

  it("loops a still but not a video", () => {
    const still = buildScaleNormalizeArgs({ srcPath: "in.jpg", isStill: true, durationSec: 2, outPath: "o.mp4" });
    const video = buildScaleNormalizeArgs({ srcPath: "in.mp4", isStill: false, durationSec: 2, outPath: "o.mp4" });
    expect(still).toContain("-loop");
    expect(video).not.toContain("-loop");
  });
});
