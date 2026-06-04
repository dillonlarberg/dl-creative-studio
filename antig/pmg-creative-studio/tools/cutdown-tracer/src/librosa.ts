/**
 * LibrosaTempoDetector — the real `TempoDetector` (build-order step 4).
 *
 * Tempo detection lives in Python (`scripts/tempo.py`, librosa); this seam spawns
 * it as a subprocess and parses its JSON, keeping DSP out of the TS codebase. The
 * subprocess boundary is injected (`TempoRunner`) so tests mock it — librosa is
 * never invoked offline. Later the runner can target a Cloud Run microservice
 * without touching this class or its callers.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { TempoDetector } from "./seams.js";

const BpmSchema = z.object({ bpm: z.number().positive() });

/** The subprocess boundary: given an audio path/URL, return tempo.py's stdout (JSON). */
export interface TempoRunner {
  run(audioUrl: string): Promise<string>;
}

export class LibrosaTempoDetector implements TempoDetector {
  constructor(private readonly runner: TempoRunner) {}

  async detect(audioUrl: string): Promise<{ bpm: number }> {
    const stdout = await this.runner.run(audioUrl);
    let parsed: unknown;
    try {
      parsed = JSON.parse(stdout.trim());
    } catch {
      throw new Error(`LibrosaTempoDetector: non-JSON output from tempo.py: ${stdout.slice(0, 200)}`);
    }
    return BpmSchema.parse(parsed); // throws on missing/non-positive bpm
  }
}

/** Resolve scripts/tempo.py relative to this compiled module. */
function defaultScriptPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url)); // …/src
  return path.resolve(here, "../scripts/tempo.py");
}

/** Real runner — spawns `python3 scripts/tempo.py <audioUrl>` and collects stdout. */
export class PythonTempoRunner implements TempoRunner {
  constructor(
    private readonly python = process.env.PYTHON_BIN ?? "python3",
    private readonly scriptPath = defaultScriptPath(),
  ) {}

  run(audioUrl: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.python, [this.scriptPath, audioUrl]);
      let out = "";
      let err = "";
      proc.stdout.on("data", (d: Buffer) => (out += d.toString()));
      proc.stderr.on("data", (d: Buffer) => (err += d.toString()));
      proc.on("error", (e) =>
        reject(new Error(`failed to spawn ${this.python} (is Python installed?): ${e.message}`)),
      );
      proc.on("close", (code) => {
        if (code === 0) resolve(out);
        else reject(new Error(`tempo.py exited ${code}: ${(err.trim() || out.trim()).slice(0, 300)}`));
      });
    });
  }
}

export function makeLibrosaTempoDetector(): LibrosaTempoDetector {
  return new LibrosaTempoDetector(new PythonTempoRunner());
}
