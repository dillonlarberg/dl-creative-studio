"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stageSourceIfMissing = stageSourceIfMissing;
exports.uploadOutput = uploadOutput;
exports.uploadIntermediate = uploadIntermediate;
exports.deriveSourceKey = deriveSourceKey;
/**
 * Storage layer for the ad-resizing pipeline (plan PR-B).
 *
 * Source staging:
 *   clients/{slug}/apps/ad-resizing/sources/{sourceKey}.{ext}
 *   sourceKey = sha256(originalUrl).slice(0, 16)   ← URL-stable (codex F10)
 *
 * Output writes:
 *   clients/{slug}/apps/ad-resizing/outputs/{outputId}.png
 *
 * Intermediates (best-effort, never block the pipeline):
 *   clients/{slug}/apps/ad-resizing/intermediates/{batchId}/{outputId}/{canvas|mask|raw}.png
 *
 * The fetch in `stageSourceIfMissing` is DNS-pinned to the IP returned by
 * `assertSafeSourceUrl` (plan Q4 / SSRF review C1). Callers MUST NOT bypass
 * this helper to fetch a URL with raw `fetch(url)` — that would re-resolve
 * DNS and open the rebinding TOCTOU.
 */
const node_crypto_1 = require("node:crypto");
const sharp_1 = __importDefault(require("sharp"));
const storage_1 = require("firebase-admin/storage");
const firebase_functions_1 = require("firebase-functions");
const undici_1 = require("undici");
const ssrf_1 = require("./ssrf");
const APP_ID = "ad-resizing";
/** Hard upper bound for fetched source bytes. ~50 MB clears all known feed CDN sizes. */
const MAX_SOURCE_BYTES = 50 * 1024 * 1024;
// ── Internal helpers ────────────────────────────────────────────────
function sha256Prefix(input, len = 16) {
    return (0, node_crypto_1.createHash)("sha256").update(input).digest("hex").slice(0, len);
}
function mimeFromSharpFormat(format) {
    if (!format)
        return "application/octet-stream";
    if (format === "jpeg" || format === "jpg")
        return "image/jpeg";
    return `image/${format}`;
}
function extFromSharpFormat(format) {
    if (!format)
        return "bin";
    if (format === "jpeg")
        return "jpg";
    return format;
}
function sourcesPrefix(clientSlug, sourceKey) {
    return `clients/${clientSlug}/apps/${APP_ID}/sources/${sourceKey}.`;
}
function outputPath(clientSlug, outputId) {
    return `clients/${clientSlug}/apps/${APP_ID}/outputs/${outputId}.png`;
}
function intermediatePath(clientSlug, batchId, outputId, kind) {
    return `clients/${clientSlug}/apps/${APP_ID}/intermediates/${batchId}/${outputId}/${kind}.png`;
}
/**
 * Fetch a URL whose DNS resolution is pinned to a single resolved IP. Closes
 * the rebinding TOCTOU between `assertSafeSourceUrl` and the actual fetch:
 * the undici dispatcher's `connect.lookup` callback returns the pre-resolved
 * IP without consulting the resolver a second time.
 */
async function fetchPinned(url, resolvedIp, family) {
    const dispatcher = new undici_1.Agent({
        connect: {
            // `lookup` matches Node's dns.lookup signature; we satisfy it from
            // memory using the IP `assertSafeSourceUrl` already validated.
            lookup: (_hostname, _opts, cb) => {
                cb(null, resolvedIp, family);
            },
        },
    });
    // Node 18+ fetch accepts an undici dispatcher via the `dispatcher` field.
    // The DOM `RequestInit` type doesn't expose it, hence the cast.
    return fetch(url.toString(), { dispatcher });
}
// ── Public API ──────────────────────────────────────────────────────
/**
 * Idempotent source staging. On cache hit reads back from Storage; on miss
 * runs the SSRF guard, pin-fetches the URL, writes to Storage, and probes
 * with sharp. Buffer is always returned so callers (PR-C orchestration)
 * don't have to re-read.
 */
async function stageSourceIfMissing(args) {
    const sourceKey = sha256Prefix(args.originalUrl);
    const bucket = (0, storage_1.getStorage)().bucket();
    // ── Cache check ──
    const prefix = sourcesPrefix(args.clientSlug, sourceKey);
    const [files] = await bucket.getFiles({ prefix });
    if (files.length > 0) {
        const file = files[0];
        const [buffer] = await file.download();
        const meta = await (0, sharp_1.default)(buffer).metadata();
        return {
            storageRef: file.name,
            sourceKey,
            width: meta.width ?? 0,
            height: meta.height ?? 0,
            mime: mimeFromSharpFormat(meta.format),
            buffer,
        };
    }
    // ── Cache miss: SSRF → pinned fetch → probe → upload ──
    const { url, resolvedIp, family } = await (0, ssrf_1.assertSafeSourceUrl)(args.originalUrl);
    const advertisedLength = Number(0); // populated after response
    let resp;
    try {
        resp = await fetchPinned(url, resolvedIp, family);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`source fetch failed: ${msg}`);
    }
    if (!resp.ok) {
        // Surface the upstream status so errorClassifier can route 404 / 5xx.
        const httpErr = Object.assign(new Error(`source URL ${resp.status}`), {
            status: resp.status,
        });
        throw httpErr;
    }
    const advertised = Number(resp.headers.get("content-length") ?? advertisedLength);
    if (Number.isFinite(advertised) && advertised > MAX_SOURCE_BYTES) {
        throw new Error(`source too large (advertised ${advertised} bytes)`);
    }
    const arrayBuf = await resp.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    if (buffer.length > MAX_SOURCE_BYTES) {
        throw new Error(`source too large (${buffer.length} bytes)`);
    }
    const meta = await (0, sharp_1.default)(buffer).metadata();
    const mime = mimeFromSharpFormat(meta.format);
    const ext = extFromSharpFormat(meta.format);
    const path = `${prefix}${ext}`;
    await bucket.file(path).save(buffer, { contentType: mime, resumable: false });
    return {
        storageRef: path,
        sourceKey,
        width: meta.width ?? 0,
        height: meta.height ?? 0,
        mime,
        buffer,
    };
}
async function uploadOutput(args) {
    const path = outputPath(args.clientSlug, args.outputId);
    const bucket = (0, storage_1.getStorage)().bucket();
    await bucket.file(path).save(args.buffer, { contentType: "image/png", resumable: false });
    return path;
}
/**
 * Best-effort write of a Phase-2 debug artifact. Plan §Q5 marks these
 * intermediates as nice-to-have; a write failure must not break the output
 * pipeline, so this swallows errors after logging.
 */
async function uploadIntermediate(args) {
    try {
        const path = intermediatePath(args.clientSlug, args.batchId, args.outputId, args.kind);
        const bucket = (0, storage_1.getStorage)().bucket();
        await bucket.file(path).save(args.buffer, { contentType: "image/png", resumable: false });
    }
    catch (err) {
        firebase_functions_1.logger.warn("uploadIntermediate failed (non-fatal)", {
            clientSlug: args.clientSlug,
            batchId: args.batchId,
            outputId: args.outputId,
            kind: args.kind,
            error: err instanceof Error ? err.message : String(err),
        });
    }
}
/** Re-exported for unit tests + future callers needing the cache key. */
function deriveSourceKey(originalUrl) {
    return sha256Prefix(originalUrl);
}
//# sourceMappingURL=storage.js.map