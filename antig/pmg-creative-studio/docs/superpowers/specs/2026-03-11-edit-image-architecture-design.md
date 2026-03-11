# Edit Image Architecture — Design Spec

**Date:** 2026-03-11
**Status:** Approved

## Overview

Replace the local FastAPI image editing backend with a browser-first architecture using Replicate for foreground extraction, Fabric.js for manual mask refinement, CSS layering for instant preview, and Canvas API for final export. A lightweight Vercel serverless function proxies Replicate API calls.

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Extraction | Vercel serverless → Replicate | Background removal, returns transparent PNG |
| Refinement | Fabric.js (browser) | Manual mask painting via Edit button on Canvas step |
| Preview | CSS layering (browser) | Instant foreground-over-background visual preview |
| Final export | Canvas API (browser) | Composite bitmap for download/storage |
| Storage | Firebase Storage (existing project) | Persist final output |
| Fallback (future) | OpenCV.js WASM (browser) | Offline/fast-path extraction — noted, not a priority |

## Wizard Flow

1. **Select Image** — unchanged
2. **Edit Type** — unchanged (video placeholder + tool cards)
3. **Canvas** — Replicate extraction + optional Fabric.js refinement
4. **New Background** — brand colors from Alli, Alli creative browser, upload, custom color picker
5. **Preview** — CSS layering (foreground PNG over chosen background), instant, no API call
6. **Save** — Canvas API composites final bitmap, download + optional Firebase Storage upload

## Service Contract

### `imageEditService.ts` (refactored)

```typescript
// Core methods
extractForeground(imageUrl: string): Promise<{ url: string; maskUrl?: string }>
saveEditedImage(compositeBlob: Blob, metadata: { clientSlug: string; imageName: string }): Promise<{ url: string }>

// Removed (dead code from old FastAPI integration)
getBackgroundCatalog()
detectText()
renderVariations()
```

`extractForeground` calls the Vercel serverless function, which proxies to Replicate. The frontend never talks to Replicate directly.

`saveEditedImage` uploads the Canvas API-exported blob to Firebase Storage and returns the download URL.

Preview compositing is handled entirely in the React component via CSS — no service method needed.

## Vercel Serverless Function

### Setup

```
edit-image-api/
├── api/
│   └── extract-foreground.js    # POST { imageUrl } → { url }
├── vercel.json
└── package.json
```

### `api/extract-foreground.js`

- Receives `{ imageUrl }` from the frontend
- Calls Replicate `lucataco/remove-bg` (or equivalent model)
- Returns `{ url }` pointing to the extracted transparent PNG
- CORS configured to allow the Alli Studio origin

### Environment

- `REPLICATE_API_TOKEN` — stored as a Vercel secret
- Frontend env var: `VITE_EXTRACT_API_URL` — points to the Vercel deployment URL

## Canvas Step — Extraction + Refinement Flow

### Auto extraction (default)

1. User clicks "Extract Background"
2. Frontend sends `imageUrl` to Vercel function
3. Vercel calls Replicate remove-bg
4. Returns transparent PNG URL
5. Canvas step shows extracted foreground on transparency grid
6. Continue button enabled

### Manual refinement (optional, via Edit button)

1. User clicks "Edit" (top-right of canvas, enabled after extraction)
2. Fabric.js canvas loads with:
   - Original image as bottom layer
   - Mask overlay showing what was extracted
   - Paintbrush tool with two modes: "add to selection" / "remove from selection"
3. User paints refinements to the mask
4. On confirm: updated mask applied, new foreground generated
5. Canvas step updates with refined extraction
6. User stays on step 3 throughout (no extra wizard step)

## Preview Step — CSS Layering

The Preview step composites visually using CSS, not pixel manipulation:

- Container element with `background-color` (for solid) or `background-image` (for image backgrounds)
- Foreground transparent PNG layered on top via `<img>` with absolute positioning
- Zero API calls, instant rendering
- Side-by-side with original image

## Save Step — Final Export

1. Canvas API draws chosen background onto a `<canvas>` element
2. Draws the foreground PNG on top
3. Exports as blob (`canvas.toBlob()`)
4. Blob available for direct download
5. Optionally uploads to Firebase Storage for persistence
6. "Add to Asset House" remains grayed out (future)

## Dependencies to Add

- `fabric` — npm package for Fabric.js (Canvas step refinement)
- No other new dependencies for the main project
- Vercel project: `replicate` npm package

## Future (Not Priority)

- **OpenCV.js** — browser-side WASM fallback for offline/fast extraction (GrabCut). ~8MB binary. Only pursue if offline use or reduced API costs become a priority.
- **MediaPipe InteractiveSegmenter** — alternative browser-side option for promptable segmentation.

## References

- Replicate remove-bg: https://replicate.com/lucataco/remove-bg
- Fabric.js: http://fabricjs.com/
- Replicate JS client: https://github.com/replicate/replicate-javascript
- Architecture sketch: `docs/superpowers/specs/2026-03-11-edit-image-tooling-architecture.md`
