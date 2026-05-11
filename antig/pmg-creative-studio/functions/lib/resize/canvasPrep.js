"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prepPaddedCanvas = prepPaddedCanvas;
// MAINTAINED IN PARALLEL with tools/resize-tracer/src/canvasPrep.ts — see TODO(resize-pipeline-extract).
const sharp_1 = __importDefault(require("sharp"));
const config_1 = require("./config");
function describeEmptyRegions(box) {
    const parts = [];
    if (box.y > 0.02)
        parts.push(`above (top ${(box.y * 100).toFixed(0)}%)`);
    const bottomGap = 1 - (box.y + box.h);
    if (bottomGap > 0.02)
        parts.push(`below (bottom ${(bottomGap * 100).toFixed(0)}%)`);
    if (box.x > 0.02)
        parts.push(`left (left ${(box.x * 100).toFixed(0)}%)`);
    const rightGap = 1 - (box.x + box.w);
    if (rightGap > 0.02)
        parts.push(`right (right ${(rightGap * 100).toFixed(0)}%)`);
    return parts.length === 0 ? "no empty regions (source already fills canvas)" : parts.join(", ");
}
async function prepPaddedCanvas(source, sourceSpec, targetSpec) {
    const { w: canvasW, h: canvasH } = (0, config_1.legalGenDims)(targetSpec);
    const widthRatio = canvasW / sourceSpec.w;
    const heightRatio = canvasH / sourceSpec.h;
    const fitRatio = Math.min(widthRatio, heightRatio);
    const scaledW = Math.max(1, Math.round(sourceSpec.w * fitRatio));
    const scaledH = Math.max(1, Math.round(sourceSpec.h * fitRatio));
    const offsetX = Math.round((canvasW - scaledW) / 2);
    const offsetY = Math.round((canvasH - scaledH) / 2);
    const scaled = await (0, sharp_1.default)(source)
        .resize(scaledW, scaledH)
        .ensureAlpha()
        .png()
        .toBuffer();
    const imageBuffer = await (0, sharp_1.default)({
        create: {
            width: canvasW,
            height: canvasH,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
    })
        .composite([{ input: scaled, top: offsetY, left: offsetX }])
        .png()
        .toBuffer();
    const whiteRect = await (0, sharp_1.default)({
        create: {
            width: scaledW,
            height: scaledH,
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 1 },
        },
    })
        .png()
        .toBuffer();
    const maskBuffer = await (0, sharp_1.default)({
        create: {
            width: canvasW,
            height: canvasH,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
    })
        .composite([{ input: whiteRect, top: offsetY, left: offsetX }])
        .png()
        .toBuffer();
    const sourceBox = {
        x: offsetX / canvasW,
        y: offsetY / canvasH,
        w: scaledW / canvasW,
        h: scaledH / canvasH,
    };
    return {
        imageBuffer,
        maskBuffer,
        width: canvasW,
        height: canvasH,
        sourceBox,
        sourceCoveragePct: Math.round(sourceBox.w * sourceBox.h * 100),
        fitRatio,
        emptyRegions: describeEmptyRegions(sourceBox),
        scaledW,
        scaledH,
        offsetX,
        offsetY,
    };
}
//# sourceMappingURL=canvasPrep.js.map