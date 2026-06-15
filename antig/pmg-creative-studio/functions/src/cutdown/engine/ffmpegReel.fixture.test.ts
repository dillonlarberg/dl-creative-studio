/**
 * Real-ffmpeg fixture test for the concat join. The pure arg-builder tests can't
 * catch timebase/PTS/extradata drift in a stream-copy concat — only running real
 * ffmpeg can. We synthesize two tiny, identically-encoded clips + a music bed,
 * run the full FfmpegReelRenderer, and assert the joined output's duration.
 *
 * Uses the ffmpeg-static binary (the same one deps.ts wires via FFMPEG_BIN). If
 * the binary can't be resolved, the suite is skipped rather than failing.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import ffmpegStatic from "ffmpeg-static";
import { FfmpegReelRenderer } from "./ffmpegReel";
import { runFfmpeg, runFfmpegCapture, parseDuration } from "./ffmpeg";

const FFMPEG_BIN = ffmpegStatic ?? "";

// Synthesize a tiny H.264 clip. Identical args across calls → concat-copy-compatible.
async function synthClip(bin: string, out: string, seconds: number): Promise<void> {
  await runFfmpeg(bin, [
    "-y",
    "-f", "lavfi",
    "-i", `testsrc=size=64x64:rate=30:duration=${seconds}`,
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-t", String(seconds),
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

describe.skipIf(!FFMPEG_BIN)("FfmpegReelRenderer (real ffmpeg)", () => {
  let dir = "";

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "reel-fixture-"));
  });

  afterAll(async () => {
    if (dir) await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  it("concats two clips + a music bed into one mp4 of the expected duration", async () => {
    const clip0 = path.join(dir, "clip-0.mp4");
    const clip1 = path.join(dir, "clip-1.mp4");
    const music = path.join(dir, "music.wav");
    await synthClip(FFMPEG_BIN, clip0, 1);
    await synthClip(FFMPEG_BIN, clip1, 1);
    await synthMusic(FFMPEG_BIN, music, 3);

    const renderer = new FfmpegReelRenderer(FFMPEG_BIN, dir);
    const { mp4Path } = await renderer.render({
      clipPaths: [clip0, clip1],
      musicPath: music,
      totalSec: 2,
    });

    const stat = await fs.stat(mp4Path);
    expect(stat.size).toBeGreaterThan(0);

    // Two 1s clips → ~2s joined output (allow a small container/rounding margin).
    const duration = await probeDuration(FFMPEG_BIN, mp4Path);
    expect(duration).toBeGreaterThan(1.8);
    expect(duration).toBeLessThan(2.3);
  }, 60_000);

  it("trims a longer music bed to totalSec (does not overrun the video)", async () => {
    const clip0 = path.join(dir, "t-clip-0.mp4");
    const music = path.join(dir, "t-music.wav");
    await synthClip(FFMPEG_BIN, clip0, 2);
    await synthMusic(FFMPEG_BIN, music, 10); // much longer than the reel

    const renderer = new FfmpegReelRenderer(FFMPEG_BIN, dir);
    const { mp4Path } = await renderer.render({ clipPaths: [clip0], musicPath: music, totalSec: 2 });

    const duration = await probeDuration(FFMPEG_BIN, mp4Path);
    expect(duration).toBeLessThan(2.3); // -t bounded it, not the 10s track
  }, 60_000);
});
