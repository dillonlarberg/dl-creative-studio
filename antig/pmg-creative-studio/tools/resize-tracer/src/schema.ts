import { z } from "zod";

// v0: single subject only — extend to array<subject> in v1.
export const P1OutputSchema = z.object({
  subjectDescription: z.string(),
  subjectLocation: z.enum([
    "upper-left",
    "upper-center",
    "upper-right",
    "center-left",
    "center",
    "center-right",
    "lower-left",
    "lower-center",
    "lower-right",
  ]),
  subjectBbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  copyRegions: z.array(
    z.object({
      text: z.string(),
      location: z.string(),
    }),
  ),
  styleCues: z.array(z.string()),
  extensionDirective: z.string(),
});

export type P1Output = z.infer<typeof P1OutputSchema>;

export const CritiqueSchema = z.object({
  runId: z.string(),
  timestamp: z.string(),
  source: z.string(),
  targetSpec: z.string(),
  p2Model: z.string(),
  p2Quality: z.enum(["medium", "high"]).optional(),
  p2OutputPath: z.string(),
  timings: z.object({
    p1Ms: z.number(),
    p2Ms: z.number(),
  }),
  critique: z.object({
    verdict: z.enum(["pass", "retry", "fail"]),
    subjectPreserved: z.enum(["yes", "partial", "no"]),
    copyIntact: z.enum(["yes", "partial", "no", "n/a"]),
    styleMatch: z.number().min(1).max(5),
    failureTags: z.array(z.string()),
    notes: z.string(),
  }),
});

export type Critique = z.infer<typeof CritiqueSchema>;

// JSON Schema (for Gemini responseSchema). Mirror of P1OutputSchema, but in
// the structured-output format the @google/genai SDK consumes.
export const P1_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    subjectDescription: { type: "string" },
    subjectLocation: {
      type: "string",
      enum: [
        "upper-left",
        "upper-center",
        "upper-right",
        "center-left",
        "center",
        "center-right",
        "lower-left",
        "lower-center",
        "lower-right",
      ],
    },
    subjectBbox: {
      type: "array",
      items: { type: "number" },
      minItems: 4,
      maxItems: 4,
    },
    copyRegions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          location: { type: "string" },
        },
        required: ["text", "location"],
      },
    },
    styleCues: {
      type: "array",
      items: { type: "string" },
    },
    extensionDirective: { type: "string" },
  },
  required: [
    "subjectDescription",
    "subjectLocation",
    "subjectBbox",
    "copyRegions",
    "styleCues",
    "extensionDirective",
  ],
} as const;
