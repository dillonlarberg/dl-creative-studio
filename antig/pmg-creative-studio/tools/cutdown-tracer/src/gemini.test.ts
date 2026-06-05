/**
 * Contract tests for GeminiMomentSelector — the genai client is INJECTED (a fake),
 * so these run no-network/no-env. They pin external behavior (Files API lifecycle,
 * structured-output validation, retry/backoff, cleanup), never internal call shapes.
 */
import { describe, it, expect, vi } from "vitest";
import { GeminiMomentSelector, type GenAiLike } from "./gemini.js";
import { SegmentSchema } from "./types.js";

interface FakeClientOpts {
  uploadStates?: string[]; // state returned by upload, then successive get() calls
  generate: (req: unknown) => Promise<unknown>;
  onDelete?: () => void;
}

/** A fake genai client capturing call counts, with a configurable Files API lifecycle. */
function makeFakeClient(opts: FakeClientOpts) {
  const states = [...(opts.uploadStates ?? ["ACTIVE"])];
  const calls = { upload: 0, get: 0, delete: 0, generate: 0 };
  const client: GenAiLike = {
    models: {
      generateContent: async (req) => {
        calls.generate++;
        return opts.generate(req);
      },
    },
    files: {
      upload: async () => {
        calls.upload++;
        return { name: "files/abc", uri: "https://files/abc", mimeType: "video/mp4", state: states.shift() ?? "ACTIVE" };
      },
      get: async () => {
        calls.get++;
        return { name: "files/abc", uri: "https://files/abc", mimeType: "video/mp4", state: states.shift() ?? "ACTIVE" };
      },
      delete: async () => {
        calls.delete++;
        opts.onDelete?.();
        return {};
      },
    },
  };
  return { client, calls };
}

const goodResponse = {
  text: JSON.stringify({
    segments: [
      { startSec: 2, endSec: 4, score: 0.9 },
      { startSec: 30, endSec: 33, score: 0.6 },
      { startSec: 10, endSec: 12, score: 0.8 },
    ],
  }),
};

describe("GeminiMomentSelector", () => {
  it("returns schema-valid segments sorted by score descending", async () => {
    const { client } = makeFakeClient({ generate: async () => goodResponse });
    const sel = new GeminiMomentSelector(client);
    const segs = await sel.select({ path: "fixtures/clip.mp4" }, { budgetSec: 15 });

    for (const s of segs) expect(() => SegmentSchema.parse(s)).not.toThrow();
    expect(segs.map((s) => s.score)).toEqual([0.9, 0.8, 0.6]); // sorted desc
  });

  it("polls the Files API until the upload is ACTIVE", async () => {
    const { client, calls } = makeFakeClient({
      uploadStates: ["PROCESSING", "PROCESSING", "ACTIVE"],
      generate: async () => goodResponse,
    });
    const sel = new GeminiMomentSelector(client, { pollIntervalMs: 0 });
    await sel.select({ path: "fixtures/clip.mp4" }, { budgetSec: 15 });
    expect(calls.upload).toBe(1);
    expect(calls.get).toBe(2); // two PROCESSING polls before ACTIVE
  });

  it("throws if the upload never becomes ACTIVE", async () => {
    const { client } = makeFakeClient({
      uploadStates: ["FAILED"],
      generate: async () => goodResponse,
    });
    const sel = new GeminiMomentSelector(client, { pollIntervalMs: 0 });
    await expect(sel.select({ path: "x.mp4" }, { budgetSec: 15 })).rejects.toThrow(/not ACTIVE/);
  });

  it("retries on a malformed response, then succeeds (backoff disabled in test)", async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce({ text: "not json {{{" })
      .mockResolvedValueOnce(goodResponse);
    const { client } = makeFakeClient({ generate });
    const sel = new GeminiMomentSelector(client, { maxAttempts: 3 });
    // override sleep by setting pollIntervalMs irrelevant; backoff sleeps are short (500ms) — keep maxAttempts low
    const segs = await sel.select({ path: "x.mp4" }, { budgetSec: 15 });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(segs).toHaveLength(3);
  });

  it("gives up after maxAttempts on persistent failure", async () => {
    const { client } = makeFakeClient({ generate: async () => ({ text: "garbage" }) });
    const sel = new GeminiMomentSelector(client, { maxAttempts: 2 });
    await expect(sel.select({ path: "x.mp4" }, { budgetSec: 15 })).rejects.toThrow(/failed after 2 attempts/);
  });

  it("best-effort deletes the uploaded file when done", async () => {
    let deleted = false;
    const { client } = makeFakeClient({ generate: async () => goodResponse, onDelete: () => (deleted = true) });
    const sel = new GeminiMomentSelector(client);
    await sel.select({ path: "x.mp4" }, { budgetSec: 15 });
    expect(deleted).toBe(true);
  });
});
