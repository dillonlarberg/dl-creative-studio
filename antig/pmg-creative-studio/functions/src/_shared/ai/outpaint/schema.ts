// Shared outpaint primitive. NOTE: tools/resize-tracer/src/schema.ts keeps a separate prototype copy.
import { z } from "zod";

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
