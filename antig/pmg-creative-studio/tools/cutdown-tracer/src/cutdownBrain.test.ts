import { describe, it, expect } from "vitest";
import { GeminiCutdownBrain } from "./cutdownBrain.js";
import type { GenAiLike } from "./geminiCore.js";

/** Fake client that returns queued generateContent responses in order. Reused by later tests. */
export function queuedClient(responses: unknown[]) {
  const queue = [...responses];
  const calls = { generate: 0, upload: 0, delete: 0 };
  const client: GenAiLike = {
    models: {
      generateContent: async () => {
        calls.generate++;
        if (queue.length === 0) throw new Error("queuedClient: out of responses");
        return queue.shift();
      },
    },
    files: {
      upload: async () => { calls.upload++; return { name: "files/x", uri: "u", mimeType: "video/mp4", state: "ACTIVE" }; },
      get: async () => ({ name: "files/x", uri: "u", mimeType: "video/mp4", state: "ACTIVE" }),
      delete: async () => { calls.delete++; return {}; },
    },
  };
  return { client, calls };
}

const analysisJson = {
  text: JSON.stringify({
    theme: "a product launch",
    beats: [
      { startSec: 2, endSec: 5, score: 0.9, summary: "reveal", role: "reveal" },
      { startSec: 20, endSec: 23, score: 0.6, summary: "intro", role: "hook" },
      { startSec: 40, endSec: 43, score: 0.75, summary: "react", role: "reaction" },
    ],
  }),
};

describe("GeminiCutdownBrain.analyze", () => {
  it("uploads once, returns a validated theme + beats, deletes the file", async () => {
    const { client, calls } = queuedClient([analysisJson]);
    const brain = new GeminiCutdownBrain(client, { pollIntervalMs: 0 });
    const analysis = await brain.analyze({ path: "x.mp4" }, 60);
    expect(analysis.theme).toBe("a product launch");
    expect(analysis.beats).toHaveLength(3);
    expect(calls.upload).toBe(1);
    expect(calls.delete).toBe(1);
  });
});
