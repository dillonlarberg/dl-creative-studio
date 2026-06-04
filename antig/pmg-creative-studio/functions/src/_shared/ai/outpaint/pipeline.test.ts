import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { legalGenDims } from "./config";
import { prepPaddedCanvas } from "./canvasPrep";
import { runPhase1Once, runPhase2ForTarget, detectSourceSpec } from "./pipeline";
import type { P1Output } from "./schema";

async function makeTestPng(w = 64, h = 64, color = { r: 200, g: 100, b: 50 }): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: color } }).png().toBuffer();
}

const validP1: P1Output = {
  subjectDescription: "test subject",
  subjectLocation: "center",
  subjectBbox: [0.25, 0.25, 0.5, 0.5],
  copyRegions: [],
  styleCues: ["test"],
  extensionDirective: "extend on all sides",
};

interface GenAiResp { text?: string }
function makeGenAi(generateContent: (req: unknown) => Promise<GenAiResp>): {
  models: { generateContent: typeof generateContent };
} {
  return { models: { generateContent } };
}

function makeOpenAi(edit: (req: unknown) => Promise<{ data?: Array<{ b64_json?: string }> }>) {
  return { images: { edit } };
}

describe("legalGenDims (regression cases ported from tracer)", () => {
  it("rounds dims to multiples of 16", () => {
    const d = legalGenDims({ w: 1080, h: 1920 });
    expect(d.w % 16).toBe(0);
    expect(d.h % 16).toBe(0);
  });

  it("ensures long edge >= 1024", () => {
    const d = legalGenDims({ w: 300, h: 250 });
    expect(Math.max(d.w, d.h)).toBeGreaterThanOrEqual(1024);
  });

  it("never exceeds gpt-image-2's 3:1 / 1:3 hard limit", () => {
    for (const t of [{ w: 160, h: 600 }, { w: 728, h: 90 }, { w: 320, h: 50 }, { w: 100, h: 1000 }]) {
      const d = legalGenDims(t);
      expect(d.w / d.h).toBeLessThanOrEqual(3);
      expect(d.h / d.w).toBeLessThanOrEqual(3);
    }
  });

  it("clears 655,360 minimum pixel budget for every preset", () => {
    const targets = [
      { w: 160, h: 600 }, { w: 728, h: 90 }, { w: 320, h: 50 },
      { w: 300, h: 250 }, { w: 1080, h: 1920 }, { w: 1920, h: 1080 },
    ];
    for (const t of targets) {
      const d = legalGenDims(t);
      expect(d.w * d.h).toBeGreaterThanOrEqual(655_360);
    }
  });

  it("throws on zero or negative dims", () => {
    expect(() => legalGenDims({ w: 0, h: 100 })).toThrow();
    expect(() => legalGenDims({ w: -10, h: 100 })).toThrow();
  });

  it("stays within gpt-image-2's 8,294,400 max pixel budget for oversized targets", () => {
    // Regression: 8.5×11" print at 300dpi (2550×3300) used to round to
    // 2544×3296 = 8,385,024 px, exceeding gpt-image-2's 8,294,400 cap and
    // failing the resize batch. See issue #25.
    const oversized = [
      { w: 2550, h: 3300 }, // 8.5×11" @ 300dpi (issue #25)
      { w: 3300, h: 2550 }, // landscape variant
      { w: 3000, h: 3000 }, // square megapixel-heavy case
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

describe("detectSourceSpec", () => {
  it("returns sharp-probed pixel dimensions", async () => {
    const buf = await makeTestPng(123, 456);
    const spec = await detectSourceSpec(buf);
    expect(spec).toEqual({ w: 123, h: 456 });
  });
});

describe("runPhase1Once", () => {
  it("returns p1 + timings on valid JSON, runs once", async () => {
    let calls = 0;
    const ai = makeGenAi(async () => {
      calls++;
      return { text: JSON.stringify(validP1) };
    });
    const png = await makeTestPng();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await runPhase1Once(ai as any, png, "image/png", { w: 64, h: 64 }, { w: 1080, h: 1920 });
    expect(r.p1.subjectDescription).toBe("test subject");
    expect(r.p1Ms).toBeGreaterThanOrEqual(0);
    expect(calls).toBe(1);
  });

  it("threads additionalContext into the user prompt", async () => {
    let captured: unknown = null;
    const ai = makeGenAi(async (req) => {
      captured = req;
      return { text: JSON.stringify(validP1) };
    });
    const png = await makeTestPng();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await runPhase1Once(ai as any, png, "image/png", { w: 64, h: 64 }, { w: 1080, h: 1920 }, "make it cinematic and moody");
    const r = captured as { contents?: Array<{ text?: string }> };
    const userText = r.contents?.[0]?.text ?? "";
    expect(userText).toContain("User instruction (apply to extensionDirective): make it cinematic and moody");
  });

  it("does NOT prepend a context line when additionalContext is undefined/empty", async () => {
    let captured: unknown = null;
    const ai = makeGenAi(async (req) => {
      captured = req;
      return { text: JSON.stringify(validP1) };
    });
    const png = await makeTestPng();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await runPhase1Once(ai as any, png, "image/png", { w: 64, h: 64 }, { w: 1080, h: 1920 }, "  ");
    const r = captured as { contents?: Array<{ text?: string }> };
    expect(r.contents?.[0]?.text ?? "").not.toContain("User instruction");
  });

  it("retries once on malformed JSON, succeeds on attempt 2", async () => {
    let n = 0;
    const ai = makeGenAi(async () => {
      n++;
      return n === 1 ? { text: "not json" } : { text: JSON.stringify(validP1) };
    });
    const png = await makeTestPng();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await runPhase1Once(ai as any, png, "image/png", { w: 64, h: 64 }, { w: 1080, h: 1920 });
    expect(r.p1.subjectDescription).toBe("test subject");
    expect(n).toBe(2);
  });
});

describe("runPhase2ForTarget", () => {
  it("returns result + raw + canvas + mask buffers at correct dims", async () => {
    const target = { label: "social-9x16", w: 1080, h: 1920 };
    const dims = legalGenDims(target);
    const fakeOutput = (
      await sharp({ create: { width: dims.w, height: dims.h, channels: 3, background: { r: 50, g: 80, b: 200 } } })
        .png()
        .toBuffer()
    ).toString("base64");
    const openai = makeOpenAi(async () => ({ data: [{ b64_json: fakeOutput }] }));
    const png = await makeTestPng(64, 64);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await runPhase2ForTarget(openai as any, png, { w: 64, h: 64 }, validP1, target);
    expect(Buffer.isBuffer(r.resultBuffer)).toBe(true);
    expect(Buffer.isBuffer(r.rawBuffer)).toBe(true);
    expect(Buffer.isBuffer(r.canvasBuffer)).toBe(true);
    expect(Buffer.isBuffer(r.maskBuffer)).toBe(true);
    expect(r.p2Quality).toBe("medium");
    expect(r.canvasWidth).toBe(dims.w);
    expect(r.canvasHeight).toBe(dims.h);

    const finalMeta = await sharp(r.resultBuffer).metadata();
    expect(finalMeta.width).toBe(target.w);
    expect(finalMeta.height).toBe(target.h);
  });

  it("passes high quality through when requested", async () => {
    const target = { label: "social-1x1", w: 1080, h: 1080 };
    const dims = legalGenDims(target);
    const fakeOutput = (
      await sharp({ create: { width: dims.w, height: dims.h, channels: 3, background: { r: 1, g: 1, b: 1 } } })
        .png()
        .toBuffer()
    ).toString("base64");
    let captured: unknown = null;
    const openai = makeOpenAi(async (req) => {
      captured = req;
      return { data: [{ b64_json: fakeOutput }] };
    });
    const png = await makeTestPng();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await runPhase2ForTarget(openai as any, png, { w: 64, h: 64 }, validP1, target, "high");
    expect((captured as { quality?: string }).quality).toBe("high");
  });

  it("translates 403 verified-org error with helpful hint", async () => {
    const target = { label: "social-1x1", w: 1080, h: 1080 };
    const err = Object.assign(new Error("organization_must_be_verified to access this model"), { status: 403 });
    const openai = { images: { edit: async () => { throw err; } } };
    const png = await makeTestPng();
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      runPhase2ForTarget(openai as any, png, { w: 64, h: 64 }, validP1, target),
    ).rejects.toThrow(/verify at platform\.openai\.com/);
  });

  it("propagates 429 unchanged for classifier to bucket as transient", async () => {
    const target = { label: "social-1x1", w: 1080, h: 1080 };
    const err = Object.assign(new Error("rate limit hit"), { status: 429 });
    const openai = { images: { edit: async () => { throw err; } } };
    const png = await makeTestPng();
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      runPhase2ForTarget(openai as any, png, { w: 64, h: 64 }, validP1, target),
    ).rejects.toMatchObject({ status: 429 });
  });
});

describe("prepPaddedCanvas (regression — mask geometry)", () => {
  it("produces image + mask at legalGenDims with alpha", async () => {
    const png = await makeTestPng(64, 64);
    const target = { w: 1080, h: 1920 };
    const padded = await prepPaddedCanvas(png, { w: 64, h: 64 }, target);
    const expected = legalGenDims(target);
    expect(padded.width).toBe(expected.w);
    expect(padded.height).toBe(expected.h);

    const maskMeta = await sharp(padded.maskBuffer).metadata();
    expect(maskMeta.channels).toBe(4);
  });
});
