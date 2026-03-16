# Mask Editor — Agent Handoff

> Read this file first. It tells you exactly what to load and what to do.

## Context Loading Order (minimize token usage)

### Step 1: Read these files (in order)

1. **This file** — you're here
2. **`CLAUDE.md`** (project root) — build commands, architecture, source layout
3. **`docs/edit-image-changelog.md`** — scroll to "Mask Editor Bugfix Rework — In Progress (2026-03-13)" section only (near bottom)
4. **`src/components/edit-image/steps/MaskEditorModal.tsx`** — the single file being modified

### Step 2: Read these only if needed

- `docs/superpowers/plans/2026-03-13-mask-editor-bugfix-rework.md` — full 8-task plan (Tasks 1–5 done, Task 6 in progress)
- `docs/superpowers/specs/2026-03-13-mask-editor-bugfix-rework-design.md` — spec with architecture rationale and fallback chains
- `docs/referances/bug_2.png` — screenshot of the current bug (image offset, now fixed)
- `docs/referances/bug_2_referance.png` — reference showing what the full image should look like

### Step 3: Do NOT read these (context waste)

- `docs/superpowers/specs/2026-03-11-*` — old specs, already executed
- `docs/superpowers/plans/2026-03-11-*` — old plans, already executed
- `docs/proxy-implementation-writeup.md` — proxy is deployed and working
- `docs/superpowers/specs/2026-03-12-mask-editor-refinement-design.md` — superseded by the 2026-03-13 bugfix rework spec

## Skills to Load

```
/session-memory
```

No other skills needed. This is a single-file bugfix — no planning, TDD, or architecture skills required.

## Current State

- **Branch:** `new_layers`
- **Build status:** `npm run build` passes (MaskEditorModal clean; pre-existing errors in NewBackgroundStep.tsx and UseCaseWizardPage.tsx are unrelated)
- **Dev server:** `npm run dev` — navigate to edit-image use case → select image → Extract Background → click Edit (pencil icon)

## What Was Done

Tasks 1–5 of the bugfix plan are complete:
- Removed all Fabric zoom/pan code (~50 lines)
- Canvas created at natural image dimensions, CSS `transform: scale(fitScale)` handles visual fitting
- `displayDims` state `{ w, h, fitScale, displayW, displayH }` drives CSS wrapper
- All refs nulled on cleanup (fixes stale stroke bug)
- **Fabric.js 7 origin fix:** Added explicit `{ left: 0, top: 0, originX: 'left', originY: 'top' }` on background image and tint overlay (Fabric 7 changed defaults from 'left'/'top' to 'center'/'center')

## What Needs To Be Done

### Active bug: Red tint overlay misalignment

The red tint (which marks removed/background areas) does not align with the image content. User reported "when I click in modal" — needs clarification whether:
- (a) Tint is wrong on initial load, OR
- (b) Tint shifts/breaks after painting a brush stroke

**Investigation checklist:**
1. Open modal, check if tint aligns BEFORE any brush interaction
2. If tint is correct on load but breaks after painting → pointer coordinate issue (CSS transform + Fabric `getScenePoint`)
3. If tint is wrong on load → check `buildMaskFromAlpha` dimensions, check if extracted image URL returns correct image
4. Add debug logs: tint canvas dims, extracted image natural dims, compare to original image dims
5. Check `mirrorPathToMask` — strokes may land at wrong coordinates due to CSS scaling

**Key risk from spec:** CSS `transform: scale()` affects how Fabric maps pointer events. Fallback chain (from spec):
1. Replace `getScenePoint` with `getViewportPoint` in `setupBrushCursor`
2. Replace with manual `(e.offsetX / fitScale, e.offsetY / fitScale)`
3. Replace with `canvas.getPointer(e.e, true)`

### After fixing tint

- Complete Task 6 manual testing (see plan for full checklist)
- Complete Task 7 (full flow testing: apply refinement → re-edit → preview → save)
- Task 8: commit

## Key Architecture Facts

- Fabric.js 7.2 — **always set `originX: 'left', originY: 'top'` on positioned images**
- Dual canvas: visible Fabric display canvas + hidden offscreen mask canvas (no color blending)
- Stroke mirroring: `path:created` event tags strokes with `data.maskMode`, mirrors to mask canvas via `mirrorPathToMask`
- CSS scaling: outer div at `displayW x displayH`, inner div with `transform: scale(fitScale)` and `transformOrigin: top left`
- Images loaded via `proxyUrl()` → Vercel CORS proxy at `edit-image-api.vercel.app`
- PNG end-to-end — no JPEG anywhere in the pipeline
