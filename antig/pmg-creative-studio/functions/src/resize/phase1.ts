// MAINTAINED IN PARALLEL with tools/resize-tracer/src/phase1.ts — see TODO(resize-pipeline-extract).
import { GoogleGenAI } from "@google/genai";
import { P1_MODEL } from "./config";
import { P1OutputSchema, P1_RESPONSE_SCHEMA, type P1Output } from "./schema";
import type { Spec } from "./promptTemplate";

const SYSTEM_INSTRUCTION = `You analyze ad creative images for resizing. Given a source ad image and target dimensions, return strict JSON describing the image so a downstream image-generation model can outpaint it correctly. Identify the focal subject, its position, any visible copy/text, style cues, and what should fill the new canvas regions when the image is extended. Be specific. Use normalized bbox coordinates (0-1).`;

export interface Phase1Input {
  sourceB64: string;
  sourceMime: string;
  sourceSpec: Spec;
  targetSpec: Spec;
  /**
   * Optional user-supplied re-crop instruction. Prepended to the prompt so the
   * Phase-1 analysis biases its extensionDirective toward the user's intent.
   * Undefined on first-run (initial batch); set on re-crop calls.
   */
  additionalContext?: string;
}

interface ParsedCandidate {
  text: string | null;
}

function extractJsonText(resp: unknown): ParsedCandidate {
  const r = resp as {
    text?: string;
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  if (typeof r.text === "string" && r.text.length > 0) {
    return { text: r.text };
  }
  const parts = r.candidates?.[0]?.content?.parts ?? [];
  const joined = parts
    .map((p) => p.text)
    .filter((t): t is string => typeof t === "string" && t.length > 0)
    .join("");
  return { text: joined.length > 0 ? joined : null };
}

function parseAndValidate(jsonText: string): P1Output {
  const parsed: unknown = JSON.parse(jsonText);
  return P1OutputSchema.parse(parsed);
}

export async function runPhase1(
  ai: GoogleGenAI,
  input: Phase1Input,
): Promise<P1Output> {
  const ctx = input.additionalContext?.trim();
  const ctxPrefix = ctx ? `User instruction (apply to extensionDirective): ${ctx}\n` : "";
  const userText = `${ctxPrefix}Target dimensions: ${input.targetSpec.w}x${input.targetSpec.h}. Source dimensions: ${input.sourceSpec.w}x${input.sourceSpec.h}. Return JSON conforming to the schema.`;

  const callOnce = async (_attempt: number): Promise<P1Output> => {
    const resp = await ai.models.generateContent({
      model: P1_MODEL,
      contents: [
        { text: userText },
        {
          inlineData: {
            mimeType: input.sourceMime,
            data: input.sourceB64,
          },
        },
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: P1_RESPONSE_SCHEMA,
      },
    });
    const { text } = extractJsonText(resp);
    if (!text) {
      throw new Error("P1 returned no text content");
    }
    return parseAndValidate(text);
  };

  try {
    return await callOnce(1);
  } catch (err) {
    const isValidation =
      err instanceof Error &&
      (err.name === "ZodError" ||
        err.message.includes("JSON") ||
        err.message.includes("parse") ||
        err.message.includes("P1 returned no text"));
    if (!isValidation) throw err;
    return await callOnce(2);
  }
}
