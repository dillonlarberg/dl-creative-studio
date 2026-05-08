import "dotenv/config";

import express from "express";
import multer from "multer";
import path from "node:path";
import { promises as fs } from "node:fs";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { parseP2Quality, TARGET_PRESETS, type TargetLabel } from "./config.js";
import { runPipeline, OUT_ROOT } from "./pipeline.js";
import { makeRunId } from "./runId.js";
import { CritiqueSchema } from "./schema.js";
import { appendCritique, readCritiques } from "./log.js";

const PORT = 3000;
const HOST = "127.0.0.1";

const geminiKey = process.env.GEMINI_API_KEY;
const openaiKey = process.env.OPENAI_API_KEY;
if (!geminiKey) {
  console.warn(
    "[resize-tracer] WARN: GEMINI_API_KEY is not set. /api/run will fail until you populate .env.",
  );
}
if (!openaiKey) {
  console.warn(
    "[resize-tracer] WARN: OPENAI_API_KEY is not set. /api/run will fail until you populate .env.",
  );
}

const genai = new GoogleGenAI({ apiKey: geminiKey ?? "" });
const openai = new OpenAI({ apiKey: openaiKey ?? "" });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/targets", (_req, res) => {
  res.json(
    Object.values(TARGET_PRESETS).map((t) => ({
      label: t.label,
      display: t.display,
      channel: t.channel,
      w: t.w,
      h: t.h,
    })),
  );
});

app.post("/api/run", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    const targetLabel = String(req.body.targetLabel ?? "") as TargetLabel;
    if (!file) {
      return res.status(400).json({ error: "file required" });
    }
    const targetSpec = TARGET_PRESETS[targetLabel];
    if (!targetSpec) {
      return res.status(400).json({ error: `unknown targetLabel: ${targetLabel}` });
    }
    if (!geminiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY not set" });
    }
    if (!openaiKey) {
      return res.status(500).json({ error: "OPENAI_API_KEY not set" });
    }
    const quality = parseP2Quality(req.body.quality);

    const fixtureBasename = path
      .basename(file.originalname, path.extname(file.originalname))
      .replace(/[^a-zA-Z0-9_-]/g, "_") || "upload";
    const runId = makeRunId(fixtureBasename, targetLabel);

    const result = await runPipeline({
      genai,
      openai,
      runId,
      source: file.buffer,
      sourceMime: file.mimetype === "image/png" ? "image/png" : "image/jpeg",
      sourceFilename: file.originalname,
      targetSpec,
      quality,
    });

    return res.json({
      runId: result.runId,
      source: file.originalname,
      targetLabel,
      targetDisplay: targetSpec.display,
      p1: result.p1,
      sourceUrl: `/out/${runId}/${path.basename(result.sourcePath)}`,
      p2CanvasUrl: `/out/${runId}/p2-canvas.png`,
      p2MaskUrl: `/out/${runId}/p2-mask.png`,
      p2RawUrl: `/out/${runId}/p2-raw.png`,
      p2FinalUrl: `/out/${runId}/result.png`,
      timings: result.timings,
      p2Model: result.p2Model,
      p2Quality: result.p2Quality,
      p2OutputPath: path.relative(process.cwd(), result.p2FinalPath),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[resize-tracer] /api/run failed:", message);
    return res.status(500).json({ error: message });
  }
});

app.post("/api/critique", async (req, res) => {
  try {
    const parsed = CritiqueSchema.parse(req.body);
    await appendCritique(parsed);
    return res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[resize-tracer] /api/critique failed:", message);
    return res.status(500).json({ error: message });
  }
});

app.get("/api/critiques", async (_req, res) => {
  try {
    const all = await readCritiques();
    res.json({ critiques: all });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// Serve generated artifacts (read-only; no upload to /out).
app.use(
  "/out",
  express.static(OUT_ROOT, {
    fallthrough: false,
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "no-store");
    },
  }),
);

// Static UI.
const PUBLIC_DIR = path.resolve(process.cwd(), "public");
app.use(express.static(PUBLIC_DIR));
app.get("/", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "tracer.html"));
});

// Ensure output dir exists at boot.
fs.mkdir(OUT_ROOT, { recursive: true }).catch((err) => {
  console.error("[resize-tracer] could not create out/:", err);
});

app.listen(PORT, HOST, () => {
  console.log(`[resize-tracer] http://${HOST}:${PORT}/tracer.html`);
});
