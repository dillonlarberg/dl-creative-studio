// Refactored from tools/resize-tracer/src/pipeline.ts for in-process orchestration:
//   - P1 is hoisted to run ONCE per batch via `runPhase1Once`
//   - P2 fans out per output via `runPhase2ForTarget`
//   - No disk I/O — all artifacts returned as Buffers
import sharp from "sharp";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { runPhase1 } from "./phase1";
import { runPhase2 } from "./phase2";
import { resizeToTarget } from "./resize";
import type { P2Quality, TargetSpec } from "./config";
import { DEFAULT_P2_QUALITY, OPENAI_P2_MODEL } from "./config";
import type { P1Output } from "./schema";
import type { Spec } from "./promptTemplate";

export interface Phase1Result {
  p1: P1Output;
  p1Ms: number;
}

export interface Phase2Result {
  resultBuffer: Buffer;  // final cover-fit at exact target dims
  rawBuffer: Buffer;     // raw model output at canvas dims
  canvasBuffer: Buffer;  // padded source PNG (input to model)
  maskBuffer: Buffer;    // mask PNG (input to model)
  p2Ms: number;
  p2Model: string;
  p2Quality: P2Quality;
  canvasWidth: number;
  canvasHeight: number;
}

/**
 * Hoisted P1: structural analysis runs ONCE per batch regardless of how many
 * target sizes the batch contains. The same P1Output threads through every
 * subsequent P2 call. Re-crop callers pass `additionalContext` to bias the
 * extensionDirective toward the user's instruction.
 *
 * `representativeTargetSpec` is used only to render the "Target dimensions"
 * line in the prompt so Gemini understands the aspect-ratio delta it is
 * extending toward. Callers should pass the first (or any) batch target.
 * The actual per-target geometry is applied later in P2.
 */
export async function runPhase1Once(
  genai: GoogleGenAI,
  source: Buffer,
  sourceMime: string,
  sourceSpec: Spec,
  representativeTargetSpec: Spec,
  additionalContext?: string,
): Promise<Phase1Result> {
  const p1Start = Date.now();
  const sourceB64 = source.toString("base64");
  const p1 = await runPhase1(genai, {
    sourceB64,
    sourceMime,
    sourceSpec,
    targetSpec: representativeTargetSpec,
    additionalContext,
  });
  return { p1, p1Ms: Date.now() - p1Start };
}

/**
 * Per-target P2: outpaints to the gen canvas, then cover-fits to exact dims.
 * Caller fans this out under `p-limit(4)` to throttle gpt-image-2.
 */
export async function runPhase2ForTarget(
  openai: OpenAI,
  source: Buffer,
  sourceSpec: Spec,
  p1: P1Output,
  targetSpec: TargetSpec,
  quality?: P2Quality,
): Promise<Phase2Result> {
  const p2Start = Date.now();
  const { imageBuffer: rawBuffer, paddedCanvas } = await runPhase2(openai, {
    p1,
    source,
    sourceSpec,
    targetSpec,
    quality,
  });
  const resultBuffer = await resizeToTarget(rawBuffer, targetSpec.w, targetSpec.h);
  return {
    resultBuffer,
    rawBuffer,
    canvasBuffer: paddedCanvas.imageBuffer,
    maskBuffer: paddedCanvas.maskBuffer,
    p2Ms: Date.now() - p2Start,
    p2Model: OPENAI_P2_MODEL,
    p2Quality: quality ?? DEFAULT_P2_QUALITY,
    canvasWidth: paddedCanvas.width,
    canvasHeight: paddedCanvas.height,
  };
}

/**
 * Probe source pixel dimensions via sharp. Pure helper used by callers to
 * derive `sourceSpec` from a buffer they've staged from Storage.
 */
export async function detectSourceSpec(buf: Buffer): Promise<Spec> {
  const meta = await sharp(buf).metadata();
  return { w: meta.width ?? 0, h: meta.height ?? 0 };
}
