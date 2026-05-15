import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";

import { runPhase1 } from "./phase1.js";
import { runPhase2 } from "./phase2.js";
import { runPipeline } from "./pipeline.js";
import { TARGET_PRESETS, legalGenDims } from "./config.js";
import { prepPaddedCanvas } from "./canvasPrep.js";
import type { P1Output } from "./schema.js";

async function makeTestPng(w = 64, h = 64, color = { r: 200, g: 100, b: 50 }): Promise<Buffer> {
  return sharp({
    create: { width: w, height: h, channels: 3, background: color },
  })
    .png()
    .toBuffer();
}

const validP1: P1Output = {
  subjectDescription: "test subject",
  subjectLocation: "center",
  subjectBbox: [0.25, 0.25, 0.5, 0.5],
  copyRegions: [],
  styleCues: ["test"],
  extensionDirective: "extend on all sides",
};

// ── Mock genai client (Phase 1) ──
interface GenAiResp {
  text?: string;
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string; inlineData?: { data?: string; mimeType?: string } }> };
  }>;
  promptFeedback?: { blockReason?: string };
}

function makeGenAi(generateContent: (req: unknown) => Promise<GenAiResp>): {
  models: { generateContent: typeof generateContent };
} {
  return { models: { generateContent } };
}

// ── Mock OpenAI client (Phase 2) ──
interface OpenAiEditResp {
  data?: Array<{ b64_json?: string }>;
}

function makeOpenAi(edit: (req: unknown) => Promise<OpenAiEditResp>): {
  images: { edit: typeof edit };
} {
  return { images: { edit } };
}

function makeOpenAiThrows(err: unknown): { images: { edit: () => Promise<never> } } {
  return {
    images: {
      edit: async () => {
        throw err;
      },
    },
  };
}

describe("legalGenDims", () => {
  it("rounds dims to multiples of 16", () => {
    const d = legalGenDims({ w: 1080, h: 1920 });
    expect(d.w % 16).toBe(0);
    expect(d.h % 16).toBe(0);
  });

  it("ensures long edge >= 1024", () => {
    const d = legalGenDims({ w: 300, h: 250 });
    expect(Math.max(d.w, d.h)).toBeGreaterThanOrEqual(1024);
  });

  it("clamps extreme aspect ratios into [1:3, 3:1]", () => {
    const d = legalGenDims({ w: 100, h: 1000 }); // 1:10 — should be clamped
    const aspect = d.w / d.h;
    expect(aspect).toBeGreaterThanOrEqual(1 / 3 - 0.05);
  });

  it("never produces dims that exceed gpt-image-2's 3:1 / 1:3 hard limit", () => {
    // Targets that previously rounded to 336×1024 (3.047:1) and were rejected.
    const skinnies = [
      { w: 160, h: 600 },
      { w: 728, h: 90 },
      { w: 320, h: 50 },
      { w: 100, h: 1000 },
      { w: 1000, h: 100 },
    ];
    for (const t of skinnies) {
      const d = legalGenDims(t);
      expect(d.w / d.h).toBeLessThanOrEqual(3);
      expect(d.h / d.w).toBeLessThanOrEqual(3);
    }
  });

  it("clears gpt-image-2's 655,360 minimum pixel budget for every preset", () => {
    const targets = [
      { w: 160, h: 600 },   // skinny vertical
      { w: 728, h: 90 },    // skinny horizontal
      { w: 320, h: 50 },    // extreme horizontal
      { w: 300, h: 250 },   // small in-band
      { w: 1080, h: 1920 }, // social vertical
      { w: 1920, h: 1080 }, // landscape
    ];
    for (const t of targets) {
      const d = legalGenDims(t);
      expect(d.w * d.h).toBeGreaterThanOrEqual(655_360);
      expect(d.w % 16).toBe(0);
      expect(d.h % 16).toBe(0);
    }
  });

  it("throws on zero or negative target dims (runaway-loop guard)", () => {
    expect(() => legalGenDims({ w: 0, h: 100 })).toThrow();
    expect(() => legalGenDims({ w: 100, h: 0 })).toThrow();
    expect(() => legalGenDims({ w: -10, h: 100 })).toThrow();
  });

  it("stays within gpt-image-2's 8,294,400 max pixel budget for oversized targets", () => {
    // Regression: 8.5×11" @ 300dpi (2550×3300) rounded to 2544×3296 =
    // 8,385,024 px, over the cap. Issue #25.
    const oversized = [
      { w: 2550, h: 3300 },
      { w: 3300, h: 2550 },
      { w: 3000, h: 3000 },
    ];
    for (const t of oversized) {
      const d = legalGenDims(t);
      expect(d.w * d.h).toBeLessThanOrEqual(8_294_400);
      expect(d.w % 16).toBe(0);
      expect(d.h % 16).toBe(0);
      expect(Math.max(d.w, d.h)).toBeLessThanOrEqual(3840);
    }
  });
});

describe("runPhase1", () => {
  it("returns parsed P1Output on valid JSON", async () => {
    const ai = makeGenAi(async () => ({ text: JSON.stringify(validP1) }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await runPhase1(ai as any, {
      sourceB64: "x",
      sourceMime: "image/png",
      sourceSpec: { w: 64, h: 64 },
      targetSpec: { w: 1080, h: 1920 },
    });
    expect(out.subjectDescription).toBe("test subject");
  });

  it("retries once on malformed JSON, succeeds on second try", async () => {
    let n = 0;
    const ai = makeGenAi(async () => {
      n++;
      if (n === 1) return { text: "not json" };
      return { text: JSON.stringify(validP1) };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await runPhase1(ai as any, {
      sourceB64: "x",
      sourceMime: "image/png",
      sourceSpec: { w: 64, h: 64 },
      targetSpec: { w: 1080, h: 1920 },
    });
    expect(out.subjectDescription).toBe("test subject");
    expect(n).toBe(2);
  });

  it("throws after one retry when both attempts malformed", async () => {
    const ai = makeGenAi(async () => ({ text: "still not json" }));
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      runPhase1(ai as any, {
        sourceB64: "x",
        sourceMime: "image/png",
        sourceSpec: { w: 64, h: 64 },
        targetSpec: { w: 1080, h: 1920 },
      }),
    ).rejects.toThrow();
  });
});

describe("runPhase2 (OpenAI gpt-image-2)", () => {
  it("returns imageBuffer + paddedCanvas on b64_json", async () => {
    const png = await makeTestPng();
    const fakePngB64 = (await makeTestPng(128, 128)).toString("base64");
    let request: unknown = null;
    const openai = makeOpenAi(async (req) => {
      request = req;
      return { data: [{ b64_json: fakePngB64 }] };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await runPhase2(openai as any, {
      p1: validP1,
      source: png,
      sourceSpec: { w: 64, h: 64 },
      targetSpec: { w: 1080, h: 1920 },
    });
    expect(Buffer.isBuffer(out.imageBuffer)).toBe(true);
    expect(out.imageBuffer.length).toBeGreaterThan(0);
    expect(Buffer.isBuffer(out.paddedCanvas.imageBuffer)).toBe(true);
    expect(Buffer.isBuffer(out.paddedCanvas.maskBuffer)).toBe(true);
    expect(out.paddedCanvas.width).toBeGreaterThan(0);
    expect(out.paddedCanvas.height).toBeGreaterThan(0);
    expect((request as { quality?: string }).quality).toBe("medium");
  });

  it("passes high quality through to OpenAI when requested", async () => {
    const png = await makeTestPng();
    const fakePngB64 = (await makeTestPng(128, 128)).toString("base64");
    let request: unknown = null;
    const openai = makeOpenAi(async (req) => {
      request = req;
      return { data: [{ b64_json: fakePngB64 }] };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await runPhase2(openai as any, {
      p1: validP1,
      source: png,
      sourceSpec: { w: 64, h: 64 },
      targetSpec: { w: 1080, h: 1920 },
      quality: "high",
    });
    expect((request as { quality?: string }).quality).toBe("high");
  });

  it("throws when response has no b64_json", async () => {
    const png = await makeTestPng();
    const openai = makeOpenAi(async () => ({ data: [{}] }));
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      runPhase2(openai as any, {
        p1: validP1,
        source: png,
        sourceSpec: { w: 64, h: 64 },
        targetSpec: { w: 1080, h: 1920 },
      }),
    ).rejects.toThrow(/no image \(no b64_json/);
  });

  it("propagates 429 rate-limit errors", async () => {
    const png = await makeTestPng();
    const err = Object.assign(new Error("rate limit hit"), { status: 429 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const openai = makeOpenAiThrows(err) as any;
    await expect(
      runPhase2(openai, {
        p1: validP1,
        source: png,
        sourceSpec: { w: 64, h: 64 },
        targetSpec: { w: 1080, h: 1920 },
      }),
    ).rejects.toThrow(/rate limit hit/);
  });

  it("translates 403 verified-org errors with helpful hint", async () => {
    const png = await makeTestPng();
    const err = Object.assign(new Error("organization_must_be_verified to access this model"), {
      status: 403,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const openai = makeOpenAiThrows(err) as any;
    await expect(
      runPhase2(openai, {
        p1: validP1,
        source: png,
        sourceSpec: { w: 64, h: 64 },
        targetSpec: { w: 1080, h: 1920 },
      }),
    ).rejects.toThrow(/verify at platform\.openai\.com/);
  });
});

describe("prepPaddedCanvas", () => {
  it("produces image and mask at legalGenDims", async () => {
    const png = await makeTestPng(64, 64);
    const target = TARGET_PRESETS["social-9x16"];
    const padded = await prepPaddedCanvas(png, { w: 64, h: 64 }, target);
    const expected = legalGenDims(target);
    expect(padded.width).toBe(expected.w);
    expect(padded.height).toBe(expected.h);

    const imgMeta = await sharp(padded.imageBuffer).metadata();
    const maskMeta = await sharp(padded.maskBuffer).metadata();
    expect(imgMeta.width).toBe(expected.w);
    expect(imgMeta.height).toBe(expected.h);
    expect(maskMeta.width).toBe(expected.w);
    expect(maskMeta.height).toBe(expected.h);
    expect(imgMeta.channels).toBe(4);
    expect(maskMeta.channels).toBe(4);
  });

  it("mask is opaque-white over source region, transparent elsewhere", async () => {
    const png = await makeTestPng(64, 64);
    const target = TARGET_PRESETS["social-9x16"];
    const padded = await prepPaddedCanvas(png, { w: 64, h: 64 }, target);
    const { data: maskRaw, info } = await sharp(padded.maskBuffer)
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(4);

    // Pixel at center of source region should be opaque white.
    const cx = padded.offsetX + Math.floor(padded.scaledW / 2);
    const cy = padded.offsetY + Math.floor(padded.scaledH / 2);
    const ci = (cy * info.width + cx) * 4;
    expect(maskRaw[ci + 0]).toBe(255);
    expect(maskRaw[ci + 1]).toBe(255);
    expect(maskRaw[ci + 2]).toBe(255);
    expect(maskRaw[ci + 3]).toBe(255);

    // Pixel near top-left corner (outside source for portrait targets) is transparent.
    const oi = (1 * info.width + 1) * 4;
    expect(maskRaw[oi + 3]).toBe(0);
  });
});

describe("runPipeline (happy path)", () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tracer-test-"));
    process.chdir(tmpDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("writes all artifacts and returns paths + timings", async () => {
    const png = await makeTestPng(64, 64);
    const target = TARGET_PRESETS["social-9x16"];
    const dims = legalGenDims(target);
    const fakeModelOut = (
      await sharp({
        create: { width: dims.w, height: dims.h, channels: 3, background: { r: 50, g: 80, b: 200 } },
      })
        .png()
        .toBuffer()
    ).toString("base64");

    const genai = makeGenAi(async () => ({ text: JSON.stringify(validP1) }));
    const openai = makeOpenAi(async () => ({ data: [{ b64_json: fakeModelOut }] }));

    const result = await runPipeline({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      genai: genai as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      openai: openai as any,
      runId: "test-run-001",
      source: png,
      sourceMime: "image/png",
      sourceFilename: "creative-01.png",
      targetSpec: target,
    });

    expect(result.runId).toBe("test-run-001");
    expect(result.timings.p1Ms).toBeGreaterThanOrEqual(0);
    expect(result.timings.p2Ms).toBeGreaterThanOrEqual(0);
    expect(result.p2Quality).toBe("medium");
    expect(result.p1.subjectDescription).toBe("test subject");

    // All artifacts on disk.
    await fs.access(result.sourcePath);
    await fs.access(result.p1Path);
    await fs.access(result.p2CanvasPath);
    await fs.access(result.p2MaskPath);
    await fs.access(result.p2RawPath);
    await fs.access(result.p2FinalPath);

    // Final dims match exact target.
    const finalMeta = await sharp(await fs.readFile(result.p2FinalPath)).metadata();
    expect(finalMeta.width).toBe(target.w);
    expect(finalMeta.height).toBe(target.h);
  });
});
