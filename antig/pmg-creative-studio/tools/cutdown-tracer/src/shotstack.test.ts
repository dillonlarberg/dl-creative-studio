/**
 * Tests for the Shotstack renderer. The pure timeline builder is asserted
 * directly; the renderer uses an INJECTED fetch (fake), so no real Shotstack call
 * is made and the suite stays no-network.
 */
import { describe, it, expect } from "vitest";
import { buildShotstackTimeline, ShotstackRenderer, type FetchLike } from "./shotstack.js";
import { EditSpecSchema, type EditSpec } from "./types.js";

const spec: EditSpec = EditSpecSchema.parse({
  sourceUrl: "https://signed/source.mp4",
  musicUrl: "https://signed/music.mp3",
  cuts: [
    { srcIn: 10, srcOut: 12, len: 2 },
    { srcIn: 30, srcOut: 32, len: 2 },
    { srcIn: 0, srcOut: 1, len: 1 },
  ],
  totalSec: 5,
  width: 1080,
  height: 1920,
});

describe("buildShotstackTimeline", () => {
  it("maps cuts to sequential video clips trimmed at each srcIn", () => {
    const tl = buildShotstackTimeline(spec) as any;
    const clips = tl.timeline.tracks[0].clips;
    expect(clips).toHaveLength(3);
    expect(clips[0]).toMatchObject({ start: 0, length: 2, asset: { src: spec.sourceUrl, trim: 10 } });
    expect(clips[1]).toMatchObject({ start: 2, length: 2, asset: { trim: 30 } });
    expect(clips[2]).toMatchObject({ start: 4, length: 1, asset: { trim: 0 } });
  });

  it("lays the music on its own track across the timeline with a tail fade", () => {
    const tl = buildShotstackTimeline(spec) as any;
    const audio = tl.timeline.tracks[1].clips[0];
    expect(audio.asset).toMatchObject({ type: "audio", src: spec.musicUrl });
    expect(audio).toMatchObject({ start: 0, length: 5, transition: { out: "fade" } });
  });

  it("emits the output contract dimensions", () => {
    const tl = buildShotstackTimeline(spec) as any;
    expect(tl.output).toMatchObject({ format: "mp4", size: { width: 1080, height: 1920 } });
  });

  it("video clips tile the timeline start-to-end with no gaps", () => {
    const tl = buildShotstackTimeline(spec) as any;
    const clips = tl.timeline.tracks[0].clips;
    let cursor = 0;
    for (const c of clips) {
      expect(c.start).toBeCloseTo(cursor, 9);
      cursor += c.length;
    }
    expect(cursor).toBeCloseTo(spec.totalSec, 9);
  });
});

/** A scripted fake fetch: submit returns an id, then status goes done with a URL. */
function fakeFetch(opts: { submitStatus?: number; statuses?: string[]; url?: string }): FetchLike {
  const statuses = [...(opts.statuses ?? ["queued", "done"])];
  return async (url, init) => {
    const isSubmit = (init?.method ?? "GET") === "POST";
    if (isSubmit) {
      const status = opts.submitStatus ?? 201;
      return {
        status,
        ok: status >= 200 && status < 300,
        json: async () => ({ success: status < 400, response: { id: "render-1" } }),
      };
    }
    const status = statuses.shift() ?? "done";
    return {
      status: 200,
      ok: true,
      json: async () => ({ response: { status, url: status === "done" ? (opts.url ?? "https://cdn/out.mp4") : undefined } }),
    };
  };
}

describe("ShotstackRenderer", () => {
  it("submits, polls to done, and returns the mp4 URL", async () => {
    const r = new ShotstackRenderer("k", { pollIntervalMs: 0, fetchFn: fakeFetch({ url: "https://cdn/reel.mp4" }) });
    expect(await r.render(spec)).toEqual({ mp4Url: "https://cdn/reel.mp4" });
  });

  it("falls back to the second base host on 403/404", async () => {
    let firstHostTried = "";
    const fetchFn: FetchLike = async (url, init) => {
      if ((init?.method ?? "GET") === "POST") {
        if (!firstHostTried) {
          firstHostTried = url;
          return { status: 404, ok: false, json: async () => ({}) };
        }
        return { status: 201, ok: true, json: async () => ({ success: true, response: { id: "x" } }) };
      }
      return { status: 200, ok: true, json: async () => ({ response: { status: "done", url: "https://cdn/ok.mp4" } }) };
    };
    const r = new ShotstackRenderer("k", { pollIntervalMs: 0, fetchFn });
    expect((await r.render(spec)).mp4Url).toBe("https://cdn/ok.mp4");
    expect(firstHostTried).toContain("/edit/stage");
  });

  it("throws on a 401 (bad key)", async () => {
    const fetchFn: FetchLike = async () => ({ status: 401, ok: false, json: async () => ({}) });
    const r = new ShotstackRenderer("k", { pollIntervalMs: 0, fetchFn });
    await expect(r.render(spec)).rejects.toThrow(/401/);
  });

  it("throws when a render reports failed", async () => {
    const r = new ShotstackRenderer("k", {
      pollIntervalMs: 0,
      fetchFn: fakeFetch({ statuses: ["queued", "failed"] }),
    });
    await expect(r.render(spec)).rejects.toThrow(/failed/);
  });

  it("requires an API key", () => {
    expect(() => new ShotstackRenderer("")).toThrow(/SHOTSTACK_API_KEY/);
  });
});
