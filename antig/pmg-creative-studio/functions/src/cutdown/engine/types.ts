/**
 * Value objects that cross seam boundaries — defined as Zod schemas so data is
 * validated wherever it enters the pipeline (PRD #23). Each schema exports an
 * inferred TypeScript type alongside it.
 *
 * Spec: src/apps/video-stitch/v0-design.html · PRD: dillonlarberg/dl-creative-studio#78.
 */
import { z } from "zod";
import { MoodSchema, GenreSchema, VocalsSchema, UseCaseTagSchema, EnergySchema } from "./musicTags";

/** The fixed v0 output contract — 15.000s · 1080×1920 · 9:16. */
export const OUTPUT = {
  totalSec: 15,
  width: 1080,
  height: 1920,
} as const;

/** The three fixed creative angles for V1. Each implies its own playback order. */
export const AngleSchema = z.enum(["narrative", "highlights", "punchy"]);
export type Angle = z.infer<typeof AngleSchema>;

/**
 * A ranked moment of the source video, as returned by `VideoMomentSelector`.
 * `score` is 0–1 (higher = more engaging). The optional `summary`/`role`/`why`
 * carry model rationale through the pipeline to the storyboard.
 */
export const SegmentSchema = z
  .object({
    startSec: z.number().nonnegative(),
    endSec: z.number().nonnegative(),
    score: z.number(),
    summary: z.string().optional(),
    role: z.string().optional(),
    why: z.string().optional(),
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
  mood: MoodSchema.optional(),
  genre: GenreSchema.optional(),
  energy: EnergySchema.optional(),
  vocals: VocalsSchema.optional(),
  tags: z.array(UseCaseTagSchema).optional(),
  provider: z.string().min(1),
  licenseRef: z.string().min(1),
});
export type SampleMusicTrack = z.infer<typeof SampleMusicTrackSchema>;

/** A described beat from the shared analyze pass — a Segment that REQUIRES summary + role. */
export const BeatSchema = z
  .object({
    startSec: z.number().nonnegative(),
    endSec: z.number().nonnegative(),
    score: z.number(),
    summary: z.string().min(1),
    role: z.string().min(1),
  })
  .refine((b) => b.endSec > b.startSec, { message: "endSec must be greater than startSec" });
export type Beat = z.infer<typeof BeatSchema>;

/** The shared content map produced once per run by the analyze pass. */
export const VideoAnalysisSchema = z.object({
  theme: z.string().min(1),
  beats: z.array(BeatSchema).min(1),
});
export type VideoAnalysis = z.infer<typeof VideoAnalysisSchema>;

/** A cut that also carries the rationale of the source moment it was filled from. */
export const PlannedCutSchema = z
  .object({
    srcIn: z.number().nonnegative(),
    srcOut: z.number().nonnegative(),
    len: z.number().positive(),
    summary: z.string().optional(),
    role: z.string().optional(),
    why: z.string().optional(),
    score: z.number().optional(),
  })
  .refine((c) => c.srcOut > c.srcIn, { message: "srcOut must be greater than srcIn" })
  // The source window must equal the output slot length (1:1 speed, no stretch).
  // Guards the render's `-t totalSec` against a tampered/stale plan that would
  // otherwise truncate the video or freeze its tail. 2ms tolerance for ms rounding.
  .refine((c) => Math.abs(c.srcOut - c.srcIn - c.len) < 0.002, {
    message: "srcOut - srcIn must equal len",
  });
export type PlannedCut = z.infer<typeof PlannedCutSchema>;

/** One AI-generated cut version: an angle, its pitch, and the ordered cuts. */
export const CutdownPlanSchema = z.object({
  angle: AngleSchema,
  description: z.string().min(1),
  cuts: z.array(PlannedCutSchema).min(1),
});
export type CutdownPlan = z.infer<typeof CutdownPlanSchema>;

/**
 * The local-render request handed to `ReelRenderer`: ordered local clip paths
 * (each already normalized to OUTPUT dims by `extractClips`) plus a local music
 * file. Music starts at t=0; `totalSec` is derived from the plan's cuts, not the
 * raw client `targetSec`. Dimensions are NOT carried — a stream-copy renderer
 * never rescales, so they would be dead params (the extractor owns dimensions).
 */
export interface ReelComposition {
  clipPaths: readonly string[];
  musicPath: string;
  totalSec: number;
}
