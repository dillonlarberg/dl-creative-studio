/**
 * GeminiCutdownBrain — the V1 cutdown "brain". One shared video call (analyze →
 * theme + beats); then per-angle text-only select + critique over the beats; then
 * planCuts. Returns one CutdownPlan per angle. Client is INJECTED (no-network tests).
 */
import { GoogleGenAI } from "@google/genai";
import type { VideoRef } from "./seams.js";
import { VideoAnalysisSchema, type VideoAnalysis } from "./types.js";
import { type GenAiLike, uploadAndActivate, generateJson } from "./geminiCore.js";

const DEFAULT_MODEL = "gemini-2.5-flash";

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
}

/** Wire the real client from an API key. */
export function makeCutdownBrain(apiKey: string, opts?: CutdownBrainOptions): GeminiCutdownBrain {
  if (!apiKey) throw new Error("GEMINI_API_KEY is required for the real GeminiCutdownBrain");
  return new GeminiCutdownBrain(new GoogleGenAI({ apiKey }) as unknown as GenAiLike, opts);
}
