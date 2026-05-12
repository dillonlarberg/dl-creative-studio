"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPhase2 = runPhase2;
// MAINTAINED IN PARALLEL with tools/resize-tracer/src/phase2.ts — see TODO(resize-pipeline-extract).
const openai_1 = require("openai");
const config_1 = require("./config");
const canvasPrep_1 = require("./canvasPrep");
const promptTemplate_1 = require("./promptTemplate");
async function runPhase2(client, input) {
    const padded = await (0, canvasPrep_1.prepPaddedCanvas)(input.source, input.sourceSpec, input.targetSpec);
    const prompt = (0, promptTemplate_1.buildP2PromptForOpenAi)(input.p1, padded);
    const quality = input.quality ?? config_1.DEFAULT_P2_QUALITY;
    let resp;
    try {
        const editArgs = {
            model: config_1.OPENAI_P2_MODEL,
            image: await (0, openai_1.toFile)(padded.imageBuffer, "source.png", { type: "image/png" }),
            mask: await (0, openai_1.toFile)(padded.maskBuffer, "mask.png", { type: "image/png" }),
            prompt,
            size: `${padded.width}x${padded.height}`,
            quality,
            n: 1,
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resp = await client.images.edit(editArgs);
    }
    catch (err) {
        const status = err?.status;
        const msg = err instanceof Error ? err.message : String(err);
        if (status === 403 && /organization_must_be_verified|verified/i.test(msg)) {
            throw new Error(`P2 organization verification required: verify at platform.openai.com/settings/organization/general before using ${config_1.OPENAI_P2_MODEL}. Original: ${msg}`);
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
//# sourceMappingURL=phase2.js.map