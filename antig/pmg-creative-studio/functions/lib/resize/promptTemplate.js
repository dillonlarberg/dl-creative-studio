"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildP2PromptForOpenAi = buildP2PromptForOpenAi;
function buildP2PromptForOpenAi(p1, canvas) {
    return `Extend the existing scene into the masked (transparent) regions of the canvas. The unmasked region contains an existing ad creative; preserve its style.

Style: ${p1.styleCues.join(", ")}.
Direction: ${p1.extensionDirective}.
Empty regions to fill: ${canvas.emptyRegions}.
The new background must seamlessly continue the existing scene — same lighting, color palette, depth of field, and mood.`;
}
//# sourceMappingURL=promptTemplate.js.map