/**
 * Value objects that cross seam boundaries — defined as Zod schemas so data is
 * validated wherever it enters the pipeline (PRD #23). Each schema exports an
 * inferred TypeScript type alongside it.
 *
 * Spec: src/apps/video-stitch/v0-design.html · PRD: dillonlarberg/dl-creative-studio#78.
 */
import { z } from "zod";

/** The fixed v0 output contract — 15.000s · 1080×1920 · 9:16. */
export const OUTPUT = {
  totalSec: 15,
  width: 1080,
  height: 1920,
} as const;

/**
 * A ranked moment of the source video, as returned by `VideoMomentSelector`.
 * `score` is 0–1 (higher = more engaging). Mirrors the verify-gemini shape.
 */
export const SegmentSchema = z
  .object({
    startSec: z.number().nonnegative(),
    endSec: z.number().nonnegative(),
    score: z.number(),
  })
  .refine((s) => s.endSec > s.startSec, {
    message: "endSec must be greater than startSec",
  });
export type Segment = z.infer<typeof SegmentSchema>;

/**
 * One hard cut in the rendered timeline. `srcIn`/`srcOut` are SOURCE timestamps;
 * `len` is the OUTPUT slot length. The cuts tile [0, totalSec] with Σ `len` = 15.000.
 */
export const CutSchema = z
  .object({
    srcIn: z.number().nonnegative(),
    srcOut: z.number().nonnegative(),
    len: z.number().positive(),
  })
  .refine((c) => c.srcOut > c.srcIn, {
    message: "srcOut must be greater than srcIn",
  });
export type Cut = z.infer<typeof CutSchema>;

/** An ordered list of hard cuts whose `len`s sum to exactly the output duration. */
export const CutPlanSchema = z.array(CutSchema).min(1);
export type CutPlan = z.infer<typeof CutPlanSchema>;

/**
 * A catalog music track. In v0 this is a `sampleMusic/{trackId}` Firestore doc;
 * the file itself lives in Cloud Storage and is served via a long-TTL signed URL.
 */
export const SampleMusicTrackSchema = z.object({
  trackId: z.string().min(1),
  title: z.string().min(1),
  url: z.string().min(1),
  format: z.enum(["mp3", "wav", "m4a", "aac"]),
  durationSec: z.number().positive(),
  bpm: z.number().positive().optional(),
  firstBeatSec: z.number().nonnegative().optional(),
  mood: z.string().optional(),
  genre: z.string().optional(),
  provider: z.string().min(1),
  licenseRef: z.string().min(1),
});
export type SampleMusicTrack = z.infer<typeof SampleMusicTrackSchema>;

/**
 * One pre-extracted clip the renderer plays in sequence: a fetchable URL plus its
 * output length. Each clip is already trimmed to a single moment (Shotstack only
 * ever fetches a few seconds of video — the full long source would exceed the
 * renderer's source limits).
 */
export const ClipRefSchema = z.object({
  url: z.string().min(1),
  len: z.number().positive(),
});
export type ClipRef = z.infer<typeof ClipRefSchema>;

/** The render request handed to `VideoRenderer`. All asset refs must be URLs a cloud renderer can fetch. */
export const EditSpecSchema = z.object({
  clips: z.array(ClipRefSchema).min(1),
  musicUrl: z.string().min(1),
  totalSec: z.number().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type EditSpec = z.infer<typeof EditSpecSchema>;
