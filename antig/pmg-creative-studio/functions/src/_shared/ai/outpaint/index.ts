/**
 * Shared outpaint capability — lifted out of `resize/` (resolves the former
 * TODO(resize-pipeline-extract) coupling) so any caller can pad/extend an image
 * without dragging in ad-resizing concerns (Firestore batches, Storage staging,
 * SSRF, the callable contract).
 *
 * The interface is deliberately split into two phases:
 *   - `runPhase1Once`     — structural analysis (Gemini), run ONCE per source
 *   - `runPhase2ForTarget` — outpaint + cover-fit (OpenAI), run PER target dim
 *
 * Both take injected AI clients and operate purely on Buffers + Specs, returning
 * Buffers. The caller owns its own fan-out / persistence (ad-resizing fans out
 * under p-limit + Firestore; video-stitch composes its own pad-crop flow).
 */
export {
  runPhase1Once,
  runPhase2ForTarget,
  detectSourceSpec,
  type Phase1Result,
  type Phase2Result,
} from "./pipeline";
export { runPhase1, type Phase1Input } from "./phase1";
export { runPhase2, type Phase2Input, type Phase2Output } from "./phase2";
export { prepPaddedCanvas, type PaddedCanvas } from "./canvasPrep";
export { buildP2PromptForOpenAi, type Spec } from "./promptTemplate";
export { resizeToTarget } from "./resize";
export {
  P1OutputSchema,
  P1_RESPONSE_SCHEMA,
  type P1Output,
} from "./schema";
export {
  legalGenDims,
  parseP2Quality,
  P1_MODEL,
  OPENAI_P2_MODEL,
  P2_QUALITIES,
  DEFAULT_P2_QUALITY,
  type P2Quality,
  type TargetSpec,
  type Channel,
} from "./config";
