import { GoogleGenAI } from "@google/genai";
import { P1_MODEL } from "./config.js";
import { P1OutputSchema, P1_RESPONSE_SCHEMA, type P1Output } from "./schema.js";
import type { Spec } from "./promptTemplate.js";

const SYSTEM_INSTRUCTION = `You analyze ad creative images for resizing. Given a source ad image and target dimensions, return strict JSON describing the image so a downstream image-generation model can outpaint it correctly. Identify the focal subject, its position, any visible copy/text, style cues, and what should fill the new canvas regions when the image is extended. Be specific. Use normalized bbox coordinates (0-1).`;

export interface Phase1Input {
  sourceB64: string;
  sourceMime: string;
  sourceSpec: Spec;
  targetSpec: Spec;
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
  const userText = `Target dimensions: ${input.targetSpec.w}x${input.targetSpec.h}. Source dimensions: ${input.sourceSpec.w}x${input.sourceSpec.h}. Return JSON conforming to the schema.`;

  console.log(
    `[P1] calling ${P1_MODEL}: source ${input.sourceSpec.w}×${input.sourceSpec.h} → target ${input.targetSpec.w}×${input.targetSpec.h}`,
  );

  const callOnce = async (attempt: number): Promise<P1Output> => {
    const t0 = Date.now();
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
    const ms = Date.now() - t0;
    const { text } = extractJsonText(resp);
    if (!text) {
      throw new Error("P1 returned no text content");
    }
    const out = parseAndValidate(text);
    console.log(
      `[P1] OK in ${ms}ms (attempt ${attempt}): subject="${out.subjectDescription}" at ${out.subjectLocation}, copy=${out.copyRegions.length}, style=${out.styleCues.length}`,
    );
    return out;
  };

  try {
    return await callOnce(1);
  } catch (err) {
    // Retry once on validation/parse failure (Gemini ~5% malformed rate).
    const isValidation =
      err instanceof Error &&
      (err.name === "ZodError" ||
        err.message.includes("JSON") ||
        err.message.includes("parse") ||
        err.message.includes("P1 returned no text"));
    if (!isValidation) {
      console.error(`[P1] non-validation error, not retrying:`, err);
      throw err;
    }
    console.warn(`[P1] validation failure on attempt 1, retrying once: ${err.message}`);
    return await callOnce(2);
  }
}
