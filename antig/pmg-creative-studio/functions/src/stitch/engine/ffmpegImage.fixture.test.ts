/**
 * CRITICAL real-ffmpeg fixture for Video-Stitch Slice 0 (#90).
 *
 * The whole stitch reuse story rests on ONE invariant: a zoompan still-clip and a
 * blurred-fill video-clip — produced by two DIFFERENT filter chains — must come out
 * with byte-identical codec params so FfmpegReelRenderer can join them with `-c copy`
 * (one encode total). Pure arg-builder tests can't catch timebase/PTS/SAR/profile
 * drift; only real ffmpeg can. We synthesize an off-aspect still + an off-aspect
 * video, normalize each via the NEW builders, then concat+mux them through the
 * REUSED renderer and assert the joined output's duration.
 *
 * Uses ffmpeg-static (same binary deps.ts wires via FFMPEG_BIN). If it can't be
 * resolved, the suite is skipped rather than failing.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import ffmpegStatic from "ffmpeg-static";
import { buildZoompanArgs, buildBlurredFillArgs } from "./ffmpegImage";
import { runFfmpeg, runFfmpegCapture, parseDuration } from "../../cutdown/engine/ffmpeg";
import { FfmpegReelRenderer } from "../../cutdown/engine/ffmpegReel";

const FFMPEG_BIN = ffmpegStatic ?? "";

/** An off-aspect (16:9) still, the wrong shape for a 9:16 reel. */
async function synthStill(bin: string, out: string): Promise<void> {
  await runFfmpeg(bin, [
    "-y", "-f", "lavfi",
    "-i", "testsrc=size=1280x720:rate=1",
    "-frames:v", "1",
    out,
  ]);
}

/** An off-aspect (16:9) source video. */
async function synthVideo(bin: string, out: string, seconds: number): Promise<void> {
  await runFfmpeg(bin, [
    "-y", "-f", "lavfi",
    "-i", `testsrc=size=1280x720:rate=30:duration=${seconds}`,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-t", String(seconds),
    out,
  ]);
}

async function synthMusic(bin: string, out: string, seconds: number): Promise<void> {
  await runFfmpeg(bin, ["-y", "-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`, out]);
}

async function probeDuration(bin: string, file: string): Promise<number> {
  const { stderr } = await runFfmpegCapture(bin, ["-i", file]);
  return parseDuration(stderr);
}

describe.skipIf(!FFMPEG_BIN)("stitch normalize → concat-copy invariant (real ffmpeg)", () => {
  let dir = "";

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "stitch-fixture-"));
  });

  afterAll(async () => {
    if (dir) await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  it("joins a zoompan still-clip + a blurred-fill video-clip via -c copy into one reel", async () => {
    const still = path.join(dir, "still.png");
    const srcVid = path.join(dir, "src.mp4");
    const stillClip = path.join(dir, "norm-still.mp4");
    const videoClip = path.join(dir, "norm-video.mp4");
    const music = path.join(dir, "music.wav");

    await synthStill(FFMPEG_BIN, still);
    await synthVideo(FFMPEG_BIN, srcVid, 2);
    await synthMusic(FFMPEG_BIN, music, 5);

    // The two NEW normalize paths:
    await runFfmpeg(FFMPEG_BIN, buildZoompanArgs({ stillPath: still, durationSec: 2, outPath: stillClip }));
    await runFfmpeg(FFMPEG_BIN, buildBlurredFillArgs({ srcPath: srcVid, durationSec: 2, outPath: videoClip }));

    // The REUSED renderer does the concat (-c copy) + music mux. If params drifted,
    // the stream-copy join would corrupt or fail here.
    const renderer = new FfmpegReelRenderer(FFMPEG_BIN, dir);
    const { mp4Path } = await renderer.render({
      clipPaths: [stillClip, videoClip],
      musicPath: music,
      totalSec: 4,
    });

    const stat = await fs.stat(mp4Path);
    expect(stat.size).toBeGreaterThan(0);

    // 2s + 2s → ~4s joined (small container/rounding margin).
    const duration = await probeDuration(FFMPEG_BIN, mp4Path);
    expect(duration).toBeGreaterThan(3.6);
    expect(duration).toBeLessThan(4.4);
  }, 120_000);

  it("produces both normalized clips at the 9:16 output size", async () => {
    const still = path.join(dir, "s2.png");
    const srcVid = path.join(dir, "v2.mp4");
    const stillClip = path.join(dir, "ns2.mp4");
    const videoClip = path.join(dir, "nv2.mp4");
    await synthStill(FFMPEG_BIN, still);
    await synthVideo(FFMPEG_BIN, srcVid, 1);
    await runFfmpeg(FFMPEG_BIN, buildZoompanArgs({ stillPath: still, durationSec: 1, outPath: stillClip }));
    await runFfmpeg(FFMPEG_BIN, buildBlurredFillArgs({ srcPath: srcVid, durationSec: 1, outPath: videoClip }));

    for (const clip of [stillClip, videoClip]) {
      const { stderr } = await runFfmpegCapture(FFMPEG_BIN, ["-i", clip]);
      expect(stderr).toMatch(/1080x1920/);
      expect(stderr).toMatch(/yuv420p/);
    }
  }, 120_000);
});
