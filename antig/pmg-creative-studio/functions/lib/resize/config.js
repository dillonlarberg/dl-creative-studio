"use strict";
// MAINTAINED IN PARALLEL with tools/resize-tracer/src/config.ts — see TODO(resize-pipeline-extract).
// Locked constants — Phase 1 (Gemini 2.5 Pro analysis) + Phase 2 (OpenAI gpt-image-2 edit).
// Phase 1 SDK: @google/genai. Phase 2 SDK: openai.
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_P2_QUALITY = exports.P2_QUALITIES = exports.OPENAI_P2_MODEL = exports.P1_MODEL = void 0;
exports.parseP2Quality = parseP2Quality;
exports.legalGenDims = legalGenDims;
exports.P1_MODEL = "gemini-2.5-pro";
exports.OPENAI_P2_MODEL = "gpt-image-2";
exports.P2_QUALITIES = ["medium", "high"];
exports.DEFAULT_P2_QUALITY = "medium";
function parseP2Quality(value) {
    return exports.P2_QUALITIES.includes(value) ? value : exports.DEFAULT_P2_QUALITY;
}
// Working-resolution constraints for gpt-image-2 (per OpenAI docs):
//   - both edges multiples of 16
//   - long:short aspect ≤ 3:1
//   - max edge ≤ 3840
//   - total pixels in [655,360, 8,294,400]
// We additionally floor the long edge at 1024 so in-band aspects keep
// a roomy baseline; sharp downsamples to exact target dims afterward.
const GEN_MIN_LONG_EDGE = 1024;
const GEN_DIM_MULTIPLE = 16;
const GEN_MIN_ASPECT = 1 / 3;
const GEN_MAX_ASPECT = 3;
function roundToMultiple(n, m) {
    return Math.max(m, Math.round(n / m) * m);
}
function legalGenDims(target) {
    if (target.w <= 0 || target.h <= 0) {
        throw new Error(`legalGenDims: invalid target ${target.w}×${target.h}`);
    }
    const aspect = Math.min(GEN_MAX_ASPECT, Math.max(GEN_MIN_ASPECT, target.w / target.h));
    let longEdge;
    let shortEdge;
    if (aspect >= 1) {
        longEdge = Math.max(target.w, GEN_MIN_LONG_EDGE);
        shortEdge = longEdge / aspect;
    }
    else {
        longEdge = Math.max(target.h, GEN_MIN_LONG_EDGE);
        shortEdge = longEdge * aspect;
    }
    const wRaw = aspect >= 1 ? longEdge : shortEdge;
    const hRaw = aspect >= 1 ? shortEdge : longEdge;
    let w = roundToMultiple(wRaw, GEN_DIM_MULTIPLE);
    let h = roundToMultiple(hRaw, GEN_DIM_MULTIPLE);
    if (Math.max(w, h) < GEN_MIN_LONG_EDGE) {
        if (w >= h) {
            w = roundToMultiple(GEN_MIN_LONG_EDGE, GEN_DIM_MULTIPLE);
            h = roundToMultiple(w / aspect, GEN_DIM_MULTIPLE);
        }
        else {
            h = roundToMultiple(GEN_MIN_LONG_EDGE, GEN_DIM_MULTIPLE);
            w = roundToMultiple(h * aspect, GEN_DIM_MULTIPLE);
        }
    }
    for (let i = 0; i < 4 && w / h > GEN_MAX_ASPECT; i++)
        h += GEN_DIM_MULTIPLE;
    for (let i = 0; i < 4 && h / w > GEN_MAX_ASPECT; i++)
        w += GEN_DIM_MULTIPLE;
    const MIN_PIXELS = 655_360;
    if (w * h < MIN_PIXELS) {
        const scale = Math.sqrt(MIN_PIXELS / (w * h));
        w = Math.ceil((w * scale) / GEN_DIM_MULTIPLE) * GEN_DIM_MULTIPLE;
        h = Math.ceil((h * scale) / GEN_DIM_MULTIPLE) * GEN_DIM_MULTIPLE;
    }
    return { w, h };
}
//# sourceMappingURL=config.js.map