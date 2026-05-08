import type { P1Output } from "./schema.js";
import type { PaddedCanvas } from "./canvasPrep.js";

export interface Spec {
  w: number;
  h: number;
}

/**
 * Phase 2 prompt for OpenAI gpt-image-2 `images.edit`.
 *
 * Short and content-focused. The mask already tells the model exactly
 * where to paint (transparent regions) and where to preserve (opaque
 * regions), so the prompt's job is to describe what should appear in the
 * masked area, NOT to repeat layout rules. Compare with the legacy
 * Nano-Banana prompt which had to litigate every pixel via text.
 */
export function buildP2PromptForOpenAi(p1: P1Output, canvas: PaddedCanvas): string {
  return `Extend the existing scene into the masked (transparent) regions of the canvas. The unmasked region contains an existing ad creative; preserve its style.

Style: ${p1.styleCues.join(", ")}.
Direction: ${p1.extensionDirective}.
Empty regions to fill: ${canvas.emptyRegions}.
The new background must seamlessly continue the existing scene — same lighting, color palette, depth of field, and mood.`;
}
