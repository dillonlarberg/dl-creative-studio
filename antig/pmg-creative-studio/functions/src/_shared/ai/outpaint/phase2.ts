// Shared outpaint primitive. NOTE: tools/resize-tracer/src/phase2.ts keeps a separate prototype copy.
import OpenAI, { toFile } from "openai";
import { DEFAULT_P2_QUALITY, OPENAI_P2_MODEL, type P2Quality } from "./config";
import { prepPaddedCanvas, type PaddedCanvas } from "./canvasPrep";
import { buildP2PromptForOpenAi, type Spec } from "./promptTemplate";
import type { P1Output } from "./schema";

export interface Phase2Input {
  p1: P1Output;
  source: Buffer;
  sourceSpec: Spec;
  targetSpec: Spec;
  quality?: P2Quality;
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

  const prompt = buildP2PromptForOpenAi(input.p1, padded);
  const quality = input.quality ?? DEFAULT_P2_QUALITY;

  let resp: OpenAiImagesEditResponse;
  try {
    const editArgs: unknown = {
      model: OPENAI_P2_MODEL,
      image: await toFile(padded.imageBuffer, "source.png", { type: "image/png" }),
      mask: await toFile(padded.maskBuffer, "mask.png", { type: "image/png" }),
      prompt,
      size: `${padded.width}x${padded.height}`,
      quality,
      n: 1,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resp = await client.images.edit(editArgs as any);
  } catch (err) {
    const status = (err as { status?: number })?.status;
    const msg = err instanceof Error ? err.message : String(err);
    if (status === 403 && /organization_must_be_verified|verified/i.test(msg)) {
      throw new Error(
        `P2 organization verification required: verify at platform.openai.com/settings/organization/general before using ${OPENAI_P2_MODEL}. Original: ${msg}`,
      );
    }
    throw err;
  }

  const data = resp.data?.[0];
  if (!data?.b64_json) {
    throw new Error("P2 returned no image (no b64_json in response)");
  }
  const buf = Buffer.from(data.b64_json, "base64");
  return { imageBuffer: buf, paddedCanvas: padded };
}
