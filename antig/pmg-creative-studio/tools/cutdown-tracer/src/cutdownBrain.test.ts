import { describe, it, expect } from "vitest";
import { GeminiCutdownBrain } from "./cutdownBrain.js";
import type { GenAiLike } from "./geminiCore.js";
import type { SampleMusicTrack } from "./types.js";

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

const selectJson = (startSecs: number[]) => ({
  text: JSON.stringify({
    segments: startSecs.map((startSec) => ({
      startSec, endSec: startSec + 3, score: 0.8, summary: "m", role: "reveal", why: "fits the angle",
    })),
  }),
});

const critiqueJson = (startSecs: number[], description = "a tight, coherent cut") => ({
  text: JSON.stringify({
    description,
    segments: startSecs.map((startSec) => ({
      startSec, endSec: startSec + 3, score: 0.8, summary: "m", role: "reveal", why: "kept",
    })),
  }),
});

const analysis = JSON.parse(analysisJson.text) as import("./types.js").VideoAnalysis;

describe("GeminiCutdownBrain.selectForAngle", () => {
  it("returns angle-ordered segments with a why, text-only (no upload)", async () => {
    const { client, calls } = queuedClient([selectJson([2, 40, 20])]);
    const brain = new GeminiCutdownBrain(client);
    const segs = await brain.selectForAngle(analysis, "narrative", undefined, 60);
    expect(calls.upload).toBe(0);
    expect(segs.map((s) => s.startSec)).toEqual([2, 20, 40]);
    expect(segs[0].why).toBeTruthy();
  });
});

const selected: import("./types.js").Segment[] = [
  { startSec: 2, endSec: 5, score: 0.8, summary: "reveal", role: "reveal", why: "x" },
  { startSec: 40, endSec: 43, score: 0.6, summary: "react", role: "reaction", why: "y" },
];

describe("GeminiCutdownBrain.critique", () => {
  it("returns the revised selection when the model responds well", async () => {
    const { client } = queuedClient([critiqueJson([2], "a calm narrative")]);
    const brain = new GeminiCutdownBrain(client);
    const out = await brain.critique(analysis, "narrative", undefined, selected, 60);
    expect(out.segments).toHaveLength(1);
    expect(out.segments[0].why).toBe("kept");
    expect(out.description).toBe("a calm narrative");
  });

  it("degrades to the input selection if the critique call fails", async () => {
    const { client } = queuedClient([{ text: "garbage" }, { text: "garbage" }]);
    const brain = new GeminiCutdownBrain(client, { maxAttempts: 2, backoffMs: 0 });
    const out = await brain.critique(analysis, "narrative", undefined, selected, 60);
    expect(out.segments).toEqual(selected);
    expect(out.description.length).toBeGreaterThan(0);
  });
});

const track: SampleMusicTrack = {
  trackId: "t", title: "T", url: "fake://t.mp3", format: "mp3",
  durationSec: 120, bpm: 120, provider: "fake", licenseRef: "x",
};

describe("GeminiCutdownBrain.cutdown", () => {
  it("returns one CutdownPlan per angle from a single analyze + per-angle select+critique", async () => {
    const responses = [
      analysisJson,
      selectJson([2, 20, 40]), critiqueJson([2, 20, 40]),   // narrative: select, critique
      selectJson([2, 40, 20]), critiqueJson([2, 40, 20]),   // highlights
      selectJson([40, 2, 20]), critiqueJson([40, 2, 20]),   // punchy
    ];
    const { client, calls } = queuedClient(responses);
    const brain = new GeminiCutdownBrain(client, { pollIntervalMs: 0 });
    const plans = await brain.cutdown({ path: "x.mp4" }, track, { targetSec: 15, durationSec: 120 });

    expect(plans.map((p) => p.angle)).toEqual(["narrative", "highlights", "punchy"]);
    for (const p of plans) {
      expect(p.cuts.length).toBeGreaterThan(0);
      expect(p.description.length).toBeGreaterThan(0);
    }
    expect(calls.upload).toBe(1);
    expect(calls.generate).toBe(7); // 1 analyze + 3 select + 3 critique
  });

  it("throws when no angle yields a usable (in-bounds) plan", async () => {
    const responses = [
      analysisJson,
      selectJson([2, 20, 40]), critiqueJson([2, 20, 40]),
      selectJson([2, 40, 20]), critiqueJson([2, 40, 20]),
      selectJson([40, 2, 20]), critiqueJson([40, 2, 20]),
    ];
    const { client } = queuedClient(responses);
    const brain = new GeminiCutdownBrain(client, { pollIntervalMs: 0 });
    await expect(
      brain.cutdown({ path: "x.mp4" }, track, { targetSec: 15, durationSec: 1 }),
    ).rejects.toThrow(/no angle produced/);
  });
});
