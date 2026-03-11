# Edit Image — Change Background: Development Log

## Overview

Implementation of the Change Background feature for the edit-image use case wizard. This document tracks decisions, issues encountered, and fixes applied during development.

## Architecture

Extracted the edit-image wizard into dedicated components under `src/components/edit-image/` to avoid further bloating `UseCaseWizardPage.tsx` (already 4200+ lines).

### File Structure

```
src/components/edit-image/
├── types.ts                        # Shared types (EditImageStepData, EditImageStepProps)
├── EditImageWizard.tsx             # Step orchestrator (switch on currentStepId)
└── steps/
    ├── SelectImageStep.tsx         # Alli asset picker + local upload
    ├── ChooseEditTypeStep.tsx      # 3 cards + preview video placeholder
    ├── CanvasStep.tsx              # Foreground extraction + edit mask button
    ├── NewBackgroundStep.tsx       # Brand colors, Alli creative browser, upload, custom picker
    ├── PreviewStep.tsx             # Single before/after comparison
    └── ApproveDownloadStep.tsx     # Download + grayed-out Asset House
```

### Integration Points

- **UseCaseWizardPage.tsx** — Updated WIZARD_STEPS, added `<EditImageWizard />` block, added step validation in `isNextDisabled`, added edit-image step data carry-forward and completion handling.
- **Existing services** — `imageEditService.ts` (provider-agnostic contract), `alliService.ts`, `creativeService.ts`.

### Architecture Direction

See `docs/superpowers/specs/2026-03-11-edit-image-tooling-architecture.md` for the full architecture sketch. Summary:
- **Retiring** the local FastAPI service (`local-services/image-edit-api/`)
- **Moving to** React + Firebase Functions + Replicate for foreground extraction
- **Frontend** stays provider-agnostic via `imageEditService.ts` contract
- **Firebase Functions** handle Replicate API calls, prediction polling, and result storage
- **Browser-first path** (MediaPipe/Transformers.js) reserved for future interactive masking only

## Wizard Steps

| Step | ID | Component | Validation |
|------|----|-----------|------------|
| 1 | `select` | SelectImageStep | `imageUrl` required |
| 2 | `edit-type` | ChooseEditTypeStep | `editType` required |
| 3 | `canvas` | CanvasStep | `extractedImageUrl` required |
| 4 | `new-background` | NewBackgroundStep | `selectedBackground` required |
| 5 | `preview` | PreviewStep | `previewReady` required |
| 6 | `approve` | ApproveDownloadStep | None (final step) |

## Issues & Fixes

### 1. Firestore rejects `undefined` values

**Problem:** `onStepDataChange` sets fields like `imageFile: undefined` and `assetId: undefined`. Firestore's `updateDoc()` throws `Function updateDoc() called with invalid data. Unsupported field value: undefined`.

**Fix:** Added `sanitizeForFirestore()` — a recursive function that strips `undefined` values and `File` objects before saving. Scoped to `edit-image` only to avoid affecting other workflows.

**Location:** `UseCaseWizardPage.tsx` (module-level function + conditional usage in `handleNext`)

### 2. Type imports from wrong module

**Problem:** Plan referenced `BackgroundCatalogItem` and `RenderVariation` from `../../types` but they're exported from `../../services/imageEditService`.

**Fix:** Updated imports in `types.ts`, `BackgroundConfigStep.tsx`, and `PreviewStep.tsx`.

### 3. `renderVariations` response shape

**Problem:** `imageEditService.renderVariations()` returns `{ variations: RenderVariation[] }`, not `RenderVariation[]` directly. Plan assumed direct array.

**Fix:** Extract `.variations` from the response in `PreviewStep.tsx`.

### 4. Variable name collision in PreviewStep

**Problem:** Two `const response` declarations in the same scope (one for `fetch()`, one for `renderVariations()`).

**Fix:** Renamed to `fetchResp` and `renderResp`.

### 5. Backend not running blocks UI review

**Problem:** `BackgroundConfigStep` and `PreviewStep` call the local FastAPI server (`127.0.0.1:8001`). When it's not running, the UI shows errors and blocks click-through.

**Fix:**
- `BackgroundConfigStep`: Falls back to `FALLBACK_CATALOG` (6 hardcoded solid colors) when API fetch fails.
- `PreviewStep`: Falls back to placeholder variations using the original image URL when rendering fails.
- `ApproveDownloadStep`: URL rendering handles both relative API paths and absolute URLs.

### 6. Step data not carried forward

**Problem:** Generic `handleNext` resets `stepData` to the saved data for the next step. Edit-image uses a flat object across all steps, so `imageUrl`, `editType`, etc. were lost on step transitions.

**Fix:** Added `edit-image` branch in `handleNext` that merges current data with next step's saved data: `setStepData({ ...currentStepData, ...nextStepSavedData })`.

### 7. Unscoped video-cutdown validation blocking edit-image

**Problem:** `isNextDisabled` had unscoped checks for step IDs `upload`, `configure`, and `ai-reccos` — these were meant for video-cutdown but fired for any use case with matching step IDs. Edit-image's `configure` step was permanently disabled because `!stepData.lengths` was always true.

**Fix:** Scoped all three checks to `useCaseId === 'video-cutdown'`.

**Location:** `UseCaseWizardPage.tsx` in the `isNextDisabled` computation.

## UI Review Checkpoint

**Status:** All 5 steps render and are navigable end-to-end. User is reviewing each step's UI and will provide adjustment requests.

**Pickup point:** User has clicked through all steps successfully. Awaiting UI feedback/adjustments.

---

## UI Redesign — 2026-03-11

### Step name changes (prior to this session)
| Step ID | Before | After |
|---------|--------|-------|
| `edit-type` | Choose Edit Type | Edit Type |
| `configure` | Configure Edit | Canvas |
| `approve` | Approve & Download | Save |

### Wizard expanded from 5 steps to 6

Old: Select Image → Edit Type → Configure → Preview → Save
New: Select Image → Edit Type → Canvas → New Background → Preview → Save

### Changes by step

**Edit Type (ChooseEditTypeStep):**
- Added preview video placeholder above tool cards
- Placeholder text updates based on selected tool

**Canvas (CanvasStep — new):**
- New step for foreground extraction
- Shows selected image on canvas area
- "Extract Background" button triggers extraction (falls back to original image when API offline)
- Grayed "Edit" button (top-right) for future manual mask painting
- Continue disabled until extraction complete

**New Background (NewBackgroundStep — new, replaces BackgroundConfigStep):**
- Brand colors loaded from Alli Asset Library (primaryColor + variables + assets of type 'color')
- "+" button opens native color picker for custom colors
- "Browse Alli Creative" card to search/select background images
- "Upload Image" card for local file upload
- Selected background image preview bar
- No variation count picker (single output only)

**Preview (PreviewStep — simplified):**
- Removed variation grid and "Re-render" button
- Simple side-by-side: Original vs Edited (single result)
- Uses extractedImageUrl instead of imageUrl for compositing

**BackgroundConfigStep — deleted**
- Replaced by CanvasStep + NewBackgroundStep

### Data model changes (types.ts)
- Added: `extractedImageUrl`, `extractionMethod`, `customColor`
- Changed: `selectedBackground` to discriminated union (`color` | `image`)
- Removed: `variationCount`, `variations` array (single output only)

### Service changes (imageEditService.ts)
- Added: `extractForeground()` method stub for foreground extraction API

### Pickup point
All 6 steps are wired up. Ready for UI review and adjustments.

---

## Architecture Integration — 2026-03-11

### Backend migration
- Retired local FastAPI service (`local-services/image-edit-api/`) dependency
- `imageEditService.ts` rewritten: `extractForeground(imageUrl)` calls Vercel/Replicate, `saveEditedImage(blob, meta)` uploads to Firebase Storage
- Old methods removed: `getBackgroundCatalog`, `detectText`, `renderVariations`
- Environment variable changed: `VITE_IMAGE_EDIT_API_URL` → `VITE_EXTRACT_API_URL`

### Canvas step
- `extractForeground` now sends image URL (not File upload) to Vercel serverless function
- Fabric.js mask editor modal added (Edit button opens it)
- Brush tools: "Keep" (green) and "Erase" (red) with adjustable size
- Mask application is visual-only for now; full pipeline is a follow-up

### Preview step
- Replaced server-side rendering with CSS layering (instant, zero API calls)
- Foreground PNG transparency shows chosen background via CSS `background-color` or `background-image`

### Save step
- Canvas API composites foreground + background into a single PNG blob
- Direct browser download (no server round-trip for the file)
- Optional Firebase Storage upload for persistence

### New files
- `src/components/edit-image/steps/MaskEditorModal.tsx` — Fabric.js mask refinement UI
- `src/components/edit-image/utils/compositeImage.ts` — Canvas API compositing helper

### Dependencies
- Added: `fabric` (Fabric.js for mask editing)
- Removed dependency on: `VITE_IMAGE_EDIT_API_URL`, local FastAPI server

---

## Pending

- [ ] "Add to Asset House" button (currently grayed out with "Coming Soon" tooltip)
- [ ] Change Text edit type
- [ ] Change Colors edit type
- [ ] Full mask-to-foreground pipeline (applying paint strokes to alpha channel)
- [ ] Manual mask editing actual refinement (currently visual-only)
