import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { extractText, generateJson, uploadAndActivate, type GenAiLike } from "./geminiCore.js";

const Schema = z.object({ ok: z.boolean() });

/** Fake genai client with a configurable Files API state queue (no-network). */
function makeUploadClient(uploadStates: string[]) {
  const states = [...uploadStates];
  const calls = { upload: 0, get: 0 };
  const client: GenAiLike = {
    models: { generateContent: async () => ({}) },
    files: {
      upload: async () => {
        calls.upload++;
        return { name: "files/abc", uri: "u", mimeType: "video/mp4", state: states.shift() ?? "ACTIVE" };
      },
      get: async () => {
        calls.get++;
        return { name: "files/abc", uri: "u", mimeType: "video/mp4", state: states.shift() ?? "ACTIVE" };
      },
      delete: async () => ({}),
    },
  };
  return { client, calls };
}

function clientReturning(...responses: unknown[]): GenAiLike {
  const queue = [...responses];
  return {
    models: { generateContent: async () => queue.shift() },
    files: {
      upload: async () => ({ name: "files/x", uri: "u", mimeType: "video/mp4", state: "ACTIVE" }),
      get: async () => ({ name: "files/x", uri: "u", mimeType: "video/mp4", state: "ACTIVE" }),
      delete: async () => ({}),
    },
  };
}

describe("geminiCore", () => {
  it("extractText reads resp.text, else joins candidate parts", () => {
    expect(extractText({ text: "hi" })).toBe("hi");
    expect(extractText({ candidates: [{ content: { parts: [{ text: "a" }, { text: "b" }] } }] })).toBe("ab");
    expect(extractText({})).toBeNull();
  });

  it("generateJson validates and returns parsed output", async () => {
    const ai = clientReturning({ text: JSON.stringify({ ok: true }) });
    const out = await generateJson(ai, { model: "m", contents: [], schema: Schema });
    expect(out.ok).toBe(true);
  });

  it("generateJson retries on malformed output then succeeds", async () => {
    const gen = vi.fn()
      .mockResolvedValueOnce({ text: "nope{{" })
      .mockResolvedValueOnce({ text: JSON.stringify({ ok: true }) });
    const ai: GenAiLike = { ...clientReturning(), models: { generateContent: gen } };
    const out = await generateJson(ai, { model: "m", contents: [], schema: Schema, maxAttempts: 3, backoffMs: 0 });
    expect(gen).toHaveBeenCalledTimes(2);
    expect(out.ok).toBe(true);
  });

  it("generateJson gives up after maxAttempts", async () => {
    const ai = clientReturning({ text: "garbage" }, { text: "garbage" });
    await expect(
      generateJson(ai, { model: "m", contents: [], schema: Schema, maxAttempts: 2, backoffMs: 0 }),
    ).rejects.toThrow(/failed after 2 attempts/);
  });

  it("uploadAndActivate polls through PROCESSING until ACTIVE", async () => {
    const { client, calls } = makeUploadClient(["PROCESSING", "PROCESSING", "ACTIVE"]);
    const file = await uploadAndActivate(client, "x.mp4", { pollIntervalMs: 0 });
    expect(String(file.state)).toBe("ACTIVE");
    expect(calls.upload).toBe(1);
    expect(calls.get).toBe(2); // one PROCESSING poll before ACTIVE
  });

  it("uploadAndActivate throws if the file never becomes ACTIVE", async () => {
    const { client } = makeUploadClient(["FAILED"]);
    await expect(uploadAndActivate(client, "x.mp4", { pollIntervalMs: 0 })).rejects.toThrow(/not ACTIVE/);
  });
});
