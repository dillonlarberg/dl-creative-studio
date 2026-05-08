import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { runPhase1 } from "./phase1.js";
import { runPhase2 } from "./phase2.js";
import { resizeToTarget } from "./resize.js";
import type { TargetSpec } from "./config.js";
import { OPENAI_P2_MODEL } from "./config.js";
import type { P1Output } from "./schema.js";

export const OUT_ROOT = path.resolve(process.cwd(), "out");

export interface PipelineInput {
  genai: GoogleGenAI;
  openai: OpenAI;
  runId: string;
  source: Buffer;
  sourceMime: string;
  sourceFilename: string;
  targetSpec: TargetSpec;
}

export interface PipelineResult {
  runId: string;
  runDir: string;
  p1: P1Output;
  sourcePath: string;
  p1Path: string;
  p2CanvasPath: string;     // padded source PNG (input to model)
  p2MaskPath: string;       // mask PNG (input to model)
  p2RawPath: string;        // raw model output, canvas dims
  p2FinalPath: string;      // final cover-fit resize to exact target dims
  timings: { p1Ms: number; p2Ms: number };
  p2Model: string;
}

async function detectSourceSpec(buf: Buffer): Promise<{ w: number; h: number }> {
  const meta = await sharp(buf).metadata();
  return { w: meta.width ?? 0, h: meta.height ?? 0 };
}

export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const tStart = Date.now();
  console.log(
    `\n────── [run ${input.runId}] start ──────\n` +
      `  source:  ${input.sourceFilename} (${input.source.length} bytes, ${input.sourceMime})\n` +
      `  target:  ${input.targetSpec.label} (${input.targetSpec.w}×${input.targetSpec.h}, ${input.targetSpec.channel})`,
  );

  const runDir = path.join(OUT_ROOT, input.runId);
  await fs.mkdir(runDir, { recursive: true });

  const ext = input.sourceMime === "image/png" ? "png" : "jpg";
  const sourcePath = path.join(runDir, `source.${ext}`);
  await fs.writeFile(sourcePath, input.source);

  const sourceSpec = await detectSourceSpec(input.source);
  const sourceB64 = input.source.toString("base64");

  // ── Phase 1: vision analysis (Gemini 2.5 Pro) ──
  const p1Start = Date.now();
  const p1 = await runPhase1(input.genai, {
    sourceB64,
    sourceMime: input.sourceMime,
    sourceSpec,
    targetSpec: input.targetSpec,
  });
  const p1Ms = Date.now() - p1Start;

  const p1Path = path.join(runDir, "p1.json");
  await fs.writeFile(p1Path, JSON.stringify(p1, null, 2), "utf8");

  // ── Phase 2: image edit (OpenAI gpt-image-2 with image + binary mask) ──
  const p2Start = Date.now();
  const { imageBuffer: rawP2, paddedCanvas } = await runPhase2(input.openai, {
    p1,
    source: input.source,
    sourceSpec,
    targetSpec: input.targetSpec,
  });
  const p2Ms = Date.now() - p2Start;

  const p2CanvasPath = path.join(runDir, "p2-canvas.png");
  await fs.writeFile(p2CanvasPath, paddedCanvas.imageBuffer);
  const p2MaskPath = path.join(runDir, "p2-mask.png");
  await fs.writeFile(p2MaskPath, paddedCanvas.maskBuffer);
  const p2RawPath = path.join(runDir, "p2-raw.png");
  await fs.writeFile(p2RawPath, rawP2);

  // ── Final check: deterministic resize/crop to exact target dims ──
  const rawMeta = await sharp(rawP2).metadata();
  const upsample =
    (rawMeta.width ?? 0) < input.targetSpec.w ||
    (rawMeta.height ?? 0) < input.targetSpec.h;
  console.log(
    `[resize] ${rawMeta.width}×${rawMeta.height} → ${input.targetSpec.w}×${input.targetSpec.h} ` +
      `(cover-fit center${upsample ? ", upsample" : ", downsample"})`,
  );
  const finalBuf = await resizeToTarget(rawP2, input.targetSpec.w, input.targetSpec.h);
  const p2FinalPath = path.join(runDir, "result.png");
  await fs.writeFile(p2FinalPath, finalBuf);

  console.log(
    `────── [run ${input.runId}] done in ${Date.now() - tStart}ms ` +
      `(P1=${p1Ms}ms, P2=${p2Ms}ms) ──────\n`,
  );

  return {
    runId: input.runId,
    runDir,
    p1,
    sourcePath,
    p1Path,
    p2CanvasPath,
    p2MaskPath,
    p2RawPath,
    p2FinalPath,
    timings: { p1Ms, p2Ms },
    p2Model: OPENAI_P2_MODEL,
  };
}
