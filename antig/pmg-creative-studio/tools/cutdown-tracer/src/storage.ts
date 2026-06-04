/**
 * GcsBlobStore — the real `BlobStore` (build-order step 5).
 *
 * Uploads the source video to Cloud Storage and signs objects (source + catalog
 * music) into long-TTL V4 read URLs the cloud renderer can fetch after queueing.
 * The bucket handle is injected (a minimal `BucketLike`), so tests run no-network.
 *
 * Signed-URL TTL is capped at 7 days by V4 signing — plenty to survive a render
 * queue; we default to 6 days.
 */
import path from "node:path";
import type { BlobStore } from "./seams.js";

/** V4 signed URLs allow at most 7 days; default to 6 to stay safely under the cap. */
const DEFAULT_TTL_MS = 6 * 24 * 60 * 60 * 1000;

/** Minimal Cloud Storage surface this store touches — lets tests inject a fake bucket. */
export interface FileLike {
  getSignedUrl(opts: { action: "read"; expires: number }): Promise<[string]>;
}
export interface BucketLike {
  upload(localPath: string, opts: { destination: string }): Promise<unknown>;
  file(objectPath: string): FileLike;
}

export interface GcsBlobStoreOptions {
  /** Object-name prefix for uploaded sources, e.g. "cutdown-sources". */
  prefix?: string;
  /** Signed-URL lifetime in ms (≤ 7 days). */
  ttlMs?: number;
  /** Injectable clock for deterministic tests. */
  now?: () => number;
}

export class GcsBlobStore implements BlobStore {
  private readonly prefix: string;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(
    private readonly bucket: BucketLike,
    opts: GcsBlobStoreOptions = {},
  ) {
    this.prefix = opts.prefix ?? "cutdown-sources";
    this.ttlMs = Math.min(opts.ttlMs ?? DEFAULT_TTL_MS, 7 * 24 * 60 * 60 * 1000);
    this.now = opts.now ?? (() => Date.now());
  }

  async uploadAndSign(localPath: string, destName?: string): Promise<string> {
    const dest = `${this.prefix}/${destName ?? path.basename(localPath)}`;
    await this.bucket.upload(localPath, { destination: dest });
    return this.sign(dest);
  }

  async sign(storagePath: string): Promise<string> {
    const [url] = await this.bucket
      .file(storagePath)
      .getSignedUrl({ action: "read", expires: this.now() + this.ttlMs });
    return url;
  }
}
