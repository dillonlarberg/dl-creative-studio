import { describe, it, expect, vi, beforeEach } from "vitest";
import { HttpsError } from "firebase-functions/v2/https";

// ── Module mocks (hoisted) ──────────────────────────────────────────

const firestoreState = {
  docs: new Map<string, Record<string, unknown>>(),
};

function mockDocRef(path: string) {
  return {
    path,
    get: vi.fn(async () => {
      const data = firestoreState.docs.get(path);
      return {
        exists: !!data,
        get: (k: string) => data?.[k],
        data: () => data,
      };
    }),
    set: vi.fn(async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
      const prev = firestoreState.docs.get(path) ?? {};
      if (opts?.merge) {
        firestoreState.docs.set(path, { ...prev, ...stripDeletes(data, prev) });
      } else {
        firestoreState.docs.set(path, data);
      }
    }),
  };
}

// Mimic FieldValue.delete() semantics for the merge case.
function stripDeletes(
  next: Record<string, unknown>,
  _prev: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(next)) {
    if (v && typeof v === "object" && (v as { __delete__?: boolean }).__delete__) continue;
    out[k] = v;
  }
  return out;
}

const mockBatchWriter = () => {
  const ops: Array<{ path: string; data: Record<string, unknown> }> = [];
  return {
    set: vi.fn((ref: { path: string }, data: Record<string, unknown>) => {
      ops.push({ path: ref.path, data });
    }),
    commit: vi.fn(async () => {
      for (const o of ops) {
        const prev = firestoreState.docs.get(o.path) ?? {};
        firestoreState.docs.set(o.path, { ...prev, ...o.data });
      }
    }),
  };
};

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => ({
    doc: (path: string) => mockDocRef(path),
    batch: () => mockBatchWriter(),
  }),
  FieldValue: {
    serverTimestamp: () => ({ __ts__: true }),
    delete: () => ({ __delete__: true }),
  },
}));

vi.mock("firebase-functions", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

vi.mock("firebase-functions/params", () => ({
  defineSecret: (_name: string) => ({ value: () => "fake-secret" }),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class FakeGenAI {
    constructor(public opts: unknown) {}
  },
}));

vi.mock("openai", () => ({
  default: class FakeOpenAI {
    constructor(public opts: unknown) {}
  },
}));

vi.mock("../_shared/ai/outpaint", () => ({
  runPhase1Once: vi.fn(),
  runPhase2ForTarget: vi.fn(),
  detectSourceSpec: vi.fn(),
}));

vi.mock("./storage", () => ({
  stageSourceIfMissing: vi.fn(),
  uploadOutput: vi.fn(),
  uploadIntermediate: vi.fn(),
}));

import {
  runPhase1Once,
  runPhase2ForTarget,
} from "../_shared/ai/outpaint";
import {
  stageSourceIfMissing,
  uploadOutput,
  uploadIntermediate,
} from "./storage";
import {
  validateInput,
  runOutpaintBatchCore,
  type RunOutpaintBatchExecution,
} from "./runOutpaintBatch";

const mockedPhase1 = runPhase1Once as unknown as ReturnType<typeof vi.fn>;
const mockedPhase2 = runPhase2ForTarget as unknown as ReturnType<typeof vi.fn>;
const mockedStage = stageSourceIfMissing as unknown as ReturnType<typeof vi.fn>;
const mockedUpload = uploadOutput as unknown as ReturnType<typeof vi.fn>;
const mockedUploadInt = uploadIntermediate as unknown as ReturnType<typeof vi.fn>;

// ── Fixtures ────────────────────────────────────────────────────────

const SAMPLE_P1 = {
  subjectDescription: "test",
  subjectLocation: "center" as const,
  subjectBbox: [0.25, 0.25, 0.5, 0.5] as [number, number, number, number],
  copyRegions: [],
  styleCues: ["clean"],
  extensionDirective: "extend outward",
};

function validInput(
  overrides: Partial<RunOutpaintBatchExecution> = {},
): RunOutpaintBatchExecution {
  return {
    clientSlug: "acme",
    batchId: "batch-1",
    creativeId: "creative-1",
    originalUrl: "https://cdn.example.com/x.jpg",
    creativeName: "Hero ad",
    // createdBy is server-derived in production (from getAlliUserIdFromAuth);
    // tests inject a stable value here since runOutpaintBatchCore takes the
    // augmented execution shape, not the public callable input.
    createdBy: "alli-user-test",
    outputs: [
      { outputId: "o1", dimension: { width: 1080, height: 1080, channel: "Social", label: "social-1x1" } },
    ],
    ...overrides,
  };
}

function setStagedSource() {
  mockedStage.mockResolvedValue({
    storageRef: "clients/acme/apps/ad-resizing/sources/abc.png",
    sourceKey: "abc",
    width: 800,
    height: 600,
    mime: "image/png",
    buffer: Buffer.from("source"),
  });
}

function setHappyP1() {
  mockedPhase1.mockResolvedValue({ p1: SAMPLE_P1, p1Ms: 1234 });
}

function setHappyP2() {
  mockedPhase2.mockResolvedValue({
    resultBuffer: Buffer.from("result"),
    rawBuffer: Buffer.from("raw"),
    canvasBuffer: Buffer.from("canvas"),
    maskBuffer: Buffer.from("mask"),
    p2Ms: 5678,
    p2Model: "gpt-image-2",
    p2Quality: "medium",
    canvasWidth: 1024,
    canvasHeight: 1024,
  });
  mockedUpload.mockResolvedValue("clients/acme/apps/ad-resizing/outputs/o1.png");
  mockedUploadInt.mockResolvedValue(undefined);
}

beforeEach(() => {
  firestoreState.docs.clear();
  mockedPhase1.mockReset();
  mockedPhase2.mockReset();
  mockedStage.mockReset();
  mockedUpload.mockReset();
  mockedUploadInt.mockReset();
});

// ── validateInput ───────────────────────────────────────────────────

describe("validateInput", () => {
  it("accepts a fully-formed request", () => {
    expect(() => validateInput(validInput())).not.toThrow();
  });

  it("rejects bad clientSlug regex", () => {
    expect(() => validateInput(validInput({ clientSlug: "Acme!" }))).toThrow(HttpsError);
  });

  it("rejects missing batchId", () => {
    expect(() => validateInput({ ...validInput(), batchId: "" })).toThrow(HttpsError);
  });

  it("rejects empty outputs[]", () => {
    expect(() => validateInput({ ...validInput(), outputs: [] })).toThrow(HttpsError);
  });

  it("rejects dimension below MIN_DIM (50)", () => {
    expect(() =>
      validateInput({
        ...validInput(),
        outputs: [{ outputId: "o1", dimension: { width: 40, height: 1080 } }],
      }),
    ).toThrow(/out of bounds/);
  });

  it("rejects dimension above MAX_DIM (3840)", () => {
    expect(() =>
      validateInput({
        ...validInput(),
        outputs: [{ outputId: "o1", dimension: { width: 4000, height: 1080 } }],
      }),
    ).toThrow(/out of bounds/);
  });

  it("caps retryPrompt at 500 chars", () => {
    expect(() =>
      validateInput({ ...validInput(), retryPrompt: "x".repeat(501) }),
    ).toThrow(/500/);
  });

  it("forbids retryPrompt with multiple outputs", () => {
    expect(() =>
      validateInput({
        ...validInput(),
        retryPrompt: "make it cinematic",
        outputs: [
          { outputId: "o1", dimension: { width: 1080, height: 1080 } },
          { outputId: "o2", dimension: { width: 1080, height: 1920 } },
        ],
      }),
    ).toThrow(/single-output/);
  });

  it("rejects invalid quality", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => validateInput({ ...validInput(), quality: "ultra" as any })).toThrow(HttpsError);
  });
});

// ── Idempotency ─────────────────────────────────────────────────────

describe("runOutpaintBatchCore — idempotency", () => {
  it("returns noop when single-output is already complete and no retryPrompt", async () => {
    firestoreState.docs.set("clients/acme/apps/ad-resizing/outputs/o1", { status: "complete" });
    const r = await runOutpaintBatchCore(validInput());
    expect(r.status).toBe("noop");
    expect(mockedStage).not.toHaveBeenCalled();
  });

  it("does NOT skip when retryPrompt is set (re-crop must always run)", async () => {
    firestoreState.docs.set("clients/acme/apps/ad-resizing/outputs/o1", { status: "complete" });
    setStagedSource();
    setHappyP1();
    setHappyP2();
    const r = await runOutpaintBatchCore(validInput({ retryPrompt: "make it moody" }));
    expect(r.status).toBe("completed");
    expect(mockedStage).toHaveBeenCalled();
    expect(mockedPhase1).toHaveBeenCalled();
  });
});

// ── Happy path ──────────────────────────────────────────────────────

describe("runOutpaintBatchCore — happy path", () => {
  it("upserts BatchRecord, hoists P1, fans out P2, writes outputs, finalises 'completed'", async () => {
    setStagedSource();
    setHappyP1();
    setHappyP2();

    const input = validInput({
      outputs: [
        { outputId: "o1", dimension: { width: 1080, height: 1080, channel: "Social" } },
        { outputId: "o2", dimension: { width: 1080, height: 1920, channel: "Social" } },
      ],
    });
    mockedUpload
      .mockResolvedValueOnce("clients/acme/apps/ad-resizing/outputs/o1.png")
      .mockResolvedValueOnce("clients/acme/apps/ad-resizing/outputs/o2.png");

    const result = await runOutpaintBatchCore(input);

    expect(result).toEqual({ batchId: "batch-1", status: "completed", completedCount: 2, errorCount: 0 });
    expect(mockedPhase1).toHaveBeenCalledTimes(1); // hoisted
    expect(mockedPhase2).toHaveBeenCalledTimes(2); // fans out
    expect(mockedUpload).toHaveBeenCalledTimes(2);
    expect(mockedUploadInt).toHaveBeenCalledTimes(6); // 3 per output

    const batchDoc = firestoreState.docs.get("clients/acme/apps/ad-resizing/batches/batch-1");
    expect(batchDoc?.status).toBe("completed");
    expect(batchDoc?.completedVariations).toBe(2);
    expect(batchDoc?.errorCount).toBe(0);
    expect(batchDoc?.sourceCreative).toMatchObject({ creativeId: "creative-1" });

    expect(firestoreState.docs.get("clients/acme/apps/ad-resizing/outputs/o1")?.status).toBe("complete");
    expect(firestoreState.docs.get("clients/acme/apps/ad-resizing/outputs/o2")?.status).toBe("complete");
  });

  it("seeds pending outputs with parity fields (clientSlug, appId, createdBy, kind, format)", async () => {
    setStagedSource();
    setHappyP1();
    setHappyP2();
    mockedUpload.mockResolvedValueOnce("clients/acme/apps/ad-resizing/outputs/o1.png");

    await runOutpaintBatchCore(validInput());

    const doc = firestoreState.docs.get("clients/acme/apps/ad-resizing/outputs/o1");
    expect(doc?.clientSlug).toBe("acme");
    expect(doc?.appId).toBe("ad-resizing");
    expect(doc?.createdBy).toBe("alli-user-test");
    expect(doc?.kind).toBe("image");
    expect(doc?.format).toEqual({ width: 1080, height: 1080, label: "social-1x1" });
    // The legacy `dimension` top-level field was dropped in
    // #thegreatmigration no. 11 — only the canonical `format` remains.
    expect(doc?.dimension).toBeUndefined();
  });

  it("completion via updateOutput does NOT overwrite createdAt (P0 invariant)", async () => {
    setStagedSource();
    setHappyP1();
    setHappyP2();
    mockedUpload.mockResolvedValueOnce("clients/acme/apps/ad-resizing/outputs/o1.png");

    await runOutpaintBatchCore(validInput());

    const doc = firestoreState.docs.get("clients/acme/apps/ad-resizing/outputs/o1");
    expect(doc?.status).toBe("complete");
    // createdAt was stamped by createOutput in seedPendingOutputs and not
    // touched by updateOutput on completion — the mock sentinel survives.
    expect(doc?.createdAt).toEqual({ __ts__: true });
    expect(doc?.completedAt).toEqual({ __ts__: true });
    // Sidecar fields (not in OutputDocSchema, written via direct .set merge).
    expect(doc?.p1Analysis).toBeDefined();
    expect(doc?.timings).toBeDefined();
  });

  it("threads representativeTargetSpec (first output dims) into P1", async () => {
    setStagedSource();
    setHappyP1();
    setHappyP2();
    await runOutpaintBatchCore(
      validInput({
        outputs: [
          { outputId: "o1", dimension: { width: 728, height: 90 } },
          { outputId: "o2", dimension: { width: 1080, height: 1080 } },
        ],
      }),
    );
    const args = mockedPhase1.mock.calls[0];
    // signature: (genai, buffer, mime, sourceSpec, representativeTargetSpec, retryPrompt)
    expect(args?.[4]).toEqual({ w: 728, h: 90 });
  });

  it("threads retryPrompt into P1 additionalContext", async () => {
    setStagedSource();
    setHappyP1();
    setHappyP2();
    await runOutpaintBatchCore(validInput({ retryPrompt: "cinematic and moody" }));
    const args = mockedPhase1.mock.calls[0];
    expect(args?.[5]).toBe("cinematic and moody");
  });
});

// ── Mixed outcomes ──────────────────────────────────────────────────

describe("runOutpaintBatchCore — partial / failed", () => {
  it("marks BatchRecord 'partial' when some outputs succeed and some error", async () => {
    setStagedSource();
    setHappyP1();
    // o1 succeeds, o2 hits content_policy (permanent)
    mockedPhase2
      .mockResolvedValueOnce({
        resultBuffer: Buffer.from("r"),
        rawBuffer: Buffer.from("ra"),
        canvasBuffer: Buffer.from("c"),
        maskBuffer: Buffer.from("m"),
        p2Ms: 100,
        p2Model: "gpt-image-2",
        p2Quality: "medium",
        canvasWidth: 1024,
        canvasHeight: 1024,
      })
      .mockRejectedValueOnce(Object.assign(new Error("content_policy: rejected"), { status: 400 }));
    mockedUpload.mockResolvedValueOnce("clients/acme/apps/ad-resizing/outputs/o1.png");
    mockedUploadInt.mockResolvedValue(undefined);

    const result = await runOutpaintBatchCore(
      validInput({
        outputs: [
          { outputId: "o1", dimension: { width: 1080, height: 1080 } },
          { outputId: "o2", dimension: { width: 1080, height: 1920 } },
        ],
      }),
    );

    expect(result).toEqual({ batchId: "batch-1", status: "partial", completedCount: 1, errorCount: 1 });
    const o1 = firestoreState.docs.get("clients/acme/apps/ad-resizing/outputs/o1");
    const o2 = firestoreState.docs.get("clients/acme/apps/ad-resizing/outputs/o2");
    expect(o1?.status).toBe("complete");
    expect(o2?.status).toBe("error");
    expect(o2?.errorCategory).toBe("permanent");
  });

  it("marks BatchRecord 'failed' when every output errors", async () => {
    setStagedSource();
    setHappyP1();
    mockedPhase2.mockRejectedValue(Object.assign(new Error("rate limit hit"), { status: 429 }));

    const result = await runOutpaintBatchCore(
      validInput({
        outputs: [
          { outputId: "o1", dimension: { width: 1080, height: 1080 } },
          { outputId: "o2", dimension: { width: 1080, height: 1920 } },
        ],
      }),
    );

    expect(result.status).toBe("failed");
    expect(result.errorCount).toBe(2);
    const o1 = firestoreState.docs.get("clients/acme/apps/ad-resizing/outputs/o1");
    expect(o1?.errorCategory).toBe("transient"); // 429 → transient → Retry button
  });
});

// ── sharp probe failure ─────────────────────────────────────────────

describe("runOutpaintBatchCore — staged-source health", () => {
  it("throws when stageSourceIfMissing returns zero dimensions", async () => {
    mockedStage.mockResolvedValue({
      storageRef: "x",
      sourceKey: "abc",
      width: 0,
      height: 0,
      mime: "image/png",
      buffer: Buffer.from("x"),
    });
    await expect(runOutpaintBatchCore(validInput())).rejects.toThrow(/sharp_decode_failed/);
  });
});
