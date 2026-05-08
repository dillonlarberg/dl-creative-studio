import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import OpenAI, { toFile } from "openai";
import sharp from "sharp";
import { DEFAULT_P2_QUALITY, OPENAI_P2_MODEL, legalGenDims, TARGET_PRESETS } from "../src/config.js";
import { prepPaddedCanvas } from "../src/canvasPrep.js";

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const fixturesDir = path.resolve(process.cwd(), "fixtures");
  const files = fs
    .readdirSync(fixturesDir)
    .filter((f) => /\.(jpe?g|png)$/i.test(f))
    .sort();
  if (files.length === 0) {
    throw new Error(`No fixtures found in ${fixturesDir} — drop a .jpg or .png in there.`);
  }
  const first = files[0]!;
  const srcPath = path.join(fixturesDir, first);
  console.log(`[verify-p2-openai] using fixture: ${first}`);

  const srcBuf = fs.readFileSync(srcPath);
  const meta = await sharp(srcBuf).metadata();
  const sourceSpec = { w: meta.width ?? 0, h: meta.height ?? 0 };
  if (!sourceSpec.w || !sourceSpec.h) {
    throw new Error(`Could not read source dimensions from ${first}`);
  }
  console.log(`[verify-p2-openai] source: ${sourceSpec.w}×${sourceSpec.h}`);

  // Smoke target: 9:16 social.
  const targetSpec = TARGET_PRESETS["social-9x16"];
  const dims = legalGenDims(targetSpec);
  console.log(`[verify-p2-openai] canvas dims: ${dims.w}×${dims.h}`);

  const padded = await prepPaddedCanvas(srcBuf, sourceSpec, targetSpec);

  const client = new OpenAI({ apiKey });

  const t0 = Date.now();
  let resp;
  try {
    const editArgs: unknown = {
      model: OPENAI_P2_MODEL,
      image: await toFile(padded.imageBuffer, "source.png", { type: "image/png" }),
      mask: await toFile(padded.maskBuffer, "mask.png", { type: "image/png" }),
      prompt:
        "Extend the existing scene into the masked (transparent) regions. Match the existing lighting, color palette, and depth of field.",
      size: `${padded.width}x${padded.height}`,
      quality: DEFAULT_P2_QUALITY,
      n: 1,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resp = await client.images.edit(editArgs as any);
  } catch (err) {
    const status = (err as { status?: number })?.status;
    const msg = err instanceof Error ? err.message : String(err);
    if (status === 403 && /verified|organization/i.test(msg)) {
      console.error(
        `[verify-p2-openai] 403 organization not verified. Verify at https://platform.openai.com/settings/organization/general`,
      );
    } else if (status === 429) {
      console.error(`[verify-p2-openai] 429 rate-limited: ${msg}`);
    } else if (status === 400 && /content_policy|safety/i.test(msg)) {
      console.error(`[verify-p2-openai] 400 content policy block: ${msg}`);
    } else {
      console.error(`[verify-p2-openai] error (status=${status ?? "?"}): ${msg}`);
    }
    process.exit(1);
  }
  console.log(`[verify-p2-openai] response in ${Date.now() - t0}ms`);

  const b64 = resp.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("[verify-p2-openai] response had no b64_json");
  }
  const outPath = path.resolve(process.cwd(), "scripts/_smoke-out.png");
  fs.writeFileSync(outPath, Buffer.from(b64, "base64"));
  console.log(`[verify-p2-openai] wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
