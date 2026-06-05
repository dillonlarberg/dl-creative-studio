/**
 * FfmpegClipExtractor — the real `ClipExtractor` (build-order step 5).
 *
 * Probes the source duration and cuts each planned moment into a small, self-
 * contained H.264 clip via ffmpeg, so the cloud renderer only ever fetches a few
 * seconds of video (the full long source exceeds the renderer's source limits).
 *
 * `ffmpeg` is resolved from `FFMPEG_BIN` (e.g. the static binary shipped by the
 * `imageio-ffmpeg` pip package in the librosa venv), else `ffmpeg` on PATH.
 */
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import type { ClipExtractor } from "./seams.js";
import type { CutPlan } from "./types.js";

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/** Run ffmpeg, capturing full stderr (where ffmpeg writes diagnostics). Never rejects. */
function runFfmpegCapture(bin: string, args: string[]): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args);
    let err = "";
    proc.stderr.on("data", (d: Buffer) => (err += d.toString()));
    proc.on("error", (e) => reject(new Error(`failed to spawn ffmpeg (${bin}): ${e.message}`)));
    proc.on("close", (code) => resolve({ code, stderr: err }));
  });
}

/** Run ffmpeg and reject (with the tail of stderr) on a non-zero exit. */
async function runFfmpeg(bin: string, args: string[]): Promise<void> {
  const { code, stderr } = await runFfmpegCapture(bin, args);
  if (code !== 0) throw new Error(`ffmpeg exited ${code}: ${stderr.slice(-400)}`);
}

/** Parse "Duration: HH:MM:SS.ss" out of ffmpeg's stderr (no ffprobe in imageio-ffmpeg). */
export function parseDuration(stderr: string): number {
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) throw new Error("ffmpeg: could not parse Duration from output");
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

export class FfmpegClipExtractor implements ClipExtractor {
  constructor(
    private readonly ffmpegBin = process.env.FFMPEG_BIN ?? "ffmpeg",
    private readonly workDir = os.tmpdir(),
  ) {}

  async probeDurationSec(localVideoPath: string): Promise<number> {
    // `ffmpeg -i <file>` with no output prints stream info (incl. Duration) and exits 1;
    // we tolerate the non-zero exit and parse the full stderr.
    const { stderr } = await runFfmpegCapture(this.ffmpegBin, ["-i", localVideoPath]);
    return parseDuration(stderr);
  }

  async extractClips(localVideoPath: string, cuts: CutPlan, durationSec: number): Promise<string[]> {
    const dir = await fs.mkdtemp(path.join(this.workDir, "cutdown-clips-"));
    const paths: string[] = [];
    for (let i = 0; i < cuts.length; i++) {
      const cut = cuts[i];
      // Keep the window inside the source so we never seek past EOF.
      const srcIn = round3(Math.min(cut.srcIn, Math.max(0, durationSec - cut.len)));
      const out = path.join(dir, `clip-${String(i).padStart(3, "0")}.mp4`);
      await runFfmpeg(this.ffmpegBin, [
        "-y",
        "-ss", String(srcIn),
        "-i", localVideoPath,
        "-t", String(round3(cut.len)),
        "-an", // drop source audio — music is laid on separately by the renderer
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        out,
      ]);
      paths.push(out);
    }
    return paths;
  }
}

export function makeFfmpegClipExtractor(): FfmpegClipExtractor {
  return new FfmpegClipExtractor();
}
