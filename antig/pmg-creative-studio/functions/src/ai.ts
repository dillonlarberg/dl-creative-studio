import * as functions from "firebase-functions";
import { GoogleGenerativeAI, GenerationConfig, SchemaType } from "@google/generative-ai";
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
      const modelName = requestedModel || "gemini-3-flash-preview";
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: `You are a narrative-driven video editor. Your priority is to ensure the audio track makes complete sense.
        
        CRITICAL: If the video contains speech (voiceover, dialogue, or interview), the audio track is the MASTER TRACK. All cuts MUST occur during natural silences or the end of a complete thought/sentence. NEVER cut mid-word, mid-phrase, or while someone is visibly still speaking.
        
        If there is no speech, prioritize visual impact and rhythmic energy.`,
      });

      const generationConfig: GenerationConfig = {
        temperature: 0.7, // Creative latitude for multi-segment variety
        topP: 0.95,
        topK: 64,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            recommendations: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  length: { type: SchemaType.NUMBER },
                  options: {
                    type: SchemaType.ARRAY,
                    items: {
                      type: SchemaType.OBJECT,
                      properties: {
                        id: { type: SchemaType.NUMBER },
                        reason: { type: SchemaType.STRING },
                        segments: {
                          type: SchemaType.ARRAY,
                          items: {
                            type: SchemaType.OBJECT,
                            properties: {
                              start: { type: SchemaType.STRING },
                              end: { type: SchemaType.STRING }
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
    - YOU ARE AUDITING YOUR OWN WORK: If a recommendation sounds like it stops halfway through, you have failed.
    
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
        } catch (err: any) {
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

      if (!result) throw lastError;

      const text = result.response.text();
      functions.logger.info("Gemini Raw Response Received, parsing...");

      try {
        // Basic cleaning in case the model wraps in markdown blocks despite config
        let cleaned = text.trim();
        if (cleaned.startsWith("```json")) cleaned = cleaned.replace(/^```json/, "").replace(/```$/, "");
        else if (cleaned.startsWith("```")) cleaned = cleaned.replace(/^```/, "").replace(/```$/, "");

        const parsed = JSON.parse(cleaned.trim());

        return {
          status: "success",
          recommendations: parsed.recommendations
        };
      } catch (parseErr: any) {
        functions.logger.error("JSON Parse Failed", { text, error: parseErr.message });
        throw new Error(`JSON Parsing failed: ${parseErr.message}. Position ${parseErr.at || 'N/A'}`);
      }

    } catch (err: any) {
      functions.logger.error("Gemini Video Analysis Failed", err);
      throw new functions.https.HttpsError("internal", `Gemini Analysis Failed: ${err.message}`);
    }
  });
