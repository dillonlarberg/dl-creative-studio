// MAINTAINED IN PARALLEL with tools/resize-tracer/src/promptTemplate.ts — see TODO(resize-pipeline-extract).
import type { P1Output } from "./schema";
import type { PaddedCanvas } from "./canvasPrep";

export interface Spec {
  w: number;
  h: number;
}

export function buildP2PromptForOpenAi(p1: P1Output, canvas: PaddedCanvas): string {
  return `Extend the existing scene into the masked (transparent) regions of the canvas. The unmasked region contains an existing ad creative; preserve its style.

Style: ${p1.styleCues.join(", ")}.
Direction: ${p1.extensionDirective}.
Empty regions to fill: ${canvas.emptyRegions}.
The new background must seamlessly continue the existing scene — same lighting, color palette, depth of field, and mood.`;
}
