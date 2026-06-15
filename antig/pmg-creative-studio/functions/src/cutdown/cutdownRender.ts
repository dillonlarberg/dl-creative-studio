/**
 * Callable: `cutdownRender` (Phase D).
 *
 * Renders ONE chosen cut version (the angle the human picked) to a final MP4,
 * locally with ffmpeg (no cloud renderer):
 *   1. assertAlliStudioUser + validate the plan (cuts non-empty, srcOut-srcIn===len)
 *   2. per-invocation mkdtemp; download source; probe true duration
 *   3. resolve + download the track's music to tmp
 *   4. extractClips → normalized 9:16 clips; renderer composes them + music → mp4
 *   5. upload the final mp4 to a versioned `renders/` path; persist the OutputDoc
 *
 * `totalSec` is DERIVED from the plan's cuts (Σ len), never the raw client
 * `targetSec` — a stale/tampered value would otherwise truncate the reel via the
 * mux's `-t`. The work is split into a `cutdownRenderCore` with injectable deps so
 * the orchestration (output-doc wiring, versioned path, cleanup) is unit-tested
 * offline with fakes. Returns `{ mp4Url, angle }`.
 */
import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import os from "os";
import path from "path";
import fs from "fs/promises";

import { assertAlliStudioUser } from "../_shared/assertAlliStudioUser";
import { getAlliUserIdFromAuth } from "../_shared/getAlliUserIdFromAuth";
import { createOutput, updateOutput } from "../_shared/outputs";
import { makeCutdownDeps } from "./deps";
import { cutdownPaths, APP_ID } from "./paths";
import { CutdownPlanSchema, type CutdownPlan } from "./engine/types";
import { totalLen } from "./engine/planCuts";
import type { ClipExtractor, MusicCatalog, ReelRenderer } from "./engine/seams";

const GEMINI_KEY = defineSecret("GEMINI_API_KEY");

const CLIENT_SLUG_RE = /^[a-z0-9_-]+$/;

interface RenderInput {
  clientSlug: string;
  batchId: string;
  videoStoragePath: string;
  trackId: string;
  plan: CutdownPlan;
}

function validateInput(data: unknown): RenderInput {
  const d = (data ?? {}) as Record<string, unknown>;
  const { clientSlug, batchId, videoStoragePath, trackId } = d;

  if (typeof clientSlug !== "string" || !CLIENT_SLUG_RE.test(clientSlug)) {
    throw new HttpsError("invalid-argument", "clientSlug must match /^[a-z0-9_-]+$/");
  }
  if (typeof batchId !== "string" || batchId.length === 0) {
    throw new HttpsError("invalid-argument", "batchId is required");
  }
  if (typeof videoStoragePath !== "string" || videoStoragePath.length === 0) {
    throw new HttpsError("invalid-argument", "videoStoragePath is required");
  }
  if (typeof trackId !== "string" || trackId.length === 0) {
    throw new HttpsError("invalid-argument", "trackId is required");
  }
  // Validate the plan: rejects negative len, srcOut <= srcIn, and (critically for
  // the mux `-t`) srcOut - srcIn !== len, before anything reaches ffmpeg.
  const parsed = CutdownPlanSchema.safeParse(d.plan);
  if (!parsed.success) {
    throw new HttpsError("invalid-argument", `invalid plan: ${parsed.error.message}`);
  }
  return { clientSlug, batchId, videoStoragePath, trackId, plan: parsed.data };
}

/** Minimal Storage surface the core needs — keeps the core test-friendly. */
interface CoreBucket {
  file(objectPath: string): { download(opts: { destination: string }): Promise<unknown> };
  upload(localPath: string, opts: { destination: string; metadata?: Record<string, unknown> }): Promise<unknown>;
}

export interface CutdownRenderDeps {
  db: Firestore;
  bucket: CoreBucket;
  sign: (objectPath: string) => Promise<string>;
  catalog: Pick<MusicCatalog, "fetch">;
  clipExtractor: Pick<ClipExtractor, "probeDurationSec" | "extractClips">;
  renderer: ReelRenderer;
  /** Download a (signed) URL to a local file. */
  fetchMusic: (url: string, destPath: string) => Promise<void>;
  workRoot?: string;
}

export interface CutdownRenderCoreInput {
  clientSlug: string;
  batchId: string;
  videoStoragePath: string;
  trackId: string;
  plan: CutdownPlan;
  createdBy: string;
  /** ms epoch, injected at the callable boundary so the core stays deterministic. */
  renderTs: number;
}

export async function cutdownRenderCore(
  deps: CutdownRenderDeps,
  input: CutdownRenderCoreInput,
): Promise<{ mp4Url: string; angle: string }> {
  const { clientSlug, batchId, videoStoragePath, trackId, plan, createdBy, renderTs } = input;
  const totalSec = totalLen(plan.cuts); // derived from the plan, never raw client targetSec
  const outputId = `${batchId}-${plan.angle}`;

  await createOutput(deps.db, {
    clientSlug,
    appId: APP_ID,
    outputId,
    batchId,
    createdBy,
    status: "pending",
    kind: "video",
    format: { durationMs: Math.round(totalSec * 1000), aspectRatio: "9:16" },
    model: "ffmpeg",
    prompt: plan.description ?? null,
  });

  const workRoot = deps.workRoot ?? os.tmpdir();
  // Per-invocation root so concurrent renders of the same batch never collide.
  const work = await fs.mkdtemp(path.join(workRoot, `cutdown-render-${batchId}-`));
  // extractClips + renderer each mkdtemp their own dirs; track them all for cleanup.
  const cleanupDirs = new Set<string>([work]);

  try {
    const srcPath = path.join(work, "source.mp4");
    await deps.bucket.file(videoStoragePath).download({ destination: srcPath });
    const durationSec = await deps.clipExtractor.probeDurationSec(srcPath);

    const { url: musicUrl } = await deps.catalog.fetch(trackId);
    const musicPath = path.join(work, "music");
    await deps.fetchMusic(musicUrl, musicPath);

    const clipPaths = await deps.clipExtractor.extractClips(srcPath, plan.cuts, durationSec);
    if (clipPaths.length) cleanupDirs.add(path.dirname(clipPaths[0]));

    const { mp4Path } = await deps.renderer.render({ clipPaths, musicPath, totalSec });
    cleanupDirs.add(path.dirname(mp4Path));

    const dest = cutdownPaths.finalReel(clientSlug, batchId, plan.angle, renderTs);
    await deps.bucket.upload(mp4Path, {
      destination: dest,
      metadata: { contentType: "video/mp4", cacheControl: "public, max-age=31536000, immutable" },
    });
    const previewUrl = await deps.sign(dest);

    await updateOutput(deps.db, clientSlug, APP_ID, outputId, {
      status: "complete",
      previewUrl,
      storageRef: dest,
    });

    return { mp4Url: previewUrl, angle: plan.angle };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error("cutdown render failed", { batchId, angle: plan.angle, error: message });
    await updateOutput(deps.db, clientSlug, APP_ID, outputId, {
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

/** Download a (signed) URL to a local file. */
async function downloadToFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`music download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(destPath, buf);
}

export const cutdownRender = onCall(
  {
    // enforceAppCheck:false — App Check not yet registered for this web app;
    // match runOutpaintBatch. Re-enable once registered.
    enforceAppCheck: false,
    secrets: [GEMINI_KEY],
    region: "us-central1",
    memory: "4GiB",
    timeoutSeconds: 540,
  },
  async (request: CallableRequest<unknown>) => {
    assertAlliStudioUser(request);
    const { clientSlug, batchId, videoStoragePath, trackId, plan } = validateInput(request.data);
    const createdBy = getAlliUserIdFromAuth(request.auth);
    const deps = makeCutdownDeps(GEMINI_KEY.value());

    return cutdownRenderCore(
      {
        db: getFirestore(),
        bucket: deps.bucket,
        sign: deps.sign,
        catalog: deps.catalog,
        clipExtractor: deps.clipExtractor,
        renderer: deps.renderer,
        fetchMusic: downloadToFile,
      },
      { clientSlug, batchId, videoStoragePath, trackId, plan, createdBy, renderTs: Date.now() },
    );
  },
);
