import { describe, it, expect } from "vitest";
import { P1OutputSchema, CritiqueSchema } from "./schema.js";

describe("P1OutputSchema", () => {
  it("accepts a valid P1 object", () => {
    const result = P1OutputSchema.safeParse({
      subjectDescription: "person holding cup",
      subjectLocation: "center",
      subjectBbox: [0.1, 0.2, 0.3, 0.4],
      copyRegions: [{ text: "Hi", location: "upper-left" }],
      styleCues: ["warm"],
      extensionDirective: "extend up and down",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing required field", () => {
    const result = P1OutputSchema.safeParse({
      subjectDescription: "x",
      subjectLocation: "center",
      // subjectBbox missing
      copyRegions: [],
      styleCues: [],
      extensionDirective: "x",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid subjectLocation enum", () => {
    const result = P1OutputSchema.safeParse({
      subjectDescription: "x",
      subjectLocation: "middle-of-nowhere",
      subjectBbox: [0, 0, 1, 1],
      copyRegions: [],
      styleCues: [],
      extensionDirective: "x",
    });
    expect(result.success).toBe(false);
  });
});

describe("CritiqueSchema", () => {
  it("accepts a valid critique", () => {
    const result = CritiqueSchema.safeParse({
      runId: "run-1",
      timestamp: "2026-05-07T15:42:08Z",
      source: "creative-01.jpg",
      targetSpec: "9x16",
      p2Model: "gemini-2.5-flash-image",
      p2OutputPath: "out/run-1/result.png",
      timings: { p1Ms: 1000, p2Ms: 5000 },
      critique: {
        verdict: "pass",
        subjectPreserved: "yes",
        copyIntact: "n/a",
        styleMatch: 4,
        failureTags: [],
        notes: "looks good",
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects styleMatch out of range", () => {
    const result = CritiqueSchema.safeParse({
      runId: "r",
      timestamp: "t",
      source: "s",
      targetSpec: "9x16",
      p2Model: "m",
      p2OutputPath: "p",
      timings: { p1Ms: 0, p2Ms: 0 },
      critique: {
        verdict: "pass",
        subjectPreserved: "yes",
        copyIntact: "yes",
        styleMatch: 10,
        failureTags: [],
        notes: "",
      },
    });
    expect(result.success).toBe(false);
  });
});
