/**
 * Callable: `cutdownGenerate` (Phase D — the heart).
 *
 * From a source video (already in Storage) + a chosen track, produces N angled
 * cut versions and writes them to Firestore *progressively* so the client's
 * onSnapshot streams beats as they land:
 *   1. assertAlliStudioUser + input validation
 *   2. Download source to tmp, probe true duration
 *   3. Resolve the track from the catalog (its `.url` is already signed)
 *   4. Create the batch doc (status `generating`)
 *   5. brain.cutdown → N CutdownPlans (one per angle)
 *   6. Per plan: write the version doc, then upload + arrayUnion each thumb one
 *      at a time (so each lands in its own snapshot), then mark `ready`
 *   7. Finalise the batch (`ready`, or `partial` if any version failed)
 *
 * Returns: `{ batchId }`.
 */
import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import os from "os";
import path from "path";

import { assertAlliStudioUser } from "../_shared/assertAlliStudioUser";
import { makeCutdownDeps } from "./deps";
import { cutdownPaths, APP_ID } from "./paths";

const GEMINI_KEY = defineSecret("GEMINI_API_KEY");
const SHOTSTACK_KEY = defineSecret("SHOTSTACK_API_KEY");

const CLIENT_SLUG_RE = /^[a-z0-9_-]+$/;

interface GenerateInput {
  clientSlug: string;
  batchId: string;
  videoStoragePath: string;
  trackId: string;
  targetSec?: number;
  brief?: string;
  sourceName?: string;
}

function validateInput(data: unknown): GenerateInput {
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
  return {
    clientSlug,
    batchId,
    videoStoragePath,
    trackId,
    targetSec: typeof d.targetSec === "number" ? d.targetSec : undefined,
    brief: typeof d.brief === "string" ? d.brief : undefined,
    sourceName: typeof d.sourceName === "string" ? d.sourceName : undefined,
  };
}

export const cutdownGenerate = onCall(
  {
    enforceAppCheck: true,
    secrets: [GEMINI_KEY, SHOTSTACK_KEY],
    region: "us-central1",
    memory: "4GiB",
    timeoutSeconds: 540,
  },
  async (request: CallableRequest<unknown>) => {
    assertAlliStudioUser(request);
    const { clientSlug, batchId, videoStoragePath, trackId, targetSec, brief, sourceName } =
      validateInput(request.data);

    const db = getFirestore();
    const deps = makeCutdownDeps(GEMINI_KEY.value(), SHOTSTACK_KEY.value());

    // 1. Download source + probe true duration.
    const tmp = path.join(os.tmpdir(), `cutdown-${batchId}.mp4`);
    await deps.bucket.file(videoStoragePath).download({ destination: tmp });
    const durationSec = await deps.clipExtractor.probeDurationSec(tmp);

    // 2. Resolve the chosen track (its `.url` is already signed).
    const tracks = await deps.catalog.list();
    const track = tracks.find((t) => t.trackId === trackId);
    if (!track) {
      throw new HttpsError("not-found", `Unknown trackId "${trackId}"`);
    }

    // 3. Create the batch doc.
    await db.doc(cutdownPaths.batch(clientSlug, batchId)).set({
      id: batchId,
      clientSlug,
      appId: APP_ID,
      status: "generating",
      trackId,
      trackTitle: track.title,
      bpm: track.bpm ?? null,
      targetSec: targetSec ?? 15,
      sourceName: sourceName ?? "upload.mp4",
      videoStoragePath,
      durationSec,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 4. Plan the cuts (one CutdownPlan per angle).
    const plans = await deps.brain.cutdown(
      { path: tmp },
      track,
      { targetSec: targetSec ?? 15, durationSec, humanInput: brief || undefined },
    );

    // 5. Per plan: write the version doc, then stream thumbs in progressively.
    let anyFailed = false;
    for (const plan of plans) {
      const vRef = db.doc(cutdownPaths.version(clientSlug, batchId, plan.angle));
      try {
        await vRef.set({
          angle: plan.angle,
          description: plan.description,
          cuts: plan.cuts,
          thumbs: [],
          status: "thumbing",
          updatedAt: FieldValue.serverTimestamp(),
        });
        const framePaths = await deps.storyboard.frames(tmp, plan.cuts, durationSec);
        for (let i = 0; i < framePaths.length; i++) {
          const dest = cutdownPaths.thumb(clientSlug, batchId, plan.angle, i);
          await deps.bucket.upload(framePaths[i], {
            destination: dest,
            metadata: { contentType: "image/jpeg" },
          });
          await vRef.update({
            thumbs: FieldValue.arrayUnion(dest),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        await vRef.update({ status: "ready", updatedAt: FieldValue.serverTimestamp() });
      } catch (e) {
        anyFailed = true;
        logger.error("cutdown version failed", {
          angle: plan.angle,
          error: e instanceof Error ? e.message : String(e),
        });
        await vRef.set(
          { angle: plan.angle, status: "failed", updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        );
      }
    }

    await db.doc(cutdownPaths.batch(clientSlug, batchId)).update({
      status: anyFailed ? "partial" : "ready",
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { batchId };
  },
);
