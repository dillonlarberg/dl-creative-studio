import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { runFfmpeg } from "./ffmpeg";
import type { StoryboardMaker } from "./seams";

const THUMB_W = 216, THUMB_H = 384; // 9:16

export function frameTimestamps(cuts: ReadonlyArray<{ srcIn: number; len: number }>, durationSec: number): number[] {
  return cuts.map((c) => {
    const mid = c.srcIn + c.len / 2;
    return Math.min(Math.max(0, mid), Math.max(0, durationSec - 0.05));
  });
}

export class FfmpegStoryboard implements StoryboardMaker {
  constructor(private readonly ffmpegBin = process.env.FFMPEG_BIN ?? "ffmpeg", private readonly workDir = os.tmpdir()) {}
  async frames(localVideoPath: string, cuts: ReadonlyArray<{ srcIn: number; len: number }>, durationSec: number): Promise<string[]> {
    const dir = await fs.mkdtemp(path.join(this.workDir, "cutdown-thumbs-"));
    const times = frameTimestamps(cuts, durationSec);
    const out: string[] = [];
    for (let i = 0; i < times.length; i++) {
      const file = path.join(dir, `thumb-${String(i).padStart(3, "0")}.jpg`);
      await runFfmpeg(this.ffmpegBin, [
        "-y", "-ss", String(Math.round(times[i] * 1000) / 1000), "-i", localVideoPath, "-frames:v", "1",
        "-vf", `scale=${THUMB_W}:${THUMB_H}:force_original_aspect_ratio=increase,crop=${THUMB_W}:${THUMB_H}`,
        "-q:v", "4", file,
      ]);
      out.push(file);
    }
    return out;
  }
}
export function makeFfmpegStoryboard(): FfmpegStoryboard { return new FfmpegStoryboard(); }
