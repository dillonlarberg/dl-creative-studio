import { describe, it, expect } from "vitest";
import { buildP2PromptForOpenAi } from "./promptTemplate.js";
import type { P1Output } from "./schema.js";
import type { PaddedCanvas } from "./canvasPrep.js";

const baseP1: P1Output = {
  subjectDescription: "person holding red coffee cup, smiling",
  subjectLocation: "center",
  subjectBbox: [0.25, 0.25, 0.5, 0.5],
  copyRegions: [],
  styleCues: ["warm sunset", "shallow DOF"],
  extensionDirective: "extend upward with sky, downward with reflective ground",
};

const fakeCanvas: PaddedCanvas = {
  imageBuffer: Buffer.alloc(0),
  maskBuffer: Buffer.alloc(0),
  width: 1088,
  height: 1920,
  sourceBox: { x: 0, y: 0.25, w: 1, h: 0.5 },
  sourceCoveragePct: 50,
  fitRatio: 1,
  emptyRegions: "above (top 25%), below (bottom 25%)",
  scaledW: 1088,
  scaledH: 960,
  offsetX: 0,
  offsetY: 480,
};

describe("buildP2PromptForOpenAi", () => {
  it("includes style cues, direction, and empty regions", () => {
    const out = buildP2PromptForOpenAi(baseP1, fakeCanvas);
    expect(out).toContain("warm sunset, shallow DOF");
    expect(out).toContain("extend upward with sky, downward with reflective ground");
    expect(out).toContain("above (top 25%), below (bottom 25%)");
  });

  it("stays under 600 chars", () => {
    const out = buildP2PromptForOpenAi(baseP1, fakeCanvas);
    expect(out.length).toBeLessThanOrEqual(600);
  });

  it("matches snapshot", () => {
    const out = buildP2PromptForOpenAi(baseP1, fakeCanvas);
    expect(out).toMatchInlineSnapshot(`
      "Extend the existing scene into the masked (transparent) regions of the canvas. The unmasked region contains an existing ad creative; preserve its style.

      Style: warm sunset, shallow DOF.
      Direction: extend upward with sky, downward with reflective ground.
      Empty regions to fill: above (top 25%), below (bottom 25%).
      The new background must seamlessly continue the existing scene — same lighting, color palette, depth of field, and mood."
    `);
  });
});
