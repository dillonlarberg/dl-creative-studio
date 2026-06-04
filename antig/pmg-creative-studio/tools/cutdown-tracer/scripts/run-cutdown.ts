/**
 * run-cutdown — the V1 brain demo. Given a trackId, produces 3 angled cut
 * versions (narrative / highlights / punchy) via the CutdownBrain, then lets
 * you render one with --pick N.
 *
 * Usage:
 *   npm run run-cutdown <trackId> [videoPath] [--brief "..."] [--target 15|30|60] [--pick N]
 *
 * Examples:
 *   npm run run-cutdown otro_atardecer
 *   npm run run-cutdown otro_atardecer fixtures/test_02.mp4 --target 30
 *   npm run run-cutdown otro_atardecer --brief "focus on the sunset shots" --pick 1
 */
import "dotenv/config";
import { makeRealDeps } from "../src/realClients.js";
import { OUTPUT, type ClipRef, type EditSpec } from "../src/types.js";

// ---------------------------------------------------------------------------
// Arg parser — flag values are NEVER treated as positionals.
// Iterate tokens; when a known flag is seen, consume the next token as value.
// Everything else (non-flag, or orphaned after all flags resolved) is positional.
// ---------------------------------------------------------------------------
function parseArgs(argv: string[]): {
  positionals: string[];
  brief: string | undefined;
  target: number;
  pick: string | undefined;
} {
  const positionals: string[] = [];
  let brief: string | undefined;
  let target = 15;
  let pick: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--brief") {
      brief = argv[++i];
    } else if (token === "--target") {
      const raw = argv[++i];
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`--target must be a positive number, got: ${raw}`);
      }
      target = parsed;
    } else if (token === "--pick") {
      pick = argv[++i];
    } else {
      positionals.push(token);
    }
  }

  return { positionals, brief, target, pick };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const { positionals, brief, target: targetSec, pick } = parseArgs(process.argv.slice(2));

  const trackId = positionals[0];
  const videoPath = positionals[1] ?? "fixtures/test_02.mp4";

  if (!trackId) {
    console.error("✗ usage: npm run run-cutdown <trackId> [videoPath] [--brief \"...\"] [--target 15|30|60] [--pick N]");
    process.exit(1);
  }

  const deps = makeRealDeps();

  // 1. Probe source duration.
  const durationSec = await deps.clipExtractor.probeDurationSec(videoPath);

  // 2. Resolve track + sign URL.
  const tracks = await deps.catalog.list();
  const track = tracks.find((t) => t.trackId === trackId);
  if (!track) {
    throw new Error(`track not found in catalog: "${trackId}". Available: ${tracks.map((t) => t.trackId).join(", ")}`);
  }
  const { url } = await deps.catalog.fetch(trackId);
  const trackWithUrl = { ...track, url };

  // 3. Run summary.
  console.log(
    `▶ run-cutdown  source=${videoPath} (${durationSec.toFixed(1)}s)  track=${trackId}  bpm=${trackWithUrl.bpm ?? "?"}  target=${targetSec}s${brief ? `  brief="${brief}"` : ""}`,
  );
  console.log("  (asking Gemini for 3 angled versions — this may take 30–60 s)\n");

  // 4. Generate angled plans.
  const plans = await deps.brain.cutdown(
    { path: videoPath },
    trackWithUrl,
    { targetSec, durationSec, humanInput: brief },
  );

  // 5. Print all versions.
  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i];
    console.log(`[${i}] ${plan.angle} — ${plan.description}`);
    for (const cut of plan.cuts) {
      const role = cut.role ?? "-";
      const why = cut.why ?? "";
      console.log(
        `     ${cut.srcIn.toFixed(2)}–${cut.srcOut.toFixed(2)}s  ${cut.len.toFixed(2)}s  ${role}  — ${why}`,
      );
    }
    console.log();
  }

  if (pick === undefined) {
    console.log("Add --pick N to render one of the versions above.");
    return;
  }

  // 6. Render the chosen version.
  const pickIdx = Number(pick);
  if (!Number.isInteger(pickIdx) || pickIdx < 0 || pickIdx >= plans.length) {
    throw new Error(`--pick must be an integer 0–${plans.length - 1}, got: ${pick}`);
  }
  const chosen = plans[pickIdx];

  const runToken = `cutdown-${trackId}-${pick}`;
  console.log(`▶ extracting + uploading ${chosen.cuts.length} clip(s) for version [${pick}] (${chosen.angle})…`);

  const clipPaths = await deps.clipExtractor.extractClips(videoPath, chosen.cuts, durationSec);

  const clips: ClipRef[] = [];
  for (let i = 0; i < clipPaths.length; i++) {
    const signedUrl = await deps.blobStore.uploadAndSign(clipPaths[i], `${runToken}/clip-${i}.mp4`);
    clips.push({ url: signedUrl, len: chosen.cuts[i].len });
  }

  const spec: EditSpec = {
    clips,
    musicUrl: url,
    totalSec: targetSec,
    width: OUTPUT.width,
    height: OUTPUT.height,
  };

  console.log("  rendering via Shotstack…\n");
  const { mp4Url } = await deps.renderer.render(spec);

  console.log(`▸ rendered version [${pick}] (${chosen.angle}): ${mp4Url}`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? `\n✗ FAIL — ${e.message}` : e);
  process.exit(1);
});
