import OpenAI, { toFile } from "openai";
import { OPENAI_P2_MODEL } from "./config.js";
import { prepPaddedCanvas, type PaddedCanvas } from "./canvasPrep.js";
import { buildP2PromptForOpenAi, type Spec } from "./promptTemplate.js";
import type { P1Output } from "./schema.js";

export interface Phase2Input {
  p1: P1Output;
  source: Buffer;
  sourceSpec: Spec;
  targetSpec: Spec;
}

export interface Phase2Output {
  imageBuffer: Buffer; // raw model output at canvas dims
  paddedCanvas: PaddedCanvas;
}

interface OpenAiImagesEditResponse {
  data?: Array<{ b64_json?: string }>;
}

interface OpenAiClientLike {
  images: {
    edit: (req: unknown) => Promise<OpenAiImagesEditResponse>;
  };
}

export async function runPhase2(
  client: OpenAI | OpenAiClientLike,
  input: Phase2Input,
): Promise<Phase2Output> {
  const padded = await prepPaddedCanvas(input.source, input.sourceSpec, input.targetSpec);
  const fitDesc =
    padded.fitRatio > 1.01
      ? `upscale ${padded.fitRatio.toFixed(2)}×`
      : padded.fitRatio < 0.99
        ? `shrink ${padded.fitRatio.toFixed(2)}×`
        : "native size";
  console.log(
    `[P2 canvas] ${padded.width}×${padded.height}, source ${fitDesc}, covers ${padded.sourceCoveragePct}% (empty: ${padded.emptyRegions})`,
  );

  const prompt = buildP2PromptForOpenAi(input.p1, padded);
  console.log(
    `[P2] calling ${OPENAI_P2_MODEL} → ${padded.width}×${padded.height} (prompt=${prompt.length} chars)`,
  );

  const t0 = Date.now();
  let resp: OpenAiImagesEditResponse;
  try {
    // The OpenAI SDK's `size` field is currently typed for gpt-image-1's
    // fixed-size enum. gpt-image-2 accepts arbitrary divisible-by-16 sizes
    // within [1:3, 3:1], so we cast through `unknown`.
    const editArgs: unknown = {
      model: OPENAI_P2_MODEL,
      image: await toFile(padded.imageBuffer, "source.png", { type: "image/png" }),
      mask: await toFile(padded.maskBuffer, "mask.png", { type: "image/png" }),
      prompt,
      size: `${padded.width}x${padded.height}`,
      quality: "high",
      n: 1,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resp = await client.images.edit(editArgs as any);
  } catch (err) {
    const status = (err as { status?: number })?.status;
    const code = (err as { code?: string })?.code;
    const msg = err instanceof Error ? err.message : String(err);
    if (status === 403 && /organization_must_be_verified|verified/i.test(msg)) {
      throw new Error(
        `P2 organization verification required: verify at platform.openai.com/settings/organization/general before using ${OPENAI_P2_MODEL}. Original: ${msg}`,
      );
    }
    if (status === 429) {
      console.error(`[P2] rate limit (429): ${msg}`);
      throw err;
    }
    if (status === 400 && /content_policy|safety/i.test(msg)) {
      console.error(`[P2] content policy block (400): ${msg}`);
      throw err;
    }
    console.error(`[P2] OpenAI error (status=${status ?? "?"}, code=${code ?? "?"}): ${msg}`);
    throw err;
  }
  console.log(`[P2] response received in ${Date.now() - t0}ms`);

  const data = resp.data?.[0];
  if (!data?.b64_json) {
    throw new Error("P2 returned no image (no b64_json in response)");
  }
  const buf = Buffer.from(data.b64_json, "base64");
  console.log(`[P2] image OK: ${buf.length} bytes`);
  return { imageBuffer: buf, paddedCanvas: padded };
}
