/**
 * Slice 0 (#90) — OUTPAINT half of the spike (HITL: needs keys + real assets).
 *
 * Proves the expensive path: a real off-aspect STILL → outpaint-extended to a
 * 9:16 (1080×1920) canvas → zoompan motion clip. Prints per-asset P1/P2 latency
 * (the number that justifies pre-normalize-at-pick-time + the cap-8 budget).
 *
 * Run it YOURSELF (keys never go through the agent):
 *
 *   GEMINI_API_KEY=...  OPENAI_API_KEY=...  \
 *   FFMPEG_BIN=$(node -e "console.log(require('ffmpeg-static'))") \
 *   npx tsx functions/src/stitch/outpaint-spike.ts <real-off-aspect-still.jpg> [moreStills...]
 *
 * Outputs each `<name>.outpaint.png` (eyeball the generated border) + `.kenburns.mp4`
 * to $TMPDIR/stitch-outpaint-spike/, and prints p1Ms/p2Ms per asset.
 *
 * GO test: borders look on-brand on a luxury still AND p2Ms × 8 (parallel) fits the
 * pick-time budget. If borders disappoint → fallback to blurred-fill-everything.
 */
import os from "node:os";
import path from "node:path";
import { promises as fs, readFileSync, existsSync } from "node:fs";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import {
  detectSourceSpec,
  runPhase1Once,
  runPhase2ForTarget,
} from "../_shared/ai/outpaint";
import { buildZoompanArgs } from "./engine/ffmpegImage";
import { runFfmpeg } from "../cutdown/engine/ffmpeg";
import { OUTPUT } from "../cutdown/engine/types";

const BIN = process.env.FFMPEG_BIN ?? "ffmpeg";

/** Dependency-free .env parser (handles `export `, quotes, comments, whitespace). */
function parseEnvFile(p: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(p)) return out;
  for (let line of readFileSync(p, "utf8").split("\n")) {
    line = line.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("export ")) line = line.slice(7).trim();
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

/** Load repo-root .env.local (functions/src/stitch → up 3) and merge under process.env. */
function loadEnvLocal(): { env: Record<string, string>; file: string | null } {
  const here = __dirname; // functions compiles to CJS; __dirname is available at runtime (tsx)
  const candidates = [
    path.resolve(here, "../../../.env.local"), // repo root from this file
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), "../.env.local"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return { env: { ...parseEnvFile(c), ...process.env as Record<string, string> }, file: c };
  }
  return { env: { ...process.env as Record<string, string> }, file: null };
}

function mimeOf(p: string): string {
  const ext = path.extname(p).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

async function main(): Promise<void> {
  const stills = process.argv.slice(2);
  if (stills.length === 0) {
    console.error("Pass one or more real off-aspect still paths. See file header for the full command.");
    process.exit(2);
  }
  const { env, file } = loadEnvLocal();
  console.log(file ? `env: loaded ${file}` : "env: no .env.local found, using process.env only");
  // Accept the canonical names + the RESIZE_ variants + a known `OPENAI_API__KEY` typo.
  const geminiKey = env.GEMINI_API_KEY || env.RESIZE_GEMINI_API_KEY;
  const openaiKey = env.OPENAI_API_KEY || env.OPENAI_API__KEY || env.RESIZE_OPENAI_API_KEY;
  if (!geminiKey || !openaiKey) {
    console.error(
      `Missing keys. Need GEMINI_API_KEY + OPENAI_API_KEY in .env.local (or env).\n` +
      `  found: gemini=${geminiKey ? `${geminiKey.length}B` : "MISSING"} openai=${openaiKey ? `${openaiKey.length}B` : "MISSING"}`,
    );
    process.exit(2);
  }
  if (!env.OPENAI_API_KEY && env.OPENAI_API__KEY) {
    console.warn("note: using OPENAI_API__KEY (double underscore typo) from .env.local — consider renaming to OPENAI_API_KEY.");
  }
  console.log(`keys ok (gemini ${geminiKey.length}B, openai ${openaiKey.length}B)`);

  const genai = new GoogleGenAI({ apiKey: geminiKey });
  const openai = new OpenAI({ apiKey: openaiKey });
  const target = { label: "reel-9x16", channel: "Social" as const, w: OUTPUT.width, h: OUTPUT.height }; // 1080×1920; resizeToTarget cover-fits to this

  const outDir = path.join(os.tmpdir(), "stitch-outpaint-spike");
  await fs.mkdir(outDir, { recursive: true });

  const timings: Array<{ name: string; p1Ms: number; p2Ms: number }> = [];
  for (const stillPath of stills) {
    const name = path.basename(stillPath).replace(/\.[^.]+$/, "");
    const source = await fs.readFile(stillPath);
    const sourceSpec = await detectSourceSpec(source);

    const { p1, p1Ms } = await runPhase1Once(genai, source, mimeOf(stillPath), sourceSpec, target);
    const p2 = await runPhase2ForTarget(openai, source, sourceSpec, p1, target);

    const outpaintPng = path.join(outDir, `${name}.outpaint.png`);
    await fs.writeFile(outpaintPng, p2.resultBuffer); // already 1080×1920 cover-fit

    const clip = path.join(outDir, `${name}.kenburns.mp4`);
    await runFfmpeg(BIN, buildZoompanArgs({ stillPath: outpaintPng, durationSec: 3, outPath: clip }));

    timings.push({ name, p1Ms, p2Ms: p2.p2Ms });
    console.log(`${name}: source ${sourceSpec.w}×${sourceSpec.h} → 1080×1920  p1=${p1Ms}ms p2=${p2.p2Ms}ms`);
    console.log(`   eyeball: ${outpaintPng}  motion: ${clip}`);
  }

  const maxP2 = Math.max(...timings.map((t) => t.p2Ms));
  console.log(`\nMax p2 latency: ${maxP2}ms. 8 assets in parallel (p-limit) ≈ ${maxP2}ms wall (if 1 batch).`);
  console.log(`GO if borders look on-brand AND this fits the pick-time UX. Outputs in: ${outDir}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
