/**
 * ShotstackRenderer — the real `VideoRenderer` (build-order step 5).
 *
 * Two parts:
 *   - `buildShotstackTimeline(spec)` — a PURE function mapping our EditSpec to a
 *     Shotstack render payload (hard cuts → video clips, music → an audio track
 *     with a tail fade, 1080×1920 / 15s output). Unit-tested directly.
 *   - `ShotstackRenderer` — submits the payload and polls to `done`, using an
 *     injected `fetch` so tests run no-network. Mirrors the proven call shape in
 *     `scripts/verify-shotstack.ts` (incl. the /edit/stage vs /stage host quirk).
 */
import type { VideoRenderer } from "./seams.js";
import type { EditSpec } from "./types.js";

/** Shotstack base hosts — docs disagree (/edit/stage vs /stage); we discover at submit. */
export const STAGE_BASES = [
  "https://api.shotstack.io/edit/stage",
  "https://api.shotstack.io/stage",
];

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * Map an EditSpec to a Shotstack render payload. Hard cuts only (no transitions —
 * they blur the beat hit and eat the duration budget); music baked across the
 * whole timeline with a tail fade.
 */
export function buildShotstackTimeline(spec: EditSpec): Record<string, unknown> {
  let start = 0;
  const videoClips = spec.cuts.map((cut) => {
    const clip = {
      asset: { type: "video", src: spec.sourceUrl, trim: round3(cut.srcIn) },
      start: round3(start),
      length: round3(cut.len),
    };
    start = round3(start + cut.len);
    return clip;
  });

  const audioClip = {
    asset: { type: "audio", src: spec.musicUrl, trim: 0 },
    start: 0,
    length: spec.totalSec,
    transition: { out: "fade" }, // music tail fade so the cut doesn't stop on a hard audio cut
  };

  return {
    timeline: {
      background: "#000000",
      tracks: [
        { clips: videoClips }, // top: the cut video
        { clips: [audioClip] }, // music bed
      ],
    },
    output: {
      format: "mp4",
      size: { width: spec.width, height: spec.height },
      fps: 25,
    },
  };
}

export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ status: number; ok: boolean; json(): Promise<unknown> }>;

export interface ShotstackOptions {
  bases?: string[];
  pollIntervalMs?: number;
  timeoutMs?: number;
  fetchFn?: FetchLike;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class ShotstackRenderer implements VideoRenderer {
  private readonly bases: string[];
  private readonly pollIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly fetchFn: FetchLike;

  constructor(
    private readonly apiKey: string,
    opts: ShotstackOptions = {},
  ) {
    if (!apiKey) throw new Error("SHOTSTACK_API_KEY is required for ShotstackRenderer");
    this.bases = opts.bases ?? STAGE_BASES;
    this.pollIntervalMs = opts.pollIntervalMs ?? 3000;
    this.timeoutMs = opts.timeoutMs ?? 180_000;
    this.fetchFn = opts.fetchFn ?? (globalThis.fetch as unknown as FetchLike);
  }

  async render(spec: EditSpec): Promise<{ mp4Url: string }> {
    const payload = buildShotstackTimeline(spec);
    if (process.env.SHOTSTACK_DEBUG) {
      console.log(`[shotstack] payload:\n${JSON.stringify(payload, null, 2)}`);
    }
    const { base, id } = await this.submit(payload);
    console.log(`[shotstack] render id: ${id} (base ${base})`);
    const url = await this.poll(base, id);
    return { mp4Url: url };
  }

  /** POST the render, discovering the working base host (mirrors verify-shotstack). */
  private async submit(payload: unknown): Promise<{ base: string; id: string }> {
    for (const base of this.bases) {
      const res = await this.fetchFn(`${base}/render`, {
        method: "POST",
        headers: { "x-api-key": this.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 403 || res.status === 404) continue; // wrong host → next
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        response?: { id?: string };
      };
      if (res.status === 401) throw new Error("Shotstack 401 — check the SANDBOX key");
      if (!res.ok || !json.success || !json.response?.id) {
        throw new Error(`Shotstack submit failed (${res.status}): ${JSON.stringify(json).slice(0, 300)}`);
      }
      return { base, id: json.response.id };
    }
    throw new Error("Shotstack: no host accepted the request (tried /edit/stage and /stage)");
  }

  /** Poll until the render is `done`; return the playable URL. */
  private async poll(base: string, id: string): Promise<string> {
    const started = Date.now();
    for (;;) {
      if (Date.now() - started > this.timeoutMs) throw new Error(`Shotstack render > ${this.timeoutMs}ms`);
      await sleep(this.pollIntervalMs);
      const res = await this.fetchFn(`${base}/render/${id}`, {
        headers: { "x-api-key": this.apiKey },
      });
      const json = (await res.json().catch(() => ({}))) as {
        response?: { status?: string; url?: string; error?: unknown; data?: unknown };
      };
      const status = json.response?.status;
      if (process.env.SHOTSTACK_DEBUG) console.log(`[shotstack] status: ${status ?? "?"}`);
      if (status === "failed") {
        // Shotstack's error can be a string or an object — surface it fully (and the id for the dashboard).
        const detail =
          typeof json.response?.error === "string"
            ? json.response.error
            : JSON.stringify(json.response ?? {});
        throw new Error(`Shotstack render ${id} failed: ${detail}`);
      }
      if (status === "done" && json.response?.url) return json.response.url;
    }
  }
}

/** Wire the real renderer from an API key (sandbox/stage key for v0). */
export function makeShotstackRenderer(apiKey: string, opts?: ShotstackOptions): ShotstackRenderer {
  return new ShotstackRenderer(apiKey, opts);
}
