/**
 * Contract tests for GcsBlobStore — the bucket AND the URL resolver are INJECTED
 * (fakes), so no network/credentials are needed.
 */
import { describe, it, expect } from "vitest";
import { GcsBlobStore, type BucketLike, type ReadUrlResolver } from "./storage.js";

function fakeBucket(): { bucket: BucketLike; uploads: Array<{ localPath: string; destination: string }> } {
  const uploads: Array<{ localPath: string; destination: string }> = [];
  const bucket: BucketLike = {
    upload: async (localPath, opts) => {
      uploads.push({ localPath, destination: opts.destination });
      return {};
    },
  };
  return { bucket, uploads };
}

// Mirrors a getDownloadURL-style token URL (what functions/src/video.ts produces).
const resolver: ReadUrlResolver = async (objectPath) =>
  `https://firebasestorage.googleapis.com/v0/b/bucket/o/${encodeURIComponent(objectPath)}?alt=media&token=abc`;

describe("GcsBlobStore", () => {
  it("uploads to the prefixed destination and returns a fetchable URL", async () => {
    const { bucket, uploads } = fakeBucket();
    const store = new GcsBlobStore(bucket, resolver, { prefix: "src" });
    const url = await store.uploadAndSign("/tmp/clip.mp4");
    expect(uploads[0]).toEqual({ localPath: "/tmp/clip.mp4", destination: "src/clip.mp4" });
    expect(url).toContain(encodeURIComponent("src/clip.mp4"));
    expect(url).toContain("token=abc");
  });

  it("honors an explicit destination name", async () => {
    const { bucket, uploads } = fakeBucket();
    const store = new GcsBlobStore(bucket, resolver, { prefix: "src" });
    await store.uploadAndSign("/tmp/clip.mp4", "run-42.mp4");
    expect(uploads[0].destination).toBe("src/run-42.mp4");
  });

  it("signs an existing object path without uploading", async () => {
    const { bucket, uploads } = fakeBucket();
    const store = new GcsBlobStore(bucket, resolver);
    const url = await store.sign("sampleMusic/pulse-120.mp3");
    expect(uploads).toHaveLength(0);
    expect(url).toContain(encodeURIComponent("sampleMusic/pulse-120.mp3"));
  });

  it("retries a transient upload failure (ETIMEDOUT), then succeeds", async () => {
    let attempts = 0;
    const bucket: BucketLike = {
      upload: async () => {
        attempts++;
        if (attempts === 1) throw new Error("read ETIMEDOUT");
        return {};
      },
    };
    const store = new GcsBlobStore(bucket, resolver, { prefix: "src", retryBackoffMs: 0 });
    const url = await store.uploadAndSign("/tmp/clip.mp4", "clip-1.mp4");
    expect(attempts).toBe(2); // failed once, retried, succeeded
    expect(url).toContain(encodeURIComponent("src/clip-1.mp4"));
  });

  it("gives up after maxAttempts on persistent transient failure", async () => {
    let attempts = 0;
    const bucket: BucketLike = {
      upload: async () => {
        attempts++;
        throw new Error("read ETIMEDOUT");
      },
    };
    const store = new GcsBlobStore(bucket, resolver, { maxAttempts: 2, retryBackoffMs: 0 });
    await expect(store.uploadAndSign("/tmp/clip.mp4")).rejects.toThrow(/ETIMEDOUT/);
    expect(attempts).toBe(2);
  });

  it("does NOT retry a non-transient error (fails fast)", async () => {
    let attempts = 0;
    const bucket: BucketLike = {
      upload: async () => {
        attempts++;
        throw new Error("403 Forbidden: insufficient permissions");
      },
    };
    const store = new GcsBlobStore(bucket, resolver, { maxAttempts: 3, retryBackoffMs: 0 });
    await expect(store.uploadAndSign("/tmp/clip.mp4")).rejects.toThrow(/Forbidden/);
    expect(attempts).toBe(1); // no retries for a permission error
  });
});
