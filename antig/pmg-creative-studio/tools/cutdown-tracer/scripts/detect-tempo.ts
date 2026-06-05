/**
 * detect-tempo — Step-4 eyeball. Runs the REAL librosa TempoDetector (python3
 * subprocess) against a local audio file or URL and prints the detected BPM.
 *
 * Requires local `python3` + `librosa` (and ffmpeg for compressed formats).
 *
 * Run:  npm run detect-tempo ./fixtures/<track>.wav
 *       npm run detect-tempo "https://…signed-url….mp3"
 */
import "dotenv/config";
import { makeLibrosaTempoDetector } from "../src/librosa.js";

async function main(): Promise<void> {
  const audio = process.argv[2];
  if (!audio) {
    console.error("✗ usage: npm run detect-tempo <audio-path-or-url>");
    process.exit(1);
  }
  console.log(`① detecting tempo with librosa: ${audio}`);
  const { bpm } = await makeLibrosaTempoDetector().detect(audio);
  console.log(`✓ detected BPM: ${bpm}`);
}

main().catch((err: unknown) => {
  console.error(`✗ FAIL — ${err instanceof Error ? err.message : String(err)}`);
  console.error(
    "   hints: 'no module librosa' → pip install librosa · compressed formats need ffmpeg · " +
      "set PYTHON_BIN to point at a venv python.",
  );
  process.exit(1);
});
