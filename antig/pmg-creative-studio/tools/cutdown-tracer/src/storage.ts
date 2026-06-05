/**
 * GcsBlobStore — the real `BlobStore` (build-order step 5).
 *
 * Uploads the source video to Cloud Storage and resolves objects (source + catalog
 * music) into a fetchable read URL for the cloud renderer. The bucket handle AND the
 * URL strategy are injected, so tests run no-network and we can match the repo's
 * convention: `getDownloadURL` token URLs (work with plain ADC — no service-account
 * key needed), as used in `functions/src/video.ts`. A V4 `getSignedUrl` resolver can
 * be dropped in instead without changing this class.
 */
import path from "node:path";
import type { BlobStore } from "./seams.js";

/** Minimal Cloud Storage surface for uploads — lets tests inject a fake bucket. */
export interface BucketLike {
  upload(localPath: string, opts: { destination: string }): Promise<unknown>;
}

/** Resolves a bucket-relative object path to a fetchable read URL (token or signed). */
export type ReadUrlResolver = (objectPath: string) => Promise<string>;

export interface GcsBlobStoreOptions {
  /** Object-name prefix for uploaded sources, e.g. "cutdown-sources". */
  prefix?: string;
  /** Total attempts for a transient upload failure (default 3). */
  maxAttempts?: number;
  /** Base backoff between retries in ms; doubles each attempt (default 1000). */
  retryBackoffMs?: number;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Connection-level failures worth retrying — flaky networks drop resumable uploads
 * mid-flight (observed: `read ETIMEDOUT`). Auth/permission/4xx errors are NOT here,
 * so they fail fast instead of wasting retries.
 */
const TRANSIENT_NET = /ETIMEDOUT|ECONNRESET|ESOCKETTIMEDOUT|EAI_AGAIN|ENOTFOUND|EPIPE|socket hang up|network|timed? ?out/i;

function isTransient(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string } | null)?.code ?? "";
  return TRANSIENT_NET.test(msg) || TRANSIENT_NET.test(code);
}

export class GcsBlobStore implements BlobStore {
  private readonly prefix: string;
  private readonly maxAttempts: number;
  private readonly retryBackoffMs: number;

  constructor(
    private readonly bucket: BucketLike,
    private readonly resolveUrl: ReadUrlResolver,
    opts: GcsBlobStoreOptions = {},
  ) {
    this.prefix = opts.prefix ?? "cutdown-sources";
    this.maxAttempts = opts.maxAttempts ?? 3;
    this.retryBackoffMs = opts.retryBackoffMs ?? 1000;
  }

  async uploadAndSign(localPath: string, destName?: string): Promise<string> {
    const dest = `${this.prefix}/${destName ?? path.basename(localPath)}`;
    // Retry the upload (a resumable upload restarts cleanly) on transient network
    // failures; non-transient errors throw immediately.
    return this.withRetry(`upload ${dest}`, async () => {
      await this.bucket.upload(localPath, { destination: dest });
      return this.resolveUrl(dest);
    });
  }

  async sign(storagePath: string): Promise<string> {
    return this.resolveUrl(storagePath);
  }

  private async withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (attempt < this.maxAttempts && isTransient(err)) {
          const wait = this.retryBackoffMs * 2 ** (attempt - 1);
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(
            `GcsBlobStore: transient failure on ${label} (attempt ${attempt}/${this.maxAttempts}); retrying in ${wait}ms — ${msg}`,
          );
          await sleep(wait);
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }
}
