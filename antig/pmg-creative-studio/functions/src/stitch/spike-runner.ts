/**
 * Slice 0 (#90) spike runner — produces eyeball samples + timings for the
 * MECHANICAL half of the feasibility spike (zoompan motion, blurred-fill, concat).
 *
 * Run:  FFMPEG_BIN=$(node -e "console.log(require('ffmpeg-static'))") \
 *         npx tsx src/stitch/spike-runner.ts [stillPath] [videoPath]
 *
 * With no args it synthesizes an off-aspect (16:9) still + video so you can verify
 * the motion/look mechanics. Pass a real off-aspect still + video to eyeball them.
 *
 * NOT covered here (the HITL half — needs GEMINI/OpenAI keys + real luxury assets):
 *   outpaint-extend a real off-aspect STILL to a 9:16 canvas, and its per-asset
 *   latency. See SPIKE.md → "Outpaint half (HITL)".
 */
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { buildZoompanArgs, buildBlurredFillArgs } from "./engine/ffmpegImage";
import { runFfmpeg } from "../cutdown/engine/ffmpeg";
import { FfmpegReelRenderer } from "../cutdown/engine/ffmpegReel";

const BIN = process.env.FFMPEG_BIN ?? "ffmpeg";

async function synthStill(out: string): Promise<void> {
  await runFfmpeg(BIN, ["-y", "-f", "lavfi", "-i", "testsrc=size=1280x720:rate=1", "-frames:v", "1", out]);
}
async function synthVideo(out: string, sec: number): Promise<void> {
  await runFfmpeg(BIN, ["-y", "-f", "lavfi", "-i", `testsrc=size=1280x720:rate=30:duration=${sec}`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-t", String(sec), out]);
}
async function synthMusic(out: string, sec: number): Promise<void> {
  await runFfmpeg(BIN, ["-y", "-f", "lavfi", "-i", `sine=frequency=440:duration=${sec}`, out]);
}

async function main(): Promise<void> {
  const dir = path.join(os.tmpdir(), "stitch-spike");
  await fs.mkdir(dir, { recursive: true });

  const still = process.argv[2] ?? path.join(dir, "_still.png");
  const video = process.argv[3] ?? path.join(dir, "_video.mp4");
  if (!process.argv[2]) { await synthStill(still); console.log("synthesized still:", still); }
  if (!process.argv[3]) { await synthVideo(video, 3); console.log("synthesized video:", video); }

  const stillClip = path.join(dir, "still-kenburns.mp4");
  const videoClip = path.join(dir, "video-blurfill.mp4");
  const music = path.join(dir, "_music.wav");
  await synthMusic(music, 8);

  let t = Date.now();
  await runFfmpeg(BIN, buildZoompanArgs({ stillPath: still, durationSec: 3, outPath: stillClip }));
  console.log(`zoompan motion clip:  ${stillClip}  (${Date.now() - t}ms)`);

  t = Date.now();
  await runFfmpeg(BIN, buildBlurredFillArgs({ srcPath: video, durationSec: 3, outPath: videoClip }));
  console.log(`blurred-fill clip:    ${videoClip}  (${Date.now() - t}ms)`);

  t = Date.now();
  const { mp4Path } = await new FfmpegReelRenderer(BIN, dir).render({
    clipPaths: [stillClip, videoClip],
    musicPath: music,
    totalSec: 6,
  });
  console.log(`stitched reel:        ${mp4Path}  (concat+mux ${Date.now() - t}ms)`);
  console.log(`\nOpen the dir to eyeball:  ${dir}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
