"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeVideoForCutdowns = void 0;
const functions = __importStar(require("firebase-functions"));
const generative_ai_1 = require("@google/generative-ai");
const axios_1 = __importDefault(require("axios"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const fs = __importStar(require("fs"));
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const ffmpeg_static_1 = __importDefault(require("ffmpeg-static"));
if (ffmpeg_static_1.default) {
    fluent_ffmpeg_1.default.setFfmpegPath(ffmpeg_static_1.default);
}
// Initialize Gemini with the API key from secrets
// firebase functions:secrets:set GEMINI_API_KEY
exports.analyzeVideoForCutdowns = functions
    .runWith({
    secrets: ["GEMINI_API_KEY"],
    timeoutSeconds: 540,
    memory: "2GB"
})
    .https.onCall(async (data, context) => {
    // Initialize Gemini with the API key from secrets (must be inside handler)
    const genAI = new generative_ai_1.GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
    // 1. Validate inputs
    const { videoUrl, targetLengths, model: requestedModel } = data;
    if (!videoUrl || !targetLengths) {
        throw new functions.https.HttpsError("invalid-argument", "Missing videoUrl or targetLengths.");
    }
    const tempDir = os.tmpdir();
    const inputPath = path.join(tempDir, `analyze_in_${Date.now()}.mp4`);
    const previewPath = path.join(tempDir, `analyze_preview_${Date.now()}.mp4`);
    try {
        functions.logger.info(`Starting Gemini analysis for ${videoUrl} using model ${requestedModel || 'gemini-3-flash-preview'}`);
        // 2. Download the video via stream to save memory (avoiding arraybuffer in JS heap)
        const writer = fs.createWriteStream(inputPath);
        const streamResponse = await axios_1.default.get(videoUrl, { responseType: 'stream' });
        streamResponse.data.pipe(writer);
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
        // 3. Downsample to save memory (Convert to 360p, low bitrate)
        // Gemini doesn't need 4K/1080p to understand narrative or audio
        functions.logger.info(`Generating low-res preview for ${videoUrl}...`);
        await new Promise((resolve, reject) => {
            (0, fluent_ffmpeg_1.default)(inputPath)
                .size('640x?')
                .videoBitrate('1000k')
                .audioBitrate('96k')
                .format('mp4')
                .output(previewPath)
                .on('end', resolve)
                .on('error', reject)
                .run();
        });
        const videoBase64 = fs.readFileSync(previewPath).toString('base64');
        // 3. Setup Gemini Model
        const modelName = requestedModel || "gemini-3-flash-preview";
        const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction: `You are a narrative-driven video editor. Your priority is to ensure the audio track makes complete sense.
        
        CRITICAL: If the video contains speech (voiceover, dialogue, or interview), the audio track is the MASTER TRACK. All cuts MUST occur during natural silences or the end of a complete thought/sentence. NEVER cut mid-word, mid-phrase, or while someone is visibly still speaking.
        
        If there is no speech, prioritize visual impact and rhythmic energy.`,
        });
        const generationConfig = {
            temperature: 0.1, // Minimal randomness for strict JSON schema compliance
            topP: 0.95,
            topK: 64,
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
            responseSchema: {
                type: generative_ai_1.SchemaType.OBJECT,
                properties: {
                    recommendations: {
                        type: generative_ai_1.SchemaType.ARRAY,
                        items: {
                            type: generative_ai_1.SchemaType.OBJECT,
                            properties: {
                                length: { type: generative_ai_1.SchemaType.NUMBER },
                                options: {
                                    type: generative_ai_1.SchemaType.ARRAY,
                                    items: {
                                        type: generative_ai_1.SchemaType.OBJECT,
                                        properties: {
                                            id: { type: generative_ai_1.SchemaType.NUMBER },
                                            reason: { type: generative_ai_1.SchemaType.STRING },
                                            segments: {
                                                type: generative_ai_1.SchemaType.ARRAY,
                                                items: {
                                                    type: generative_ai_1.SchemaType.OBJECT,
                                                    properties: {
                                                        start: { type: generative_ai_1.SchemaType.STRING },
                                                        end: { type: generative_ai_1.SchemaType.STRING }
                                                    },
                                                    required: ["start", "end"]
                                                }
                                            }
                                        },
                                        required: ["id", "reason", "segments"]
                                    }
                                }
                            },
                            required: ["length", "options"]
                        }
                    }
                },
                required: ["recommendations"]
            }
        };
        const prompt = `Your mission is to create exactly 3 DISTINCT cutdown options for EACH of these target durations: ${targetLengths.join(", ")} seconds.

    ═══════════════════════════════════════
    🚨 AUDIO-FIRST EDITING RULES 🚨
    ═══════════════════════════════════════
    - Watch/Listen to the whole video. If there is a voiceover or dialogue, the narrative MUST be the driver.
    - DO NOT "lead the witness" with forced structures like hooks or montages. Simply find the 3 most compelling ways to tell a short story using this footage.
    - Each segment's start and end times MUST align with natural pauses in speech. It is better to have a slightly shorter clip than to cut someone off mid-sentence.
    - If no speech is present, focus on the visual motion and musical beats.
    
    ═══════════════════════════════════════
    STITCHING RULES
    ═══════════════════════════════════════
    - A cutdown is a sequence of 1-5 segments pulled from the video. 
    - Jump around to find the best moments. Do not just take one long 30s chunk unless it is a perfect performance.
    - 🚨 FOR 6s: Often a single continuous 6s shot is much better than multiple cuts, especially if it contains a complete and compelling thought. If you choose 1 segment, ensure it is the peak of the narrative.
    - The SUM of the segments must equal EXACTLY the target length.
    - Example for 6s: [{"start":"00:00:10","end":"00:00:16"}] (6s total).

    ═══════════════════════════════════════
    VERIFICATION CHECK
    ═══════════════════════════════════════
    - Verify that EVERY cutdown ends on a natural "out" point (end of a word, end of a thought). 
    - If a cut lands in the middle of a syllable, move it! The timing MUST be precise to the millisecond.
    ═══════════════════════════════════════
    JSON VALIDATION
    ═══════════════════════════════════════
    - You must return a complete, un-truncated, valid JSON object.
    - No markdown commentary or extra text.
    - If you are running out of space, prioritize returning the JSON structure over long reasonings.
    
    RETURN VALID JSON following requested schema.`;
        // 4. Call Gemini with retry logic
        let result;
        let lastError;
        const maxRetries = 3;
        for (let i = 0; i < maxRetries; i++) {
            try {
                result = await model.generateContent({
                    contents: [{
                            role: "user",
                            parts: [
                                { inlineData: { mimeType: "video/mp4", data: videoBase64 } },
                                { text: prompt }
                            ]
                        }],
                    generationConfig,
                });
                break; // Success!
            }
            catch (err) {
                lastError = err;
                const status = err.status || (err.response ? err.response.status : null);
                if ((status === 429 || status === 503) && i < maxRetries - 1) {
                    const delay = (i + 1) * 5000; // 5s, 10s prefix
                    functions.logger.warn(`Gemini busy/quota hit (attempt ${i + 1}/${maxRetries}). Retrying in ${delay}ms...`);
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }
                throw err; // Stop for other errors or if out of retries
            }
        }
        if (!result)
            throw lastError;
        const text = result.response.text();
        functions.logger.info("Gemini Raw Response Received, parsing...");
        try {
            // Basic cleaning in case the model wraps in markdown blocks despite config
            let cleaned = text.trim();
            if (cleaned.startsWith("```json"))
                cleaned = cleaned.replace(/^```json/, "").replace(/```$/, "");
            else if (cleaned.startsWith("```"))
                cleaned = cleaned.replace(/^```/, "").replace(/```$/, "");
            const parsed = JSON.parse(cleaned.trim());
            return {
                status: "success",
                recommendations: parsed.recommendations
            };
        }
        catch (parseErr) {
            functions.logger.error("JSON Parse Failed", { text, error: parseErr.message });
            throw new Error(`JSON Parsing failed: ${parseErr.message}. Position ${parseErr.at || 'N/A'}`);
        }
    }
    catch (err) {
        functions.logger.error("Gemini Video Analysis Failed", err);
        throw new functions.https.HttpsError("internal", `Gemini Analysis Failed: ${err.message}`);
    }
});
//# sourceMappingURL=ai.js.map