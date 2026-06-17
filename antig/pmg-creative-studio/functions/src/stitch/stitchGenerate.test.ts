/**
 * Orchestration tests for `stitchGenerateCore` — the spine, every seam faked (no
 * ffmpeg, no network, no Firestore). Pins the wiring:
 *   - track bpm drives planStitch; totalSec derived from the plan (not client target)
 *   - each asset normalized to its planned slot duration, in order, with isStill by kind
 *   - OutputDoc: pending → complete, model "ffmpeg", plan-derived durationMs
 *   - final mp4 uploaded once to a versioned renders/ path with video/mp4
 *   - failures mark the OutputDoc error and rethrow
 */
import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import type { Firestore } from "firebase-admin/firestore";
import { stitchGenerateCore, type StitchGenerateDeps, type StitchGenerateCoreInput } from "./stitchGenerate";
import type { AssetRef } from "./engine/types";

interface Write { path: string; data: Record<string, unknown>; merge: boolean; }

function makeFakeDb() {
  const writes: Write[] = [];
  const db = {
    doc: (p: string) => ({
      set: async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
        writes.push({ path: p, data, merge: !!opts?.merge });
      },
    }),
  } as unknown as Firestore;
  return { db, writes };
}

function makeDeps(over: Partial<StitchGenerateDeps> = {}) {
  const { db, writes } = makeFakeDb();
  const uploads: { localPath: string; opts: { destination: string; metadata?: Record<string, unknown> } }[] = [];
  const normalized: { isStill: boolean; durationSec: number }[] = [];
  const fetched: string[] = [];
  const deps: StitchGenerateDeps = {
    db,
    catalog: { fetch: async () => ({ url: "https://music/x.mp3", bpm: 120 }) },
    renderer: { render: async () => ({ mp4Path: path.join(os.tmpdir(), "fake-reel.mp4") }) },
    bucket: { upload: async (localPath, opts) => { uploads.push({ localPath, opts }); } },
    sign: async (p: string) => `signed::${p}`,
    fetchUrl: async (url: string) => { fetched.push(url); },
    normalize: async (o) => { normalized.push({ isStill: o.isStill, durationSec: o.durationSec }); },
    ...over,
  };
  return { deps, writes, uploads, normalized, fetched };
}

const assets: AssetRef[] = [
  { datasourceId: "ds1", assetId: "a1", kind: "image", srcUrl: "https://cdn/a1.jpg" },
  { datasourceId: "ds1", assetId: "a2", kind: "video", srcUrl: "https://cdn/a2.mp4" },
];

const input: StitchGenerateCoreInput = {
  clientSlug: "acme",
  batchId: "b1",
  assets,
  trackId: "pulse-120",
  targetSec: 15,
  createdBy: "user-1",
  renderTs: 1700000000000,
};

const EXPECTED_REF = "clients/acme/apps/video-stitch/renders/b1/reel-1700000000000.mp4";

describe("stitchGenerateCore", () => {
  it("returns the signed reel URL", async () => {
    const { deps } = makeDeps();
    expect(await stitchGenerateCore(deps, input)).toEqual({ reelUrl: `signed::${EXPECTED_REF}` });
  });

  it("creates the OutputDoc with model 'ffmpeg' and plan-derived duration (15s)", async () => {
    const { deps, writes } = makeDeps();
    await stitchGenerateCore(deps, input);
    const create = writes.find((w) => !w.merge && w.path.endsWith("/outputs/b1"));
    expect(create).toBeDefined();
    expect(create!.data).toMatchObject({
      model: "ffmpeg",
      status: "pending",
      kind: "video",
      format: { durationMs: 15000, aspectRatio: "9:16" },
    });
  });

  it("normalizes each asset to its beat-snapped slot duration, in order, isStill by kind", async () => {
    const { deps, normalized } = makeDeps();
    await stitchGenerateCore(deps, input);
    // 2 assets, 120bpm, 15s → [7.5, 7.5]
    expect(normalized).toEqual([
      { isStill: true, durationSec: 7.5 },
      { isStill: false, durationSec: 7.5 },
    ]);
  });

  it("downloads the music + every asset", async () => {
    const { deps, fetched } = makeDeps();
    await stitchGenerateCore(deps, input);
    expect(fetched).toContain("https://music/x.mp3");
    expect(fetched).toContain("https://cdn/a1.jpg");
    expect(fetched).toContain("https://cdn/a2.mp4");
  });

  it("uploads the final mp4 once to a versioned renders/ path with video/mp4", async () => {
    const { deps, uploads } = makeDeps();
    await stitchGenerateCore(deps, input);
    expect(uploads).toHaveLength(1);
    expect(uploads[0].opts.destination).toBe(EXPECTED_REF);
    expect(uploads[0].opts.metadata).toMatchObject({ contentType: "video/mp4" });
  });

  it("completes the OutputDoc with storageRef + previewUrl", async () => {
    const { deps, writes } = makeDeps();
    await stitchGenerateCore(deps, input);
    const update = writes.find((w) => w.merge && w.path.endsWith("/outputs/b1"));
    expect(update!.data).toMatchObject({
      status: "complete",
      storageRef: EXPECTED_REF,
      previewUrl: `signed::${EXPECTED_REF}`,
    });
  });

  it("falls back to default bpm when the track has none", async () => {
    const { deps, normalized } = makeDeps({ catalog: { fetch: async () => ({ url: "https://m/x" }) } });
    await stitchGenerateCore(deps, input);
    // default 120bpm → same [7.5, 7.5]
    expect(normalized.map((n) => n.durationSec)).toEqual([7.5, 7.5]);
  });

  it("marks the OutputDoc error and rethrows when the renderer fails", async () => {
    const { deps, writes } = makeDeps({
      renderer: { render: async () => { throw new Error("ffmpeg boom"); } },
    });
    await expect(stitchGenerateCore(deps, input)).rejects.toThrow(/ffmpeg boom/);
    const errWrite = writes.find((w) => w.merge && w.data.status === "error");
    expect(errWrite!.data).toMatchObject({ errorCategory: "transient" });
  });
});
