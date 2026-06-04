/**
 * GeminiCutdownBrain — the V1 cutdown "brain". One shared video call (analyze →
 * theme + beats); then per-angle text-only select + critique over the beats; then
 * planCuts. Returns one CutdownPlan per angle. Client is INJECTED (no-network tests).
 */
import { GoogleGenAI } from "@google/genai";
import type { VideoRef } from "./seams.js";
import { z } from "zod";
import { VideoAnalysisSchema, SegmentSchema, type VideoAnalysis, type Segment, type Angle } from "./types.js";
import { angleGuidance, orderSegments } from "./angles.js";
import { type GenAiLike, uploadAndActivate, generateJson } from "./geminiCore.js";

const DEFAULT_MODEL = "gemini-2.5-flash";

const SegmentsEnvelopeSchema = z.object({ segments: z.array(SegmentSchema) });

export interface CutdownBrainOptions {
  model?: string;
  pollIntervalMs?: number;
  uploadTimeoutMs?: number;
  maxAttempts?: number;
  backoffMs?: number;
}

export class GeminiCutdownBrain {
  constructor(
    private readonly ai: GenAiLike,
    private readonly opts: CutdownBrainOptions = {},
  ) {}

  private get model(): string { return this.opts.model ?? DEFAULT_MODEL; }

  /** Shared analyze pass: upload the video once, extract a theme + described beats, clean up. */
  async analyze(video: VideoRef, targetSec: number): Promise<VideoAnalysis> {
    const file = await uploadAndActivate(this.ai, video.path, {
      pollIntervalMs: this.opts.pollIntervalMs,
      uploadTimeoutMs: this.opts.uploadTimeoutMs,
    });
    try {
      const prompt =
        `Analyze this video for building a ~${targetSec}s vertical short. ` +
        `Return JSON { theme, beats } where theme is one sentence describing the through-line, ` +
        `and beats is an array of distinct moments: ` +
        `{ startSec, endSec, score (0-1 engagement), summary (what happens, <=12 words), ` +
        `role (e.g. hook, setup, build, reveal, reaction, payoff, detail) }. ` +
        `Return 8-15 well-spread, non-overlapping beats; startSec/endSec are seconds into the source.`;
      return await generateJson(this.ai, {
        model: this.model,
        contents: [
          { fileData: { fileUri: file.uri as string, mimeType: file.mimeType as string } },
          { text: prompt },
        ],
        schema: VideoAnalysisSchema,
        maxAttempts: this.opts.maxAttempts,
        backoffMs: this.opts.backoffMs,
      });
    } finally {
      try { if (file.name) await this.ai.files.delete({ name: file.name }); } catch { /* ignore */ }
    }
  }

  /** Text-only: pick the beats that serve this angle (+ brief), then order them for playback. */
  async selectForAngle(
    analysis: VideoAnalysis,
    angle: Angle,
    brief: string | undefined,
    targetSec: number,
  ): Promise<Segment[]> {
    const briefLine = brief
      ? `The user's brief is: "${brief}". Every chosen beat must serve this brief.`
      : `No specific brief — optimize for a compelling general cut.`;
    const prompt =
      `Theme: ${analysis.theme}\n` +
      `Beats (JSON): ${JSON.stringify(analysis.beats)}\n\n` +
      `Select the subset of these beats for a ~${targetSec}s vertical short. ` +
      `${angleGuidance(angle)} ${briefLine} ` +
      `Return JSON { segments: [{ startSec, endSec, score, summary, role, why }] } ` +
      `where 'why' is a short reason this beat earns its place in THIS cut. ` +
      `Choose enough distinct beats to comfortably fill ${targetSec}s. Use each beat at most once unless the duration cannot be reached otherwise.`;
    const { segments } = await generateJson(this.ai, {
      model: this.model,
      contents: [{ text: prompt }],
      schema: SegmentsEnvelopeSchema,
      maxAttempts: this.opts.maxAttempts,
      backoffMs: this.opts.backoffMs,
    });
    return orderSegments(angle, segments);
  }
}

/** Wire the real client from an API key. */
export function makeCutdownBrain(apiKey: string, opts?: CutdownBrainOptions): GeminiCutdownBrain {
  if (!apiKey) throw new Error("GEMINI_API_KEY is required for the real GeminiCutdownBrain");
  return new GeminiCutdownBrain(new GoogleGenAI({ apiKey }) as unknown as GenAiLike, opts);
}
