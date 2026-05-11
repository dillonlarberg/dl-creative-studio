"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPhase1 = runPhase1;
const config_1 = require("./config");
const schema_1 = require("./schema");
const SYSTEM_INSTRUCTION = `You analyze ad creative images for resizing. Given a source ad image and target dimensions, return strict JSON describing the image so a downstream image-generation model can outpaint it correctly. Identify the focal subject, its position, any visible copy/text, style cues, and what should fill the new canvas regions when the image is extended. Be specific. Use normalized bbox coordinates (0-1).`;
function extractJsonText(resp) {
    const r = resp;
    if (typeof r.text === "string" && r.text.length > 0) {
        return { text: r.text };
    }
    const parts = r.candidates?.[0]?.content?.parts ?? [];
    const joined = parts
        .map((p) => p.text)
        .filter((t) => typeof t === "string" && t.length > 0)
        .join("");
    return { text: joined.length > 0 ? joined : null };
}
function parseAndValidate(jsonText) {
    const parsed = JSON.parse(jsonText);
    return schema_1.P1OutputSchema.parse(parsed);
}
async function runPhase1(ai, input) {
    const ctx = input.additionalContext?.trim();
    const ctxPrefix = ctx ? `User instruction (apply to extensionDirective): ${ctx}\n` : "";
    const userText = `${ctxPrefix}Target dimensions: ${input.targetSpec.w}x${input.targetSpec.h}. Source dimensions: ${input.sourceSpec.w}x${input.sourceSpec.h}. Return JSON conforming to the schema.`;
    const callOnce = async (_attempt) => {
        const resp = await ai.models.generateContent({
            model: config_1.P1_MODEL,
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
                responseSchema: schema_1.P1_RESPONSE_SCHEMA,
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
    }
    catch (err) {
        const isValidation = err instanceof Error &&
            (err.name === "ZodError" ||
                err.message.includes("JSON") ||
                err.message.includes("parse") ||
                err.message.includes("P1 returned no text"));
        if (!isValidation)
            throw err;
        return await callOnce(2);
    }
}
//# sourceMappingURL=phase1.js.map