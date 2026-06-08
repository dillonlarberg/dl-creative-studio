/**
 * ingest-music — one-shot catalog builder. Lists the bucket's `sampleMusic/` folder,
 * probes each audio file with librosa (bpm + duration), derives the rest, and writes
 * `sampleMusic/{trackId}` Firestore docs — so nobody hand-collects metadata.
 *
 * Auth: ADC (`gcloud auth application-default login`). Re-runnable (merges docs).
 *
 * Run:  PYTHON_BIN=$(pwd)/.venv-librosa/bin/python npm run ingest-music
 *       npm run ingest-music -- --dry-run            # probe + print, write nothing
 *       npm run ingest-music -- --manifest tracks.json  # curated catalog w/ tags
 */
import "dotenv/config";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import admin from "firebase-admin";
import { z } from "zod";
import { MusicDocSchema, type MusicDoc } from "../src/firestoreCatalog.js";
import { TrackManifestSchema, manifestEntryToDocFields } from "../src/trackManifest.js";

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT ?? "automated-creative-e10d7";
const BUCKET = process.env.GCS_BUCKET ?? "automated-creative-e10d7.firebasestorage.app";
const PREFIX = "sampleMusic/";
const PYTHON = process.env.PYTHON_BIN ?? "python3";
const PROBE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "probe-audio.py");

const AUDIO_EXT = new Set(["mp3", "wav", "m4a", "aac"]);
const ProbeSchema = z.object({ bpm: z.number().positive(), durationSec: z.number().positive() });

/** "sampleMusic/otro_atardecer.mp3" → trackId "otro_atardecer", format "mp3". */
function parseObjectName(name: string): { trackId: string; format: string } {
  const base = name.slice(PREFIX.length); // strip folder prefix
  const ext = path.extname(base).slice(1).toLowerCase();
  const trackId = path.basename(base, path.extname(base));
  return { trackId, format: ext };
}

/** "otro_atardecer" → "Otro Atardecer". */
function titleize(trackId: string): string {
  return trackId
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function probe(localPath: string): Promise<{ bpm: number; durationSec: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON, [PROBE, localPath]);
    let out = "";
    let err = "";
    proc.stdout.on("data", (d: Buffer) => (out += d.toString()));
    proc.stderr.on("data", (d: Buffer) => (err += d.toString()));
    proc.on("error", (e) => reject(new Error(`failed to spawn ${PYTHON}: ${e.message}`)));
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`probe-audio.py exited ${code}: ${err.trim() || out.trim()}`));
      try {
        resolve(ProbeSchema.parse(JSON.parse(out.trim())));
      } catch (e) {
        reject(new Error(`bad probe output: ${out.slice(0, 200)}`));
      }
    });
  });
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  admin.initializeApp({ projectId: PROJECT_ID, storageBucket: BUCKET });
  const bucket = admin.storage().bucket();
  const db = admin.firestore();

  const manifestIdx = process.argv.indexOf("--manifest");
  if (manifestIdx !== -1) {
    const manifestPath = process.argv[manifestIdx + 1];
    if (!manifestPath) throw new Error("--manifest requires a file path");
    const entries = TrackManifestSchema.parse(JSON.parse(await fs.readFile(manifestPath, "utf8")));
    console.log(`① manifest ${manifestPath}: ${entries.length} track(s)`);
    for (const entry of entries) {
      let probed = { bpm: entry.bpm ?? 0, durationSec: entry.durationSec ?? 0 };
      if (!entry.bpm || !entry.durationSec) {
        const tmp = path.join(os.tmpdir(), `ingest-${entry.trackId}.${entry.format}`);
        await bucket.file(entry.storagePath).download({ destination: tmp });
        try { probed = await probe(tmp); } finally { await fs.rm(tmp, { force: true }); }
      }
      const doc = MusicDocSchema.parse(manifestEntryToDocFields(entry, probed));
      console.log(`   ${entry.trackId}: bpm=${doc.bpm} dur=${doc.durationSec}s mood=${doc.mood}/${doc.genre}`);
      if (!dryRun) await db.collection("sampleMusic").doc(entry.trackId).set(doc, { merge: true });
    }
    console.log(`\n✓ done (${dryRun ? "dry-run" : "wrote " + entries.length + " doc(s)"}).`);
    return;
  }

  console.log(`① listing gs://${BUCKET}/${PREFIX} …`);
  const [files] = await bucket.getFiles({ prefix: PREFIX });
  const audio = files.filter((f) => {
    const ext = path.extname(f.name).slice(1).toLowerCase();
    return f.name !== PREFIX && AUDIO_EXT.has(ext);
  });
  if (audio.length === 0) throw new Error(`no audio files under ${PREFIX} (found ${files.length} objects)`);
  console.log(`   ${audio.length} audio file(s): ${audio.map((f) => f.name).join(", ")}`);

  for (const file of audio) {
    const { trackId, format } = parseObjectName(file.name);
    console.log(`\n② ${file.name} → probing…`);

    const tmp = path.join(os.tmpdir(), `ingest-${trackId}.${format}`);
    await file.download({ destination: tmp });
    let meta: { bpm: number; durationSec: number };
    try {
      meta = await probe(tmp);
    } finally {
      await fs.rm(tmp, { force: true });
    }

    const doc: MusicDoc = MusicDocSchema.parse({
      title: titleize(trackId),
      storagePath: file.name,
      format,
      durationSec: meta.durationSec,
      bpm: meta.bpm,
      provider: "manual",
      licenseRef: "internal-demo",
    });

    console.log(`   bpm=${doc.bpm} duration=${doc.durationSec}s title="${doc.title}"`);
    if (dryRun) {
      console.log(`   [dry-run] would write sampleMusic/${trackId}`);
    } else {
      await db.collection("sampleMusic").doc(trackId).set(doc, { merge: true });
      console.log(`   ✓ wrote sampleMusic/${trackId}`);
    }
  }

  console.log(`\n✓ done (${dryRun ? "dry-run" : "wrote " + audio.length + " doc(s)"}).`);
}

main().catch((err: unknown) => {
  console.error(`✗ FAIL — ${err instanceof Error ? err.message : String(err)}`);
  console.error(
    "   hints: run 'gcloud auth application-default login' (+ set-quota-project " +
      `${PROJECT_ID}) · set PYTHON_BIN to the librosa venv · check the bucket/prefix.`,
  );
  process.exit(1);
});
