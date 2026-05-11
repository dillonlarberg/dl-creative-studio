"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPhase1Once = runPhase1Once;
exports.runPhase2ForTarget = runPhase2ForTarget;
exports.detectSourceSpec = detectSourceSpec;
// Refactored from tools/resize-tracer/src/pipeline.ts for in-process orchestration:
//   - P1 is hoisted to run ONCE per batch via `runPhase1Once`
//   - P2 fans out per output via `runPhase2ForTarget`
//   - No disk I/O — all artifacts returned as Buffers
const sharp_1 = __importDefault(require("sharp"));
const phase1_1 = require("./phase1");
const phase2_1 = require("./phase2");
const resize_1 = require("./resize");
const config_1 = require("./config");
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
async function runPhase1Once(genai, source, sourceMime, sourceSpec, representativeTargetSpec, additionalContext) {
    const p1Start = Date.now();
    const sourceB64 = source.toString("base64");
    const p1 = await (0, phase1_1.runPhase1)(genai, {
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
async function runPhase2ForTarget(openai, source, sourceSpec, p1, targetSpec, quality) {
    const p2Start = Date.now();
    const { imageBuffer: rawBuffer, paddedCanvas } = await (0, phase2_1.runPhase2)(openai, {
        p1,
        source,
        sourceSpec,
        targetSpec,
        quality,
    });
    const resultBuffer = await (0, resize_1.resizeToTarget)(rawBuffer, targetSpec.w, targetSpec.h);
    return {
        resultBuffer,
        rawBuffer,
        canvasBuffer: paddedCanvas.imageBuffer,
        maskBuffer: paddedCanvas.maskBuffer,
        p2Ms: Date.now() - p2Start,
        p2Model: config_1.OPENAI_P2_MODEL,
        p2Quality: quality ?? config_1.DEFAULT_P2_QUALITY,
        canvasWidth: paddedCanvas.width,
        canvasHeight: paddedCanvas.height,
    };
}
/**
 * Probe source pixel dimensions via sharp. Pure helper used by callers to
 * derive `sourceSpec` from a buffer they've staged from Storage.
 */
async function detectSourceSpec(buf) {
    const meta = await (0, sharp_1.default)(buf).metadata();
    return { w: meta.width ?? 0, h: meta.height ?? 0 };
}
//# sourceMappingURL=pipeline.js.map