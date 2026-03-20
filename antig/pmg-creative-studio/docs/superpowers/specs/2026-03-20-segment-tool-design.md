# Segment Tool Design Spec

**Date:** 2026-03-20
**Branch:** `new_layers`
**Status:** Draft

## Summary

Replace the Tesseract-based TextTool with a click-to-segment tool powered by Meta's SAM 2.1 via Replicate. Users click a point on the image, SAM segments the object at that point, and the resulting mask feeds into the existing SelectionPipeline.

## Motivation

The current TextTool uses Tesseract.js OCR to detect text regions. Since all images in Alli Studio are flat creative PNGs (no text content), the tool always returns 0 words and stays permanently disabled. A general-purpose segmentation tool is far more useful — it lets users click to select logos, shapes, backgrounds, and other visual elements.

## Architecture

### Tool Interface

`SegmentTool.ts` implements the existing `SelectionTool` interface, producing `BinaryMask` output that plugs directly into `SelectionPipeline`. No changes needed to the pipeline, MagicWandTool, BrushTool, or the canvas stack.

### Async Mask Delivery

The `SelectionTool.onEvent()` interface is synchronous (`BinaryMask | null`), but SAM inference is async (2-5s). To solve this without changing the shared interface:

- `SegmentTool` accepts an `onMaskReady: (mask: BinaryMask, event: CanvasEvent) => void` callback in its constructor
- `onEvent()` returns `null` immediately on click, then kicks off the async API call internally
- When the mask arrives, `SegmentTool` calls `onMaskReady(mask, originalEvent)` which feeds the mask into the pipeline via the same code path as synchronous tools (respecting shift/alt modifiers from the original event)

This keeps the `SelectionTool` interface unchanged.

### Inference

- **Model:** `meta/sam-2.1-base` on Replicate
- **API:** Vite dev proxy at `/replicate/*` → `https://api.replicate.com/v1/*` (avoids CORS — Replicate's API is server-to-server only)
- **Auth:** `REPLICATE_API_TOKEN` env var, injected server-side by the Vite proxy via `Authorization` header. Never sent from browser.
- **Protocol:** Dev-only prototype. Production would need a Firebase Function proxy (see TODOS.md).

### Interaction Flow

1. User selects "Segment" tool in toolbar
2. User clicks a point on the image
3. `SegmentTool.onEvent()` captures click coordinates (image-space, from `CanvasEvent.x`/`CanvasEvent.y`)
4. `onEvent()` returns `null`, starts async segmentation
5. Tool encodes the canvas image as base64 (cached after first encode — same image for all clicks)
6. POST to Replicate with image + point coordinates
7. Poll prediction status every 1s, max 30 attempts (30s timeout), using `AbortController` for cancellation
8. Decode returned mask image into `BinaryMask` (resize to image dimensions if needed)
9. Call `onMaskReady(mask, event)` — pipeline applies mask with marching ants

### UX During Inference

- **On click:** Pulsing blue dot at click point on overlay canvas
- **While waiting:** Cursor changes to `wait`. Tool ignores additional clicks (`isProcessing` flag)
- **On success:** Remove dot, apply mask, cursor back to `crosshair`
- **On error:** Remove dot, brief status text in toolbar area ("Segmentation failed — click to retry")

**Latency:** ~2-5s per click. Cold start on first call may be longer.

## Code Changes

### Remove

| File | Action |
|------|--------|
| `src/components/edit-image/steps/mask-editor/TextTool.ts` | Delete |
| `src/components/edit-image/steps/mask-editor/__tests__/TextTool.test.ts` | Delete |
| `tesseract.js` in `package.json` | Remove dependency |
| TextTool references in `MaskEditorModal.tsx` | Remove state vars (`textDetectionStatus`, `detectedWordCount`), init logic, status callback |
| `TextRegion` in `types.ts` | Remove type |

### Add

| File | Purpose |
|------|---------|
| `src/components/edit-image/steps/mask-editor/SegmentTool.ts` | New tool implementing `SelectionTool` |
| `src/components/edit-image/steps/mask-editor/__tests__/SegmentTool.test.ts` | Unit tests |

### Modify

| File | Changes |
|------|---------|
| `MaskEditorModal.tsx` | Swap TextTool for SegmentTool. Update `ActiveTool` type from `'text'` to `'segment'`. Update overlay canvas `pointerEvents` and `cursor` conditions for `'segment'`. Extract `applyMaskToSelection` helper from `handleOverlayPointerEvent` (shared by sync tools and async `onMaskReady`). Pass `onMaskReady` callback. Simpler button — always enabled, no detection status. Add `destroy()` call in cleanup. |
| `types.ts` | Remove `TextRegion` |
| `vite.config.ts` | Add `/replicate/*` proxy to Replicate API (injects auth header server-side) |
| `.env` / `.env.example` | Add `REPLICATE_API_TOKEN` |

### Unchanged

- `SelectionPipeline.ts` — receives `BinaryMask`, no changes
- `MagicWandTool.ts` — independent tool, no changes
- `BrushTool` — independent tool, no changes
- Overlay/mask canvas stack — same architecture

## Toolbar

Before: `Magic Wand | Text (0)` (Text always disabled)
After: `Magic Wand | Segment` (always enabled)

## API Details

### Vite Dev Proxy

Add to `vite.config.ts` proxy config:

```ts
'/replicate': {
  target: 'https://api.replicate.com/v1',
  changeOrigin: true,
  rewrite: (path) => path.replace(/^\/replicate/, ''),
  headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` },
}
```

### Create Prediction

```
POST /replicate/predictions    ← browser calls this (proxied)

{
  "version": "<sam-2.1-base-version-hash>",
  "input": {
    "image": "data:image/png;base64,...",
    "point_coords": [[x, y]],
    "point_labels": [1]
  }
}
```

Note: The version hash must be pinned at implementation time. Find it via `replicate.com/meta/sam-2.1-base/versions`.

### Image Size

For large images (>2000px), downscale to max 1024px on the longest side before base64 encoding to avoid Replicate payload limits. Store the scale factor to map the returned mask back to original dimensions.

### Poll Prediction

```
GET /replicate/predictions/{id}    ← browser calls this (proxied)
```

- Poll every 1s
- Max 30 attempts (30s total)
- Use `AbortController` — abort on `destroy()` or `deactivate()`
- Stop on `status === "succeeded"` or `status === "failed"`

### Mask Conversion

1. Fetch the mask image URL from prediction output
2. Load into an `Image` element, draw to offscreen canvas at `imageWidth x imageHeight` (handles any resolution mismatch)
3. Read pixel data, convert to `BinaryMask`: pixel alpha or red channel > 128 → 1, else 0
4. Compute bounds from the mask data

Note: Replicate serves outputs from `replicate.delivery` with permissive CORS. If CORS blocks the fetch, fall back to proxying through a canvas blob URL or report error.

## Cleanup

`SegmentTool.destroy()` must:
- Set `isProcessing = false`
- Abort any in-flight fetch via `AbortController.abort()`
- Clear overlay canvas
- Null out references

Called from `MaskEditorModal` cleanup effect, same as current `textToolRef.current?.destroy()`.

## Error Handling

- API token missing → log warning at init, show "Segment unavailable" in toolbar (disabled button)
- Network/API failure → status text "Segmentation failed — click to retry", tool stays active
- Timeout (30s) → same as failure
- No mask returned → ignore click silently
- CORS error on mask fetch → report as failure

## Testing

- Unit tests for `SegmentTool`: mock fetch, verify mask conversion, verify `isProcessing` flag, verify event handling, verify `onMaskReady` callback, verify destroy/deactivate abort
- Unit tests for `applyMaskToSelection` helper: 3 tests (shift=add, alt=subtract, default=pending)
- Manual testing: click various objects in flat creatives, verify mask quality

## Future Work

- Multi-point support: shift+click to add positive points, alt+click for negative points (refine segmentation)
- Move to server-side proxy when moving beyond prototype
