/**
 * Tests for the local ffmpeg reel renderer. The pure arg-builders + concat-list
 * writer are asserted directly (no subprocess). A separate real-ffmpeg fixture
 * test (ffmpegReel.fixture.test.ts) proves the stream-copy join end-to-end.
 */
import { describe, it, expect } from "vitest";
import {
  concatListLine,
  buildConcatList,
  buildConcatArgs,
  buildMuxArgs,
} from "./ffmpegReel";

describe("concatListLine", () => {
  it("wraps the path in the concat-demuxer `file '...'` form", () => {
    expect(concatListLine("/tmp/work/clip-000.mp4")).toBe("file '/tmp/work/clip-000.mp4'");
  });

  it("escapes embedded single quotes ('\\'' per ffmpeg concat format)", () => {
    // A path containing an apostrophe must not break the quoting.
    expect(concatListLine("/tmp/a'b/clip.mp4")).toBe("file '/tmp/a'\\''b/clip.mp4'");
  });
});

describe("buildConcatList", () => {
  it("emits one `file` line per clip, in order, newline-terminated", () => {
    const list = buildConcatList(["/w/clip-000.mp4", "/w/clip-001.mp4"]);
    expect(list).toBe("file '/w/clip-000.mp4'\nfile '/w/clip-001.mp4'\n");
  });
});

describe("buildConcatArgs", () => {
  it("stream-copies the concat-demuxer input (no re-encode) with -safe 0", () => {
    const args = buildConcatArgs("/w/clips.txt", "/w/concat.mp4");
    expect(args).toEqual([
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", "/w/clips.txt",
      "-c", "copy",
      "/w/concat.mp4",
    ]);
  });
});

describe("buildMuxArgs", () => {
  const args = buildMuxArgs({
    concatPath: "/w/concat.mp4",
    musicPath: "/w/music.mp3",
    totalSec: 15,
    outPath: "/w/reel.mp4",
  });

  it("maps the concat video (copy) and the first music audio stream", () => {
    expect(args).toContain("-map");
    // explicit stream selection so artwork/extra audio streams are ignored
    expect(args).toContain("0:v:0");
    expect(args).toContain("1:a:0");
    const i = args.indexOf("-c:v");
    expect(args[i + 1]).toBe("copy");
  });

  it("encodes audio to AAC 128k", () => {
    expect(args[args.indexOf("-c:a") + 1]).toBe("aac");
    expect(args[args.indexOf("-b:a") + 1]).toBe("128k");
  });

  it("bounds the output to totalSec and writes a faststart mp4", () => {
    expect(args[args.indexOf("-t") + 1]).toBe("15");
    expect(args[args.indexOf("-movflags") + 1]).toBe("+faststart");
    expect(args[args.length - 1]).toBe("/w/reel.mp4");
  });

  it("builds the audio filter: 0.1s in-fade, 1s out-fade at the tail, apad", () => {
    const af = args[args.indexOf("-af") + 1];
    expect(af).toContain("afade=t=in:st=0:d=0.1");
    expect(af).toContain("afade=t=out:st=14:d=1"); // 15 - 1
    expect(af).toContain("apad");
  });

  it("clamps the out-fade start to 0 when totalSec is shorter than the fade", () => {
    const shortArgs = buildMuxArgs({
      concatPath: "/w/c.mp4",
      musicPath: "/w/m.mp3",
      totalSec: 0.5,
      outPath: "/w/o.mp4",
    });
    const af = shortArgs[shortArgs.indexOf("-af") + 1];
    expect(af).toContain("afade=t=out:st=0:d=1");
  });
});
