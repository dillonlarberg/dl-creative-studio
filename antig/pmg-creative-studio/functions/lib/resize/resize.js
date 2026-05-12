"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resizeToTarget = resizeToTarget;
// MAINTAINED IN PARALLEL with tools/resize-tracer/src/resize.ts — see TODO(resize-pipeline-extract).
const sharp_1 = __importDefault(require("sharp"));
async function resizeToTarget(raw, w, h) {
    return (0, sharp_1.default)(raw)
        .resize({ width: w, height: h, fit: "cover", position: "center" })
        .png()
        .toBuffer();
}
//# sourceMappingURL=resize.js.map