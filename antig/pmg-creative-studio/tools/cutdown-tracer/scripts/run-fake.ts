/**
 * run-fake — eyeball a cut plan end-to-end on the Fakes (no network, no env).
 * Proves the Step-2 spine: select → fetch track → BPM → planCuts → render.
 *
 * Run:  npm run run-fake            # default track pulse-120 (120 BPM)
 *       npm run run-fake drift-90   # 90 BPM track → different grid
 */
import { runPipeline } from "../src/pipeline.js";
import { makeDeps } from "../src/factory.js";
import { totalLen } from "../src/planCuts.js";

async function main(): Promise<void> {
  const trackId = process.argv[2] ?? "pulse-120";
  const r = await runPipeline("fixtures/test_01.mp4", trackId, makeDeps({}));

  console.log(`track: ${trackId} · bpm: ${r.bpm} · cuts: ${r.plan.length} · Σlen: ${totalLen(r.plan)}s`);
  let t = 0;
  for (const c of r.plan) {
    console.log(
      `  out ${t.toFixed(3)}–${(t + c.len).toFixed(3)}s (len ${c.len})  ←  src ${c.srcIn}–${c.srcOut}s`,
    );
    t += c.len;
  }
  console.log(`mp4: ${r.mp4Url}`);
}

main().catch((err: unknown) => {
  console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
