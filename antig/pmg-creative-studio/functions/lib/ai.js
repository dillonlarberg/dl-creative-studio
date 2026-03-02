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
// Initialize Gemini with the API key from secrets
// firebase functions:secrets:set GEMINI_API_KEY
exports.analyzeVideoForCutdowns = functions
    .runWith({
    secrets: ["GEMINI_API_KEY"],
    timeoutSeconds: 540,
    memory: "1GB"
})
    .https.onCall(async (data, context) => {
    // Initialize Gemini with the API key from secrets (must be inside handler)
    const genAI = new generative_ai_1.GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
    // 1. Validate inputs
    const { videoUrl, targetLengths, model: requestedModel } = data;
    if (!videoUrl || !targetLengths) {
        throw new functions.https.HttpsError("invalid-argument", "Missing videoUrl or targetLengths.");
    }
    try {
        functions.logger.info(`Starting real Gemini analysis for ${videoUrl} using model ${requestedModel || 'gemini-3-pro-preview'}`);
        // 2. Download the video bytes
        const response = await axios_1.default.get(videoUrl, { responseType: 'arraybuffer' });
        const videoBase64 = Buffer.from(response.data, 'binary').toString('base64');
        // 3. Setup Gemini Model
        const modelName = requestedModel || "gemini-3-pro-preview"; // Requested by user
        const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction: "You are an expert video editor and award-winning creative director. Your goal is to identify the most high-impact, story-driven segments of a video to create shorter cutdowns that drive engagement.",
        });
        const generationConfig = {
            temperature: 0.4,
            topP: 0.95,
            topK: 64,
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
        };
        const prompt = `You are a world-class creative director. Watch the attached video carefully.
    
    TASK:
    - Analyze the primary hook, the core product/message, and the optimal closing moment.
    - Recommend 3 different storyboard options for EACH of the following target lengths: ${targetLengths.join(", ")} seconds.
    
    STITCHING RULES:
    - Each storyboard option must be a collection of one or more segments (clips) from the original video.
    - These segments DO NOT have to be contiguous. You can "stitch" clips from different parts of the video together.
    - The total duration of segments in any single option MUST equal exactly the target length.
    - I want your three best ideas, whether that's 1 long cut or 10 rapid-fire cuts stitched together to make a story.
    
    FOR EACH RECOMMENDATION:
    - Provide a "reason" explaining the creative strategy (e.g., "Visual hook into feature montage into logo").
    - Ensure your timestamps are accurate and reflect the actual events in the video.
    
    RETURN ONLY JSON IN THIS STRUCTURE:
    {
      "recommendations": [
        {
          "length": number,
          "options": [
            {
              "id": 1,
              "reason": "string",
              "segments": [
                { "start": "HH:MM:SS", "end": "HH:MM:SS" }
              ]
            }
          ]
        }
      ]
    }`;
        // 4. Call Gemini
        const result = await model.generateContent({
            contents: [{
                    role: "user",
                    parts: [
                        { inlineData: { mimeType: "video/mp4", data: videoBase64 } },
                        { text: prompt }
                    ]
                }],
            generationConfig,
        });
        const text = result.response.text();
        functions.logger.info("Gemini Raw Response:", text);
        const parsed = JSON.parse(text);
        return {
            status: "success",
            recommendations: parsed.recommendations
        };
    }
    catch (err) {
        functions.logger.error("Gemini Video Analysis Failed", err);
        throw new functions.https.HttpsError("internal", `Gemini Analysis Failed: ${err.message}`);
    }
});
//# sourceMappingURL=ai.js.map