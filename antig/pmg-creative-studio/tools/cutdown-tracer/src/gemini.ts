/**
 * GeminiMomentSelector — the real `VideoMomentSelector` (build-order step 3).
 *
 * Reuses the call shape proven by `scripts/verify-gemini.ts`:
 *   upload via the Files API → poll until ACTIVE → generateContent with a
 *   structured-output schema → parse + validate → best-effort cleanup.
 *
 * Follows the resize-tracer's dependency-injection pattern (`runPhase1(ai, …)`):
 * the genai client is injected, so tests pass a fake client and the offline suite
 * stays no-network/no-env. `makeGeminiSelector(apiKey)` wires the real client.
 */
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { VideoMomentSelector, VideoRef } from "./seams.js";
import { SegmentSchema, type Segment } from "./types.js";
import { type GenAiLike, uploadAndActivate, generateJson } from "./geminiCore.js";

// Re-export GenAiLike so existing imports (e.g. gemini.test.ts) stay green.
export type { GenAiLike } from "./geminiCore.js";

// gemini-2.5-flash: cheap, video-capable, fine for moment ranking (resize P1 uses 2.5-pro).
const DEFAULT_MODEL = "gemini-2.5-flash";

const SegmentsEnvelopeSchema = z.object({ segments: z.array(SegmentSchema) });

// Plain JSON-schema handed to the API — parallels P1_RESPONSE_SCHEMA in resize/schema.ts.
const SEGMENTS_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    segments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          startSec: { type: "number" },
          endSec: { type: "number" },
          score: { type: "number" },
        },
        required: ["startSec", "endSec", "score"],
      },
    },
  },
  required: ["segments"],
} as const;

export interface GeminiSelectorOptions {
  model?: string;
  pollIntervalMs?: number;
  uploadTimeoutMs?: number;
  maxAttempts?: number;
}

export class GeminiMomentSelector implements VideoMomentSelector {
  constructor(
    private readonly ai: GenAiLike,
    private readonly opts: GeminiSelectorOptions = {},
  ) {}

  async select(video: VideoRef, opts: { budgetSec: number }): Promise<Segment[]> {
    const file = await uploadAndActivate(this.ai, video.path, {
      pollIntervalMs: this.opts.pollIntervalMs,
      uploadTimeoutMs: this.opts.uploadTimeoutMs,
    });
    try {
      const prompt =
        `Identify the most engaging moments of this video for a ~${opts.budgetSec}s short vertical reel. ` +
        `Return JSON { segments: [{ startSec, endSec, score }] } where score is 0-1 ` +
        `(higher = more engaging), ordered by score descending. ` +
        `Prefer distinct, non-overlapping moments; startSec/endSec are seconds into the source.`;
      const { segments } = await generateJson(this.ai, {
        model: this.opts.model ?? DEFAULT_MODEL,
        contents: [
          { fileData: { fileUri: file.uri as string, mimeType: file.mimeType as string } },
          { text: prompt },
        ],
        schema: SegmentsEnvelopeSchema,
        responseSchema: SEGMENTS_RESPONSE_SCHEMA,
        maxAttempts: this.opts.maxAttempts,
      });
      // Sort by score descending so callers can rely on rank order (planCuts re-dedups too).
      return [...segments].sort((a, b) => b.score - a.score);
    } finally {
      // Uploaded files auto-delete after 48h regardless; this is best-effort tidy-up.
      try {
        if (file.name) await this.ai.files.delete({ name: file.name });
      } catch {
        /* ignore cleanup failures */
      }
    }
  }
}

/** Wire the real client from an API key. */
export function makeGeminiSelector(apiKey: string, opts?: GeminiSelectorOptions): GeminiMomentSelector {
  if (!apiKey) throw new Error("GEMINI_API_KEY is required for the real GeminiMomentSelector");
  return new GeminiMomentSelector(new GoogleGenAI({ apiKey }) as unknown as GenAiLike, opts);
}
