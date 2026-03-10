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
    ├── ChooseEditTypeStep.tsx      # 3 cards: Background (active), Text/Colors (Coming Soon)
    ├── BackgroundConfigStep.tsx    # Solid/image background catalog, variation count
    ├── PreviewStep.tsx             # Renders variations via FastAPI, selection grid
    └── ApproveDownloadStep.tsx     # Before/after, download, grayed-out Asset House
```

### Integration Points

- **UseCaseWizardPage.tsx** — Updated WIZARD_STEPS, added `<EditImageWizard />` block, added step validation in `isNextDisabled`, added edit-image step data carry-forward and completion handling.
- **Existing services** — `imageEditService.ts`, `alliService.ts`, `creativeService.ts` consumed as-is. No backend changes.

## Wizard Steps

| Step | ID | Component | Validation |
|------|----|-----------|------------|
| 1 | `select` | SelectImageStep | `imageUrl` required |
| 2 | `edit-type` | ChooseEditTypeStep | `editType` required |
| 3 | `configure` | BackgroundConfigStep | `selectedBackground` required |
| 4 | `preview` | PreviewStep | `selectedVariation` required |
| 5 | `approve` | ApproveDownloadStep | None (final step) |

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

## Pending

- [ ] "Add to Asset House" button (currently grayed out with "Coming Soon" tooltip)
- [ ] Change Text edit type
- [ ] Change Colors edit type
- [ ] Real GrabCut rendering when backend is running (currently falls back to placeholders)
