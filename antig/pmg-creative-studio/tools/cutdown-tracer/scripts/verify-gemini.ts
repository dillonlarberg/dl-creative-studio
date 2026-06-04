/**
 * verify-gemini — smoke test for the Gemini video-understanding surface that backs
 * the cutdown-tracer's `VideoMomentSelector` seam.
 *
 * Proves, in order:
 *   ① the API key authenticates
 *   ② the Files API accepts a video and transitions it to ACTIVE
 *   ③ Gemini returns schema-valid structured JSON of ranked segments —
 *      the exact shape `planCuts()` will consume.
 *
 * Mirrors the in-repo call shape in functions/src/resize/phase1.ts
 * (@google/genai ^1.0.0, `responseMimeType` + `responseSchema`).
 *
 * Run:  npm run verify-gemini ./fixtures/<clip>.mp4
 *       (GEMINI_API_KEY comes from .env; use a 5–10s clip to stay fast/cheap)
 */
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

// gemini-2.5-flash: cheap, video-capable, fine for moment ranking (vs 2.5-pro used by resize P1).
const MODEL = "gemini-2.5-flash";

// Validation schema (parse the model's JSON before trusting it).
const SegmentsSchema = z.object({
  segments: z.array(
    z.object({
      startSec: z.number(),
      endSec: z.number(),
      score: z.number(),
    }),
  ),
});

// Plain JSON-schema object handed to the API — parallels P1_RESPONSE_SCHEMA in resize/schema.ts.
const SEGMENTS_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    segments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          startSec: { type: "number" },
          endSec: { type: "number" },
          score: { type: "number" },
        },
        required: ["startSec", "endSec", "score"],
      },
    },
  },
  required: ["segments"],
} as const;

// Response text extraction mirrors resize/phase1.ts (resp.text, else join candidate parts).
function extractText(resp: unknown): string | null {
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

async function main(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error(
      "✗ GEMINI_API_KEY not set. Copy .env.example to .env and add your key (https://aistudio.google.com/app/apikey).",
    );
    process.exit(1);
  }
  const videoPath = process.argv[2];
  if (!videoPath) {
    console.error("✗ usage: npm run verify-gemini <path-to-short-mp4>   (use a 5–10s clip)");
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });

  // ── ① key authenticates (cheap text call) ──
  console.log("① pinging Gemini (key check)…");
  const ping = await ai.models.generateContent({
    model: MODEL,
    contents: "Reply with the single word OK.",
  });
  console.log(`   key OK — model replied: "${(extractText(ping) ?? "").trim().slice(0, 40)}"`);

  // ── ② Files API upload + poll until ACTIVE ──
  console.log(`② uploading ${videoPath} via the Files API…`);
  let file = await ai.files.upload({ file: videoPath, config: { mimeType: "video/mp4" } });
  const started = Date.now();
  while (String(file.state) === "PROCESSING") {
    if (Date.now() - started > 120_000) throw new Error("file stuck in PROCESSING > 120s");
    await new Promise((r) => setTimeout(r, 4000));
    file = await ai.files.get({ name: file.name as string });
  }
  if (String(file.state) !== "ACTIVE") throw new Error(`file not ACTIVE (state=${file.state})`);
  console.log(`   file ACTIVE — uri: ${file.uri}`);

  // ── ③ video understanding + structured output (the real proof) ──
  console.log("③ requesting ranked segments (structured JSON)…");
  const resp = await ai.models.generateContent({
    model: MODEL,
    contents: [
      { fileData: { fileUri: file.uri as string, mimeType: file.mimeType as string } },
      {
        text:
          "Identify the most engaging moments of this video for a short vertical reel. " +
          "Return JSON { segments: [{ startSec, endSec, score }] } where score is 0-1 " +
          "(higher = more engaging), ordered by score descending.",
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: SEGMENTS_RESPONSE_SCHEMA,
    },
  });

  const text = extractText(resp);
  if (!text) throw new Error("Gemini returned no text content");
  const out = SegmentsSchema.parse(JSON.parse(text));

  console.log(`✓ PASS — ${out.segments.length} segment(s):`);
  for (const s of out.segments) {
    console.log(`   ${s.startSec.toFixed(1)}s–${s.endSec.toFixed(1)}s  score=${s.score.toFixed(2)}`);
  }

  // Best-effort cleanup (uploaded files auto-delete after 48h regardless).
  try {
    await ai.files.delete({ name: file.name as string });
  } catch {
    /* ignore */
  }
}

main().catch((err: unknown) => {
  console.error(`✗ FAIL — ${err instanceof Error ? err.message : String(err)}`);
  console.error(
    "   hints: 400 = bad key / unknown model · 429 = quota (free tier ~10–15 RPM) · " +
      "confirm the model id and that your key has video access.",
  );
  process.exit(1);
});
