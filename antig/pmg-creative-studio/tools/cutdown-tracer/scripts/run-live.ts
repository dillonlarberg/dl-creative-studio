/**
 * run-live — the Step-5 gate. Runs the FULL real pipeline end-to-end:
 *   upload source → Gemini moments → catalog/librosa BPM → planCuts →
 *   signed URLs → Shotstack render → a real 15s 9:16 MP4 URL.
 *
 * Writes per-run artifacts to out/<runId>/ (segments, plan, result) and prints the
 * playable URL. Requires the step-5 setup (ADC + sampleMusic docs + .env) — see
 * SETUP-step5.md.
 *
 * Run:  npm run run-live <trackId> [videoPath]
 *       npm run run-live otro_atardecer
 *       npm run run-live dtmf ./fixtures/test_02.mp4
 */
import "dotenv/config";
import path from "node:path";
import { promises as fs } from "node:fs";
import { runPipeline } from "../src/pipeline.js";
import { makeRealDeps } from "../src/realClients.js";

async function main(): Promise<void> {
  const trackId = process.argv[2];
  const videoPath = process.argv[3] ?? "fixtures/test_02.mp4";
  if (!trackId) {
    console.error("✗ usage: npm run run-live <trackId> [videoPath]   (trackId from sampleMusic)");
    process.exit(1);
  }
  await fs.access(videoPath).catch(() => {
    throw new Error(`source video not found: ${videoPath}`);
  });

  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${trackId}`;
  const outDir = path.resolve("out", runId);
  await fs.mkdir(outDir, { recursive: true });

  console.log(`▶ live run ${runId}`);
  console.log(`  source: ${videoPath} · track: ${trackId}`);
  console.log(`  (uploading source + selecting moments + rendering — this can take a minute or two)\n`);

  const deps = makeRealDeps();
  const result = await runPipeline(videoPath, trackId, deps);

  // Persist artifacts for inspection (PRD: per-run artifacts).
  await fs.writeFile(path.join(outDir, "segments.json"), JSON.stringify(result.segments, null, 2));
  await fs.writeFile(path.join(outDir, "plan.json"), JSON.stringify(result.plan, null, 2));
  await fs.writeFile(
    path.join(outDir, "result.json"),
    JSON.stringify({ runId, trackId, videoPath, bpm: result.bpm, mp4Url: result.mp4Url, spec: result.spec }, null, 2),
  );

  console.log(`  ${result.segments.length} moment(s) · bpm ${result.bpm} · ${result.plan.length} cuts`);
  console.log(`  artifacts: out/${runId}/`);
  console.log(`\n✓ RENDERED — open this (Shotstack sandbox = watermarked):\n  ${result.mp4Url}`);
}

main().catch((err: unknown) => {
  console.error(`\n✗ FAIL — ${err instanceof Error ? err.message : String(err)}`);
  console.error(
    "   hints: 'gcloud auth application-default login' (+ quota project) · check sampleMusic/<trackId> exists · " +
      "GEMINI_API_KEY + SHOTSTACK_API_KEY in .env · see SETUP-step5.md.",
  );
  process.exit(1);
});
