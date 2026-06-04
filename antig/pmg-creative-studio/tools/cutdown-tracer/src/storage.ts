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
}

export class GcsBlobStore implements BlobStore {
  private readonly prefix: string;

  constructor(
    private readonly bucket: BucketLike,
    private readonly resolveUrl: ReadUrlResolver,
    opts: GcsBlobStoreOptions = {},
  ) {
    this.prefix = opts.prefix ?? "cutdown-sources";
  }

  async uploadAndSign(localPath: string, destName?: string): Promise<string> {
    const dest = `${this.prefix}/${destName ?? path.basename(localPath)}`;
    await this.bucket.upload(localPath, { destination: dest });
    return this.resolveUrl(dest);
  }

  async sign(storagePath: string): Promise<string> {
    return this.resolveUrl(storagePath);
  }
}
