/**
 * storyboard — eyeball the real StoryboardMaker. Grabs thumbs from a local video into out/storyboard/.
 *   FFMPEG_BIN=<ffmpeg> npm run storyboard -- fixtures/test_02.mp4
 */
import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import { makeFfmpegStoryboard } from "../src/storyboard.js";
import { makeFfmpegClipExtractor } from "../src/ffmpeg.js";

async function main(): Promise<void> {
  const videoPath = process.argv[2] ?? "fixtures/test_02.mp4";
  const durationSec = await makeFfmpegClipExtractor().probeDurationSec(videoPath);
  const cuts = [
    { srcIn: durationSec * 0.1, len: 4 },
    { srcIn: durationSec * 0.4, len: 4 },
    { srcIn: durationSec * 0.7, len: 4 },
  ];
  const paths = await makeFfmpegStoryboard().frames(videoPath, cuts, durationSec);
  const dest = path.resolve("out/storyboard");
  await fs.mkdir(dest, { recursive: true });
  for (let i = 0; i < paths.length; i++) await fs.copyFile(paths[i], path.join(dest, `thumb-${i}.jpg`));
  console.log(`▸ wrote ${paths.length} thumbs to ${dest}`);
}
main().catch((e: unknown) => { console.error(`✗ FAIL — ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
