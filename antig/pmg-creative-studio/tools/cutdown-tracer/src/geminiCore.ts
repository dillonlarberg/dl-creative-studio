/**
 * Shared @google/genai plumbing used by both the M0 selector (gemini.ts) and the
 * V1 cutdown brain (cutdownBrain.ts): the Files API lifecycle, response-text
 * extraction, and a validate-with-retry JSON generate. The client is INJECTED so
 * tests stay no-network/no-env.
 */
import type { z } from "zod";

export interface GenAiFile {
  name?: string;
  uri?: string;
  mimeType?: string;
  state?: unknown;
}

export interface GenAiLike {
  models: { generateContent(req: unknown): Promise<unknown> };
  files: {
    upload(req: { file: string; config?: { mimeType?: string } }): Promise<GenAiFile>;
    get(req: { name: string }): Promise<GenAiFile>;
    delete(req: { name: string }): Promise<unknown>;
  };
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Response-text extraction: resp.text, else join candidate parts (mirrors resize/phase1.ts). */
export function extractText(resp: unknown): string | null {
  const r = resp as {
    text?: string;
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  if (typeof r.text === "string" && r.text.length > 0) return r.text;
  const parts = r.candidates?.[0]?.content?.parts ?? [];
  const joined = parts
    .map((p) => p.text)
    .filter((t): t is string => typeof t === "string" && t.length > 0)
    .join("");
  return joined.length > 0 ? joined : null;
}

export interface UploadOpts {
  pollIntervalMs?: number;
  uploadTimeoutMs?: number;
}

/** Upload a local file via the Files API and poll until ACTIVE. */
export async function uploadAndActivate(
  ai: GenAiLike,
  path: string,
  opts: UploadOpts = {},
): Promise<GenAiFile> {
  const pollIntervalMs = opts.pollIntervalMs ?? 4000;
  const uploadTimeoutMs = opts.uploadTimeoutMs ?? 120_000;
  let file = await ai.files.upload({ file: path, config: { mimeType: "video/mp4" } });
  const started = Date.now();
  while (String(file.state) === "PROCESSING") {
    if (Date.now() - started > uploadTimeoutMs) {
      throw new Error(`Gemini Files API: video stuck in PROCESSING > ${uploadTimeoutMs}ms`);
    }
    await sleep(pollIntervalMs);
    file = await ai.files.get({ name: file.name as string });
  }
  if (String(file.state) !== "ACTIVE") {
    throw new Error(`Gemini Files API: file not ACTIVE (state=${String(file.state)})`);
  }
  return file;
}

export interface GenerateJsonReq<T> {
  model: string;
  contents: unknown[];
  schema: z.ZodType<T>;
  responseSchema?: unknown;
  maxAttempts?: number;
  backoffMs?: number;
}

/** generateContent → extract text → JSON.parse → Zod validate, with retry/backoff. */
export async function generateJson<T>(ai: GenAiLike, req: GenerateJsonReq<T>): Promise<T> {
  const maxAttempts = req.maxAttempts ?? 3;
  const backoffMs = req.backoffMs ?? 500;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const resp = await ai.models.generateContent({
        model: req.model,
        contents: req.contents,
        config: {
          responseMimeType: "application/json",
          ...(req.responseSchema ? { responseSchema: req.responseSchema } : {}),
        },
      });
      const text = extractText(resp);
      if (!text) throw new Error("Gemini returned no text content");
      return req.schema.parse(JSON.parse(text));
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) await sleep(backoffMs * 2 ** (attempt - 1));
    }
  }
  throw new Error(
    `generateJson failed after ${maxAttempts} attempts: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
}
