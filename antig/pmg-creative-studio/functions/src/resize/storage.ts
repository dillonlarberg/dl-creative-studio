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
import { createHash } from "node:crypto";
import sharp from "sharp";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions";
import { assertSafeSourceUrl } from "./ssrf";

const APP_ID = "ad-resizing";

/** Hard upper bound for fetched source bytes. ~50 MB clears all known feed CDN sizes. */
const MAX_SOURCE_BYTES = 50 * 1024 * 1024;

export interface StagedSource {
  /** Storage path (e.g. `clients/acme/apps/ad-resizing/sources/abc123.jpg`). */
  storageRef: string;
  /** 16-char sha256-prefix derived from originalUrl. */
  sourceKey: string;
  width: number;
  height: number;
  mime: string;
  /** The raw bytes — returned on both cache-hit and cache-miss (codex F9). */
  buffer: Buffer;
}

export interface UploadOutputArgs {
  clientSlug: string;
  outputId: string;
  buffer: Buffer;
}

export interface UploadIntermediateArgs {
  clientSlug: string;
  batchId: string;
  outputId: string;
  kind: "canvas" | "mask" | "raw";
  buffer: Buffer;
}

// ── Internal helpers ────────────────────────────────────────────────

function sha256Prefix(input: string, len = 16): string {
  return createHash("sha256").update(input).digest("hex").slice(0, len);
}

function mimeFromSharpFormat(format: string | undefined): string {
  if (!format) return "application/octet-stream";
  if (format === "jpeg" || format === "jpg") return "image/jpeg";
  return `image/${format}`;
}

function extFromSharpFormat(format: string | undefined): string {
  if (!format) return "bin";
  if (format === "jpeg") return "jpg";
  return format;
}

function sourcesPrefix(clientSlug: string, sourceKey: string): string {
  return `clients/${clientSlug}/apps/${APP_ID}/sources/${sourceKey}.`;
}

function outputPath(clientSlug: string, outputId: string): string {
  return `clients/${clientSlug}/apps/${APP_ID}/outputs/${outputId}.png`;
}

function intermediatePath(
  clientSlug: string,
  batchId: string,
  outputId: string,
  kind: UploadIntermediateArgs["kind"],
): string {
  return `clients/${clientSlug}/apps/${APP_ID}/intermediates/${batchId}/${outputId}/${kind}.png`;
}

/**
 * Fetch the source URL.
 *
 * TODO(ssrf-pin): re-introduce DNS pinning via an undici dispatcher whose
 * `connect.lookup` returns the IP that `assertSafeSourceUrl` already
 * validated. The previous implementation triggered "fetch failed" on
 * production CDNs (likely TLS-SNI / Host mismatch) so we ship plain fetch
 * for now. The pre-fetch SSRF address check still runs, so the residual
 * risk is only a ~microsecond DNS-rebind window between resolve and fetch
 * — acceptable for a prototype, not for production.
 */
async function fetchSource(url: URL): Promise<Response> {
  return fetch(url.toString());
}

/** Drill into nested `err.cause` chains (Node fetch hides the real reason there). */
function describeFetchError(err: unknown): string {
  const visited = new Set<unknown>();
  const parts: string[] = [];
  let current: unknown = err;
  while (current && !visited.has(current)) {
    visited.add(current);
    if (current instanceof Error) {
      parts.push(current.name + ': ' + current.message);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      current = (current as any).cause;
    } else {
      parts.push(String(current));
      current = null;
    }
  }
  return parts.join(' → ');
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Idempotent source staging. On cache hit reads back from Storage; on miss
 * runs the SSRF guard, pin-fetches the URL, writes to Storage, and probes
 * with sharp. Buffer is always returned so callers (PR-C orchestration)
 * don't have to re-read.
 */
export async function stageSourceIfMissing(args: {
  clientSlug: string;
  originalUrl: string;
}): Promise<StagedSource> {
  const sourceKey = sha256Prefix(args.originalUrl);
  const bucket = getStorage().bucket();

  // ── Cache check ──
  const prefix = sourcesPrefix(args.clientSlug, sourceKey);
  const [files] = await bucket.getFiles({ prefix });
  if (files.length > 0) {
    const file = files[0]!;
    const [buffer] = await file.download();
    const meta = await sharp(buffer).metadata();
    return {
      storageRef: file.name,
      sourceKey,
      width: meta.width ?? 0,
      height: meta.height ?? 0,
      mime: mimeFromSharpFormat(meta.format),
      buffer,
    };
  }

  // ── Cache miss: SSRF → fetch → probe → upload ──
  const { url } = await assertSafeSourceUrl(args.originalUrl);

  const advertisedLength = Number(0); // populated after response
  let resp: Response;
  try {
    resp = await fetchSource(url);
  } catch (err) {
    const detail = describeFetchError(err);
    logger.warn('stageSourceIfMissing: fetch threw', {
      url: url.toString(),
      host: url.hostname,
      detail,
    });
    throw new Error(`source fetch failed: ${detail}`);
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

  const meta = await sharp(buffer).metadata();
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

export async function uploadOutput(args: UploadOutputArgs): Promise<string> {
  const path = outputPath(args.clientSlug, args.outputId);
  const bucket = getStorage().bucket();
  await bucket.file(path).save(args.buffer, { contentType: "image/png", resumable: false });
  return path;
}

/**
 * Best-effort write of a Phase-2 debug artifact. Plan §Q5 marks these
 * intermediates as nice-to-have; a write failure must not break the output
 * pipeline, so this swallows errors after logging.
 */
export async function uploadIntermediate(args: UploadIntermediateArgs): Promise<void> {
  try {
    const path = intermediatePath(args.clientSlug, args.batchId, args.outputId, args.kind);
    const bucket = getStorage().bucket();
    await bucket.file(path).save(args.buffer, { contentType: "image/png", resumable: false });
  } catch (err) {
    logger.warn("uploadIntermediate failed (non-fatal)", {
      clientSlug: args.clientSlug,
      batchId: args.batchId,
      outputId: args.outputId,
      kind: args.kind,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Re-exported for unit tests + future callers needing the cache key. */
export function deriveSourceKey(originalUrl: string): string {
  return sha256Prefix(originalUrl);
}
