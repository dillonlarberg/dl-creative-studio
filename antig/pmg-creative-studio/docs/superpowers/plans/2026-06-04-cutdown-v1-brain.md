# Cutdown V1 Brain + CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the isolatable cutdown "brain" — `aiCutdown(video, track, {humanInput?, targetSec})` that returns **3 angled cut versions** (Narrative / Highlights / Punchy), each a `CutdownPlan` with an AI description and per-cut rationale — plus a CLI that renders a chosen version to a real reel.

**Architecture:** Extends the M0 tracer (`tools/cutdown-tracer/`). One Gemini *video* call (analyze → theme + beats) is shared; three *text* selection calls + three *text* critique calls run over the extracted beats (1 + 3 + 3 = 7 calls, only the first touches the video). `planCuts` gains an order-preserving mode and propagates per-segment metadata onto cuts. Everything sits behind interface seams with Fakes, so `npm test` stays no-network/no-env. A CLI reuses the existing ffmpeg/GCS/Shotstack tail to render the picked version.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), Zod, `@google/genai` (injected `GenAiLike` client), Vitest, tsx. librosa/ffmpeg/Firestore/GCS/Shotstack reused unchanged.

**Spec:** `docs/superpowers/specs/2026-06-04-cutdown-v1-three-version-selection-design.md`

**Out of scope (follow-up plan):** storyboard thumbnail generation (`StoryboardMaker`) and the minimal web shell (spec checkpoint 5). This plan delivers the brain + a `--pick` CLI render.

---

## File structure

**Modify:**
- `src/types.ts` — add `Angle`, `Beat`, `VideoAnalysis`, `PlannedCut`, `CutdownPlan` schemas; extend `Segment` with optional `summary`/`role`/`why`.
- `src/planCuts.ts` — propagate segment metadata onto cuts; add `preserveOrder` mode (skip score-sort, fill in given order).
- `src/gemini.ts` — extract shared helpers into `geminiCore.ts` (keep M0 selector green).
- `src/seams.ts` — add `CutdownBrain` interface.
- `src/fakes.ts` — add `FakeCutdownBrain`.
- `src/factory.ts` / `src/realClients.ts` — wire the brain.
- `package.json` — add `run-cutdown` script.
- `README.md` — document the brain + CLI.

**Create:**
- `src/geminiCore.ts` — shared Gemini plumbing: `uploadAndActivate`, `extractText`, `generateJson` (retry + Zod validate).
- `src/angles.ts` — the three fixed angle definitions + `orderSegments(angle, segs)`.
- `src/cutdownBrain.ts` — `GeminiCutdownBrain implements CutdownBrain` (analyze → per-angle select+critique → planCuts).
- `src/cutdownBrain.test.ts`, `src/angles.test.ts`, `src/geminiCore.test.ts` — contract tests (no-network).
- `scripts/run-cutdown.ts` — CLI: probe → brain → print 3 descriptions → `--pick N` → render.

---

## Task 1: Value objects — Angle, Beat, VideoAnalysis, PlannedCut, CutdownPlan

**Files:**
- Modify: `src/types.ts`
- Test: `src/types.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/types.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  AngleSchema,
  SegmentSchema,
  BeatSchema,
  VideoAnalysisSchema,
  PlannedCutSchema,
  CutdownPlanSchema,
} from "./types.js";

describe("V1 value objects", () => {
  it("AngleSchema accepts the three fixed angles and rejects others", () => {
    for (const a of ["narrative", "highlights", "punchy"]) {
      expect(AngleSchema.parse(a)).toBe(a);
    }
    expect(() => AngleSchema.parse("dramatic")).toThrow();
  });

  it("SegmentSchema allows optional summary/role/why", () => {
    const s = SegmentSchema.parse({
      startSec: 1, endSec: 3, score: 0.8,
      summary: "founder demos the app", role: "reveal", why: "clear product moment",
    });
    expect(s.role).toBe("reveal");
    // still valid without the optional fields
    expect(() => SegmentSchema.parse({ startSec: 1, endSec: 3, score: 0.5 })).not.toThrow();
  });

  it("BeatSchema requires a summary + role on top of a segment", () => {
    expect(() =>
      BeatSchema.parse({ startSec: 0, endSec: 2, score: 0.5 }),
    ).toThrow(); // missing summary/role
    const b = BeatSchema.parse({ startSec: 0, endSec: 2, score: 0.5, summary: "intro", role: "hook" });
    expect(b.summary).toBe("intro");
  });

  it("VideoAnalysisSchema wraps a theme + beats", () => {
    const a = VideoAnalysisSchema.parse({
      theme: "a product launch",
      beats: [{ startSec: 0, endSec: 2, score: 0.5, summary: "intro", role: "hook" }],
    });
    expect(a.beats).toHaveLength(1);
  });

  it("CutdownPlanSchema carries angle + description + planned cuts", () => {
    const p = CutdownPlanSchema.parse({
      angle: "narrative",
      description: "tells it in order",
      cuts: [{ srcIn: 0, srcOut: 2, len: 2, why: "opens the story", role: "hook" }],
    });
    expect(p.angle).toBe("narrative");
    expect(p.cuts[0].len).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/types.test.ts`
Expected: FAIL — `AngleSchema`/`BeatSchema`/etc. are not exported.

- [ ] **Step 3: Add the schemas to `src/types.ts`**

Add after the existing `SegmentSchema` block, and **extend** `SegmentSchema` with optional metadata. Replace the existing `SegmentSchema` definition with:

```ts
/** The three fixed creative angles for V1. Each implies its own playback order. */
export const AngleSchema = z.enum(["narrative", "highlights", "punchy"]);
export type Angle = z.infer<typeof AngleSchema>;

/**
 * A ranked moment. `score` is 0–1 (higher = more engaging). The optional
 * `summary`/`role`/`why` carry model rationale through the pipeline to the storyboard.
 */
export const SegmentSchema = z
  .object({
    startSec: z.number().nonnegative(),
    endSec: z.number().nonnegative(),
    score: z.number(),
    summary: z.string().optional(),
    role: z.string().optional(),
    why: z.string().optional(),
  })
  .refine((s) => s.endSec > s.startSec, {
    message: "endSec must be greater than startSec",
  });
export type Segment = z.infer<typeof SegmentSchema>;
```

Then append these new schemas to the file (after `SampleMusicTrackSchema`, before `EditSpecSchema`):

```ts
/** A described beat from the shared analyze pass — a Segment that REQUIRES summary + role. */
export const BeatSchema = z
  .object({
    startSec: z.number().nonnegative(),
    endSec: z.number().nonnegative(),
    score: z.number(),
    summary: z.string().min(1),
    role: z.string().min(1),
  })
  .refine((b) => b.endSec > b.startSec, { message: "endSec must be greater than startSec" });
export type Beat = z.infer<typeof BeatSchema>;

/** The shared content map produced once per run by the analyze pass. */
export const VideoAnalysisSchema = z.object({
  theme: z.string().min(1),
  beats: z.array(BeatSchema).min(1),
});
export type VideoAnalysis = z.infer<typeof VideoAnalysisSchema>;

/** A cut that also carries the rationale of the source moment it was filled from. */
export const PlannedCutSchema = z
  .object({
    srcIn: z.number().nonnegative(),
    srcOut: z.number().nonnegative(),
    len: z.number().positive(),
    summary: z.string().optional(),
    role: z.string().optional(),
    why: z.string().optional(),
    score: z.number().optional(),
  })
  .refine((c) => c.srcOut > c.srcIn, { message: "srcOut must be greater than srcIn" });
export type PlannedCut = z.infer<typeof PlannedCutSchema>;

/** One AI-generated cut version: an angle, its pitch, and the ordered cuts. */
export const CutdownPlanSchema = z.object({
  angle: AngleSchema,
  description: z.string().min(1),
  cuts: z.array(PlannedCutSchema).min(1),
});
export type CutdownPlan = z.infer<typeof CutdownPlanSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/types.test.ts && npx tsc --noEmit`
Expected: PASS (5 tests); typecheck clean. (Existing `planCuts.test.ts` etc. still compile because the new `Segment` fields are optional.)

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/types.test.ts
git commit -m "feat: V1 value objects — Angle, Beat, VideoAnalysis, PlannedCut, CutdownPlan"
```

---

## Task 2: planCuts — propagate metadata + preserve-order mode

**Files:**
- Modify: `src/planCuts.ts`
- Test: `src/planCuts.test.ts` (add cases)

- [ ] **Step 1: Write the failing tests**

Append to `src/planCuts.test.ts` (inside the top-level describe or a new one):

```ts
import { planCuts } from "./planCuts.js";

describe("planCuts — V1 metadata + ordering", () => {
  const ranked = [
    { startSec: 0, endSec: 4, score: 0.5, summary: "intro", role: "hook", why: "sets it up" },
    { startSec: 10, endSec: 14, score: 0.9, summary: "reveal", role: "reveal", why: "the moment" },
    { startSec: 20, endSec: 24, score: 0.7, summary: "react", role: "reaction", why: "payoff" },
  ];

  it("copies source segment metadata onto the cut it fills", () => {
    const cuts = planCuts({ bpm: 120, totalSec: 6, ranked });
    // default (score) order → highest score first → 'reveal' fills slot 0
    expect(cuts[0].role).toBe("reveal");
    expect(cuts[0].why).toBe("the moment");
    expect(cuts[0].score).toBe(0.9);
  });

  it("preserveOrder=true fills slots in the given order, not by score", () => {
    const cuts = planCuts({ bpm: 120, totalSec: 6, ranked, preserveOrder: true });
    expect(cuts[0].role).toBe("hook");   // first in input, despite lowest score
    expect(cuts[1].role).toBe("reveal");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/planCuts.test.ts`
Expected: FAIL — `cuts[0].role` is `undefined` (metadata not propagated) and `preserveOrder` is ignored.

- [ ] **Step 3: Implement metadata propagation + preserveOrder**

In `src/planCuts.ts`, update the input type and the two functions. Change `PlanCutsInput`:

```ts
export interface PlanCutsInput {
  bpm: number;
  totalSec: number;
  ranked: Segment[];
  /** When true, fill slots in the given order (per-angle playback) instead of by score. */
  preserveOrder?: boolean;
}
```

Update `dedupRanked` to optionally skip the score-sort:

```ts
export function dedupRanked(ranked: Segment[], preserveOrder = false): Segment[] {
  const ordered = preserveOrder ? [...ranked] : [...ranked].sort((a, b) => b.score - a.score);
  const kept: Segment[] = [];
  for (const seg of ordered) {
    const overlaps = kept.some((k) => seg.startSec < k.endSec && k.startSec < seg.endSec);
    if (!overlaps) kept.push(seg);
  }
  return kept;
}
```

Update `planCuts` to thread `preserveOrder` and copy metadata onto each emitted cut. Replace the loop body's push and the `moments` line:

```ts
export function planCuts({ bpm, totalSec, ranked, preserveOrder = false }: PlanCutsInput): CutPlan {
  if (ranked.length === 0) {
    throw new Error("planCuts: ranked segments must not be empty");
  }

  const boundaries = barGridBoundaries(bpm, totalSec);
  const moments = dedupRanked(ranked, preserveOrder);
  const cursors = new Array<number>(moments.length).fill(0);

  const cuts: Cut[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const len = roundMs(boundaries[i + 1] - boundaries[i]);
    const mi = i % moments.length;
    const moment = moments[mi];

    let offset = cursors[mi];
    if (roundMs(moment.startSec + offset + len) > moment.endSec) offset = 0;

    const srcIn = roundMs(moment.startSec + offset);
    const srcOut = roundMs(srcIn + len);
    cursors[mi] = roundMs(offset + len);
    cuts.push({
      srcIn,
      srcOut,
      len,
      summary: moment.summary,
      role: moment.role,
      why: moment.why,
      score: moment.score,
    });
  }
  return cuts;
}
```

> Note: `CutPlan`/`Cut` are structurally compatible — `Cut`'s extra optional fields are added in Task 1 only on `PlannedCut`, but `cuts.push` here adds them as plain object properties. To keep types honest, change the local array type to `PlannedCut[]` and the return type to `PlannedCut[]`. Update the imports and signature:

```ts
import type { Segment, PlannedCut } from "./types.js";
// ...
export function planCuts(input: PlanCutsInput): PlannedCut[] { /* as above, cuts: PlannedCut[] */ }
export function totalLen(plan: PlannedCut[]): number { /* unchanged body */ }
```

(`CutPlan` consumers like `extractClips` accept these structurally since `PlannedCut` is a superset of `Cut`.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/planCuts.test.ts && npx tsc --noEmit`
Expected: PASS (all existing + 2 new). Typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/planCuts.ts src/planCuts.test.ts
git commit -m "feat: planCuts propagates segment metadata + preserveOrder mode"
```

---

## Task 3: angles.ts — the three fixed angles + ordering

**Files:**
- Create: `src/angles.ts`, `src/angles.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/angles.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ANGLES, angleGuidance, orderSegments } from "./angles.js";
import type { Segment } from "./types.js";

const segs: Segment[] = [
  { startSec: 30, endSec: 33, score: 0.6, role: "reaction" },
  { startSec: 5, endSec: 8, score: 0.95, role: "reveal" },
  { startSec: 50, endSec: 53, score: 0.8, role: "payoff" },
];

describe("angles", () => {
  it("exposes exactly the three fixed angles", () => {
    expect(ANGLES).toEqual(["narrative", "highlights", "punchy"]);
  });

  it("angleGuidance returns non-empty prompt text per angle", () => {
    for (const a of ANGLES) expect(angleGuidance(a).length).toBeGreaterThan(20);
  });

  it("narrative orders chronologically by startSec", () => {
    const out = orderSegments("narrative", segs);
    expect(out.map((s) => s.startSec)).toEqual([5, 30, 50]);
  });

  it("highlights orders by score descending", () => {
    const out = orderSegments("highlights", segs);
    expect(out.map((s) => s.score)).toEqual([0.95, 0.8, 0.6]);
  });

  it("punchy puts the single strongest segment first, rest follow by score", () => {
    const out = orderSegments("punchy", segs);
    expect(out[0].score).toBe(0.95);
    expect(out.map((s) => s.score)).toEqual([0.95, 0.8, 0.6]);
  });

  it("does not mutate the input", () => {
    const copy = [...segs];
    orderSegments("narrative", segs);
    expect(segs).toEqual(copy);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/angles.test.ts`
Expected: FAIL — module `./angles.js` not found.

- [ ] **Step 3: Implement `src/angles.ts`**

```ts
/**
 * The three fixed creative angles for V1. Each angle provides (a) prompt guidance
 * that biases which beats get selected, and (b) a deterministic playback ordering
 * applied after selection. The grid still owns timing; the angle owns order + bias.
 */
import type { Angle, Segment } from "./types.js";

export const ANGLES: Angle[] = ["narrative", "highlights", "punchy"];

/** Human/AI-facing guidance injected into the selection prompt for each angle. */
export function angleGuidance(angle: Angle): string {
  switch (angle) {
    case "narrative":
      return "Choose beats that form a story arc: setup, a turn, and a payoff. Favor continuity and a sense of progression over raw intensity.";
    case "highlights":
      return "Choose the highest-impact, most engaging beats — the moments a viewer would clip and share. Intensity over continuity.";
    case "punchy":
      return "Choose hook-dense beats for a fast, attention-grabbing cut. Lead with the single strongest moment; keep momentum high throughout.";
  }
}

/** A short label used as the default description prefix and for logs. */
export function angleLabel(angle: Angle): string {
  return { narrative: "Narrative", highlights: "Highlights", punchy: "Punchy" }[angle];
}

/** Deterministic playback ordering per angle. Pure; returns a new array. */
export function orderSegments(angle: Angle, segs: Segment[]): Segment[] {
  const copy = [...segs];
  switch (angle) {
    case "narrative":
      return copy.sort((a, b) => a.startSec - b.startSec);
    case "highlights":
      return copy.sort((a, b) => b.score - a.score);
    case "punchy": {
      const byScore = copy.sort((a, b) => b.score - a.score);
      return byScore; // strongest first is already satisfied by score-desc
    }
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/angles.test.ts && npx tsc --noEmit`
Expected: PASS (6 tests); typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/angles.ts src/angles.test.ts
git commit -m "feat: three fixed cutdown angles + per-angle ordering"
```

---

## Task 4: geminiCore.ts — extract shared Gemini plumbing

**Files:**
- Create: `src/geminiCore.ts`, `src/geminiCore.test.ts`
- Modify: `src/gemini.ts` (use the shared helpers)

- [ ] **Step 1: Write the failing test**

Create `src/geminiCore.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { extractText, generateJson, type GenAiLike } from "./geminiCore.js";

const Schema = z.object({ ok: z.boolean() });

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
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/geminiCore.test.ts`
Expected: FAIL — module `./geminiCore.js` not found.

- [ ] **Step 3: Implement `src/geminiCore.ts`**

```ts
/**
 * Shared @google/genai plumbing used by both the M0 selector (gemini.ts) and the
 * V1 cutdown brain (cutdownBrain.ts): the Files API lifecycle, response-text
 * extraction, and a validate-with-retry JSON generate. The client is INJECTED so
 * tests stay no-network.
 */
import type { z } from "zod";

export interface GenAiFile {
  name?: string;
  uri?: string;
  mimeType?: string;
  state?: unknown;
}

export interface GenAiLike {
  models: { generateContent(req: unknown): Promise<unknown> };
  files: {
    upload(req: { file: string; config?: { mimeType?: string } }): Promise<GenAiFile>;
    get(req: { name: string }): Promise<GenAiFile>;
    delete(req: { name: string }): Promise<unknown>;
  };
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Response-text extraction: resp.text, else join candidate parts (mirrors resize/phase1.ts). */
export function extractText(resp: unknown): string | null {
  const r = resp as {
    text?: string;
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  if (typeof r.text === "string" && r.text.length > 0) return r.text;
  const parts = r.candidates?.[0]?.content?.parts ?? [];
  const joined = parts
    .map((p) => p.text)
    .filter((t): t is string => typeof t === "string" && t.length > 0)
    .join("");
  return joined.length > 0 ? joined : null;
}

export interface UploadOpts {
  pollIntervalMs?: number;
  uploadTimeoutMs?: number;
}

/** Upload a local file via the Files API and poll until ACTIVE. */
export async function uploadAndActivate(
  ai: GenAiLike,
  path: string,
  opts: UploadOpts = {},
): Promise<GenAiFile> {
  const pollIntervalMs = opts.pollIntervalMs ?? 4000;
  const uploadTimeoutMs = opts.uploadTimeoutMs ?? 120_000;
  let file = await ai.files.upload({ file: path, config: { mimeType: "video/mp4" } });
  const started = Date.now();
  while (String(file.state) === "PROCESSING") {
    if (Date.now() - started > uploadTimeoutMs) {
      throw new Error(`Gemini Files API: video stuck in PROCESSING > ${uploadTimeoutMs}ms`);
    }
    await sleep(pollIntervalMs);
    file = await ai.files.get({ name: file.name as string });
  }
  if (String(file.state) !== "ACTIVE") {
    throw new Error(`Gemini Files API: file not ACTIVE (state=${String(file.state)})`);
  }
  return file;
}

export interface GenerateJsonReq<T> {
  model: string;
  contents: unknown[];
  schema: z.ZodType<T>;
  responseSchema?: unknown; // optional JSON-schema hint for the API
  maxAttempts?: number;
  backoffMs?: number;
}

/** generateContent → extract text → JSON.parse → Zod validate, with retry/backoff. */
export async function generateJson<T>(ai: GenAiLike, req: GenerateJsonReq<T>): Promise<T> {
  const maxAttempts = req.maxAttempts ?? 3;
  const backoffMs = req.backoffMs ?? 500;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const resp = await ai.models.generateContent({
        model: req.model,
        contents: req.contents,
        config: {
          responseMimeType: "application/json",
          ...(req.responseSchema ? { responseSchema: req.responseSchema } : {}),
        },
      });
      const text = extractText(resp);
      if (!text) throw new Error("Gemini returned no text content");
      return req.schema.parse(JSON.parse(text));
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) await sleep(backoffMs * 2 ** (attempt - 1));
    }
  }
  throw new Error(
    `generateJson failed after ${maxAttempts} attempts: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
}
```

- [ ] **Step 4: Refactor `src/gemini.ts` to reuse the helpers**

Replace `gemini.ts`'s private `GenAiLike`/`GenAiFile` interfaces, `sleep`, `extractText`, `uploadAndActivate`, and the retry loop with imports from `geminiCore.js`. Concretely:

```ts
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { VideoMomentSelector, VideoRef } from "./seams.js";
import { SegmentSchema, type Segment } from "./types.js";
import {
  type GenAiLike, type GenAiFile, uploadAndActivate, generateJson,
} from "./geminiCore.js";

const DEFAULT_MODEL = "gemini-2.5-flash";
const SegmentsEnvelopeSchema = z.object({ segments: z.array(SegmentSchema) });
const SEGMENTS_RESPONSE_SCHEMA = { /* unchanged JSON schema object */ } as const;

export type { GenAiLike } from "./geminiCore.js"; // keep existing test import working

export class GeminiMomentSelector implements VideoMomentSelector {
  constructor(private readonly ai: GenAiLike, private readonly opts: { model?: string; pollIntervalMs?: number; uploadTimeoutMs?: number; maxAttempts?: number } = {}) {}

  async select(video: VideoRef, opts: { budgetSec: number }): Promise<Segment[]> {
    const file = await uploadAndActivate(this.ai, video.path, {
      pollIntervalMs: this.opts.pollIntervalMs,
      uploadTimeoutMs: this.opts.uploadTimeoutMs,
    });
    try {
      const prompt =
        `Identify the most engaging moments of this video for a ~${opts.budgetSec}s short vertical reel. ` +
        `Return JSON { segments: [{ startSec, endSec, score }] } where score is 0-1 ` +
        `(higher = more engaging), ordered by score descending. ` +
        `Prefer distinct, non-overlapping moments; startSec/endSec are seconds into the source.`;
      const { segments } = await generateJson(this.ai, {
        model: this.opts.model ?? DEFAULT_MODEL,
        contents: [
          { fileData: { fileUri: file.uri as string, mimeType: file.mimeType as string } },
          { text: prompt },
        ],
        schema: SegmentsEnvelopeSchema,
        responseSchema: SEGMENTS_RESPONSE_SCHEMA,
        maxAttempts: this.opts.maxAttempts,
      });
      return [...segments].sort((a, b) => b.score - a.score);
    } finally {
      try { if (file.name) await this.ai.files.delete({ name: file.name }); } catch { /* ignore */ }
    }
  }
}

export function makeGeminiSelector(apiKey: string, opts?: ConstructorParameters<typeof GeminiMomentSelector>[1]): GeminiMomentSelector {
  if (!apiKey) throw new Error("GEMINI_API_KEY is required for the real GeminiMomentSelector");
  return new GeminiMomentSelector(new GoogleGenAI({ apiKey }) as unknown as GenAiLike, opts);
}
```

> The existing `gemini.test.ts` imports `{ GeminiMomentSelector, type GenAiLike }` from `./gemini.js` and exercises upload polling, validation, retry, give-up, and cleanup. The re-export of `GenAiLike` and unchanged public behavior keep all 6 tests green. The error message changes from "failed after N attempts" inside the selector to "failed after N attempts" inside `generateJson` — the existing regex `/failed after 2 attempts/` still matches.

- [ ] **Step 5: Run all tests + typecheck**

Run: `npx vitest run src/geminiCore.test.ts src/gemini.test.ts && npx tsc --noEmit`
Expected: PASS — geminiCore (4) + gemini (6) green; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/geminiCore.ts src/geminiCore.test.ts src/gemini.ts
git commit -m "refactor: extract shared Gemini plumbing into geminiCore; reuse in selector"
```

---

## Task 5: cutdownBrain — analyze pass

**Files:**
- Create: `src/cutdownBrain.ts`, `src/cutdownBrain.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/cutdownBrain.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { GeminiCutdownBrain } from "./cutdownBrain.js";
import type { GenAiLike } from "./geminiCore.js";

/** Fake client that returns queued generateContent responses in order. */
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
    expect(calls.delete).toBe(1); // file cleaned up after analyze
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/cutdownBrain.test.ts`
Expected: FAIL — module `./cutdownBrain.js` not found.

- [ ] **Step 3: Implement the analyze pass in `src/cutdownBrain.ts`**

```ts
/**
 * GeminiCutdownBrain — the V1 cutdown "brain". One shared video call (analyze →
 * theme + beats); then per-angle text-only select + critique over the beats; then
 * planCuts. Returns one CutdownPlan per angle. Client is INJECTED (no-network tests).
 */
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { VideoRef } from "./seams.js";
import {
  VideoAnalysisSchema, type VideoAnalysis, type SampleMusicTrack,
  type Segment, type CutdownPlan, type Angle,
} from "./types.js";
import { type GenAiLike, uploadAndActivate, generateJson } from "./geminiCore.js";

const DEFAULT_MODEL = "gemini-2.5-flash";

export interface CutdownBrainOptions {
  model?: string;
  pollIntervalMs?: number;
  uploadTimeoutMs?: number;
  maxAttempts?: number;
  backoffMs?: number;
}

export class GeminiCutdownBrain {
  constructor(
    private readonly ai: GenAiLike,
    private readonly opts: CutdownBrainOptions = {},
  ) {}

  private get model(): string { return this.opts.model ?? DEFAULT_MODEL; }

  /** Shared analyze pass: upload the video once, extract a theme + described beats, clean up. */
  async analyze(video: VideoRef, targetSec: number): Promise<VideoAnalysis> {
    const file = await uploadAndActivate(this.ai, video.path, {
      pollIntervalMs: this.opts.pollIntervalMs,
      uploadTimeoutMs: this.opts.uploadTimeoutMs,
    });
    try {
      const prompt =
        `Analyze this video for building a ~${targetSec}s vertical short. ` +
        `Return JSON { theme, beats } where theme is one sentence describing the through-line, ` +
        `and beats is an array of distinct moments: ` +
        `{ startSec, endSec, score (0-1 engagement), summary (what happens, <=12 words), ` +
        `role (e.g. hook, setup, build, reveal, reaction, payoff, detail) }. ` +
        `Return 8-15 well-spread, non-overlapping beats; startSec/endSec are seconds into the source.`;
      return await generateJson(this.ai, {
        model: this.model,
        contents: [
          { fileData: { fileUri: file.uri as string, mimeType: file.mimeType as string } },
          { text: prompt },
        ],
        schema: VideoAnalysisSchema,
        maxAttempts: this.opts.maxAttempts,
        backoffMs: this.opts.backoffMs,
      });
    } finally {
      try { if (file.name) await this.ai.files.delete({ name: file.name }); } catch { /* ignore */ }
    }
  }
}

/** Wire the real client from an API key. */
export function makeCutdownBrain(apiKey: string, opts?: CutdownBrainOptions): GeminiCutdownBrain {
  if (!apiKey) throw new Error("GEMINI_API_KEY is required for the real GeminiCutdownBrain");
  return new GeminiCutdownBrain(new GoogleGenAI({ apiKey }) as unknown as GenAiLike, opts);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/cutdownBrain.test.ts && npx tsc --noEmit`
Expected: PASS (1 test); typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/cutdownBrain.ts src/cutdownBrain.test.ts
git commit -m "feat: cutdown brain analyze pass (shared theme + beats)"
```

---

## Task 6: cutdownBrain — angled selection pass

**Files:**
- Modify: `src/cutdownBrain.ts`, `src/cutdownBrain.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/cutdownBrain.test.ts`:

```ts
const selectJson = (startSecs: number[]) => ({
  text: JSON.stringify({
    segments: startSecs.map((startSec) => ({
      startSec, endSec: startSec + 3, score: 0.8, summary: "m", role: "reveal", why: "fits the angle",
    })),
  }),
});

const analysis = {
  theme: "a product launch",
  beats: [
    { startSec: 2, endSec: 5, score: 0.9, summary: "reveal", role: "reveal" },
    { startSec: 20, endSec: 23, score: 0.6, summary: "intro", role: "hook" },
    { startSec: 40, endSec: 43, score: 0.75, summary: "react", role: "reaction" },
  ],
};

describe("GeminiCutdownBrain.selectForAngle", () => {
  it("returns angle-ordered segments with a why, text-only (no upload)", async () => {
    const { client, calls } = queuedClient([selectJson([2, 40, 20])]);
    const brain = new GeminiCutdownBrain(client);
    const segs = await brain.selectForAngle(analysis, "narrative", undefined, 60);
    expect(calls.upload).toBe(0); // text-only
    // narrative ⇒ chronological order regardless of model order
    expect(segs.map((s) => s.startSec)).toEqual([2, 20, 40]);
    expect(segs[0].why).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/cutdownBrain.test.ts -t selectForAngle`
Expected: FAIL — `brain.selectForAngle` is not a function.

- [ ] **Step 3: Implement `selectForAngle`**

Add imports and the method to `GeminiCutdownBrain` in `src/cutdownBrain.ts`:

```ts
import { SegmentSchema } from "./types.js";
import { angleGuidance, orderSegments } from "./angles.js";

const SegmentsEnvelopeSchema = z.object({ segments: z.array(SegmentSchema) });
```

```ts
  /** Text-only: pick the beats that serve this angle (+ brief), then order them for playback. */
  async selectForAngle(
    analysis: VideoAnalysis,
    angle: Angle,
    brief: string | undefined,
    targetSec: number,
  ): Promise<Segment[]> {
    const briefLine = brief
      ? `The user's brief is: "${brief}". Every chosen beat must serve this brief.`
      : `No specific brief — optimize for a compelling general cut.`;
    const prompt =
      `Theme: ${analysis.theme}\n` +
      `Beats (JSON): ${JSON.stringify(analysis.beats)}\n\n` +
      `Select the subset of these beats for a ~${targetSec}s vertical short. ` +
      `${angleGuidance(angle)} ${briefLine} ` +
      `Return JSON { segments: [{ startSec, endSec, score, summary, role, why }] } ` +
      `where 'why' is a short reason this beat earns its place in THIS cut. ` +
      `Choose enough distinct beats to comfortably fill ${targetSec}s; reuse only if necessary.`;
    const { segments } = await generateJson(this.ai, {
      model: this.model,
      contents: [{ text: prompt }],
      schema: SegmentsEnvelopeSchema,
      maxAttempts: this.opts.maxAttempts,
      backoffMs: this.opts.backoffMs,
    });
    return orderSegments(angle, segments);
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/cutdownBrain.test.ts && npx tsc --noEmit`
Expected: PASS (2 tests); typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/cutdownBrain.ts src/cutdownBrain.test.ts
git commit -m "feat: cutdown brain angled selection pass (text-only, brief-aware)"
```

---

## Task 7: cutdownBrain — critique pass (bounded, degrades on failure)

**Files:**
- Modify: `src/cutdownBrain.ts`, `src/cutdownBrain.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/cutdownBrain.test.ts`:

```ts
const selected: import("./types.js").Segment[] = [
  { startSec: 2, endSec: 5, score: 0.8, summary: "reveal", role: "reveal", why: "x" },
  { startSec: 40, endSec: 43, score: 0.6, summary: "react", role: "reaction", why: "y" },
];

describe("GeminiCutdownBrain.critique", () => {
  it("returns the revised selection when the model responds well", async () => {
    const revised = { text: JSON.stringify({ segments: [
      { startSec: 2, endSec: 5, score: 0.85, summary: "reveal", role: "reveal", why: "kept" },
    ] }) };
    const { client } = queuedClient([revised]);
    const brain = new GeminiCutdownBrain(client);
    const out = await brain.critique(analysis, "narrative", undefined, selected);
    expect(out).toHaveLength(1);
  });

  it("degrades to the input selection if the critique call fails", async () => {
    const { client } = queuedClient([{ text: "garbage" }, { text: "garbage" }]);
    const brain = new GeminiCutdownBrain(client, { maxAttempts: 2, backoffMs: 0 });
    const out = await brain.critique(analysis, "narrative", undefined, selected);
    expect(out).toEqual(selected); // fell back, did not throw
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/cutdownBrain.test.ts -t critique`
Expected: FAIL — `brain.critique` is not a function.

- [ ] **Step 3: Implement `critique`**

Add to `GeminiCutdownBrain` in `src/cutdownBrain.ts`:

```ts
  /**
   * Bounded single self-check. Re-examines the selection against the angle + brief +
   * cut-to-cut coherence and may swap/drop/replace picks ONCE. On any failure it
   * degrades to the input selection rather than aborting the version.
   */
  async critique(
    analysis: VideoAnalysis,
    angle: Angle,
    brief: string | undefined,
    selected: Segment[],
  ): Promise<Segment[]> {
    const briefLine = brief ? `Brief: "${brief}". ` : "";
    const prompt =
      `Theme: ${analysis.theme}\n` +
      `Available beats: ${JSON.stringify(analysis.beats)}\n` +
      `Current ${angle} selection: ${JSON.stringify(selected)}\n\n` +
      `${briefLine}Critique this selection for coherence (do adjacent cuts relate?) and ` +
      `${angle} fit. If it is already good, return it unchanged. Otherwise swap/drop/replace ` +
      `beats (drawn only from the available beats) to improve it. ` +
      `Return JSON { segments: [{ startSec, endSec, score, summary, role, why }] }.`;
    try {
      const { segments } = await generateJson(this.ai, {
        model: this.model,
        contents: [{ text: prompt }],
        schema: SegmentsEnvelopeSchema,
        maxAttempts: this.opts.maxAttempts,
        backoffMs: this.opts.backoffMs,
      });
      return orderSegments(angle, segments);
    } catch {
      return selected; // graceful degradation — the version still ships
    }
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/cutdownBrain.test.ts && npx tsc --noEmit`
Expected: PASS (4 tests); typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/cutdownBrain.ts src/cutdownBrain.test.ts
git commit -m "feat: cutdown brain critique pass (bounded, degrades on failure)"
```

---

## Task 8: cutdownBrain — orchestrate `cutdown()` → 3 CutdownPlans

**Files:**
- Modify: `src/cutdownBrain.ts`, `src/cutdownBrain.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/cutdownBrain.test.ts`:

```ts
import type { SampleMusicTrack } from "./types.js";

const track: SampleMusicTrack = {
  trackId: "t", title: "T", url: "fake://t.mp3", format: "mp3",
  durationSec: 120, bpm: 120, provider: "fake", licenseRef: "x",
};

describe("GeminiCutdownBrain.cutdown", () => {
  it("returns one CutdownPlan per angle from a single analyze + per-angle select+critique", async () => {
    // 1 analyze + (3 select + 3 critique). Critique echoes selection.
    const responses = [
      analysisJson,
      selectJson([2, 20, 40]), selectJson([2, 20, 40]),   // narrative: select, critique
      selectJson([2, 40, 20]), selectJson([2, 40, 20]),   // highlights
      selectJson([40, 2, 20]), selectJson([40, 2, 20]),   // punchy
    ];
    const { client, calls } = queuedClient(responses);
    const brain = new GeminiCutdownBrain(client, { pollIntervalMs: 0 });
    const plans = await brain.cutdown({ path: "x.mp4" }, track, { targetSec: 15, durationSec: 120 });

    expect(plans.map((p) => p.angle)).toEqual(["narrative", "highlights", "punchy"]);
    for (const p of plans) {
      expect(p.cuts.length).toBeGreaterThan(0);
      expect(p.description.length).toBeGreaterThan(0);
    }
    expect(calls.upload).toBe(1); // analyze uploaded once, reused as text thereafter
    expect(calls.generate).toBe(7); // 1 + 3 + 3
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/cutdownBrain.test.ts -t cutdown`
Expected: FAIL — `brain.cutdown` is not a function.

- [ ] **Step 3: Implement `cutdown()`**

Add imports + the method + a description helper to `src/cutdownBrain.ts`:

```ts
import { clampSegments, planCuts } from "./planCuts.js";
import { ANGLES, angleLabel } from "./angles.js";
import { CutdownPlanSchema } from "./types.js";
```

```ts
  /**
   * Full brain: probe-supplied duration clamps model timestamps; analyze once; then
   * for each fixed angle select → critique → planCuts. Returns one plan per angle.
   */
  async cutdown(
    video: VideoRef,
    track: SampleMusicTrack,
    opts: { targetSec: number; durationSec: number; humanInput?: string },
  ): Promise<CutdownPlan[]> {
    const analysis = await this.analyze(video, opts.targetSec);
    const bpm = track.bpm ?? 120;

    const plans: CutdownPlan[] = [];
    for (const angle of ANGLES) {
      const selected = await this.selectForAngle(analysis, angle, opts.humanInput, opts.targetSec);
      const critiqued = await this.critique(analysis, angle, opts.humanInput, selected);
      const clamped = clampSegments(critiqued, opts.durationSec);
      if (clamped.length === 0) continue; // this angle yielded nothing usable → drop it
      const cuts = planCuts({ bpm, totalSec: opts.targetSec, ranked: clamped, preserveOrder: true });
      plans.push(
        CutdownPlanSchema.parse({
          angle,
          description: this.describe(angle, analysis, opts.humanInput),
          cuts,
        }),
      );
    }
    if (plans.length === 0) {
      throw new Error("GeminiCutdownBrain.cutdown: no angle produced a usable plan");
    }
    return plans;
  }

  /** A short, deterministic pitch for a version (the AI 'why' lives per-cut). */
  private describe(angle: Angle, analysis: VideoAnalysis, brief?: string): string {
    const base = {
      narrative: "Tells it in order — setup, turn, payoff.",
      highlights: "The highest-impact moments, biggest first.",
      punchy: "Hook-dense and fast; leads with the strongest beat.",
    }[angle];
    const briefBit = brief ? ` Tuned to: "${brief}".` : "";
    return `${angleLabel(angle)} · ${base}${briefBit} (${analysis.theme})`;
  }
```

> `clampSegments` strips the optional metadata today (it rebuilds `{ startSec, endSec, score }`). Update it to preserve `summary`/`role`/`why` so per-cut rationale survives. In `src/planCuts.ts`, change the push inside `clampSegments`:
>
> ```ts
> out.push({ startSec: roundMs(s.startSec), endSec, score: s.score, summary: s.summary, role: s.role, why: s.why });
> ```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/cutdownBrain.test.ts && npx tsc --noEmit`
Expected: PASS (5 tests); typecheck clean.

- [ ] **Step 5: Run the full suite (no regressions)**

Run: `npm test && npm run typecheck`
Expected: all suites green (existing 71 + new), typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/cutdownBrain.ts src/cutdownBrain.test.ts src/planCuts.ts
git commit -m "feat: cutdown brain orchestration — 3 angled CutdownPlans per run"
```

---

## Task 9: CutdownBrain seam + Fake + factory wiring

**Files:**
- Modify: `src/seams.ts`, `src/fakes.ts`, `src/factory.ts`, `src/realClients.ts`
- Test: `src/fakes.test.ts` (add a case)

- [ ] **Step 1: Write the failing test**

Append to `src/fakes.test.ts`:

```ts
import { FakeCutdownBrain } from "./fakes.js";
import { CutdownPlanSchema } from "./types.js";

describe("FakeCutdownBrain", () => {
  it("returns 3 schema-valid angled plans with no network", async () => {
    const brain = new FakeCutdownBrain();
    const track = {
      trackId: "t", title: "T", url: "fake://t.mp3", format: "mp3" as const,
      durationSec: 120, bpm: 120, provider: "fake", licenseRef: "x",
    };
    const plans = await brain.cutdown({ path: "x.mp4" }, track, { targetSec: 15, durationSec: 120 });
    expect(plans.map((p) => p.angle)).toEqual(["narrative", "highlights", "punchy"]);
    for (const p of plans) expect(() => CutdownPlanSchema.parse(p)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/fakes.test.ts -t FakeCutdownBrain`
Expected: FAIL — `FakeCutdownBrain` not exported.

- [ ] **Step 3: Add the `CutdownBrain` seam**

In `src/seams.ts`, add the interface (after `VideoMomentSelector`):

```ts
import type { SampleMusicTrack, CutdownPlan } from "./types.js"; // extend existing import

/**
 * The V1 cutdown brain: from a video + a chosen track, produce N angled cut
 * versions for a human to pick. Real: Gemini (analyze + per-angle select+critique).
 * Fake: deterministic angled plans. Brief (`humanInput`) is optional.
 */
export interface CutdownBrain {
  cutdown(
    video: VideoRef,
    track: SampleMusicTrack,
    opts: { targetSec: number; durationSec: number; humanInput?: string },
  ): Promise<CutdownPlan[]>;
}
```

- [ ] **Step 4: Add `FakeCutdownBrain`**

In `src/fakes.ts`, add (reuse `planCuts` + `ANGLES`):

```ts
import type { CutdownBrain } from "./seams.js";
import type { CutdownPlan } from "./types.js";
import { ANGLES, orderSegments } from "./angles.js";
import { planCuts, clampSegments } from "./planCuts.js";

/** Deterministic 3-angle plans from evenly-spaced beats. No network. */
export class FakeCutdownBrain implements CutdownBrain {
  async cutdown(
    _video: VideoRef,
    track: SampleMusicTrack,
    opts: { targetSec: number; durationSec: number; humanInput?: string },
  ): Promise<CutdownPlan[]> {
    const beats: Segment[] = Array.from({ length: 6 }, (_, i) => ({
      startSec: i * 8,
      endSec: i * 8 + 3,
      score: Number((1 - i / 6).toFixed(3)),
      summary: `beat ${i}`,
      role: ["hook", "setup", "build", "reveal", "reaction", "payoff"][i],
      why: `fake reason ${i}`,
    }));
    const bpm = track.bpm ?? 120;
    return ANGLES.map((angle) => {
      const ordered = orderSegments(angle, clampSegments(beats, opts.durationSec));
      return {
        angle,
        description: `${angle} (fake)${opts.humanInput ? ` · ${opts.humanInput}` : ""}`,
        cuts: planCuts({ bpm, totalSec: opts.targetSec, ranked: ordered, preserveOrder: true }),
      };
    });
  }
}
```

- [ ] **Step 5: Wire the factory + real deps**

In `src/factory.ts`, add `brain` to the deps. Import `FakeCutdownBrain` and `makeCutdownBrain`, then add to both branches:

```ts
import { FakeCutdownBrain } from "./fakes.js";
import { makeCutdownBrain } from "./cutdownBrain.js";
// fakes branch:  brain: new FakeCutdownBrain(),
// real branch:   brain: makeCutdownBrain(env.GEMINI_API_KEY ?? ""),
```

Add `brain: CutdownBrain;` to `PipelineDeps` in `src/seams.ts`. In `src/realClients.ts`, add `brain: makeCutdownBrain(env.GEMINI_API_KEY ?? ""),` to the returned object and import `makeCutdownBrain`.

> Adding `brain` to `PipelineDeps` means every existing constructor of deps must provide it. `makeDeps` (both branches), `makeRealDeps`, and any test that builds a `PipelineDeps` literal need the field. Search: `rg "PipelineDeps" src` and add `brain` to each. `pipeline.test.ts` builds deps — add `brain: new FakeCutdownBrain()` there.

- [ ] **Step 6: Run to verify it passes**

Run: `npm test && npm run typecheck`
Expected: all green; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add src/seams.ts src/fakes.ts src/fakes.test.ts src/factory.ts src/realClients.ts src/pipeline.test.ts
git commit -m "feat: CutdownBrain seam + FakeCutdownBrain + factory wiring"
```

---

## Task 10: CLI — `run-cutdown` (3 versions → pick → render)

**Files:**
- Create: `scripts/run-cutdown.ts`
- Modify: `package.json`

- [ ] **Step 1: Add the npm script**

In `package.json` `scripts`, add:

```json
    "run-cutdown": "tsx scripts/run-cutdown.ts",
```

- [ ] **Step 2: Implement `scripts/run-cutdown.ts`**

This is a live, manually-eyeballed script (no unit test — it talks to real providers). It reuses `makeRealDeps` for ffmpeg/GCS/Shotstack and the brain.

```ts
/**
 * run-cutdown — live V1 brain demo.
 *   npm run run-cutdown <trackId> [videoPath] [--brief "..."] [--target 15|30|60] [--pick N]
 *
 * Probes the source, asks the brain for 3 angled versions, prints each version's
 * description + cuts. With --pick N it renders that version via the existing
 * ffmpeg→GCS→Shotstack tail and prints the mp4 URL.
 */
import "dotenv/config";
import { makeRealDeps } from "../src/realClients.js";
import { OUTPUT, type ClipRef, type EditSpec } from "../src/types.js";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const positionals = process.argv.slice(2).filter((a) => !a.startsWith("--") && !/^\d+$/.test(a) === false ? false : !a.startsWith("--"));
  const trackId = positionals[0];
  const videoPath = positionals[1] ?? "fixtures/test_02.mp4";
  const brief = arg("--brief");
  const targetSec = Number(arg("--target") ?? "15") as 15 | 30 | 60;
  const pick = arg("--pick");

  if (!trackId) {
    console.error('Usage: npm run run-cutdown <trackId> [videoPath] [--brief "..."] [--target 15|30|60] [--pick N]');
    process.exit(1);
  }

  const deps = makeRealDeps();
  const durationSec = await deps.clipExtractor.probeDurationSec(videoPath);
  const track = (await deps.catalog.list()).find((t) => t.trackId === trackId);
  if (!track) throw new Error(`unknown trackId "${trackId}"`);
  const { url } = await deps.catalog.fetch(trackId);
  const trackWithUrl = { ...track, url };

  console.log(`\nsource: ${videoPath} (${durationSec.toFixed(1)}s) · track: ${trackId} (${track.bpm ?? "?"}bpm) · target ${targetSec}s${brief ? ` · brief: "${brief}"` : ""}\n`);

  const plans = await deps.brain.cutdown({ path: videoPath }, trackWithUrl, { targetSec, durationSec, humanInput: brief });

  plans.forEach((p, i) => {
    console.log(`[${i}] ${p.description}`);
    p.cuts.forEach((c) => console.log(`     ${c.srcIn.toFixed(2)}–${c.srcOut.toFixed(2)}s  ${c.len.toFixed(2)}s  ${c.role ?? ""}  — ${c.why ?? ""}`));
    console.log("");
  });

  if (pick === undefined) {
    console.log("Add --pick N to render one of the versions above.");
    return;
  }

  const chosen = plans[Number(pick)];
  if (!chosen) throw new Error(`--pick ${pick} out of range (0..${plans.length - 1})`);

  const runToken = `cutdown-${trackId}-${pick}`;
  const clipPaths = await deps.clipExtractor.extractClips(videoPath, chosen.cuts, durationSec);
  const clips: ClipRef[] = [];
  for (let i = 0; i < clipPaths.length; i++) {
    const signed = await deps.blobStore.uploadAndSign(clipPaths[i], `${runToken}/clip-${i}.mp4`);
    clips.push({ url: signed, len: chosen.cuts[i].len });
  }
  const spec: EditSpec = { clips, musicUrl: url, totalSec: targetSec, width: OUTPUT.width, height: OUTPUT.height };
  const { mp4Url } = await deps.renderer.render(spec);
  console.log(`\n▸ rendered version [${pick}] (${chosen.angle}): ${mp4Url}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

> The clunky `positionals` filter exists because flags interleave with positionals. Simplify if you prefer a parser, but keep zero new deps. `EditSpec.totalSec` already accepts any positive number, so 15/30/60 all validate.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. (No unit test — this script hits live providers.)

- [ ] **Step 4: Commit**

```bash
git add scripts/run-cutdown.ts package.json
git commit -m "feat: run-cutdown CLI — 3 angled versions, --pick renders one"
```

- [ ] **Step 5: ⛳ LIVE GATE — eyeball 3 versions + a render**

With the venv + env from the README:

```bash
FFMPEG_BIN=$(.venv-librosa/bin/python -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())") \
PYTHON_BIN=$(pwd)/.venv-librosa/bin/python \
npm run run-cutdown otro_atardecer fixtures/test_02.mp4 --target 15
```
Expected: 3 versions print with distinct descriptions + cut lists that visibly differ (Narrative chronological, Highlights score-ordered, Punchy strongest-first). Then re-run with `--pick 1 --brief "focus on the demo"` and watch the rendered URL. **Human confirms the versions are meaningfully different and the rendered cut is coherent before proceeding to the follow-up (storyboard + web shell) plan.**

---

## Task 11: Docs

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document the brain + CLI**

Add a "V1 cutdown brain" section to `README.md` after "Running it":

```markdown
## V1 cutdown brain (3 versions)

The V1 brain returns three angled cut versions for a human to pick:

    aiCutdown(video, track, { humanInput?, targetSec }) → CutdownPlan[]

- One shared Gemini *video* call (analyze → theme + beats); then per-angle text-only
  select + critique over the beats (1 + 3 + 3 = 7 calls).
- Angles: **Narrative** (chronological) · **Highlights** (impact-ordered) · **Punchy**
  (strongest-first). A brief (`humanInput`), when present, biases all three.

    # print 3 versions; add --pick N to render one
    FFMPEG_BIN=… PYTHON_BIN=… npm run run-cutdown <trackId> [video] [--target 15|30|60] [--brief "…"] [--pick N]

Storyboard thumbnails + the web shell are a follow-up (spec checkpoint 5).
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document V1 cutdown brain + run-cutdown CLI"
```

---

## Self-review notes (addressed)

- **Spec coverage:** analyze (Task 5), 3 fixed angles + ordering (Task 3, 6), per-version critique with graceful degradation (Task 7), brief-optional single path (Tasks 6–8), shared-analysis diversity + 7-call budget (Task 8), `CutdownPlan` + description + per-cut why (Tasks 1, 8), planCuts order-preservation + metadata (Task 2), seam+Fake+no-network tests (Task 9), variable target length (Tasks 8, 10), live render of a picked version (Task 10). **Deferred (next plan):** storyboard thumbnails (`StoryboardMaker`) + web shell (spec checkpoint 5) + catalog browse UI.
- **Type consistency:** `GenAiLike` is defined once in `geminiCore.ts` and re-exported from `gemini.ts`; `CutdownPlan`/`PlannedCut`/`Beat`/`VideoAnalysis` defined in Task 1 and used unchanged thereafter; `cutdown(video, track, {targetSec, durationSec, humanInput?})` signature identical across seam (Task 9), impl (Task 8), Fake (Task 9), and CLI (Task 10).
- **No placeholders:** every step has runnable code/commands and expected output.
```
