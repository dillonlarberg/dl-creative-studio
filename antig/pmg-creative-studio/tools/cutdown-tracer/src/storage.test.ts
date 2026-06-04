/**
 * Contract tests for GcsBlobStore — the bucket is INJECTED (a fake recording
 * calls), so no network/credentials are needed. Clock is injected for determinism.
 */
import { describe, it, expect } from "vitest";
import { GcsBlobStore, type BucketLike } from "./storage.js";

interface Recorded {
  uploads: Array<{ localPath: string; destination: string }>;
  signed: Array<{ objectPath: string; expires: number }>;
}

function fakeBucket(): { bucket: BucketLike; rec: Recorded } {
  const rec: Recorded = { uploads: [], signed: [] };
  const bucket: BucketLike = {
    upload: async (localPath, opts) => {
      rec.uploads.push({ localPath, destination: opts.destination });
      return {};
    },
    file: (objectPath) => ({
      getSignedUrl: async (opts) => {
        rec.signed.push({ objectPath, expires: opts.expires });
        return [`https://storage.example/${objectPath}?X-Goog-Expires=${opts.expires}`];
      },
    }),
  };
  return { bucket, rec };
}

const FIXED_NOW = 1_000_000;

describe("GcsBlobStore", () => {
  it("uploads to the prefixed destination and returns a signed URL", async () => {
    const { bucket, rec } = fakeBucket();
    const store = new GcsBlobStore(bucket, { prefix: "src", now: () => FIXED_NOW });
    const url = await store.uploadAndSign("/tmp/clip.mp4");
    expect(rec.uploads[0]).toEqual({ localPath: "/tmp/clip.mp4", destination: "src/clip.mp4" });
    expect(url).toContain("src/clip.mp4");
  });

  it("honors an explicit destination name", async () => {
    const { bucket, rec } = fakeBucket();
    const store = new GcsBlobStore(bucket, { prefix: "src" });
    await store.uploadAndSign("/tmp/clip.mp4", "run-42.mp4");
    expect(rec.uploads[0].destination).toBe("src/run-42.mp4");
  });

  it("signs an existing object path without uploading", async () => {
    const { bucket, rec } = fakeBucket();
    const store = new GcsBlobStore(bucket, { now: () => FIXED_NOW });
    const url = await store.sign("sampleMusic/pulse-120.mp3");
    expect(rec.uploads).toHaveLength(0);
    expect(url).toContain("sampleMusic/pulse-120.mp3");
  });

  it("sets a future read expiry within the 7-day V4 cap", async () => {
    const { bucket, rec } = fakeBucket();
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    const store = new GcsBlobStore(bucket, { ttlMs: SEVEN_DAYS * 10, now: () => FIXED_NOW }); // over-cap → clamped
    await store.sign("x");
    const expires = rec.signed[0].expires;
    expect(expires).toBeGreaterThan(FIXED_NOW);
    expect(expires - FIXED_NOW).toBeLessThanOrEqual(SEVEN_DAYS);
  });
});
