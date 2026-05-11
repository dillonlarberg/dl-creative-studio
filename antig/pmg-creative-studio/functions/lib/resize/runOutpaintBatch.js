"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runOutpaintBatch = exports.detectSourceSpec = void 0;
exports.validateInput = validateInput;
exports.runOutpaintBatchCore = runOutpaintBatchCore;
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
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const firebase_functions_1 = require("firebase-functions");
const firestore_1 = require("firebase-admin/firestore");
const genai_1 = require("@google/genai");
const openai_1 = __importDefault(require("openai"));
const p_limit_1 = __importDefault(require("p-limit"));
const assertAlliStudioUser_1 = require("../_shared/assertAlliStudioUser");
const pipeline_1 = require("./pipeline");
Object.defineProperty(exports, "detectSourceSpec", { enumerable: true, get: function () { return pipeline_1.detectSourceSpec; } });
const storage_1 = require("./storage");
const errorClassifier_1 = require("./errorClassifier");
const GEMINI_KEY = (0, params_1.defineSecret)("GEMINI_API_KEY");
const OPENAI_KEY = (0, params_1.defineSecret)("OPENAI_API_KEY");
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
function emitEvent(event, fields) {
    firebase_functions_1.logger.info("resize_event", { event, ...fields });
}
// ── Lazy client cache (Gen 2 secrets only available at invocation time) ──
let genai = null;
let openai = null;
function getGenAi() {
    genai ??= new genai_1.GoogleGenAI({ apiKey: GEMINI_KEY.value() });
    return genai;
}
function getOpenAi() {
    openai ??= new openai_1.default({ apiKey: OPENAI_KEY.value() });
    return openai;
}
// ── Input validation ────────────────────────────────────────────────
function badArg(message) {
    throw new https_1.HttpsError("invalid-argument", message);
}
function validateInput(data) {
    if (!data || typeof data !== "object")
        badArg("Request body required");
    const d = data;
    if (typeof d.clientSlug !== "string" || !CLIENT_SLUG_RE.test(d.clientSlug)) {
        badArg("clientSlug must match /^[a-z0-9_-]+$/");
    }
    for (const key of ["batchId", "creativeId", "originalUrl", "creativeName"]) {
        if (typeof d[key] !== "string" || d[key].length === 0) {
            badArg(`${key} required`);
        }
    }
    if (!Array.isArray(d.outputs) || d.outputs.length === 0) {
        badArg("outputs[] required (non-empty)");
    }
    const outputs = d.outputs.map((o, i) => {
        if (!o || typeof o !== "object")
            badArg(`outputs[${i}] invalid`);
        const oo = o;
        if (typeof oo.outputId !== "string" || !oo.outputId)
            badArg(`outputs[${i}].outputId required`);
        const dim = oo.dimension;
        if (!dim || typeof dim.width !== "number" || typeof dim.height !== "number") {
            badArg(`outputs[${i}].dimension { width, height } required`);
        }
        const w = dim.width;
        const h = dim.height;
        if (w < MIN_DIM || w > MAX_DIM || h < MIN_DIM || h > MAX_DIM) {
            badArg(`outputs[${i}].dimension out of bounds [${MIN_DIM}, ${MAX_DIM}]`);
        }
        return {
            outputId: oo.outputId,
            dimension: {
                width: w,
                height: h,
                label: typeof dim.label === "string" ? dim.label : undefined,
                channel: typeof dim.channel === "string" ? dim.channel : undefined,
            },
        };
    });
    let retryPrompt;
    if (d.retryPrompt !== undefined) {
        if (typeof d.retryPrompt !== "string")
            badArg("retryPrompt must be a string");
        if (d.retryPrompt.length > MAX_RETRY_PROMPT) {
            badArg(`retryPrompt exceeds ${MAX_RETRY_PROMPT} chars`);
        }
        retryPrompt = d.retryPrompt;
        if (outputs.length !== 1) {
            badArg("retryPrompt requires exactly one output (single-output re-crop)");
        }
    }
    let quality;
    if (d.quality !== undefined) {
        if (d.quality !== "medium" && d.quality !== "high") {
            badArg("quality must be 'medium' or 'high'");
        }
        quality = d.quality;
    }
    return {
        clientSlug: d.clientSlug,
        batchId: d.batchId,
        creativeId: d.creativeId,
        originalUrl: d.originalUrl,
        creativeName: d.creativeName,
        feedName: typeof d.feedName === "string" ? d.feedName : undefined,
        outputs,
        retryPrompt,
        quality,
    };
}
// ── Path helpers (mirror src/platform/firebase/paths.ts) ────────────
function batchDocPath(slug, batchId) {
    return `clients/${slug}/apps/${APP_ID}/batches/${batchId}`;
}
function outputDocPath(slug, outputId) {
    return `clients/${slug}/apps/${APP_ID}/outputs/${outputId}`;
}
// ── Orchestration ───────────────────────────────────────────────────
/**
 * Idempotency probe (plan §PR-C step 2): if the caller is replaying an
 * already-complete single-output request with no retryPrompt, short-circuit.
 */
async function checkIdempotency(input) {
    if (input.retryPrompt !== undefined)
        return false;
    if (input.outputs.length !== 1)
        return false;
    const db = (0, firestore_1.getFirestore)();
    const docRef = db.doc(outputDocPath(input.clientSlug, input.outputs[0].outputId));
    const snap = await docRef.get();
    if (!snap.exists)
        return false;
    return snap.get("status") === "complete";
}
async function upsertBatchProcessing(input, source) {
    const db = (0, firestore_1.getFirestore)();
    const ratio = `${source.width}x${source.height}`;
    await db.doc(batchDocPath(input.clientSlug, input.batchId)).set({
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
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    }, { merge: true });
}
async function seedPendingOutputs(input) {
    const db = (0, firestore_1.getFirestore)();
    const batch = db.batch();
    for (const o of input.outputs) {
        const ref = db.doc(outputDocPath(input.clientSlug, o.outputId));
        batch.set(ref, {
            outputId: o.outputId,
            batchId: input.batchId,
            dimension: o.dimension,
            status: "pending",
            model: "gpt-image-2",
            quality: input.quality ?? "medium",
            prompt: input.retryPrompt ?? null,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
    }
    await batch.commit();
}
async function runOne(input, source, o, p1, p1Ms) {
    const db = (0, firestore_1.getFirestore)();
    const ref = db.doc(outputDocPath(input.clientSlug, o.outputId));
    try {
        const targetSpec = {
            label: o.dimension.label ?? `${o.dimension.width}x${o.dimension.height}`,
            channel: o.dimension.channel,
            w: o.dimension.width,
            h: o.dimension.height,
        };
        const p2 = await (0, pipeline_1.runPhase2ForTarget)(getOpenAi(), source.buffer, { w: source.width, h: source.height }, p1, targetSpec, input.quality);
        const storageRef = await (0, storage_1.uploadOutput)({
            clientSlug: input.clientSlug,
            outputId: o.outputId,
            buffer: p2.resultBuffer,
        });
        // Best-effort intermediates (never fail the output).
        await Promise.all([
            (0, storage_1.uploadIntermediate)({
                clientSlug: input.clientSlug,
                batchId: input.batchId,
                outputId: o.outputId,
                kind: "canvas",
                buffer: p2.canvasBuffer,
            }),
            (0, storage_1.uploadIntermediate)({
                clientSlug: input.clientSlug,
                batchId: input.batchId,
                outputId: o.outputId,
                kind: "mask",
                buffer: p2.maskBuffer,
            }),
            (0, storage_1.uploadIntermediate)({
                clientSlug: input.clientSlug,
                batchId: input.batchId,
                outputId: o.outputId,
                kind: "raw",
                buffer: p2.rawBuffer,
            }),
        ]);
        await ref.set({
            status: "complete",
            storageRef,
            p1Analysis: p1,
            timings: { p1Ms, p2Ms: p2.p2Ms },
            model: p2.p2Model,
            quality: p2.p2Quality,
            completedAt: firestore_1.FieldValue.serverTimestamp(),
            errorCategory: firestore_1.FieldValue.delete(),
            errorMessage: firestore_1.FieldValue.delete(),
        }, { merge: true });
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
    }
    catch (err) {
        const classified = (0, errorClassifier_1.classifyError)(err);
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
        await ref.set({
            status: "error",
            errorCategory: classified.category,
            errorMessage: classified.message,
            completedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
        return {
            outputId: o.outputId,
            ok: false,
            category: classified.category,
            reason: classified.reason,
        };
    }
}
async function finaliseBatch(input, outcomes) {
    const completedCount = outcomes.filter((o) => o.ok).length;
    const errorCount = outcomes.length - completedCount;
    let status;
    if (errorCount === 0)
        status = "completed";
    else if (completedCount === 0)
        status = "failed";
    else
        status = "partial";
    const db = (0, firestore_1.getFirestore)();
    await db.doc(batchDocPath(input.clientSlug, input.batchId)).set({
        status,
        completedVariations: completedCount,
        errorCount,
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { batchId: input.batchId, status, completedCount, errorCount };
}
/** Pure orchestrator — exported for tests that bypass the onCall wrapper. */
async function runOutpaintBatchCore(input) {
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
    const staged = await (0, storage_1.stageSourceIfMissing)({
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
        w: input.outputs[0].dimension.width,
        h: input.outputs[0].dimension.height,
    };
    let p1Result;
    try {
        p1Result = await (0, pipeline_1.runPhase1Once)(getGenAi(), staged.buffer, staged.mime, { w: staged.width, h: staged.height }, representativeTarget, input.retryPrompt);
    }
    catch (err) {
        const classified = (0, errorClassifier_1.classifyError)(err);
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
    const limit = (0, p_limit_1.default)(P2_FANOUT);
    const outcomes = await Promise.all(input.outputs.map((o) => limit(() => runOne(input, {
        buffer: staged.buffer,
        mime: staged.mime,
        width: staged.width,
        height: staged.height,
    }, o, p1Result.p1, p1Result.p1Ms))));
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
// ── v2 Callable wrapper ────────────────────────────────────────────
exports.runOutpaintBatch = (0, https_1.onCall)({
    secrets: [GEMINI_KEY, OPENAI_KEY],
    memory: "2GiB",
    timeoutSeconds: 300,
    concurrency: 1,
    maxInstances: 10,
    region: "us-central1",
    // App Check enforcement temporarily disabled to unblock end-to-end smoke
    // testing — the reCAPTCHA Enterprise key + Firebase App Check provider
    // registration are queued as a follow-up. Auth still gated by
    // assertAlliStudioUser (verified email + PMG allowlist). Flip back to
    // `true` once App Check is registered for the Creative Studio web app.
    enforceAppCheck: false,
}, async (req) => {
    (0, assertAlliStudioUser_1.assertAlliStudioUser)(req);
    const input = validateInput(req.data);
    try {
        return await runOutpaintBatchCore(input);
    }
    catch (err) {
        if (err instanceof https_1.HttpsError)
            throw err;
        const classified = (0, errorClassifier_1.classifyError)(err);
        emitEvent("batch_failed", {
            batchId: input.batchId,
            reason: classified.reason,
            message: classified.message,
        });
        // Mark the batch failed so the UI can observe terminal state.
        try {
            const db = (0, firestore_1.getFirestore)();
            await db.doc(batchDocPath(input.clientSlug, input.batchId)).set({
                status: "failed",
                errorCount: input.outputs.length,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            }, { merge: true });
        }
        catch {
            // ignore secondary failures
        }
        throw new https_1.HttpsError("internal", classified.message);
    }
});
//# sourceMappingURL=runOutpaintBatch.js.map