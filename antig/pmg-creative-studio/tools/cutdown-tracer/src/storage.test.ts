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
});
