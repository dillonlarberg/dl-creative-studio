import * as functions from "firebase-functions";
import { GoogleGenerativeAI, GenerationConfig } from "@google/generative-ai";
import axios from "axios";

// Initialize Gemini with the API key from secrets
// firebase functions:secrets:set GEMINI_API_KEY
export const analyzeVideoForCutdowns = functions
  .runWith({
    secrets: ["GEMINI_API_KEY"],
    timeoutSeconds: 540,
    memory: "1GB"
  })
  .https.onCall(async (data: { videoUrl: string, targetLengths: number[], model?: string }, context) => {
    // Initialize Gemini with the API key from secrets (must be inside handler)
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
    // 1. Validate inputs
    const { videoUrl, targetLengths, model: requestedModel } = data;
    if (!videoUrl || !targetLengths) {
      throw new functions.https.HttpsError("invalid-argument", "Missing videoUrl or targetLengths.");
    }

    try {
      functions.logger.info(`Starting real Gemini analysis for ${videoUrl} using model ${requestedModel || 'gemini-3-pro-preview'}`);

      // 2. Download the video bytes
      const response = await axios.get(videoUrl, { responseType: 'arraybuffer' });
      const videoBase64 = Buffer.from(response.data, 'binary').toString('base64');

      // 3. Setup Gemini Model
      const modelName = requestedModel || "gemini-3-pro-preview"; // Requested by user
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: "You are an expert video editor and award-winning creative director. Your goal is to identify the most high-impact, story-driven segments of a video to create shorter cutdowns that drive engagement.",
      });

      const generationConfig: GenerationConfig = {
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

    } catch (err: any) {
      functions.logger.error("Gemini Video Analysis Failed", err);
      throw new functions.https.HttpsError("internal", `Gemini Analysis Failed: ${err.message}`);
    }
  });
