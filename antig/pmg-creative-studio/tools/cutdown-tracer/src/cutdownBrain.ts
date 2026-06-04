/**
 * GeminiCutdownBrain — the V1 cutdown "brain". One shared video call (analyze →
 * theme + beats); then per-angle text-only select + critique over the beats; then
 * planCuts. Returns one CutdownPlan per angle. Client is INJECTED (no-network tests).
 */
import { GoogleGenAI } from "@google/genai";
import type { CutdownBrain, VideoRef } from "./seams.js";
import { z } from "zod";
import { VideoAnalysisSchema, SegmentSchema, CutdownPlanSchema, type VideoAnalysis, type Segment, type Angle, type CutdownPlan, type SampleMusicTrack } from "./types.js";
import { angleGuidance, orderSegments, ANGLES, angleLabel } from "./angles.js";
import { clampSegments, planCuts } from "./planCuts.js";
import { type GenAiLike, uploadAndActivate, generateJson } from "./geminiCore.js";

const DEFAULT_MODEL = "gemini-2.5-flash";
export const DEFAULT_BPM = 120; // used when a track has no detected bpm; planCuts needs a tempo for the beat grid

const SegmentsEnvelopeSchema = z.object({ segments: z.array(SegmentSchema) });

const CritiqueEnvelopeSchema = z.object({
  description: z.string().min(1),
  segments: z.array(SegmentSchema),
});

export interface CutdownBrainOptions {
  model?: string;
  pollIntervalMs?: number;
  uploadTimeoutMs?: number;
  maxAttempts?: number;
  backoffMs?: number;
}

export class GeminiCutdownBrain implements CutdownBrain {
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

  /**
   * Bounded single self-check. Re-examines the selection against the angle + brief +
   * cut-to-cut coherence and may swap/drop/replace picks ONCE. On any failure it
   * degrades to the input selection rather than aborting the version.
   * Also produces an AI-written one-line description for the version (falls back to
   * the deterministic describe() on failure).
   */
  async critique(
    analysis: VideoAnalysis,
    angle: Angle,
    brief: string | undefined,
    selected: Segment[],
    targetSec: number,
  ): Promise<{ description: string; segments: Segment[] }> {
    const briefLine = brief ? `Brief: "${brief}". ` : "";
    const prompt =
      `Theme: ${analysis.theme}\n` +
      `Available beats: ${JSON.stringify(analysis.beats)}\n` +
      `Current ${angle} selection: ${JSON.stringify(selected)}\n\n` +
      `${briefLine}Critique this selection for coherence (do adjacent cuts relate?) and ` +
      `${angle} fit. Keep enough beats to fill roughly ${targetSec}s — don't collapse to too few. ` +
      `If it is already good, return it unchanged. Otherwise swap/drop/replace ` +
      `beats (drawn only from the available beats) to improve it. ` +
      `Also write a one-line 'description': a punchy pitch (<=15 words) for THIS version's cut. ` +
      `Return JSON { description, segments: [{ startSec, endSec, score, summary, role, why }] }.`;
    try {
      const { description, segments } = await generateJson(this.ai, {
        model: this.model,
        contents: [{ text: prompt }],
        schema: CritiqueEnvelopeSchema,
        maxAttempts: this.opts.maxAttempts,
        backoffMs: this.opts.backoffMs,
      });
      return { description, segments: orderSegments(angle, segments) };
    } catch {
      // graceful degradation — keep the selection and fall back to a deterministic pitch
      return { description: this.describe(angle, analysis, brief), segments: selected };
    }
  }

  /**
   * Full brain: probe-supplied duration clamps model timestamps; analyze once; then
   * for each fixed angle select → critique → planCuts. Returns one plan per angle.
   */
  async cutdown(
    video: VideoRef,
    track: SampleMusicTrack,
    opts: { targetSec: number; durationSec: number; humanInput?: string },
  ): Promise<CutdownPlan[]> {
    const analysis = await this.analyze(video, opts.targetSec);
    const bpm = track.bpm ?? DEFAULT_BPM;

    const plans: CutdownPlan[] = [];
    for (const angle of ANGLES) {
      const selected = await this.selectForAngle(analysis, angle, opts.humanInput, opts.targetSec);
      // playback order is set by selectForAngle/critique (per-angle); planCuts preserves it.
      const { description, segments: critiqued } = await this.critique(
        analysis, angle, opts.humanInput, selected, opts.targetSec,
      );
      const clamped = clampSegments(critiqued, opts.durationSec);
      if (clamped.length === 0) continue; // this angle yielded nothing usable → drop it
      const cuts = planCuts({ bpm, totalSec: opts.targetSec, ranked: clamped, preserveOrder: true });
      plans.push(CutdownPlanSchema.parse({ angle, description, cuts }));
    }
    if (plans.length === 0) {
      throw new Error("GeminiCutdownBrain.cutdown: no angle produced a usable plan");
    }
    return plans;
  }

  /** A short, deterministic pitch for a version (the AI 'why' lives per-cut). */
  private describe(angle: Angle, analysis: VideoAnalysis, brief?: string): string {
    const base: Record<Angle, string> = {
      narrative: "Tells it in order — setup, turn, payoff.",
      highlights: "The highest-impact moments, biggest first.",
      punchy: "Hook-dense and fast; leads with the strongest beat.",
    };
    const briefBit = brief ? ` Tuned to: "${brief}".` : "";
    return `${angleLabel(angle)} · ${base[angle]}${briefBit} (${analysis.theme})`;
  }
}

/** Wire the real client from an API key. */
export function makeCutdownBrain(apiKey: string, opts?: CutdownBrainOptions): GeminiCutdownBrain {
  if (!apiKey) throw new Error("GEMINI_API_KEY is required for the real GeminiCutdownBrain");
  return new GeminiCutdownBrain(new GoogleGenAI({ apiKey }) as unknown as GenAiLike, opts);
}
