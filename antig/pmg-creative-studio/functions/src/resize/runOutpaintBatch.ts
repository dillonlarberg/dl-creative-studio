/**
 * Callable: `runOutpaintBatch` (plan PR-C).
 *
 * v2 onCall — caller passes `{ clientSlug, batchId, creativeId, originalUrl,
 * creativeName, feedName?, outputs[], retryPrompt?, quality? }`. Orchestrates:
 *   1. assertAlliStudioUser + input validation
 *   2. Idempotency check (single-output complete + no retryPrompt → no-op)
 *   3. stageSourceIfMissing
 *   4. Upsert BatchRecord (status `processing`, sourceCreative populated)
 *   5. Write each output's Firestore doc as `pending`
 *   6. Hoist P1 — runs ONCE per batch
 *   7. Fan out P2 under `p-limit(4)`; per output: P2 → uploadOutput +
 *      3 × uploadIntermediate → Firestore update
 *   8. Final BatchRecord status (completed / partial / failed)
 *
 * Errors per output are routed through `classifyError`; transient/permanent
 * categories drive the UI's retry button (PR-D).
 */
import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import pLimit from "p-limit";

import { assertAlliStudioUser } from "../_shared/assertAlliStudioUser";
import {
  runPhase1Once,
  runPhase2ForTarget,
  detectSourceSpec,
} from "./pipeline";
import {
  stageSourceIfMissing,
  uploadOutput,
  uploadIntermediate,
} from "./storage";
import { classifyError } from "./errorClassifier";
import type { P1Output } from "./schema";
import type { TargetSpec, P2Quality } from "./config";

const GEMINI_KEY = defineSecret("GEMINI_API_KEY");
const OPENAI_KEY = defineSecret("OPENAI_API_KEY");

const APP_ID = "ad-resizing";
const CLIENT_SLUG_RE = /^[a-z0-9_-]+$/;
const MIN_DIM = 50;
const MAX_DIM = 3840;
const MAX_RETRY_PROMPT = 500;
const P2_FANOUT = 4;

/**
 * Structured event log. Every entry shares a consistent envelope so Cloud
 * Logging can build log-based metrics + alerts on `jsonPayload.event` without
 * scraping free-form messages.
 *
 * Stages:
 *   batch_received   — input passed validation, orchestrator starting
 *   source_staged    — source bytes are in Storage + probed
 *   p1_done          — Phase-1 returned (or threw + got classified)
 *   output_complete  — single output succeeded (P2 + upload + Firestore)
 *   output_error     — single output errored (with category + reason)
 *   batch_finalised  — BatchRecord wrote terminal status
 */
function emitEvent(
  event:
    | "batch_received"
    | "source_staged"
    | "p1_done"
    | "p1_error"
    | "output_complete"
    | "output_error"
    | "batch_finalised"
    | "batch_failed",
  fields: Record<string, unknown>,
): void {
  logger.info("resize_event", { event, ...fields });
}

interface OutputRequest {
  outputId: string;
  dimension: { width: number; height: number; label?: string; channel?: string };
}

export interface RunOutpaintBatchInput {
  clientSlug: string;
  batchId: string;
  creativeId: string;
  originalUrl: string;
  creativeName: string;
  feedName?: string;
  outputs: OutputRequest[];
  retryPrompt?: string;
  quality?: P2Quality;
}

export interface RunOutpaintBatchResult {
  batchId: string;
  status: "completed" | "partial" | "failed" | "noop";
  completedCount: number;
  errorCount: number;
}

// ── Lazy client cache (Gen 2 secrets only available at invocation time) ──

let genai: GoogleGenAI | null = null;
let openai: OpenAI | null = null;

function getGenAi(): GoogleGenAI {
  genai ??= new GoogleGenAI({ apiKey: GEMINI_KEY.value() });
  return genai;
}

function getOpenAi(): OpenAI {
  openai ??= new OpenAI({ apiKey: OPENAI_KEY.value() });
  return openai;
}

// ── Input validation ────────────────────────────────────────────────

function badArg(message: string): never {
  throw new HttpsError("invalid-argument", message);
}

export function validateInput(data: unknown): RunOutpaintBatchInput {
  if (!data || typeof data !== "object") badArg("Request body required");
  const d = data as Record<string, unknown>;

  if (typeof d.clientSlug !== "string" || !CLIENT_SLUG_RE.test(d.clientSlug)) {
    badArg("clientSlug must match /^[a-z0-9_-]+$/");
  }
  for (const key of ["batchId", "creativeId", "originalUrl", "creativeName"] as const) {
    if (typeof d[key] !== "string" || (d[key] as string).length === 0) {
      badArg(`${key} required`);
    }
  }
  if (!Array.isArray(d.outputs) || d.outputs.length === 0) {
    badArg("outputs[] required (non-empty)");
  }

  const outputs: OutputRequest[] = (d.outputs as unknown[]).map((o, i) => {
    if (!o || typeof o !== "object") badArg(`outputs[${i}] invalid`);
    const oo = o as Record<string, unknown>;
    if (typeof oo.outputId !== "string" || !oo.outputId) badArg(`outputs[${i}].outputId required`);
    const dim = oo.dimension as Record<string, unknown> | undefined;
    if (!dim || typeof dim.width !== "number" || typeof dim.height !== "number") {
      badArg(`outputs[${i}].dimension { width, height } required`);
    }
    const w = dim.width as number;
    const h = dim.height as number;
    if (w < MIN_DIM || w > MAX_DIM || h < MIN_DIM || h > MAX_DIM) {
      badArg(`outputs[${i}].dimension out of bounds [${MIN_DIM}, ${MAX_DIM}]`);
    }
    return {
      outputId: oo.outputId as string,
      dimension: {
        width: w,
        height: h,
        label: typeof dim.label === "string" ? dim.label : undefined,
        channel: typeof dim.channel === "string" ? dim.channel : undefined,
      },
    };
  });

  let retryPrompt: string | undefined;
  if (d.retryPrompt !== undefined) {
    if (typeof d.retryPrompt !== "string") badArg("retryPrompt must be a string");
    if (d.retryPrompt.length > MAX_RETRY_PROMPT) {
      badArg(`retryPrompt exceeds ${MAX_RETRY_PROMPT} chars`);
    }
    retryPrompt = d.retryPrompt;
    if (outputs.length !== 1) {
      badArg("retryPrompt requires exactly one output (single-output re-crop)");
    }
  }

  let quality: P2Quality | undefined;
  if (d.quality !== undefined) {
    if (d.quality !== "medium" && d.quality !== "high") {
      badArg("quality must be 'medium' or 'high'");
    }
    quality = d.quality;
  }

  return {
    clientSlug: d.clientSlug as string,
    batchId: d.batchId as string,
    creativeId: d.creativeId as string,
    originalUrl: d.originalUrl as string,
    creativeName: d.creativeName as string,
    feedName: typeof d.feedName === "string" ? d.feedName : undefined,
    outputs,
    retryPrompt,
    quality,
  };
}

// ── Path helpers (mirror src/platform/firebase/paths.ts) ────────────

function batchDocPath(slug: string, batchId: string): string {
  return `clients/${slug}/apps/${APP_ID}/batches/${batchId}`;
}
function outputDocPath(slug: string, outputId: string): string {
  return `clients/${slug}/apps/${APP_ID}/outputs/${outputId}`;
}

// ── Orchestration ───────────────────────────────────────────────────

/**
 * Idempotency probe (plan §PR-C step 2): if the caller is replaying an
 * already-complete single-output request with no retryPrompt, short-circuit.
 */
async function checkIdempotency(
  input: RunOutpaintBatchInput,
): Promise<boolean> {
  if (input.retryPrompt !== undefined) return false;
  if (input.outputs.length !== 1) return false;
  const db = getFirestore();
  const docRef = db.doc(outputDocPath(input.clientSlug, input.outputs[0]!.outputId));
  const snap = await docRef.get();
  if (!snap.exists) return false;
  return snap.get("status") === "complete";
}

async function upsertBatchProcessing(
  input: RunOutpaintBatchInput,
  source: { storageRef: string; width: number; height: number; mime: string },
): Promise<void> {
  const db = getFirestore();
  const ratio = `${source.width}x${source.height}`;
  await db.doc(batchDocPath(input.clientSlug, input.batchId)).set(
    {
      id: input.batchId,
      clientSlug: input.clientSlug,
      appId: APP_ID,
      templateId: input.creativeId,
      feedId: input.feedName ?? "",
      feedName: input.creativeName,
      status: "processing",
      totalVariations: input.outputs.length,
      completedVariations: 0,
      errorCount: 0,
      ratio,
      sourceCreative: {
        creativeId: input.creativeId,
        originalUrl: input.originalUrl,
        storageRef: source.storageRef,
        width: source.width,
        height: source.height,
        mime: source.mime,
      },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

async function seedPendingOutputs(
  input: RunOutpaintBatchInput,
): Promise<void> {
  const db = getFirestore();
  const batch = db.batch();
  for (const o of input.outputs) {
    const ref = db.doc(outputDocPath(input.clientSlug, o.outputId));
    batch.set(
      ref,
      {
        outputId: o.outputId,
        batchId: input.batchId,
        dimension: o.dimension,
        status: "pending",
        model: "gpt-image-2",
        quality: input.quality ?? "medium",
        prompt: input.retryPrompt ?? null,
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
  await batch.commit();
}

interface RunOneOk {
  outputId: string;
  ok: true;
}
interface RunOneErr {
  outputId: string;
  ok: false;
  category: "transient" | "permanent";
  reason: string;
}

async function runOne(
  input: RunOutpaintBatchInput,
  source: { buffer: Buffer; mime: string; width: number; height: number },
  o: OutputRequest,
  p1: P1Output,
  p1Ms: number,
): Promise<RunOneOk | RunOneErr> {
  const db = getFirestore();
  const ref = db.doc(outputDocPath(input.clientSlug, o.outputId));
  try {
    const targetSpec: TargetSpec = {
      label: o.dimension.label ?? `${o.dimension.width}x${o.dimension.height}`,
      channel: o.dimension.channel,
      w: o.dimension.width,
      h: o.dimension.height,
    };
    const p2 = await runPhase2ForTarget(
      getOpenAi(),
      source.buffer,
      { w: source.width, h: source.height },
      p1,
      targetSpec,
      input.quality,
    );

    const storageRef = await uploadOutput({
      clientSlug: input.clientSlug,
      outputId: o.outputId,
      buffer: p2.resultBuffer,
    });

    // Best-effort intermediates (never fail the output).
    await Promise.all([
      uploadIntermediate({
        clientSlug: input.clientSlug,
        batchId: input.batchId,
        outputId: o.outputId,
        kind: "canvas",
        buffer: p2.canvasBuffer,
      }),
      uploadIntermediate({
        clientSlug: input.clientSlug,
        batchId: input.batchId,
        outputId: o.outputId,
        kind: "mask",
        buffer: p2.maskBuffer,
      }),
      uploadIntermediate({
        clientSlug: input.clientSlug,
        batchId: input.batchId,
        outputId: o.outputId,
        kind: "raw",
        buffer: p2.rawBuffer,
      }),
    ]);

    await ref.set(
      {
        status: "complete",
        storageRef,
        p1Analysis: p1,
        timings: { p1Ms, p2Ms: p2.p2Ms },
        model: p2.p2Model,
        quality: p2.p2Quality,
        completedAt: FieldValue.serverTimestamp(),
        errorCategory: FieldValue.delete(),
        errorMessage: FieldValue.delete(),
      },
      { merge: true },
    );
    emitEvent("output_complete", {
      batchId: input.batchId,
      outputId: o.outputId,
      width: o.dimension.width,
      height: o.dimension.height,
      label: o.dimension.label,
      channel: o.dimension.channel,
      p2Ms: p2.p2Ms,
      p2Model: p2.p2Model,
      p2Quality: p2.p2Quality,
    });
    return { outputId: o.outputId, ok: true };
  } catch (err) {
    const classified = classifyError(err);
    emitEvent("output_error", {
      batchId: input.batchId,
      outputId: o.outputId,
      width: o.dimension.width,
      height: o.dimension.height,
      label: o.dimension.label,
      channel: o.dimension.channel,
      category: classified.category,
      reason: classified.reason,
      message: classified.message,
    });
    await ref.set(
      {
        status: "error",
        errorCategory: classified.category,
        errorMessage: classified.message,
        completedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return {
      outputId: o.outputId,
      ok: false,
      category: classified.category,
      reason: classified.reason,
    };
  }
}

async function finaliseBatch(
  input: RunOutpaintBatchInput,
  outcomes: Array<RunOneOk | RunOneErr>,
): Promise<RunOutpaintBatchResult> {
  const completedCount = outcomes.filter((o) => o.ok).length;
  const errorCount = outcomes.length - completedCount;
  let status: RunOutpaintBatchResult["status"];
  if (errorCount === 0) status = "completed";
  else if (completedCount === 0) status = "failed";
  else status = "partial";

  const db = getFirestore();
  await db.doc(batchDocPath(input.clientSlug, input.batchId)).set(
    {
      status,
      completedVariations: completedCount,
      errorCount,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return { batchId: input.batchId, status, completedCount, errorCount };
}

/** Pure orchestrator — exported for tests that bypass the onCall wrapper. */
export async function runOutpaintBatchCore(
  input: RunOutpaintBatchInput,
): Promise<RunOutpaintBatchResult> {
  const batchStart = Date.now();
  emitEvent("batch_received", {
    batchId: input.batchId,
    clientSlug: input.clientSlug,
    creativeId: input.creativeId,
    outputs: input.outputs.length,
    hasRetryPrompt: input.retryPrompt !== undefined,
    quality: input.quality ?? "medium",
  });

  // ── Step 2: idempotency probe
  if (await checkIdempotency(input)) {
    emitEvent("batch_finalised", {
      batchId: input.batchId,
      status: "noop",
      totalMs: Date.now() - batchStart,
    });
    return { batchId: input.batchId, status: "noop", completedCount: 1, errorCount: 0 };
  }

  // ── Step 3: stage source (with SSRF guard + pin-fetch inside)
  const staged = await stageSourceIfMissing({
    clientSlug: input.clientSlug,
    originalUrl: input.originalUrl,
  });

  // If sharp couldn't probe dims, surface a permanent error early.
  if (!staged.width || !staged.height) {
    throw new Error(`sharp_decode_failed: could not probe ${input.originalUrl}`);
  }
  emitEvent("source_staged", {
    batchId: input.batchId,
    sourceKey: staged.sourceKey,
    width: staged.width,
    height: staged.height,
    mime: staged.mime,
    storageRef: staged.storageRef,
  });

  // ── Steps 4-5: BatchRecord upsert + per-output pending seed
  await upsertBatchProcessing(input, staged);
  await seedPendingOutputs(input);

  // ── Step 6: hoist P1 (runs once)
  const representativeTarget = {
    w: input.outputs[0]!.dimension.width,
    h: input.outputs[0]!.dimension.height,
  };
  let p1Result;
  try {
    p1Result = await runPhase1Once(
      getGenAi(),
      staged.buffer,
      staged.mime,
      { w: staged.width, h: staged.height },
      representativeTarget,
      input.retryPrompt,
    );
  } catch (err) {
    const classified = classifyError(err);
    emitEvent("p1_error", {
      batchId: input.batchId,
      category: classified.category,
      reason: classified.reason,
      message: classified.message,
    });
    throw err;
  }
  emitEvent("p1_done", {
    batchId: input.batchId,
    p1Ms: p1Result.p1Ms,
    subjectLocation: p1Result.p1.subjectLocation,
    copyRegions: p1Result.p1.copyRegions.length,
    styleCues: p1Result.p1.styleCues.length,
  });

  // ── Step 7: p-limit(4) fan-out
  const limit = pLimit(P2_FANOUT);
  const outcomes = await Promise.all(
    input.outputs.map((o) =>
      limit(() =>
        runOne(
          input,
          {
            buffer: staged.buffer,
            mime: staged.mime,
            width: staged.width,
            height: staged.height,
          },
          o,
          p1Result.p1,
          p1Result.p1Ms,
        ),
      ),
    ),
  );

  // ── Step 9: finalise batch status
  const result = await finaliseBatch(input, outcomes);
  emitEvent("batch_finalised", {
    batchId: input.batchId,
    status: result.status,
    completedCount: result.completedCount,
    errorCount: result.errorCount,
    totalMs: Date.now() - batchStart,
  });
  return result;
}

// Re-export for tests of `detectSourceSpec` use cases.
export { detectSourceSpec };

// ── v2 Callable wrapper ────────────────────────────────────────────

export const runOutpaintBatch = onCall(
  {
    secrets: [GEMINI_KEY, OPENAI_KEY],
    memory: "2GiB",
    timeoutSeconds: 300,
    concurrency: 1,
    maxInstances: 10,
    region: "us-central1",
    // App Check verifies the request originates from our registered web app
    // (reCAPTCHA Enterprise / debug token in dev). Stops a leaked Firebase ID
    // token from being weaponised by a curl script.
    enforceAppCheck: true,
  },
  async (req: CallableRequest<unknown>): Promise<RunOutpaintBatchResult> => {
    assertAlliStudioUser(req);
    const input = validateInput(req.data);
    try {
      return await runOutpaintBatchCore(input);
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      const classified = classifyError(err);
      emitEvent("batch_failed", {
        batchId: input.batchId,
        reason: classified.reason,
        message: classified.message,
      });
      // Mark the batch failed so the UI can observe terminal state.
      try {
        const db = getFirestore();
        await db.doc(batchDocPath(input.clientSlug, input.batchId)).set(
          {
            status: "failed",
            errorCount: input.outputs.length,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      } catch {
        // ignore secondary failures
      }
      throw new HttpsError("internal", classified.message);
    }
  },
);
