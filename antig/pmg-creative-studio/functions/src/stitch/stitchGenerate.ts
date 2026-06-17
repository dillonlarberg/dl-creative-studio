/**
 * Callable: `stitchGenerate` (Slice 1 — the spine).
 *
 * From N curated, already-9:16-ish assets (in the user's order) + a chosen track,
 * compose ONE 15s reel locally with ffmpeg — no AI in v1 (the human owns order +
 * selection):
 *   1. assertAlliStudioUser + validate (2..MAX_ASSETS assets, srcUrls, trackId)
 *   2. resolve the track (its bpm drives the beat grid)
 *   3. planStitch → per-asset beat-snapped durations (Σ === plan.totalSec)
 *   4. per-invocation mkdtemp; download music + each asset; normalize each to a
 *      1080×1920 clip of its slot duration (scale+pad, no crop)
 *   5. reuse FfmpegReelRenderer (concat-copy + music mux) → mp4
 *   6. upload to a versioned renders/ path; persist the OutputDoc
 *
 * `totalSec` is DERIVED from planStitch (never the raw client targetSec) so a
 * stale/tampered value can't truncate the reel via the mux `-t`. Split into a
 * `stitchGenerateCore` with injectable deps so the orchestration is unit-tested
 * offline with fakes. Returns `{ reelUrl }`.
 *
 * Slice 1 = scale-only normalize (assets already near 9:16). Outpaint (off-aspect
 * stills) and blurred-fill (off-aspect video) arrive in Slices 3 & 4, behind the
 * same per-asset normalize step.
 */
import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import os from "os";
import path from "path";
import fs from "fs/promises";

import { assertAlliStudioUser } from "../_shared/assertAlliStudioUser";
import { getAlliUserIdFromAuth } from "../_shared/getAlliUserIdFromAuth";
import { createOutput, updateOutput } from "../_shared/outputs";
import { makeStitchDeps, downloadToFile } from "./deps";
import { stitchPaths, APP_ID } from "./paths";
import { planStitch, MAX_ASSETS } from "./engine/planStitch";
import { AssetRefSchema, DEFAULT_BPM, DEFAULT_TARGET_SEC, type AssetRef } from "./engine/types";
import type { MusicCatalog, ReelRenderer } from "../cutdown/engine/seams";

const CLIENT_SLUG_RE = /^[a-z0-9_-]+$/;

interface StitchInput {
  clientSlug: string;
  batchId: string;
  assets: AssetRef[];
  trackId: string;
  targetSec: number;
}

function validateInput(data: unknown): StitchInput {
  const d = (data ?? {}) as Record<string, unknown>;
  const { clientSlug, batchId, trackId } = d;

  if (typeof clientSlug !== "string" || !CLIENT_SLUG_RE.test(clientSlug)) {
    throw new HttpsError("invalid-argument", "clientSlug must match /^[a-z0-9_-]+$/");
  }
  if (typeof batchId !== "string" || batchId.length === 0) {
    throw new HttpsError("invalid-argument", "batchId is required");
  }
  if (typeof trackId !== "string" || trackId.length === 0) {
    throw new HttpsError("invalid-argument", "trackId is required");
  }
  const assetsParsed = AssetRefSchema.array().safeParse(d.assets);
  if (!assetsParsed.success) {
    throw new HttpsError("invalid-argument", `invalid assets: ${assetsParsed.error.message}`);
  }
  const assets = assetsParsed.data;
  if (assets.length < 2) {
    throw new HttpsError("invalid-argument", "stitch needs at least 2 assets");
  }
  if (assets.length > MAX_ASSETS) {
    throw new HttpsError("invalid-argument", `at most ${MAX_ASSETS} assets per reel`);
  }
  const targetSec = typeof d.targetSec === "number" && d.targetSec > 0 ? d.targetSec : DEFAULT_TARGET_SEC;
  return { clientSlug, batchId, assets, trackId, targetSec };
}

/** Minimal Storage surface the core needs — keeps the core test-friendly. */
interface CoreBucket {
  upload(localPath: string, opts: { destination: string; metadata?: Record<string, unknown> }): Promise<unknown>;
}

export interface StitchGenerateDeps {
  db: Firestore;
  catalog: Pick<MusicCatalog, "fetch">;
  renderer: ReelRenderer;
  bucket: CoreBucket;
  sign: (objectPath: string) => Promise<string>;
  /** Download a URL (asset or music) to a local file. */
  fetchUrl: (url: string, destPath: string) => Promise<void>;
  /** Normalize one asset to a 1080×1920 clip of `durationSec` at `outPath`. */
  normalize: (opts: { srcPath: string; isStill: boolean; durationSec: number; outPath: string }) => Promise<void>;
  workRoot?: string;
}

export interface StitchGenerateCoreInput {
  clientSlug: string;
  batchId: string;
  assets: AssetRef[];
  trackId: string;
  targetSec: number;
  createdBy: string;
  /** ms epoch, injected at the callable boundary so the core stays deterministic. */
  renderTs: number;
}

export async function stitchGenerateCore(
  deps: StitchGenerateDeps,
  input: StitchGenerateCoreInput,
): Promise<{ reelUrl: string }> {
  const { clientSlug, batchId, assets, trackId, targetSec, createdBy, renderTs } = input;

  // Track first: its bpm owns the beat grid the cuts snap to.
  const { url: musicUrl, bpm } = await deps.catalog.fetch(trackId);
  const plan = planStitch({ count: assets.length, bpm: bpm ?? DEFAULT_BPM, targetSec });

  await createOutput(deps.db, {
    clientSlug,
    appId: APP_ID,
    outputId: batchId,
    batchId,
    createdBy,
    status: "pending",
    kind: "video",
    format: { durationMs: Math.round(plan.totalSec * 1000), aspectRatio: "9:16" },
    model: "ffmpeg",
    prompt: null,
  });

  const workRoot = deps.workRoot ?? os.tmpdir();
  const work = await fs.mkdtemp(path.join(workRoot, `stitch-${batchId}-`));
  const cleanupDirs = new Set<string>([work]);

  try {
    const musicPath = path.join(work, "music");
    await deps.fetchUrl(musicUrl, musicPath);

    // Download + normalize each asset to its planned slot duration, in order.
    const clipPaths: string[] = [];
    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];
      const src = path.join(work, `src-${String(i).padStart(2, "0")}`);
      const clip = path.join(work, `clip-${String(i).padStart(2, "0")}.mp4`);
      await deps.fetchUrl(asset.srcUrl, src);
      await deps.normalize({
        srcPath: src,
        isStill: asset.kind === "image",
        durationSec: plan.slots[i].durationSec,
        outPath: clip,
      });
      clipPaths.push(clip);
    }

    const { mp4Path } = await deps.renderer.render({ clipPaths, musicPath, totalSec: plan.totalSec });
    cleanupDirs.add(path.dirname(mp4Path));

    const dest = stitchPaths.finalReel(clientSlug, batchId, renderTs);
    await deps.bucket.upload(mp4Path, {
      destination: dest,
      metadata: { contentType: "video/mp4", cacheControl: "public, max-age=31536000, immutable" },
    });
    const previewUrl = await deps.sign(dest);

    await updateOutput(deps.db, clientSlug, APP_ID, batchId, {
      status: "complete",
      previewUrl,
      storageRef: dest,
    });

    return { reelUrl: previewUrl };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error("stitch generate failed", { batchId, error: message });
    await updateOutput(deps.db, clientSlug, APP_ID, batchId, {
      status: "error",
      errorCategory: "transient",
      errorMessage: message,
    });
    throw e instanceof HttpsError ? e : new HttpsError("internal", message);
  } finally {
    for (const dir of cleanupDirs) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

export const stitchGenerate = onCall(
  {
    // enforceAppCheck:false — App Check not yet registered for this web app; matches
    // cutdown/runOutpaintBatch. Re-enable once registered.
    enforceAppCheck: false,
    region: "us-central1",
    memory: "4GiB",
    timeoutSeconds: 540,
  },
  async (request: CallableRequest<unknown>) => {
    assertAlliStudioUser(request);
    const { clientSlug, batchId, assets, trackId, targetSec } = validateInput(request.data);
    const createdBy = getAlliUserIdFromAuth(request.auth);
    const deps = makeStitchDeps();

    return stitchGenerateCore(
      {
        db: getFirestore(),
        catalog: deps.catalog,
        renderer: deps.renderer,
        bucket: deps.bucket,
        sign: deps.sign,
        fetchUrl: downloadToFile,
        normalize: deps.normalize,
      },
      { clientSlug, batchId, assets, trackId, targetSec, createdBy, renderTs: Date.now() },
    );
  },
);
