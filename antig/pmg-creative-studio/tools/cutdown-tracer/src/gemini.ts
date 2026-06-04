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

/** A minimal subset of the @google/genai client — just what this seam touches. Lets tests inject a fake. */
export interface GenAiLike {
  models: { generateContent(req: unknown): Promise<unknown> };
  files: {
    upload(req: { file: string; config?: { mimeType?: string } }): Promise<GenAiFile>;
    get(req: { name: string }): Promise<GenAiFile>;
    delete(req: { name: string }): Promise<unknown>;
  };
}

interface GenAiFile {
  name?: string;
  uri?: string;
  mimeType?: string;
  state?: unknown;
}

export interface GeminiSelectorOptions {
  model?: string;
  pollIntervalMs?: number;
  uploadTimeoutMs?: number;
  maxAttempts?: number;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Response-text extraction mirrors resize/phase1.ts (resp.text, else join candidate parts). */
function extractText(resp: unknown): string | null {
  const r = resp as {
    text?: string;
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  if (typeof r.text === "string" && r.text.length > 0) return r.text;
  const parts = r.candidates?.[0]?.content?.parts ?? [];
  const joined = parts
    .map((p) => p.text)
    .filter((t): t is string => typeof t === "string" && t.length > 0)
    .join("");
  return joined.length > 0 ? joined : null;
}

export class GeminiMomentSelector implements VideoMomentSelector {
  private readonly model: string;
  private readonly pollIntervalMs: number;
  private readonly uploadTimeoutMs: number;
  private readonly maxAttempts: number;

  constructor(
    private readonly ai: GenAiLike,
    opts: GeminiSelectorOptions = {},
  ) {
    this.model = opts.model ?? DEFAULT_MODEL;
    this.pollIntervalMs = opts.pollIntervalMs ?? 4000;
    this.uploadTimeoutMs = opts.uploadTimeoutMs ?? 120_000;
    this.maxAttempts = opts.maxAttempts ?? 3;
  }

  async select(video: VideoRef, opts: { budgetSec: number }): Promise<Segment[]> {
    const file = await this.uploadAndActivate(video.path);
    try {
      return await this.generateSegments(file, opts.budgetSec);
    } finally {
      // Uploaded files auto-delete after 48h regardless; this is best-effort tidy-up.
      try {
        if (file.name) await this.ai.files.delete({ name: file.name });
      } catch {
        /* ignore cleanup failures */
      }
    }
  }

  /** Upload the source and poll the Files API until it transitions to ACTIVE. */
  private async uploadAndActivate(path: string): Promise<GenAiFile> {
    let file = await this.ai.files.upload({ file: path, config: { mimeType: "video/mp4" } });
    const started = Date.now();
    while (String(file.state) === "PROCESSING") {
      if (Date.now() - started > this.uploadTimeoutMs) {
        throw new Error(`Gemini Files API: video stuck in PROCESSING > ${this.uploadTimeoutMs}ms`);
      }
      await sleep(this.pollIntervalMs);
      file = await this.ai.files.get({ name: file.name as string });
    }
    if (String(file.state) !== "ACTIVE") {
      throw new Error(`Gemini Files API: file not ACTIVE (state=${String(file.state)})`);
    }
    return file;
  }

  /** Ask Gemini for ranked segments, validating the structured output. Retries with backoff. */
  private async generateSegments(file: GenAiFile, budgetSec: number): Promise<Segment[]> {
    const prompt =
      `Identify the most engaging moments of this video for a ~${budgetSec}s short vertical reel. ` +
      `Return JSON { segments: [{ startSec, endSec, score }] } where score is 0-1 ` +
      `(higher = more engaging), ordered by score descending. ` +
      `Prefer distinct, non-overlapping moments; startSec/endSec are seconds into the source.`;

    let lastErr: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const resp = await this.ai.models.generateContent({
          model: this.model,
          contents: [
            { fileData: { fileUri: file.uri as string, mimeType: file.mimeType as string } },
            { text: prompt },
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: SEGMENTS_RESPONSE_SCHEMA,
          },
        });
        const text = extractText(resp);
        if (!text) throw new Error("Gemini returned no text content");
        const { segments } = SegmentsEnvelopeSchema.parse(JSON.parse(text));
        // Sort by score descending so callers can rely on rank order (planCuts re-dedups too).
        return [...segments].sort((a, b) => b.score - a.score);
      } catch (err) {
        lastErr = err;
        if (attempt < this.maxAttempts) {
          await sleep(500 * 2 ** (attempt - 1)); // 500ms, 1s, … exponential backoff
        }
      }
    }
    throw new Error(
      `GeminiMomentSelector failed after ${this.maxAttempts} attempts: ` +
        `${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
    );
  }
}

/** Wire the real client from an API key. */
export function makeGeminiSelector(apiKey: string, opts?: GeminiSelectorOptions): GeminiMomentSelector {
  if (!apiKey) throw new Error("GEMINI_API_KEY is required for the real GeminiMomentSelector");
  return new GeminiMomentSelector(new GoogleGenAI({ apiKey }) as unknown as GenAiLike, opts);
}
