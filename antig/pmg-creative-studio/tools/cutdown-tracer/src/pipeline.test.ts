/**
 * End-to-end: runPipeline wired with ALL Fakes — no network, no env. Asserts a
 * 15.000s plan flows through to a returned MP4 URL with hard cuts (PRD #6, #27, #30).
 */
import { describe, it, expect } from "vitest";
import { runPipeline } from "./pipeline.js";
import { makeDeps } from "./factory.js";
import {
  FakeEvenSpacedSelector,
  FakeFixedBpm,
  FakeMusicCatalog,
  FakeEchoRenderer,
  FakeBlobStore,
} from "./fakes.js";
import { EditSpecSchema, OUTPUT } from "./types.js";
import { totalLen } from "./planCuts.js";
import type { PipelineDeps } from "./seams.js";

const fakeDeps = (): PipelineDeps => ({
  selector: new FakeEvenSpacedSelector(),
  tempo: new FakeFixedBpm(),
  catalog: new FakeMusicCatalog(),
  renderer: new FakeEchoRenderer(),
  blobStore: new FakeBlobStore(),
});

describe("runPipeline (all Fakes, no network)", () => {
  it("flows a 15.000s plan through to an mp4Url", async () => {
    const result = await runPipeline("fixtures/test_01.mp4", "pulse-120", fakeDeps());

    expect(totalLen(result.plan)).toBe(OUTPUT.totalSec);
    expect(result.mp4Url).toMatch(/^fake:\/\/render\//);
    expect(result.bpm).toBe(120);
    expect(result.plan.length).toBeGreaterThan(1); // hard cuts, not one long clip
  });

  it("produces a renderer-ready, schema-valid EditSpec at the output contract", async () => {
    const { spec } = await runPipeline("fixtures/test_01.mp4", "pulse-120", fakeDeps());
    expect(() => EditSpecSchema.parse(spec)).not.toThrow();
    expect(spec.width).toBe(1080);
    expect(spec.height).toBe(1920);
    expect(spec.totalSec).toBe(15);
  });

  it("uploads the source to the BlobStore and uses the signed URL (not the local path)", async () => {
    const { spec } = await runPipeline("fixtures/test_01.mp4", "pulse-120", fakeDeps());
    expect(spec.sourceUrl).toMatch(/^fake:\/\/blob\//); // signed URL, fetchable by the renderer
    expect(spec.sourceUrl).not.toBe("fixtures/test_01.mp4"); // never the bare local path
  });

  it("encodes the cut count into the (fake) render URL — plan reached the renderer intact", async () => {
    const { plan, mp4Url } = await runPipeline("fixtures/test_01.mp4", "pulse-120", fakeDeps());
    expect(mp4Url).toContain(`${plan.length}-cuts`);
  });

  it("falls back to the TempoDetector when the track carries no BPM", async () => {
    // drift-90 has a catalog BPM (90); swap in a catalog track with none to exercise the fallback.
    const deps = fakeDeps();
    deps.catalog = new FakeMusicCatalog([
      {
        trackId: "no-bpm",
        title: "No BPM",
        url: "fake://music/no-bpm.mp3",
        format: "mp3",
        durationSec: 30,
        provider: "fake",
        licenseRef: "fake-license-9999",
      },
    ]);
    deps.tempo = new FakeFixedBpm(128);
    const { bpm } = await runPipeline("fixtures/test_01.mp4", "no-bpm", deps);
    expect(bpm).toBe(128); // came from the detector, not the catalog
  });

  it("prefers the catalog BPM over the detector when present", async () => {
    const deps = fakeDeps();
    deps.tempo = new FakeFixedBpm(200); // would differ if used
    const { bpm } = await runPipeline("fixtures/test_01.mp4", "drift-90", deps);
    expect(bpm).toBe(90); // catalog wins
  });
});

describe("makeDeps factory", () => {
  it("returns all Fakes by default (USE_FAKES unset)", async () => {
    const deps = makeDeps({});
    const result = await runPipeline("fixtures/test_01.mp4", "pulse-120", deps);
    expect(result.mp4Url).toMatch(/^fake:\/\/render\//);
  });

  it("returns Fakes when USE_FAKES=1", () => {
    expect(() => makeDeps({ USE_FAKES: "1" })).not.toThrow();
  });

  it("wires the real Gemini selector but defers tempo/catalog/renderer (USE_FAKES=0)", () => {
    // With a key present, the real selector constructs; the not-yet seams (step 4–5) still throw.
    expect(() => makeDeps({ USE_FAKES: "0", GEMINI_API_KEY: "test-key" })).toThrow(/not yet|build-order/);
  });

  it("requires GEMINI_API_KEY when going real (USE_FAKES=0)", () => {
    expect(() => makeDeps({ USE_FAKES: "0" })).toThrow(/GEMINI_API_KEY/);
  });
});
