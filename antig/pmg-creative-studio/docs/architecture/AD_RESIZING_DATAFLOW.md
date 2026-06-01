# ad-resizing — Dataflow Model

> Companion to [`SYSTEM_GUIDE.md`](./SYSTEM_GUIDE.md). Where the System Guide maps the
> *whole* system, this doc traces **one app, end to end**: how `src/apps/ad-resizing/`
> connects to the `functions/src/resize/` Cloud Function, and how data moves through a
> single resize run.
>
> Read this before the agent-tool pilot — the "tool" is the Cloud Function core, and the
> async result path described here is the one thing the pilot has to wrap.

---

## The model in one sentence

**The app triggers a batch request and (separately) listens to the database; the Cloud
Function computes and writes to the database; the app reads those writes and surfaces them
to the user.**

The two halves of that sentence are **two independent channels running in opposite
directions** — and the key surprise is that the resized images **do not come back through
the function's return value.** They come back through Firestore.

```
   src/apps/ad-resizing/  (CLIENT)                  functions/src/resize/  (SERVER)
   ──────────────────────────────                   ──────────────────────────────

   AppRoot.tsx                                       runOutpaintBatch.ts
     handleRun()  L372-415                             onCall wrapper        L586
       │  mints batchId + outputIds                      │ assertAlliStudioUser (auth)  L602
       │  CLIENT-SIDE, before calling                    │ validateInput               L603
       ▼                                                 │ + createdBy from auth        L606
     useOutpaintRunner.ts                                ▼
       runBatch()  L57 ──── CHANNEL 1: REQUEST ────▶  runOutpaintBatchCore()  L469
       httpsCallable('runOutpaintBatch') L37            │  the 9-step pipeline
       ◀── returns only {status, counts} ──────────     │  (Gemini → OpenAI → sharp)
                                                         │
       │ (meanwhile, in parallel)                        │ writes results out-of-band
       ▼                                                 ▼
     useBatchOutputs.ts                              services/outputs.ts
       onSnapshot()  L100,L111  ◀── CHANNEL 2: ────  createOutput / updateOutput
       subscribes to Firestore      RESULTS
                                  (realtime stream)        │
                                                           ▼
                              ┌─────────────────────────────────────┐
                              │  Firestore                           │
                              │  clients/{slug}/apps/ad-resizing/    │
                              │    batches/{batchId}   ← status      │
                              │    outputs/{outputId}  ← the results │
                              └─────────────────────────────────────┘
                                          ▲
                              Storage: the actual PNG bytes,
                              referenced by `storageRef` on each output doc
```

---

## How the two sides are wired

`src/apps/ad-resizing/` and `functions/src/resize/` **share no code** — there is no import
across that boundary. They are bound together by a single string: the callable name
**`'runOutpaintBatch'`**.

- **Client handle:** `src/apps/ad-resizing/hooks/useOutpaintRunner.ts:37`
  `httpsCallable<unknown, RunBatchResult>(functions, 'runOutpaintBatch', { timeout: 600000 })`
- **Server endpoint:** `functions/src/resize/runOutpaintBatch.ts:586`
  `export const runOutpaintBatch = onCall({...}, handler)`
- **Pure core (the "tool"):** `functions/src/resize/runOutpaintBatch.ts:469`
  `runOutpaintBatchCore(input)` — *"exported for tests that bypass the onCall wrapper."*

### Two channels

| | Channel 1 — Request | Channel 2 — Results |
|---|---|---|
| Direction | client → server | server → client |
| Transport | Firebase callable (`httpsCallable`) | Firestore realtime (`onSnapshot`) |
| Carries | the batch config (creative, dimensions) | the output docs (status + `storageRef`) |
| Client code | `useOutpaintRunner.ts` | `useBatchOutputs.ts` |
| Returns | only a **summary** `{batchId, status, completedCount, errorCount}` | the **actual** per-output results, streamed live |

**Why client-minted IDs matter.** `handleRun` generates `batchId` and `outputIds`
**client-side** (`AppRoot.tsx:372-373`) *before* calling the server, then immediately points
the subscription at that `batchId` (`setActiveJobId`, L403). So Channel 2 is live *before*
the server has written anything — the client watches the docs blink from `pending` →
`complete` as the function fills them in.

---

## One call, end to end

A user resizes one creative into N dimensions (say 6).

### Phase A — Client assembles and fires (Channel 1)

| Step | Where | What happens |
|---|---|---|
| 1 | `AppRoot.tsx:372` | `targetBatchId = newId()` — fresh batch id minted client-side (reuses existing id for "add more sizes") |
| 2 | `AppRoot.tsx:373` | `outputIds = dims.map(d => newOutputId(d.id))` — one id per dimension, same order |
| 3 | `AppRoot.tsx:403` | `setActiveJobId(targetBatchId)` → `useBatchOutputs` (L98) starts subscribing **now** |
| 4 | `AppRoot.tsx:415` | `runner.runBatch({ batchId, creative, dimensions, outputIds })` |
| 5 | `useOutpaintRunner.ts:43,59` | `toOutputRequests()` zips dimensions+outputIds; resolves `originalUrl`; invokes the callable |

Shape transform: `Creative` + `Dimension[]` → `RunBatchInput` → callable payload (`RunOutpaintBatchInput`).

### Phase B — Server runs the pipeline (`runOutpaintBatchCore`)

| Step | Where | What happens |
|---|---|---|
| 0 | `runOutpaintBatch.ts:602-607` | onCall shell: `assertAlliStudioUser` (PMG allowlist), `validateInput`, derive `createdBy` from auth token → `RunOutpaintBatchExecution` |
| 1 | L473 | `emitEvent("batch_received")` |
| 2 | L483 | **Idempotency probe** — replaying a single already-complete output (no retry-prompt) → short-circuit `noop` |
| 3 | L493 | **Stage source** — `stageSourceIfMissing` fetches `originalUrl` behind an **SSRF guard**, stores it; `sharp` probes width/height/mime. `emitEvent("source_staged")` |
| 4 | L512 | `upsertBatchProcessing` → writes `batches/{batchId}` `status:"processing"`, `totalVariations`, `sourceCreative{}` |
| 5 | L513 | `seedPendingOutputs` → writes N output docs `status:"pending"`. **← Channel 2 lights up: N pending tiles appear** |
| 6 | L522 | **Phase 1 (hoisted, runs ONCE)** — `runPhase1Once` → **Gemini 2.5 Pro** structural analysis → `P1Output` (subject bbox, copy regions, style cues, extension directive). `emitEvent("p1_done")` |
| 7 | L549-567 | **Phase 2 fan-out under `p-limit(4)`** — `runOne` per output (see below) |
| 8 | L570 | `finaliseBatch` → batch doc `status: completed \| partial \| failed` + counts. `emitEvent("batch_finalised")` |
| 9 | L578 | return summary → back across Channel 1 |

#### Inside each `runOne` (per output, 4 concurrent)

| Step | Where | What happens |
|---|---|---|
| a | `runOutpaintBatch.ts:337` | `runPhase2ForTarget` → **OpenAI gpt-image-2** outpaints onto a padded canvas using the shared `P1Output` + this target's geometry |
| b | `pipeline.ts:84` | `resizeToTarget` (`sharp`) cover-fits the raw output to **exact** target W×H |
| c | L346 | `uploadOutput` → writes final PNG to **Storage**, returns `storageRef` |
| d | L353-375 | best-effort upload of intermediates (canvas/mask/raw) — never fails the output |
| e | L379 | `updateOutput` → output doc `status:"complete"`, `storageRef`, model/quality. **← Channel 2: tile flips pending → complete, image renders** |
| f | L399 / L413 | `emitEvent("output_complete")` — or on throw, `classifyError` → `updateOutput status:"error"` + `output_error` |

### Phase C — Client receives results (Channel 2, throughout)

| Step | Where | What happens |
|---|---|---|
| 1 | `useBatchOutputs.ts:111` | `onSnapshot` on `outputs where batchId == activeJobId` fires on **every** server write — pending appears, each flips to complete/error live |
| 2 | `useBatchOutputs.ts:55,124` | each `OutputDoc` → `toGeneratedOutput()` → `GeneratedOutput` view model (re-attaches full `Dimension` from `channels.ts`) |
| 3 | `AppRoot.tsx:415` | the awaited `runBatch` summary returns *after* the pipeline finishes — used for final state/toast, **not** for the images (those already streamed in) |
| 4 | `AppRoot.tsx:489` | Download — `storageRef` → `getDownloadURL` (Storage SDK, called from the component) |

---

## Data shapes as they flow

```
Creative + Dimension[]              (client domain — types.ts)
   └─(toOutputRequests)→ RunBatchInput                     (useOutpaintRunner.ts:16)
        └─(callable)→ RunOutpaintBatchInput                (runOutpaintBatch.ts:95)
             └─(+createdBy)→ RunOutpaintBatchExecution     (runOutpaintBatch.ts:113)
                  ├─ staged source Buffer                  (stageSourceIfMissing)
                  ├─ P1Output                              (Gemini, schema.ts)
                  ├─ Phase2Result.resultBuffer             (OpenAI + sharp, pipeline.ts:21)
                  └─→ storageRef + OutputDoc               (Storage + services/outputs.ts)
                       └─(onSnapshot)→ OutputDoc           (useBatchOutputs.ts:18)
                            └─(toGeneratedOutput)→ GeneratedOutput  (rendered as a tile)
```

---

## Coupling notes (cleanup targets — see issue #69)

These are where the boundary leaks. None block the dataflow; all matter for the
domain-decoupling / agent-tool work.

1. **Duplicated request contract.** Frontend `RunBatchInput`/`OutpaintOutputRequest`
   (`useOutpaintRunner.ts:16,6`) and backend `RunOutpaintBatchInput`/`OutputRequest`
   (`runOutpaintBatch.ts:95`) are hand-aligned, not shared. → a shared types package.
2. **Duplicated schema paths.** Backend has its own `batchDocPath`/`outputDocPath`
   (`runOutpaintBatch.ts:220-225`) duplicating the frontend's `paths.ts`. → share `paths`.
3. **Shadow `OutputDoc` type.** `useBatchOutputs.ts:18` re-declares the output shape that
   already lives canonically in `types/outputs.ts`. → import the canonical type.
4. **Raw Firestore in a hook.** `useBatchOutputs.ts:100,111` opens `onSnapshot` directly.
   → extract to a service returning a typed stream/poll (this is the agent tool's
   `checkResizeStatus`).
5. **Storage SDK from the component.** `AppRoot.tsx:489` calls `getDownloadURL` directly.
   → route through a `storageService` (the agent tool's `getResizeDownloadUrl`).

---

## Implications for the agent-tool pilot

- **The tool already exists** as `runOutpaintBatchCore` (`runOutpaintBatch.ts:469`) — all
  of Phase B, framework-free, typed in → typed out. An agent calls it as the tests do.
- **The async result path is the only thing to wrap.** Because results return via Channel 2
  (Firestore), not the callable return value, an agent needs:
  - `checkResizeStatus(clientSlug, batchId)` — poll the same `outputs where batchId==`
    query `useBatchOutputs.ts:110` already encodes (replaces the `onSnapshot`).
  - `getResizeDownloadUrl(storageRef)` — wrap `AppRoot.tsx:489`'s `getDownloadURL`.
- **Client-minted IDs help the agent.** It fires the core with a `batchId` it chose, then
  polls `checkResizeStatus(batchId)` on that same id — no need to scrape the return value
  to learn what to watch.
- Extracting tools #2 and #3 is the *same work* as coupling fixes #4 and #5 above — the
  pilot and the first slice of #69 are one effort, done outside-in.

---

*Traced from `runOutpaintBatch.ts`, `pipeline.ts`, `useOutpaintRunner.ts`,
`useBatchOutputs.ts`, and `AppRoot.tsx` on 2026-06-01.*
