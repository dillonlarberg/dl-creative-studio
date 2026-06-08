/**
 * Callable: `cutdownRender` (Phase D).
 *
 * Renders ONE chosen cut version (the angle the human picked) to a final MP4:
 *   1. assertAlliStudioUser + input validation (plan.cuts non-empty)
 *   2. Download source to tmp, probe true duration
 *   3. Resolve the track's signed music URL (catalog.fetch)
 *   4. Extract each cut to a local clip, upload each to Storage + sign it
 *   5. renderer.render({ clips, musicUrl, totalSec, 1080×1920 }) → mp4Url
 *   6. Persist an OutputDoc (parity with the unified outputs view)
 *
 * Returns: `{ mp4Url, angle }`.
 */
import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { getFirestore } from "firebase-admin/firestore";
import os from "os";
import path from "path";
import fs from "fs/promises";

import { assertAlliStudioUser } from "../_shared/assertAlliStudioUser";
import { getAlliUserIdFromAuth } from "../_shared/getAlliUserIdFromAuth";
import { createOutput, updateOutput } from "../_shared/outputs";
import { makeCutdownDeps } from "./deps";
import { cutdownPaths, APP_ID } from "./paths";
import { CutdownPlanSchema, OUTPUT, type CutdownPlan } from "./engine/types";

const GEMINI_KEY = defineSecret("GEMINI_API_KEY");
const SHOTSTACK_KEY = defineSecret("SHOTSTACK_API_KEY");

const CLIENT_SLUG_RE = /^[a-z0-9_-]+$/;

interface RenderInput {
  clientSlug: string;
  batchId: string;
  videoStoragePath: string;
  trackId: string;
  targetSec?: number;
  plan: CutdownPlan;
}

function validateInput(data: unknown): RenderInput {
  const d = (data ?? {}) as Record<string, unknown>;
  const clientSlug = d.clientSlug;
  const batchId = d.batchId;
  const videoStoragePath = d.videoStoragePath;
  const trackId = d.trackId;

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
  // Validate the plan against the engine's Zod schema so malformed cuts
  // (negative len, srcOut <= srcIn) are rejected before reaching ffmpeg.
  const parsed = CutdownPlanSchema.safeParse(d.plan);
  if (!parsed.success) {
    throw new HttpsError("invalid-argument", `invalid plan: ${parsed.error.message}`);
  }
  return {
    clientSlug,
    batchId,
    videoStoragePath,
    trackId,
    targetSec: typeof d.targetSec === "number" ? d.targetSec : undefined,
    plan: parsed.data,
  };
}

export const cutdownRender = onCall(
  {
    // enforceAppCheck:false — App Check not yet registered for this web app;
    // match runOutpaintBatch. Re-enable once registered.
    enforceAppCheck: false,
    secrets: [GEMINI_KEY, SHOTSTACK_KEY],
    region: "us-central1",
    memory: "4GiB",
    timeoutSeconds: 540,
  },
  async (request: CallableRequest<unknown>) => {
    assertAlliStudioUser(request);
    const { clientSlug, batchId, videoStoragePath, trackId, targetSec, plan } = validateInput(
      request.data,
    );
    const createdBy = getAlliUserIdFromAuth(request.auth);
    const totalSec = targetSec ?? OUTPUT.totalSec;

    const db = getFirestore();
    const deps = makeCutdownDeps(GEMINI_KEY.value(), SHOTSTACK_KEY.value());

    // OutputDoc id — one final reel per batch+angle.
    const outputId = `${batchId}-${plan.angle}`;
    await createOutput(db, {
      clientSlug,
      appId: APP_ID,
      outputId,
      batchId,
      createdBy,
      status: "pending",
      kind: "video",
      format: { durationMs: Math.round(totalSec * 1000), aspectRatio: "9:16" },
      model: "shotstack",
      prompt: plan.description ?? null,
    });

    // tmpdir() is in-memory tmpfs that persists across warm invocations — track
    // every local file we write and clean up in `finally` so warm instances
    // don't OOM.
    const tmp = path.join(os.tmpdir(), `cutdown-render-${batchId}.mp4`);
    let clipPaths: string[] = [];

    try {
      // 1. Download source + probe true duration.
      await deps.bucket.file(videoStoragePath).download({ destination: tmp });
      const durationSec = await deps.clipExtractor.probeDurationSec(tmp);

      // 2. Signed music URL the cloud renderer can fetch.
      const { url: musicUrl } = await deps.catalog.fetch(trackId);

      // 3. Extract each cut locally, upload to Storage, sign for the renderer.
      clipPaths = await deps.clipExtractor.extractClips(tmp, plan.cuts, durationSec);
      const clips = await Promise.all(
        clipPaths.map(async (localPath, i) => {
          const dest = cutdownPaths.renderClip(clientSlug, batchId, plan.angle, i);
          await deps.bucket.upload(localPath, {
            destination: dest,
            metadata: { contentType: "video/mp4" },
          });
          return { url: await deps.sign(dest), len: plan.cuts[i].len };
        }),
      );

      // 4. Render.
      const { mp4Url } = await deps.renderer.render({
        clips,
        musicUrl,
        totalSec,
        width: OUTPUT.width,
        height: OUTPUT.height,
      });

      await updateOutput(db, clientSlug, APP_ID, outputId, {
        status: "complete",
        previewUrl: mp4Url,
        // TODO(cutdown): re-host the rendered mp4 into our GCS bucket so
        // storageRef is a bucket path like the resize app.
        storageRef: mp4Url,
      });

      return { mp4Url, angle: plan.angle };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger.error("cutdown render failed", { batchId, angle: plan.angle, error: message });
      await updateOutput(db, clientSlug, APP_ID, outputId, {
        status: "error",
        errorCategory: "transient",
        errorMessage: message,
      });
      if (e instanceof HttpsError) throw e;
      throw new HttpsError("internal", message);
    } finally {
      await fs.rm(tmp, { force: true }).catch(() => {});
      if (clipPaths.length) {
        await fs.rm(path.dirname(clipPaths[0]), { recursive: true, force: true }).catch(() => {});
      }
    }
  },
);
