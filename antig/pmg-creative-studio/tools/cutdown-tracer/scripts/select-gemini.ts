/**
 * select-gemini — Step-3 eyeball. Runs the REAL Gemini moment selector against a
 * fixture video, prints the ranked segments, then feeds them through the pure
 * planCuts to show how the real moments land on the bar grid.
 *
 * Tempo/catalog/renderer are still Fakes (steps 4–5), so BPM is supplied here.
 *
 * Run:  npm run select-gemini ./fixtures/<clip>.mp4 [bpm]
 *       (GEMINI_API_KEY from .env; use a ~70s clip to exercise real selection)
 */
import "dotenv/config";
import { makeGeminiSelector } from "../src/gemini.js";
import { planCuts, dedupRanked, totalLen } from "../src/planCuts.js";
import { OUTPUT } from "../src/types.js";

async function main(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("✗ GEMINI_API_KEY not set — copy .env.example to .env and add your key.");
    process.exit(1);
  }
  const videoPath = process.argv[2];
  if (!videoPath) {
    console.error("✗ usage: npm run select-gemini <path-to-mp4> [bpm]");
    process.exit(1);
  }
  const bpm = Number(process.argv[3] ?? 120);

  console.log(`① selecting moments with Gemini (uploading ${videoPath})…`);
  const selector = makeGeminiSelector(apiKey);
  const segments = await selector.select({ path: videoPath }, { budgetSec: OUTPUT.totalSec });

  console.log(`\n② ${segments.length} ranked segment(s) (score desc):`);
  for (const s of segments) {
    console.log(`   ${s.startSec.toFixed(1)}–${s.endSec.toFixed(1)}s  score=${s.score.toFixed(2)}`);
  }

  const deduped = dedupRanked(segments);
  if (deduped.length < segments.length) {
    console.log(`   (${segments.length - deduped.length} overlapping segment(s) will be dropped by planCuts)`);
  }

  console.log(`\n③ planCuts @ ${bpm} BPM → ${OUTPUT.totalSec}s grid:`);
  const plan = planCuts({ bpm, totalSec: OUTPUT.totalSec, ranked: segments });
  let t = 0;
  for (const c of plan) {
    console.log(`   out ${t.toFixed(3)}–${(t + c.len).toFixed(3)}s (len ${c.len})  ←  src ${c.srcIn}–${c.srcOut}s`);
    t += c.len;
  }
  console.log(`\n✓ ${plan.length} hard cuts · Σlen ${totalLen(plan)}s (target ${OUTPUT.totalSec}s)`);
}

main().catch((err: unknown) => {
  console.error(`✗ FAIL — ${err instanceof Error ? err.message : String(err)}`);
  console.error("   hints: 400 = bad key / unknown model · 429 = quota · confirm key has video access.");
  process.exit(1);
});
