/**
 * Video-Stitch media arg-builders (Slice 0 spike → reused by Slices 2 & 4).
 *
 * Stitch composes N polished, standalone creatives into one reel. Unlike cutdown
 * (which cuts ONE long video, center-cropping to fill), stitch must turn mixed,
 * off-aspect assets into 9:16 clips WITHOUT cropping brand content:
 *   - a STILL → a motion ("Ken Burns") clip          → buildZoompanArgs
 *   - an off-aspect VIDEO → a blurred-fill 9:16 clip  → buildBlurredFillArgs
 *
 * THE CONTRACT (why these can `-c copy` concat with each other AND with cutdown's
 * extractClips output): every builder emits the SAME codec params —
 *   OUTPUT.width×OUTPUT.height, fps=30, SAR=1, yuv420p, H.264, NO audio stream.
 * If any param drifts, the stream-copy concat in FfmpegReelRenderer corrupts or
 * fails. ffmpegImage.fixture.test.ts proves the join holds across both paths.
 *
 *                    still ──┐
 *                            ├─► [1080×1920·30fps·yuv420p·h264·-an] ─► concat -c copy ─► reel
 *   off-aspect video (16:9) ─┘
 */
import { OUTPUT } from "../../cutdown/engine/types";

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/** The shared encoder tail every normalized stitch clip ends with. Identical to
 *  cutdown's extractClips encode so all clips share byte-identical codec params. */
const ENCODE_TAIL = [
  "-an", // music bed is laid on later in the mux pass
  "-c:v", "libx264",
  "-preset", "veryfast",
  "-crf", "23",
  "-movflags", "+faststart",
] as const;

/**
 * Pure: ffmpeg args to turn a STILL into a slow pan/zoom ("Ken Burns") motion clip.
 *
 * Jitter fix: we UPSCALE the still (3×) BEFORE zoompan, so the fractional per-frame
 * zoom samples sub-pixel from a high-res source instead of stepping across the
 * native grid. `force_original_aspect_ratio=increase` + `crop` fills the upscaled
 * canvas (the source is pre-fit to ~9:16 by the caller, so this crops only padding,
 * never brand content). zoompan then renders s=1080×1920 @ 30fps for `durationSec`.
 */
export function buildZoompanArgs(opts: {
  stillPath: string;
  durationSec: number;
  outPath: string;
  width?: number;
  height?: number;
  fps?: number;
  /** Max zoom at the end of the clip (1.0 = none). Default a gentle 1.12. */
  zoomTo?: number;
}): string[] {
  const w = opts.width ?? OUTPUT.width;
  const h = opts.height ?? OUTPUT.height;
  const fps = opts.fps ?? 30;
  const dur = round3(opts.durationSec);
  const frames = Math.max(1, Math.round(dur * fps));
  const zoomTo = opts.zoomTo ?? 1.12;
  // per-frame zoom step that reaches zoomTo over the clip
  const step = round3((zoomTo - 1) / frames);
  const up = 3; // upscale factor before zoom
  const vf = [
    `scale=${w * up}:${h * up}:force_original_aspect_ratio=increase`,
    `crop=${w * up}:${h * up}`,
    `zoompan=z='min(zoom+${step},${zoomTo})':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${w}x${h}:fps=${fps}`,
    "setsar=1",
    "format=yuv420p",
  ].join(",");
  return [
    "-y",
    "-loop", "1",
    "-framerate", String(fps),
    "-i", opts.stillPath,
    "-t", String(dur),
    "-vf", vf,
    ...ENCODE_TAIL,
    opts.outPath,
  ];
}

/**
 * Pure: ffmpeg args to fit an off-aspect VIDEO into 9:16 via a blurred-fill
 * background (the standard IG/TikTok look). The clip is scaled to FIT (no crop of
 * the subject) and centered over a scaled+cropped+blurred copy of itself. Outpaint
 * can't extend moving frames, so this is the video analog of outpainting a still.
 */
export function buildBlurredFillArgs(opts: {
  srcPath: string;
  durationSec: number;
  outPath: string;
  width?: number;
  height?: number;
  fps?: number;
  /** Background blur strength. Default 24. */
  blur?: number;
}): string[] {
  const w = opts.width ?? OUTPUT.width;
  const h = opts.height ?? OUTPUT.height;
  const fps = opts.fps ?? 30;
  const dur = round3(opts.durationSec);
  const blur = opts.blur ?? 24;
  const filter = [
    `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},boxblur=${blur}:5,setsar=1[bg]`,
    `[0:v]scale=${w}:${h}:force_original_aspect_ratio=decrease[fg]`,
    `[bg][fg]overlay=(W-w)/2:(H-h)/2,fps=${fps},format=yuv420p,setsar=1[v]`,
  ].join(";");
  return [
    "-y",
    "-i", opts.srcPath,
    "-t", String(dur),
    "-filter_complex", filter,
    "-map", "[v]",
    ...ENCODE_TAIL,
    opts.outPath,
  ];
}
