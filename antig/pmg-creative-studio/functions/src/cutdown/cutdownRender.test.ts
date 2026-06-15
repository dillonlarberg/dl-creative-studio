/**
 * Orchestration tests for `cutdownRenderCore` — the render tail, with every seam
 * faked (no ffmpeg, no network, no Firestore). Pins the wiring that the
 * Shotstack→ffmpeg swap changed:
 *   - OutputDoc written with model "ffmpeg"
 *   - final mp4 uploaded ONCE to a versioned renders/ path (the per-clip upload
 *     loop is gone) with contentType video/mp4
 *   - storageRef = object path, previewUrl = signed URL (the storageRef TODO fix)
 *   - totalSec derived from the plan, not a client targetSec
 *   - failures mark the OutputDoc error and rethrow
 */
import { describe, it, expect } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { cutdownRenderCore, type CutdownRenderDeps, type CutdownRenderCoreInput } from "./cutdownRender";
import { FakeMusicCatalog, FakeClipExtractor, FakeReelRenderer } from "./engine/fakes";
import type { CutdownPlan } from "./engine/types";

interface Write {
  path: string;
  data: Record<string, unknown>;
  merge: boolean;
}

function makeFakeDb() {
  const writes: Write[] = [];
  const db = {
    doc: (path: string) => ({
      set: async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
        writes.push({ path, data, merge: !!opts?.merge });
      },
    }),
  } as unknown as Firestore;
  return { db, writes };
}

function makeDeps(over: Partial<CutdownRenderDeps> = {}) {
  const { db, writes } = makeFakeDb();
  const uploads: { localPath: string; opts: { destination: string; metadata?: Record<string, unknown> } }[] = [];
  const downloads: string[] = [];
  const signed: string[] = [];
  const deps: CutdownRenderDeps = {
    db,
    bucket: {
      file: (p: string) => ({
        download: async () => {
          downloads.push(p);
        },
      }),
      upload: async (localPath, opts) => {
        uploads.push({ localPath, opts });
      },
    },
    sign: async (p: string) => {
      signed.push(p);
      return `signed::${p}`;
    },
    catalog: new FakeMusicCatalog(),
    clipExtractor: new FakeClipExtractor(),
    renderer: new FakeReelRenderer(),
    fetchMusic: async () => {},
    ...over,
  };
  return { deps, writes, uploads, downloads, signed };
}

const plan: CutdownPlan = {
  angle: "narrative",
  description: "the pitch",
  cuts: [
    { srcIn: 0, srcOut: 2, len: 2 },
    { srcIn: 10, srcOut: 13, len: 3 },
  ],
};

const input: CutdownRenderCoreInput = {
  clientSlug: "acme",
  batchId: "b1",
  videoStoragePath: "clients/acme/apps/video-cutdown/uploads/x.mp4",
  trackId: "pulse-120",
  plan,
  createdBy: "user-1",
  renderTs: 1700000000000,
};

const EXPECTED_REF = "clients/acme/apps/video-cutdown/renders/b1/narrative-1700000000000.mp4";

describe("cutdownRenderCore", () => {
  it("returns the signed preview URL for the rendered angle", async () => {
    const { deps } = makeDeps();
    const result = await cutdownRenderCore(deps, input);
    expect(result).toEqual({ mp4Url: `signed::${EXPECTED_REF}`, angle: "narrative" });
  });

  it("creates the OutputDoc with model 'ffmpeg' and plan-derived duration", async () => {
    const { deps, writes } = makeDeps();
    await cutdownRenderCore(deps, input);
    const create = writes.find((w) => !w.merge && String(w.path).endsWith("/outputs/b1-narrative"));
    expect(create).toBeDefined();
    expect(create!.data).toMatchObject({
      model: "ffmpeg",
      status: "pending",
      kind: "video",
      format: { durationMs: 5000, aspectRatio: "9:16" }, // 2 + 3 = 5s, NOT a client targetSec
    });
  });

  it("uploads the final mp4 exactly once to a versioned renders/ path with video/mp4", async () => {
    const { deps, uploads } = makeDeps();
    await cutdownRenderCore(deps, input);
    expect(uploads).toHaveLength(1); // per-clip upload loop is gone
    expect(uploads[0].opts.destination).toBe(EXPECTED_REF);
    expect(uploads[0].opts.metadata).toMatchObject({ contentType: "video/mp4" });
  });

  it("completes the OutputDoc with storageRef = object path and previewUrl = signed URL", async () => {
    const { deps, writes } = makeDeps();
    await cutdownRenderCore(deps, input);
    const update = writes.find((w) => w.merge && String(w.path).endsWith("/outputs/b1-narrative"));
    expect(update).toBeDefined();
    expect(update!.data).toMatchObject({
      status: "complete",
      storageRef: EXPECTED_REF,
      previewUrl: `signed::${EXPECTED_REF}`,
    });
  });

  it("marks the OutputDoc error and rethrows when the renderer fails", async () => {
    const { deps, writes } = makeDeps({
      renderer: {
        render: async () => {
          throw new Error("ffmpeg boom");
        },
      },
    });
    await expect(cutdownRenderCore(deps, input)).rejects.toThrow(/ffmpeg boom/);
    const errWrite = writes.find((w) => w.merge && w.data.status === "error");
    expect(errWrite).toBeDefined();
    expect(errWrite!.data).toMatchObject({ errorCategory: "transient" });
  });
});
