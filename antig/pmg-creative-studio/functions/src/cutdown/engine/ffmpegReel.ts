/**
 * FfmpegReelRenderer — the real `ReelRenderer`. Replaces the Shotstack cloud
 * renderer with two local ffmpeg passes:
 *
 *   1. concat (stream-copy): join the pre-normalized clips into one silent mp4.
 *      Clips come off `extractClips` already 1080×1920 / 30fps / yuv420p, so
 *      `-c copy` joins them with no re-encode (the single encode happened in
 *      extract). Proven end-to-end by ffmpegReel.fixture.test.ts.
 *   2. mux: lay the music bed onto the concatenated video. Music starts at t=0
 *      (no beat-sync in v0), gets a short in-fade + a 1s tail fade, and `apad`
 *      guards a track shorter than the reel. `-t totalSec` bounds the output.
 *
 * The pure arg-builders (`buildConcatArgs`/`buildMuxArgs`) + the list writer are
 * unit-tested directly; the class is a thin wrapper that reuses `runFfmpeg` from
 * `ffmpeg.ts` (DRY — one place spawns ffmpeg).
 */
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import type { ReelRenderer } from "./seams";
import type { ReelComposition } from "./types";
import { runFfmpeg } from "./ffmpeg";

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

const FADE_IN_SEC = 0.1; // kills the startup pop
const FADE_OUT_SEC = 1; // music tail fade so the reel doesn't end on a hard audio cut

/**
 * One line of an ffmpeg concat-demuxer list file: `file '<path>'`. Embedded
 * single quotes are escaped as `'\''` per the concat format, so paths with
 * apostrophes don't break the quoting.
 */
export function concatListLine(clipPath: string): string {
  return `file '${clipPath.replace(/'/g, "'\\''")}'`;
}

/** The full concat-demuxer list file body (one `file` line per clip, in order). */
export function buildConcatList(clipPaths: readonly string[]): string {
  return clipPaths.map(concatListLine).join("\n") + "\n";
}

/** Pure: args for pass 1 — stream-copy the concat-demuxer input into one mp4. */
export function buildConcatArgs(listPath: string, outPath: string): string[] {
  return ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outPath];
}

/** Pure: args for pass 2 — mux the music bed onto the concatenated (silent) video. */
export function buildMuxArgs(opts: {
  concatPath: string;
  musicPath: string;
  totalSec: number;
  outPath: string;
}): string[] {
  const total = round3(opts.totalSec);
  const fadeOutStart = round3(Math.max(0, total - FADE_OUT_SEC));
  const af = [
    `afade=t=in:st=0:d=${FADE_IN_SEC}`,
    `afade=t=out:st=${fadeOutStart}:d=${FADE_OUT_SEC}`,
    "apad",
  ].join(",");
  return [
    "-y",
    "-i", opts.concatPath,
    "-i", opts.musicPath,
    "-map", "0:v:0", // the concatenated video
    "-map", "1:a:0", // first music audio stream (ignore artwork/extra streams)
    "-c:v", "copy",
    "-af", af,
    "-t", String(total),
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    opts.outPath,
  ];
}

/** Write the concat list file the demuxer reads in pass 1. */
export async function writeConcatList(listPath: string, clipPaths: readonly string[]): Promise<void> {
  await fs.writeFile(listPath, buildConcatList(clipPaths), "utf8");
}

export class FfmpegReelRenderer implements ReelRenderer {
  constructor(
    private readonly ffmpegBin = process.env.FFMPEG_BIN ?? "ffmpeg",
    private readonly workDir = os.tmpdir(),
  ) {}

  async render(comp: ReelComposition): Promise<{ mp4Path: string }> {
    const dir = await fs.mkdtemp(path.join(this.workDir, "cutdown-reel-"));
    const listPath = path.join(dir, "clips.txt");
    const concatPath = path.join(dir, "concat.mp4");
    const outPath = path.join(dir, "reel.mp4");

    await writeConcatList(listPath, comp.clipPaths);
    await runFfmpeg(this.ffmpegBin, buildConcatArgs(listPath, concatPath));
    await runFfmpeg(
      this.ffmpegBin,
      buildMuxArgs({ concatPath, musicPath: comp.musicPath, totalSec: comp.totalSec, outPath }),
    );
    return { mp4Path: outPath };
  }
}

export function makeFfmpegReelRenderer(): FfmpegReelRenderer {
  return new FfmpegReelRenderer();
}
