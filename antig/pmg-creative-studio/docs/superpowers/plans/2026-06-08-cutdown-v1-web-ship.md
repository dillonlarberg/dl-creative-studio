# Cutdown V1 — Monolith-Native Video Cutdown App (adlabs) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship the V1 cutdown tool as a first-class app inside the AdLabs monolith at `https://adlabs-alli.web.app/adlabs/<client>/video-cutdown` — upload a long video → pick a catalog track → set length + optional brief → watch 3 AI cut versions (with storyboard thumbnails) **stream in live** → pick one → render & download a 9:16 reel.

**Architecture:** Mirror the **ad-resizing** app layer-for-layer. Frontend = a custom `AppRoot.tsx` (NOT WizardShell) under `src/apps/video-cutdown/` with `components/ hooks/ services/ utils/ types.ts`. Backend = Firebase v2 callables under `functions/src/cutdown/`, with the V1 cutdown **brain lifted into `functions/src/cutdown/engine/` (CJS)** — the same move already done for `_shared/ai/outpaint`. Progress is **live**: the `cutdownGenerate` callable writes a batch + per-angle version docs + per-cut thumbnail uploads to Firestore/GCS as it goes; the client subscribes via `onSnapshot` (reusing ad-resizing's `useBatchOutputs`/`useStorageUrl` patterns) so version cards and thumbnails fill in progressively. The `tools/cutdown-tracer/` rig stays as the engine's reference harness + offline test bed.

**Tech Stack:** React 19 + React Router 7 + Vite + Tailwind + `@agencypmg/alli-design-system` (frontend); Firebase Functions v2 (Node 22, CommonJS), `@google/genai`, `ffmpeg-static`/spawn, Shotstack, Firestore + Storage via firebase-admin, `defineSecret`; Zod; Vitest. **No Python/librosa at runtime** (catalog BPM precomputed at ingest). **No OpenAI** (outpaint/stitch is M1).

**This is the video-cutdown app, ultimately. Stitch is M1 (next), explicitly out of scope here** — `@pmg/ai-outpaint` package, Reframer, image reframe, mixed image+video stitch, AI ordering, multi-creative picker. None are touched.

---

## Reference: ad-resizing is the template (study before building)

| Concern | ad-resizing file | cutdown equivalent |
|---|---|---|
| Route mount | `src/App.tsx:139-146` (`<AdResizingAppRoot/>` in `<ClientProvider>`) | replace `src/App.tsx:131-138` WizardShell with `<VideoCutdownAppRoot/>` |
| Manifest (registry card) | `src/apps/ad-resizing/manifest.ts` (14 lines, `status:'live'`, `steps:[]`) | `src/apps/video-cutdown/manifest.ts` lift preview→live |
| Orchestrator | `AppRoot.tsx` (Stage state machine `browse\|results`) | `AppRoot.tsx` (Stage `source\|music\|brief\|run\|render`) |
| Backend call | `hooks/useOutpaintRunner.ts` (`httpsCallable(...,{timeout:600000})`) | `hooks/useCutdown.ts` |
| Live progress | `hooks/useBatchOutputs.ts` (`onSnapshot` batch + outputs) | `hooks/useCutdownBatch.ts` |
| Storage URL resolve | `hooks/useStorageUrl.ts` | reuse (import) |
| Upload | `services/uploadService.ts` (`uploadBytes`+`getDownloadURL`+doc) | `services/uploadVideo.ts` |
| Backend orchestrator | `functions/src/resize/runOutpaintBatch.ts` (`onCall`, auth, progressive writes) | `functions/src/cutdown/cutdownGenerate.ts` |
| Reusable engine | `functions/src/_shared/ai/outpaint/` | `functions/src/cutdown/engine/` (lifted brain) |
| Paths SoT | `src/platform/firebase/paths.ts` (`'video-cutdown'` already a valid AppId) | reuse |
| Auth gate | `functions/src/_shared/assertAlliStudioUser` | reuse |
| Output persistence | `functions/src/_shared/outputs` (`createOutput`/`updateOutput`) | reuse |

---

## File Structure

**Engine work in the tracer (Phases A–B):** new `src/storyboard.ts`, `src/musicTags.ts`, `src/trackManifest.ts`, `tracks.json`; modified `src/seams.ts`, `src/ffmpeg.ts`, `src/fakes.ts`, `src/factory.ts`, `src/realClients.ts`, `src/types.ts`, `src/firestoreCatalog.ts`, `scripts/ingest-music.ts`.

**Backend (Phase C–D):**
```
functions/src/cutdown/
  index.ts                 ← barrel (exports the 3 callables)
  cutdownListTracks.ts     ← onCall → signed catalog
  cutdownGenerate.ts       ← onCall → progressive batch+versions+thumbs
  cutdownRender.ts         ← onCall → extract+upload+Shotstack → output doc
  deps.ts                  ← functions-side engine wiring (admin + secrets + ffmpeg-static)
  paths.ts                 ← batch/version/thumb path helpers (uses src paths convention)
  engine/                  ← LIFTED brain (CJS), copied from tools/cutdown-tracer/src/
    cutdownBrain.ts angles.ts geminiCore.ts gemini.ts planCuts.ts shotstack.ts
    ffmpeg.ts storyboard.ts firestoreCatalog.ts types.ts musicTags.ts seams.ts
    fakes.ts (+ *.test.ts ported)
```
Modified: `functions/src/index.ts` (add `export * from "./cutdown"`).

**Frontend (Phase E):**
```
src/apps/video-cutdown/
  AppRoot.tsx              ← orchestrator (Stage machine)
  manifest.ts             ← lift preview→live
  types.ts                ← TrackView, CutdownPlanView, VersionDoc, BatchDoc, Stage
  components/  SourcePanel.tsx  MusicPicker.tsx  BriefPanel.tsx
               VersionsBoard.tsx  VersionCard.tsx  RenderResult.tsx  StepIndicator.tsx
  hooks/       useTracks.ts  useCutdown.ts  useCutdownBatch.ts
  services/    uploadVideo.ts
  utils/       fmtTime.ts (+ __tests__)  videoValidation.ts (+ __tests__)
```
Modified: `src/App.tsx` (mount AppRoot), `firestore.rules`, `storage.rules`.

---

## Phase A — Engine: `StoryboardMaker` seam (in the tracer)

### Task A1: Export ffmpeg helpers for reuse

**Files:** Modify `tools/cutdown-tracer/src/ffmpeg.ts:21,32`

- [ ] **Step 1:** Add `export` to both helpers so `storyboard.ts` can reuse them:
```typescript
export function runFfmpegCapture(bin: string, args: string[]): Promise<{ code: number | null; stderr: string }> {
```
```typescript
export async function runFfmpeg(bin: string, args: string[]): Promise<void> {
```
- [ ] **Step 2:** `cd tools/cutdown-tracer && npm run typecheck && npm test` → clean, 101 pass.
- [ ] **Step 3:** `git commit -am "refactor(ffmpeg): export runFfmpeg helpers for storyboard reuse"`

### Task A2: `StoryboardMaker` interface + `frameTimestamps` (TDD)

**Files:** Modify `src/seams.ts`; Create `src/storyboard.ts`, `src/storyboard.test.ts`

- [ ] **Step 1:** In `src/seams.ts` after `ClipExtractor` add:
```typescript
/** Grabs one representative still per cut for the storyboard preview. Real: ffmpeg
 *  single-frame extraction at each cut's midpoint. Fake: canned local paths. */
export interface StoryboardMaker {
  frames(localVideoPath: string, cuts: ReadonlyArray<{ srcIn: number; len: number }>, durationSec: number): Promise<string[]>;
}
```
and add `storyboard: StoryboardMaker;` to `PipelineDeps`.
- [ ] **Step 2:** Write `src/storyboard.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { frameTimestamps } from "./storyboard.js";

describe("frameTimestamps", () => {
  it("returns the midpoint of each cut window", () => {
    expect(frameTimestamps([{ srcIn: 4, len: 6 }, { srcIn: 84, len: 6 }], 200)).toEqual([7, 87]);
  });
  it("clamps a midpoint past the source duration", () => {
    const [t] = frameTimestamps([{ srcIn: 198, len: 6 }], 200);
    expect(t).toBeLessThan(200); expect(t).toBeGreaterThan(0);
  });
  it("never returns a negative timestamp", () => {
    expect(frameTimestamps([{ srcIn: 0, len: 0.2 }], 200)).toEqual([0.1]);
  });
});
```
- [ ] **Step 3:** Run `npx vitest run src/storyboard.test.ts` → FAIL (no module).
- [ ] **Step 4:** Create `src/storyboard.ts`:
```typescript
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { runFfmpeg } from "./ffmpeg.js";
import type { StoryboardMaker } from "./seams.js";

const THUMB_W = 216, THUMB_H = 384; // 9:16

export function frameTimestamps(cuts: ReadonlyArray<{ srcIn: number; len: number }>, durationSec: number): number[] {
  return cuts.map((c) => {
    const mid = c.srcIn + c.len / 2;
    return Math.min(Math.max(0, mid), Math.max(0, durationSec - 0.05));
  });
}

export class FfmpegStoryboard implements StoryboardMaker {
  constructor(private readonly ffmpegBin = process.env.FFMPEG_BIN ?? "ffmpeg", private readonly workDir = os.tmpdir()) {}
  async frames(localVideoPath: string, cuts: ReadonlyArray<{ srcIn: number; len: number }>, durationSec: number): Promise<string[]> {
    const dir = await fs.mkdtemp(path.join(this.workDir, "cutdown-thumbs-"));
    const times = frameTimestamps(cuts, durationSec);
    const out: string[] = [];
    for (let i = 0; i < times.length; i++) {
      const file = path.join(dir, `thumb-${String(i).padStart(3, "0")}.jpg`);
      await runFfmpeg(this.ffmpegBin, [
        "-y", "-ss", String(Math.round(times[i] * 1000) / 1000), "-i", localVideoPath, "-frames:v", "1",
        "-vf", `scale=${THUMB_W}:${THUMB_H}:force_original_aspect_ratio=increase,crop=${THUMB_W}:${THUMB_H}`,
        "-q:v", "4", file,
      ]);
      out.push(file);
    }
    return out;
  }
}
export function makeFfmpegStoryboard(): FfmpegStoryboard { return new FfmpegStoryboard(); }
```
- [ ] **Step 5:** `npx vitest run src/storyboard.test.ts` → PASS (3).
- [ ] **Step 6:** `git add -A && git commit -m "feat(storyboard): StoryboardMaker seam + ffmpeg frame-grab"`

### Task A3: `FakeStoryboard` + wire factory/realClients (TDD)

**Files:** Modify `src/fakes.ts`, `src/factory.ts`, `src/realClients.ts`, `src/storyboard.test.ts`

- [ ] **Step 1:** Append to `src/storyboard.test.ts`:
```typescript
import { FakeStoryboard } from "./fakes.js";
describe("FakeStoryboard", () => {
  it("returns one canned path per cut, no ffmpeg", async () => {
    const paths = await new FakeStoryboard().frames("x.mp4", [{ srcIn: 1, len: 2 }, { srcIn: 5, len: 2 }], 100);
    expect(paths).toHaveLength(2); expect(paths[0]).toMatch(/thumb-0/);
  });
});
```
- [ ] **Step 2:** Run → FAIL (not exported).
- [ ] **Step 3:** In `src/fakes.ts` add the seam import + class:
```typescript
import type { StoryboardMaker } from "./seams.js";
export class FakeStoryboard implements StoryboardMaker {
  async frames(_p: string, cuts: ReadonlyArray<{ srcIn: number; len: number }>, _d: number): Promise<string[]> {
    return cuts.map((_c, i) => `fake://thumb-${i}.jpg`);
  }
}
```
- [ ] **Step 4:** In `src/factory.ts` import `FakeStoryboard` and add `storyboard: new FakeStoryboard()` to the fakes return; add `storyboard: notYet("StoryboardMaker", "functions wiring")` to the real branch.
- [ ] **Step 5:** In `src/realClients.ts` import `makeFfmpegStoryboard` and add `storyboard: makeFfmpegStoryboard()` to the returned deps.
- [ ] **Step 6:** `npm run typecheck && npm test` → clean, all pass.
- [ ] **Step 7:** `git add -A && git commit -m "feat(storyboard): FakeStoryboard + factory/realClients wiring"`

---

## Phase B — Engine: unified music tagging schema + `tracks.json` (in the tracer)

### Task B1: Controlled tag vocabularies (TDD)

**Files:** Create `src/musicTags.ts`, `src/musicTags.test.ts`

- [ ] **Step 1:** Write `src/musicTags.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { MoodSchema, GenreSchema, VocalsSchema, UseCaseTagSchema, EnergySchema } from "./musicTags.js";
describe("music tag vocabularies", () => {
  it("accepts known values", () => {
    expect(MoodSchema.parse("energetic")).toBe("energetic");
    expect(GenreSchema.parse("electronic")).toBe("electronic");
    expect(VocalsSchema.parse("instrumental")).toBe("instrumental");
    expect(UseCaseTagSchema.parse("product")).toBe("product");
    expect(EnergySchema.parse(3)).toBe(3);
  });
  it("rejects unknown values", () => {
    expect(() => MoodSchema.parse("spicy")).toThrow();
    expect(() => EnergySchema.parse(6)).toThrow();
  });
});
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Create `src/musicTags.ts`:
```typescript
import { z } from "zod";
export const MOODS = ["energetic","chill","uplifting","dramatic","dark","playful","cinematic","nostalgic","aggressive","romantic","confident","warm","dreamy","calm","intense"] as const;
export const GENRES = ["electronic","hiphop","pop","rock","ambient","corporate","acoustic","orchestral","lofi","funk","indie","rnb","folk","jazz"] as const;
export const USE_CASE_TAGS = ["product","lifestyle","tech","fashion","travel","corporate","social","beauty","fitness","food","automotive","finance"] as const;
export const MoodSchema = z.enum(MOODS);
export const GenreSchema = z.enum(GENRES);
export const VocalsSchema = z.enum(["instrumental","vocal"]);
export const UseCaseTagSchema = z.enum(USE_CASE_TAGS);
export const EnergySchema = z.number().int().min(1).max(5);
export type Mood = z.infer<typeof MoodSchema>;
export type Genre = z.infer<typeof GenreSchema>;
export type Vocals = z.infer<typeof VocalsSchema>;
export type UseCaseTag = z.infer<typeof UseCaseTagSchema>;
```
- [ ] **Step 4:** Run → PASS. **Step 5:** `git commit -am "feat(music): controlled tag vocabularies"`

### Task B2: Extend doc + runtime schemas (TDD, additive)

**Files:** Modify `src/firestoreCatalog.ts`, `src/types.ts`; Create `src/firestoreCatalog.test.ts`

- [ ] **Step 1:** Write `src/firestoreCatalog.test.ts` (fake Firestore, asserts tags carry through + legacy docs still parse):
```typescript
import { describe, it, expect } from "vitest";
import { FirestoreMusicCatalog, type FirestoreLike } from "./firestoreCatalog.js";
function fakeDb(docs: Array<{ id: string; data: unknown }>): FirestoreLike {
  return { collection: () => ({
    get: async () => ({ docs: docs.map((d) => ({ id: d.id, exists: true, data: () => d.data })) }),
    doc: (id: string) => ({ get: async () => { const m = docs.find((d) => d.id === id); return { id, exists: !!m, data: () => m?.data }; } }),
  }) };
}
describe("FirestoreMusicCatalog tagging", () => {
  it("carries tags through to the runtime track", async () => {
    const db = fakeDb([{ id: "trk_pulse", data: { title: "Pulse", storagePath: "sampleMusic/p.mp3", format: "mp3", durationSec: 142, bpm: 124, provider: "pixabay", licenseRef: "cc0", mood: "energetic", genre: "electronic", energy: 5, vocals: "instrumental", tags: ["tech","product"] } }]);
    const [t] = await new FirestoreMusicCatalog(db, async (p) => `signed://${p}`).list();
    expect(t.mood).toBe("energetic"); expect(t.energy).toBe(5); expect(t.tags).toEqual(["tech","product"]); expect(t.url).toBe("signed://sampleMusic/p.mp3");
  });
  it("accepts a legacy doc with no tags", async () => {
    const db = fakeDb([{ id: "legacy", data: { title: "Old", storagePath: "sampleMusic/o.mp3", format: "mp3", durationSec: 100, bpm: 100, provider: "manual", licenseRef: "internal-demo" } }]);
    const [t] = await new FirestoreMusicCatalog(db, async (p) => `signed://${p}`).list();
    expect(t.trackId).toBe("legacy"); expect(t.mood).toBeUndefined();
  });
});
```
- [ ] **Step 2:** Run → FAIL (energy/vocals/tags stripped).
- [ ] **Step 3:** In `src/firestoreCatalog.ts` import the tag schemas and extend `MusicDocSchema` with `mood: MoodSchema.optional(), genre: GenreSchema.optional(), energy: EnergySchema.optional(), vocals: VocalsSchema.optional(), tags: z.array(UseCaseTagSchema).optional()`; pass them through in `toTrack`.
- [ ] **Step 4:** In `src/types.ts` import the tag schemas and replace `mood`/`genre` in `SampleMusicTrackSchema` with the enum versions + add `energy`/`vocals`/`tags` (all `.optional()`).
- [ ] **Step 5:** `npx vitest run src/firestoreCatalog.test.ts && npm run typecheck` → PASS, clean.
- [ ] **Step 6:** `git commit -am "feat(music): additive tagging fields on doc + runtime schemas"`

### Task B3: `tracks.json` manifest + `ingest --manifest` (TDD)

**Files:** Create `src/trackManifest.ts`, `src/trackManifest.test.ts`, `tracks.json`; Modify `scripts/ingest-music.ts`

- [ ] **Step 1:** Write `src/trackManifest.test.ts` (validates entry, rejects out-of-vocab mood, maps to doc fields omitting trackId). **Step 2:** Run → FAIL.
- [ ] **Step 3:** Create `src/trackManifest.ts`:
```typescript
import { z } from "zod";
import { MoodSchema, GenreSchema, VocalsSchema, UseCaseTagSchema, EnergySchema } from "./musicTags.js";
import type { MusicDoc } from "./firestoreCatalog.js";
export const TrackManifestEntrySchema = z.object({
  trackId: z.string().min(1), title: z.string().min(1), storagePath: z.string().min(1),
  format: z.enum(["mp3","wav","m4a","aac"]), mood: MoodSchema, genre: GenreSchema, energy: EnergySchema,
  vocals: VocalsSchema, tags: z.array(UseCaseTagSchema), provider: z.string().min(1), licenseRef: z.string().min(1),
  bpm: z.number().positive().optional(), durationSec: z.number().positive().optional(),
});
export type TrackManifestEntry = z.infer<typeof TrackManifestEntrySchema>;
export const TrackManifestSchema = z.array(TrackManifestEntrySchema).min(1);
export function manifestEntryToDocFields(e: TrackManifestEntry, probed: { bpm: number; durationSec: number }): MusicDoc {
  return { title: e.title, storagePath: e.storagePath, format: e.format, durationSec: e.durationSec ?? probed.durationSec,
    bpm: e.bpm ?? probed.bpm, mood: e.mood, genre: e.genre, energy: e.energy, vocals: e.vocals, tags: e.tags, provider: e.provider, licenseRef: e.licenseRef };
}
```
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Create `tracks.json` (the 2 real tracks as the by-example shape; bpm/dur omitted → probed at ingest):
```json
[
  { "trackId": "dtmf", "title": "Dtmf", "storagePath": "sampleMusic/dtmf.mp3", "format": "mp3", "mood": "confident", "genre": "hiphop", "energy": 4, "vocals": "instrumental", "tags": ["social","lifestyle"], "provider": "manual", "licenseRef": "internal-demo" },
  { "trackId": "otro_atardecer", "title": "Otro Atardecer", "storagePath": "sampleMusic/otro_atardecer.mp3", "format": "mp3", "mood": "warm", "genre": "indie", "energy": 3, "vocals": "instrumental", "tags": ["lifestyle","travel"], "provider": "manual", "licenseRef": "internal-demo" }
]
```
- [ ] **Step 6:** In `scripts/ingest-music.ts` import `{ TrackManifestSchema, manifestEntryToDocFields }` and add a `--manifest <file>` branch at the start of `main()` (reads the manifest, downloads each `storagePath` to probe bpm/duration when absent, writes `sampleMusic/{trackId}` via `manifestEntryToDocFields`). [Full branch code as in prior draft.]
- [ ] **Step 7:** `npm run typecheck && npx vitest run` → clean, all pass.
- [ ] **Step 8:** `git commit -am "feat(music): tracks.json manifest + ingest --manifest path"`

---

## Phase C — Lift the engine into `functions/src/cutdown/engine/` (CJS)

> Behavior-preserving copy of the tracer's brain into functions, exactly like `_shared/ai/outpaint`. functions is CommonJS; the brain is pure logic + injected clients (no `import.meta`, no top-level await), so it compiles under `tsc --module commonjs`. `@google/genai` is already a functions dep and used in CJS by `runOutpaintBatch.ts`.

### Task C1: Copy engine files + adjust for CJS build

**Files:** Create `functions/src/cutdown/engine/*` (copied from `tools/cutdown-tracer/src/`)

- [ ] **Step 1:** Copy these files verbatim into `functions/src/cutdown/engine/`: `types.ts musicTags.ts seams.ts angles.ts planCuts.ts geminiCore.ts gemini.ts cutdownBrain.ts shotstack.ts ffmpeg.ts storyboard.ts firestoreCatalog.ts fakes.ts` plus their `*.test.ts`.
```bash
mkdir -p functions/src/cutdown/engine
cp tools/cutdown-tracer/src/{types,musicTags,seams,angles,planCuts,geminiCore,gemini,cutdownBrain,shotstack,ffmpeg,storyboard,firestoreCatalog,fakes}.ts functions/src/cutdown/engine/
cp tools/cutdown-tracer/src/{planCuts,storyboard,musicTags,trackManifest,firestoreCatalog,angles,cutdownBrain,gemini}.test.ts functions/src/cutdown/engine/ 2>/dev/null || true
cp tools/cutdown-tracer/src/trackManifest.ts functions/src/cutdown/engine/
```
- [ ] **Step 2:** Verify functions builds with the new files (tsc CJS):
```bash
cd functions && npm run build
```
Expected: compiles. If `.js` extension imports error under classic resolution, the fix is a one-time tsconfig adjustment in `functions/tsconfig.json` (`"moduleResolution": "node16"` or strip `.js` from the copied engine imports). Apply whichever keeps the rest of functions building; re-run.
- [ ] **Step 3:** Run the ported engine tests under functions' vitest:
```bash
cd functions && npx vitest run src/cutdown/engine
```
Expected: the pure-logic suites (planCuts, storyboard, musicTags, trackManifest, angles) + fake-backed cutdownBrain/gemini tests pass. Drop any test that depends on the tracer's `realClients`/scripts (not copied).
- [ ] **Step 4:** `git add functions/src/cutdown && git commit -m "feat(cutdown): lift V1 brain engine into functions (CJS)"`

### Task C2: Functions-side engine wiring `deps.ts`

**Files:** Create `functions/src/cutdown/deps.ts`

- [ ] **Step 1:** Create `functions/src/cutdown/deps.ts` — composes the engine seams from firebase-admin + secrets + ffmpeg-static (the functions analogue of `realClients.ts`, but using admin and NOT initializing a second app):
```typescript
import { getFirestore } from "firebase-admin/firestore";
import { getStorage, getDownloadURL } from "firebase-admin/storage";
import ffmpegStatic from "ffmpeg-static";
import { makeGeminiSelector } from "./engine/gemini.js";
import { makeCutdownBrain } from "./engine/cutdownBrain.js";
import { makeShotstackRenderer } from "./engine/shotstack.js";
import { makeFfmpegClipExtractor } from "./engine/ffmpeg.js";
import { makeFfmpegStoryboard } from "./engine/storyboard.js";
import { FirestoreMusicCatalog, type FirestoreLike } from "./engine/firestoreCatalog.js";
import { GcsBlobStore, type BucketLike } from "./engine/storage.js"; // copy storage.ts too if needed, or inline upload in render

// ffmpeg-static ships the binary path; the engine reads FFMPEG_BIN.
if (ffmpegStatic) process.env.FFMPEG_BIN = ffmpegStatic;

export function makeCutdownDeps(geminiKey: string, shotstackKey: string) {
  const db = getFirestore();
  const bucket = getStorage().bucket();
  const sign = (objectPath: string) => getDownloadURL(bucket.file(objectPath));
  const catalog = new FirestoreMusicCatalog(db as unknown as FirestoreLike, sign);
  return {
    catalog,
    brain: makeCutdownBrain(geminiKey),
    selector: makeGeminiSelector(geminiKey),
    renderer: makeShotstackRenderer(shotstackKey),
    clipExtractor: makeFfmpegClipExtractor(),
    storyboard: makeFfmpegStoryboard(),
    sign,
    bucket,
  };
}
```
> Note: copy `tools/cutdown-tracer/src/storage.ts` into `engine/` too (the `GcsBlobStore`/`BucketLike`), or inline the few upload lines in `cutdownRender.ts`. Prefer copying for parity.
- [ ] **Step 2:** Add `"ffmpeg-static"` is already in functions deps (confirmed). `cd functions && npm run build` → compiles.
- [ ] **Step 3:** `git commit -am "feat(cutdown): functions-side engine deps wiring"`

---

## Phase D — Backend callables (`functions/src/cutdown/`)

> First read `functions/src/resize/runOutpaintBatch.ts:1-70,587-635` + `functions/src/_shared/assertAlliStudioUser.ts` + `functions/src/_shared/outputs.ts` to copy the EXACT `onCall` options (`enforceAppCheck`, `region`, `secrets`, memory/timeout) and the auth-gate + output-write call shapes. Use those verbatim below.

### Task D1: paths + data-model types

**Files:** Create `functions/src/cutdown/paths.ts`

- [ ] **Step 1:** Create helpers for the live-progress docs (under the existing `clients/{slug}/apps/video-cutdown/` tree):
```typescript
export const APP_ID = "video-cutdown" as const;
const appRoot = (slug: string) => `clients/${slug}/apps/${APP_ID}`;
export const cutdownPaths = {
  batch: (slug: string, batchId: string) => `${appRoot(slug)}/batches/${batchId}`,
  versions: (slug: string, batchId: string) => `${appRoot(slug)}/batches/${batchId}/versions`,
  version: (slug: string, batchId: string, angle: string) => `${appRoot(slug)}/batches/${batchId}/versions/${angle}`,
  thumb: (slug: string, batchId: string, angle: string, i: number) => `${appRoot(slug)}/batches/${batchId}/thumbs/${angle}-${i}.jpg`,
  renderClip: (slug: string, batchId: string, angle: string, i: number) => `${appRoot(slug)}/renders/${batchId}/${angle}-clip-${i}.mp4`,
};
```
- [ ] **Step 2:** `cd functions && npm run build` → compiles. **Step 3:** commit.

### Task D2: `cutdownListTracks` callable (TDD-lite via emulator/unit)

**Files:** Create `functions/src/cutdown/cutdownListTracks.ts`

- [ ] **Step 1:** Implement (auth gate + catalog list, strips URLs not needed for browse but signs for preview):
```typescript
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { assertAlliStudioUser } from "../_shared/assertAlliStudioUser";
import { makeCutdownDeps } from "./deps.js";

const GEMINI_KEY = defineSecret("GEMINI_API_KEY");
const SHOTSTACK_KEY = defineSecret("SHOTSTACK_API_KEY");

export const cutdownListTracks = onCall(
  { enforceAppCheck: true, secrets: [GEMINI_KEY, SHOTSTACK_KEY], region: "us-central1", memory: "512MiB", timeoutSeconds: 60 },
  async (request) => {
    await assertAlliStudioUser(request);
    const deps = makeCutdownDeps(GEMINI_KEY.value(), SHOTSTACK_KEY.value());
    const tracks = await deps.catalog.list();
    return { tracks };
  },
);
```
> Confirm the exact `assertAlliStudioUser(request)` signature against the resize callable and match it.
- [ ] **Step 2:** `cd functions && npm run build` → compiles. **Step 3:** commit.

### Task D3: `cutdownGenerate` callable — progressive writes (the heart)

**Files:** Create `functions/src/cutdown/cutdownGenerate.ts`

- [ ] **Step 1:** Implement. Downloads the uploaded source, creates a batch doc, runs the brain, and writes **each version doc + each thumbnail as it completes** so the client's `onSnapshot` fills the board live:
```typescript
import os from "node:os";
import path from "node:path";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { assertAlliStudioUser } from "../_shared/assertAlliStudioUser";
import { makeCutdownDeps } from "./deps.js";
import { cutdownPaths } from "./paths.js";

const GEMINI_KEY = defineSecret("GEMINI_API_KEY");
const SHOTSTACK_KEY = defineSecret("SHOTSTACK_API_KEY");
const SLUG_RE = /^[a-z0-9_-]+$/;

export const cutdownGenerate = onCall(
  { enforceAppCheck: true, secrets: [GEMINI_KEY, SHOTSTACK_KEY], region: "us-central1", memory: "4GiB", timeoutSeconds: 540 },
  async (request) => {
    await assertAlliStudioUser(request);
    const { clientSlug, batchId, videoStoragePath, trackId, targetSec, brief, sourceName } = request.data ?? {};
    if (!clientSlug || !SLUG_RE.test(clientSlug)) throw new HttpsError("invalid-argument", "bad clientSlug");
    if (!batchId || !videoStoragePath || !trackId) throw new HttpsError("invalid-argument", "missing batchId/videoStoragePath/trackId");

    const deps = makeCutdownDeps(GEMINI_KEY.value(), SHOTSTACK_KEY.value());
    const db = getFirestore();
    const batchRef = db.doc(cutdownPaths.batch(clientSlug, batchId));

    // 1. Download source to /tmp.
    const tmp = path.join(os.tmpdir(), `cutdown-${batchId}.mp4`);
    await deps.bucket.file(videoStoragePath).download({ destination: tmp });
    const durationSec = await deps.clipExtractor.probeDurationSec(tmp);

    // 2. Resolve track + create batch doc (status analyzing).
    const tracks = await deps.catalog.list();
    const track = tracks.find((t) => t.trackId === trackId);
    if (!track) throw new HttpsError("not-found", `unknown trackId ${trackId}`);
    const { url } = await deps.catalog.fetch(trackId);
    const trackWithUrl = { ...track, url };
    await batchRef.set({
      id: batchId, clientSlug, appId: "video-cutdown", status: "generating",
      trackId, trackTitle: track.title, bpm: track.bpm ?? null, targetSec: targetSec ?? 15,
      sourceName: sourceName ?? "upload.mp4", videoStoragePath, durationSec,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });

    // 3. Generate all 3 angled plans (brain).
    const plans = await deps.brain.cutdown({ path: tmp }, trackWithUrl, { targetSec: targetSec ?? 15, durationSec, humanInput: brief || undefined });

    // 4. Per version: write the plan doc, then upload + attach each thumb progressively.
    for (const plan of plans) {
      const vRef = db.doc(cutdownPaths.version(clientSlug, batchId, plan.angle));
      await vRef.set({ angle: plan.angle, description: plan.description, cuts: plan.cuts, thumbs: [], status: "thumbing", updatedAt: FieldValue.serverTimestamp() });
      const framePaths = await deps.storyboard.frames(tmp, plan.cuts, durationSec);
      for (let i = 0; i < framePaths.length; i++) {
        const dest = cutdownPaths.thumb(clientSlug, batchId, plan.angle, i);
        await deps.bucket.upload(framePaths[i], { destination: dest, metadata: { contentType: "image/jpeg" } });
        await vRef.update({ thumbs: FieldValue.arrayUnion(dest), updatedAt: FieldValue.serverTimestamp() });
      }
      await vRef.update({ status: "ready" });
    }

    // 5. Batch ready.
    await batchRef.update({ status: "ready", updatedAt: FieldValue.serverTimestamp() });
    return { batchId };
  },
);
```
> If `brain.cutdown` degrades an angle, write that version doc with `status:"failed"` and continue; mark batch `partial` if any angle failed. Mirror `runOutpaintBatch`'s try/per-item error handling.
- [ ] **Step 2:** `cd functions && npm run build` → compiles. **Step 3:** commit `feat(cutdown): cutdownGenerate callable with live progress writes`.

### Task D4: `cutdownRender` callable

**Files:** Create `functions/src/cutdown/cutdownRender.ts`

- [ ] **Step 1:** Implement — extract the chosen plan's clips, upload, Shotstack render, and write an OutputDoc via the shared helper (live status), returning `{ outputId, mp4Url }`:
```typescript
import os from "node:os"; import path from "node:path";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { assertAlliStudioUser } from "../_shared/assertAlliStudioUser";
import { createOutput, updateOutput } from "../_shared/outputs"; // confirm exact signatures
import { makeCutdownDeps } from "./deps.js";
import { cutdownPaths } from "./paths.js";

const GEMINI_KEY = defineSecret("GEMINI_API_KEY");
const SHOTSTACK_KEY = defineSecret("SHOTSTACK_API_KEY");

export const cutdownRender = onCall(
  { enforceAppCheck: true, secrets: [GEMINI_KEY, SHOTSTACK_KEY], region: "us-central1", memory: "4GiB", timeoutSeconds: 540 },
  async (request) => {
    await assertAlliStudioUser(request);
    const { clientSlug, batchId, videoStoragePath, trackId, targetSec, plan } = request.data ?? {};
    if (!clientSlug || !batchId || !videoStoragePath || !trackId || !plan?.cuts?.length) throw new HttpsError("invalid-argument", "missing fields");
    const deps = makeCutdownDeps(GEMINI_KEY.value(), SHOTSTACK_KEY.value());

    const tmp = path.join(os.tmpdir(), `render-${batchId}.mp4`);
    await deps.bucket.file(videoStoragePath).download({ destination: tmp });
    const durationSec = await deps.clipExtractor.probeDurationSec(tmp);
    const { url: musicUrl } = await deps.catalog.fetch(trackId);

    const clipPaths = await deps.clipExtractor.extractClips(tmp, plan.cuts, durationSec);
    const clips = [];
    for (let i = 0; i < clipPaths.length; i++) {
      const dest = cutdownPaths.renderClip(clientSlug, batchId, plan.angle, i);
      await deps.bucket.upload(clipPaths[i], { destination: dest, metadata: { contentType: "video/mp4" } });
      clips.push({ url: await deps.sign(dest), len: plan.cuts[i].len });
    }
    const { mp4Url } = await deps.renderer.render({ clips, musicUrl, totalSec: targetSec ?? 15, width: 1080, height: 1920 });
    // Persist to the unified outputs collection (live "your generations").
    // const outputId = await createOutput(...); await updateOutput(... status complete, storageRef/mp4Url ...);
    return { mp4Url, angle: plan.angle };
  },
);
```
> Wire `createOutput`/`updateOutput` to match `_shared/outputs` exactly once its signature is read; this lands the reel in the unified view. If signature work is heavy, return `{ mp4Url }` for V1 and add the output write as a fast-follow.
- [ ] **Step 2:** `cd functions && npm run build` → compiles. **Step 3:** commit.

### Task D5: Export the callables

**Files:** Create `functions/src/cutdown/index.ts`; Modify `functions/src/index.ts`

- [ ] **Step 1:** `functions/src/cutdown/index.ts`:
```typescript
export { cutdownListTracks } from "./cutdownListTracks.js";
export { cutdownGenerate } from "./cutdownGenerate.js";
export { cutdownRender } from "./cutdownRender.js";
```
- [ ] **Step 2:** In `functions/src/index.ts` add `export * from "./cutdown";`
- [ ] **Step 3:** `cd functions && npm run build` → compiles; the 3 callables appear in the function manifest.
- [ ] **Step 4:** Set the new secret + smoke via emulator or deploy a single function:
```bash
firebase functions:secrets:set SHOTSTACK_API_KEY --project automated-creative-e10d7
firebase deploy --only functions:cutdownListTracks --project automated-creative-e10d7
```
Gate: `cutdownListTracks` returns the catalog. **Step 5:** commit.

---

## Phase E — Frontend app (`src/apps/video-cutdown/`, custom AppRoot)

### Task E1: Lift manifest preview→live + mount AppRoot

**Files:** Modify `src/apps/video-cutdown/manifest.ts`, `src/App.tsx`

- [ ] **Step 1:** Replace `src/apps/video-cutdown/manifest.ts` with a live, custom-AppRoot manifest (mirror ad-resizing's):
```typescript
import type { AppManifest } from '../types';
const manifest: AppManifest = {
  id: 'video-cutdown', basePath: 'video-cutdown', title: 'Video Cutdown',
  description: 'Turn one long video into a sharp, beat-synced 9:16 cut — 3 AI versions, pick one.',
  status: 'live', requiresBrandStandards: false, steps: [], initialStepData: () => ({}),
};
export default manifest;
```
- [ ] **Step 2:** In `src/App.tsx` import `VideoCutdownAppRoot` and replace the `video-cutdown/*` route's `<WizardShell manifest={videoCutdownManifest} />` with `<VideoCutdownAppRoot />` (keep the `<ClientProvider>` wrapper).
- [ ] **Step 3:** Create a placeholder `src/apps/video-cutdown/AppRoot.tsx` exporting `export default function VideoCutdownAppRoot(){ return <div>cutdown</div>; }` so the build passes. `npm run build` → compiles. **Step 4:** commit.

### Task E2: types + upload service + utils (TDD on utils)

**Files:** Create `src/apps/video-cutdown/types.ts`, `services/uploadVideo.ts`, `utils/fmtTime.ts` (+test), `utils/videoValidation.ts` (+test)

- [ ] **Step 1:** `types.ts` — view models matching the backend docs:
```typescript
export type Stage = 'source' | 'music' | 'brief' | 'run' | 'render';
export interface TrackView { trackId: string; title: string; bpm?: number; mood?: string; genre?: string; energy?: number; vocals?: string; durationSec: number; }
export interface CutView { srcIn: number; srcOut: number; len: number; role?: string; why?: string; score?: number; summary?: string; }
export interface VersionDoc { angle: 'narrative'|'highlights'|'punchy'; description?: string; cuts: CutView[]; thumbs: string[]; status: 'planning'|'thumbing'|'ready'|'failed'; }
export interface BatchDoc { id: string; status: 'analyzing'|'generating'|'ready'|'partial'|'failed'; theme?: string; trackId: string; trackTitle: string; bpm?: number; targetSec: number; sourceName: string; videoStoragePath: string; durationSec: number; }
```
- [ ] **Step 2:** TDD `utils/fmtTime.ts` (`fmtTime(83)==="1:23"`) and `utils/videoValidation.ts` (`validateVideoFile` — mp4/mov, size ≤ 500MB). Write tests first → fail → implement → pass. Mirror `ad-resizing/utils/uploadValidation.ts` style.
- [ ] **Step 3:** `services/uploadVideo.ts` — mirror `ad-resizing/services/uploadService.ts` but for video, using `paths.storage.app(slug,'video-cutdown',`uploads/${id}.mp4`)`:
```typescript
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../../firebase';
import { paths } from '../../../platform/firebase/paths';
import { newId } from '../../../utils/ids';
export async function uploadVideo(clientSlug: string, file: File): Promise<{ storagePath: string; url: string; name: string }> {
  const id = newId();
  const storagePath = paths.storage.app(clientSlug, 'video-cutdown', `uploads/${id}.mp4`);
  const r = ref(storage, storagePath);
  await uploadBytes(r, file);
  return { storagePath, url: await getDownloadURL(r), name: file.name };
}
```
- [ ] **Step 4:** `npm run build && npm run test:run` (or `npx vitest run src/apps/video-cutdown`) → pass. **Step 5:** commit.

### Task E3: hooks — `useTracks`, `useCutdown`, `useCutdownBatch`

**Files:** Create `hooks/useTracks.ts`, `hooks/useCutdown.ts`, `hooks/useCutdownBatch.ts`

- [ ] **Step 1:** `useCutdown.ts` — wrap the callables (mirror `useOutpaintRunner.ts`):
```typescript
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebase';
export function useCutdown() {
  const generate = httpsCallable(functions, 'cutdownGenerate', { timeout: 600000 });
  const render = httpsCallable(functions, 'cutdownRender', { timeout: 600000 });
  return { generate, render };
}
```
- [ ] **Step 2:** `useTracks.ts` — call `cutdownListTracks` once, return `{ tracks, loading, error }`.
- [ ] **Step 3:** `useCutdownBatch.ts` — **the live-progress hook** (mirror `useBatchOutputs.ts`): subscribe to the batch doc + its `versions` subcollection via `onSnapshot`; return `{ batch, versions }` reactively. Thumb storageRefs resolve via the reused `useStorageUrl` in the card component.
```typescript
import { useEffect, useState } from 'react';
import { doc, collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../../firebase';
import type { BatchDoc, VersionDoc } from '../types';
export function useCutdownBatch(clientSlug: string, batchId: string | null) {
  const [batch, setBatch] = useState<BatchDoc | null>(null);
  const [versions, setVersions] = useState<VersionDoc[]>([]);
  useEffect(() => {
    if (!batchId) return;
    const base = `clients/${clientSlug}/apps/video-cutdown/batches/${batchId}`;
    const u1 = onSnapshot(doc(db, base), (s) => setBatch(s.data() as BatchDoc | null));
    const u2 = onSnapshot(collection(db, `${base}/versions`), (snap) => setVersions(snap.docs.map((d) => d.data() as VersionDoc)));
    return () => { u1(); u2(); };
  }, [clientSlug, batchId]);
  return { batch, versions };
}
```
- [ ] **Step 4:** `npm run build` → compiles. **Step 5:** commit.

### Task E4: components (model on the prototype design + ad-resizing style)

**Files:** Create `components/{SourcePanel,MusicPicker,BriefPanel,VersionsBoard,VersionCard,RenderResult,StepIndicator}.tsx`

> Visual spec = `tools/cutdown-tracer/prototype/*.html`; component style = ad-resizing components + `@agencypmg/alli-design-system`. Each is props-driven and focused.

- [ ] **Step 1:** `StepIndicator.tsx` — adapt `ad-resizing/components/StepIndicator.tsx` to the steps Source·Music·Brief·Versions·Render.
- [ ] **Step 2:** `SourcePanel.tsx` — upload-only (Alli tab disabled "soon"); file input → `uploadVideo` → `onUploaded({storagePath,url,name})`; read duration client-side via a hidden `<video>` for display.
- [ ] **Step 3:** `MusicPicker.tsx` — render `useTracks()` rows (title · bpm · mood/genre), select → `onPick(trackId)`. Mirror prototype `02-music.html`.
- [ ] **Step 4:** `BriefPanel.tsx` — 15/30/60 toggle + optional brief textarea → `onChange({targetSec,brief})`.
- [ ] **Step 5:** `VersionCard.tsx` — one version: header (angle+tag), AI pitch, **thumbnail strip that renders `cuts.length` slots and fills `thumbs[i]` as they arrive** (resolve each storageRef via reused `useStorageUrl`; show a shimmer placeholder until present), cut list (time/role/why/score with `?? ''` guards). Selectable (radio).
- [ ] **Step 6:** `VersionsBoard.tsx` — given `versions` + `batch.status`, render the 3 `VersionCard`s; cards appear as version docs arrive and become selectable when `status==='ready'`. A header line reflects `batch.status` ("Analyzing…", "Generating Punchy…", "Pick a version").
- [ ] **Step 7:** `RenderResult.tsx` — `<video controls>` of `mp4Url` + Download + "Start new".
- [ ] **Step 8:** `npm run build` → compiles. **Step 9:** commit each or as a batch.

### Task E5: `AppRoot.tsx` orchestration (Stage machine)

**Files:** Replace `src/apps/video-cutdown/AppRoot.tsx`

- [ ] **Step 1:** Implement the orchestrator (mirror `ad-resizing/AppRoot.tsx` state-machine shape): `useParams` clientSlug; `Stage` state; holds `{ source, trackId, targetSec, brief, batchId, chosenAngle, mp4Url }`; renders the `StepIndicator` + the active panel; on Brief→continue calls `generate({...})` then sets `batchId` + Stage `run`; the `run` stage renders `VersionsBoard` driven by `useCutdownBatch` (live); on pick+continue calls `render(...)` and shows `RenderResult`.
```tsx
export default function VideoCutdownAppRoot() {
  const { clientSlug = '' } = useParams<{ clientSlug: string }>();
  const { generate, render } = useCutdown();
  const [stage, setStage] = useState<Stage>('source');
  const [source, setSource] = useState<{storagePath:string;url:string;name:string;durationSec?:number}|null>(null);
  const [trackId, setTrackId] = useState<string|null>(null);
  const [cfg, setCfg] = useState<{targetSec:number;brief:string}>({ targetSec: 15, brief: '' });
  const [batchId, setBatchId] = useState<string|null>(null);
  const [chosenAngle, setChosenAngle] = useState<string|null>(null);
  const [mp4Url, setMp4Url] = useState<string|null>(null);
  const { batch, versions } = useCutdownBatch(clientSlug, batchId);
  // source→music→brief panels set their state + advance stage;
  // brief continue: const id = newId(); await generate({ clientSlug, batchId:id, videoStoragePath: source!.storagePath, trackId, targetSec: cfg.targetSec, brief: cfg.brief, sourceName: source!.name }); setBatchId(id); setStage('run');
  // run stage: <VersionsBoard batch={batch} versions={versions} onPick={setChosenAngle} onRender={async()=>{ const r = await render({ clientSlug, batchId, videoStoragePath: source!.storagePath, trackId, targetSec: cfg.targetSec, plan: versions.find(v=>v.angle===chosenAngle) }); setMp4Url(r.data.mp4Url); setStage('render'); }} />
  // render stage: <RenderResult mp4Url={mp4Url!} .../>
  return (/* StepIndicator + switch(stage) */);
}
```
- [ ] **Step 2:** `npm run build && npm run lint` → clean.
- [ ] **Step 3:** Local dev run: `npm run dev`, open `/adlabs/<client>/video-cutdown`, walk the flow against the deployed callables (App Check debug token from `firebase.ts`). Gate: versions stream in live, thumbnails fill progressively, render plays.
- [ ] **Step 4:** commit.

---

## Phase F — Rules, catalog content, deploy, live gate

### Task F1: Firestore + Storage rules for the cutdown subtree

**Files:** Modify `firestore.rules`, `storage.rules`

- [ ] **Step 1:** Allow studio users to read/write `clients/{slug}/apps/video-cutdown/**` (batches/versions/outputs) and read `sampleMusic/**`, and read/write the video-cutdown Storage prefix — matching the existing ad-resizing rule blocks. Mirror the resize rules exactly.
- [ ] **Step 2:** `firebase deploy --only firestore:rules,storage --project automated-creative-e10d7`. **Step 3:** commit.

### Task F2: Catalog content — ingest ~20 CC0 tracks (parallel, not blocking)

- [ ] **Step 1:** Drop ~20 CC0 mp3s (Pixabay Music / FMA) into `gs://…firebasestorage.app/sampleMusic/` and add a curated entry per track to `tools/cutdown-tracer/tracks.json` (mood/genre/energy/vocals/tags from the controlled vocab).
- [ ] **Step 2:** `cd tools/cutdown-tracer && PYTHON_BIN=$(pwd)/.venv-librosa/bin/python npm run ingest-music -- --manifest tracks.json` (probes bpm/duration, writes `sampleMusic/{trackId}`). Verify `cutdownListTracks` returns them.
- [ ] **Step 3:** commit `tracks.json`.

### Task F3: Deploy functions + hosting to adlabs

- [ ] **Step 1:** Ensure secrets set: `GEMINI_API_KEY` (exists), `SHOTSTACK_API_KEY` (Task D5).
- [ ] **Step 2:** `npm run build` (frontend) then:
```bash
firebase deploy --only functions:cutdownGenerate,functions:cutdownRender,functions:cutdownListTracks,hosting:adlabs-alli --project automated-creative-e10d7
```
- [ ] **Step 3:** commit any config.

### Task F4: Live gate

- [ ] **Step 1:** Open `https://adlabs-alli.web.app/adlabs/<client>/video-cutdown`. Upload an mp4 → pick a track → 15s + brief → watch the 3 version cards + thumbnails **stream in live** → pick one → render → the 9:16 reel plays + downloads.
- [ ] **Step 2:** Confirm a doc exists at `clients/<slug>/apps/video-cutdown/batches/<id>` with `versions` + thumbs in Storage, and (if wired) an `outputs/{id}` reel.
- [ ] **Step 3:** Gate: end-to-end works at the real URL with live progress. Done.

---

## Self-Review

**Spec coverage:** in-monolith URL → E1 route + manifest. Upload-only → E4 SourcePanel. Catalog → D2 + E3 useTracks. Length/brief → E4 BriefPanel. 3 versions streaming live → D3 progressive writes + E3 useCutdownBatch + E4/E6 VersionsBoard. Storyboard thumbs filling progressively → A (engine) + D3 per-cut upload + VersionCard. Pick + render → D4 + E5. Tagging schema + tracks.json → B + F2. Brain lifted to functions → C. Deploy to adlabs → F. M1/stitch excluded → stated, no tasks touch it. ✓

**Placeholder scan:** new logic units have full code; UI components specced with key code + visual/style references (prototype + ad-resizing) — legitimate per the codebase's own "copy the pattern" registry docs, not omitted logic. The two spots flagged "confirm signature against existing file" (`assertAlliStudioUser`, `_shared/outputs`) require reading one in-repo file in-task — not invented APIs. ✓

**Type consistency:** `StoryboardMaker.frames(path,cuts,durationSec)` identical across seam/Ffmpeg/Fake/deps/callable. `VersionDoc`/`BatchDoc`/`TrackView` shared between the callable writes (D3) and the hook reads (E3). `cutdownPaths.*` used by both callables. `makeCutdownDeps` return shape consumed by D3/D4. ✓

**Known v0 limits (intentional):** generate is one ≤540s callable writing progress (matches `runOutpaintBatch`); render is synchronous within the callable; tag-based browse filtering deferred (tags rendered, not filtered); the tracer engine copy in `functions/src/cutdown/engine/` may drift from `tools/cutdown-tracer/` (precedent: outpaint) — tracer stays the reference/test bed.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-08-cutdown-v1-web-ship.md`.

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks. Natural slices: A+B (engine), C (lift), D (callables), E (frontend), F (deploy).

**2. Inline Execution** — work tasks in this session with checkpoints.

Which approach?
