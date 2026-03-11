# Edit Image UI Redesign — Design Spec

**Date:** 2026-03-11
**Status:** Approved

## Overview

Redesign the edit-image wizard to support a more granular workflow: extract foreground first, then choose a new background, then preview a single result. Adds a new "Canvas" step and a "New Background" step, simplifies Preview to show one result instead of a variation grid.

## Updated Wizard Steps

| # | ID | Name | Component | Validation |
|---|-----|------|-----------|------------|
| 1 | `select` | Select Image | SelectImageStep | `imageUrl` required |
| 2 | `edit-type` | Edit Type | ChooseEditTypeStep (updated) | `editType` required |
| 3 | `canvas` | Canvas | CanvasStep (new) | `extractedImageUrl` required |
| 4 | `new-background` | New Background | NewBackgroundStep (new) | `selectedBackground` required |
| 5 | `preview` | Preview | PreviewStep (updated) | `selectedVariation` required |
| 6 | `approve` | Save | ApproveDownloadStep | None |

## Step Changes

### Step 2: Edit Type (ChooseEditTypeStep — updated)

- Add a **preview video placeholder** section above the tool cards
- The video placeholder updates based on which tool card is hovered/selected (for now, static placeholder for all three)
- Tool cards remain: Background (enabled), Text (Coming Soon), Colors (Coming Soon)

### Step 3: Canvas (CanvasStep — new)

- Shows the selected image on a canvas area
- Below the canvas: a blue **"Extract Background"** button
- Top-right of the canvas: a grayed-out **"Edit"** button (for manual mask painting — future feature)
- On click "Extract Background": calls the API (or falls back to a placeholder showing the original image) and stores the extracted foreground URL
- Continue is disabled until extraction is complete
- The Edit button becomes active after extraction (but manual painting is not implemented yet — just the button state)

### Step 4: New Background (NewBackgroundStep — new, replaces old BackgroundConfigStep)

Three sections:

1. **Brand Colors** — loaded from Alli asset library (`assetHouse.brandColors` or similar). Rendered as color swatches. Includes a **"+"** button that opens a native color picker for custom colors.
2. **Background Image** — two cards side by side:
   - **Browse Alli Creative** — opens the Alli asset picker to search existing images
   - **Upload Image** — local file upload (JPG, PNG, WebP)
3. **Selected image preview** bar — shown when a background image is selected

No variation count picker. Single output only.

### Step 5: Preview (PreviewStep — updated)

- Remove the variation grid entirely
- Remove the "Re-render" button
- Show a simple side-by-side: **Original** vs. **Edited** (single result)
- The edited image is composited from the extracted foreground + chosen background
- For now, falls back to placeholder (original image) when backend is not running

### Step 6: Save (ApproveDownloadStep — unchanged)

No changes.

## Data Model Changes (EditImageStepData)

```typescript
// New fields for Canvas step
extractedImageUrl?: string;   // URL of extracted foreground
extractionMethod?: 'auto' | 'manual';

// Remove
variationCount?: number;      // REMOVED — no longer needed

// Simplify
variations?: RenderVariation[];        // Still used but will contain 0-1 items
selectedVariation?: RenderVariation;   // The single result
```

## File Changes

| File | Action |
|------|--------|
| `UseCaseWizardPage.tsx` | Update WIZARD_STEPS to 6 steps, update `isNextDisabled` for new step IDs |
| `EditImageWizard.tsx` | Add cases for `canvas` and `new-background` |
| `types.ts` | Add `extractedImageUrl`, `extractionMethod`; remove `variationCount` |
| `steps/ChooseEditTypeStep.tsx` | Add preview video placeholder above tool cards |
| `steps/CanvasStep.tsx` | **New file** — canvas + extract button + edit button |
| `steps/NewBackgroundStep.tsx` | **New file** — brand colors from Alli, image picker, upload, custom color |
| `steps/PreviewStep.tsx` | Simplify to single original-vs-edited comparison |
| `steps/BackgroundConfigStep.tsx` | **Delete** — replaced by NewBackgroundStep |

## Styling

All new components follow existing patterns:
- `text-xs font-black uppercase tracking-[0.2em]` for headings
- `rounded-2xl` cards, `border-2` for selections
- `blue-600` as primary accent, `gray-100/200` for borders
- `cn()` utility for conditional classes
