# Mask Editor Bugfix Rework — Design Spec

**Date:** 2026-03-13
**Branch:** `new_layers`
**Status:** Draft
**Supersedes:** Portions of `2026-03-12-mask-editor-refinement-design.md` (canvas setup, zoom/pan sections)
**Preserves:** Dual-canvas architecture, stroke mirroring, mask-to-alpha pipeline, proxyUrl helper

## Problem Statement

The MaskEditorModal has four bugs that make it non-functional:

1. **Image positioning:** The image is offset up and left — only the bottom-right corner is visible in the modal canvas. Root cause: the Fabric canvas is created at display dimensions (`displayW x displayH`) AND `setZoom(fitScale)` is applied, double-scaling the content.

2. **Zoom-out misalignment:** When zooming out to see the whole image, it occupies only the top-left quadrant. Same root cause — the viewport transform anchors at (0,0) with no centering logic.

3. **Stale strokes:** Strokes from previous modal opens (even on different images) persist. Root cause: refs (`fabricRef`, `maskCanvasRef`, `initialMaskRef`, `cursorRef`) aren't nulled on cleanup, so remounts can inherit stale state.

4. **No initial mask edges:** The red tint overlay from the extracted foreground's alpha channel doesn't appear. Root cause: the tint `FabricImage` is mispositioned due to the same viewport scaling bug as the background image. The `buildMaskFromAlpha` logic itself is correct.

## Root Cause

All four bugs trace to a single architectural deviation: the current implementation uses **Fabric's native zoom** (`setZoom(fitScale)`) for display fitting, instead of **CSS scaling** as the original spec prescribed. This introduced viewport transform complexity that broke image positioning, tint overlay alignment, and coordinate mapping.

## Solution: Natural Dimensions + CSS Scaling

Strip all zoom/pan code. Return to the original spec's approach:

- Fabric canvas at **natural image dimensions** (`naturalWidth x naturalHeight`)
- CSS `transform: scale(fitScale)` on a wrapper div for visual fitting
- All coordinate spaces (Fabric, mask canvas, brush cursor) are 1:1 with natural pixels
- No viewport transforms, no coordinate remapping

### Canvas Setup

```
outerDiv: { width: displayW, height: displayH, overflow: hidden }
  innerDiv: { transform: scale(fitScale), transformOrigin: top left, width: w, height: h }
    <canvas>  ← attribute dimensions: w x h (natural)
```

Where:
- `w`, `h` = `origImg.naturalWidth`, `origImg.naturalHeight`
- `fitScale = Math.min(MAX_DISPLAY_WIDTH / w, MAX_DISPLAY_HEIGHT / h, 1)`
- `displayW = Math.round(w * fitScale)`
- `displayH = Math.round(h * fitScale)`

### What Gets Removed

- `canvas.setZoom()`, `zoomTo()`, `handleFitToView()`
- `mouse:wheel` zoom handler
- `zoomPercent` state
- `fitScaleRef`, `displayDimsRef`, `fabricModuleRef` refs (replaced by `displayDims` state)
- `MIN_ZOOM_FACTOR`, `MAX_ZOOM` constants
- `MagnifyingGlassMinusIcon`, `MagnifyingGlassPlusIcon` imports
- Zoom buttons (MagnifyingGlassPlus/Minus icons) from toolbar
- `Cmd+0` keyboard shortcut
- ~80 lines total

### Init Sequence (corrected)

1. Load original image via `proxyUrl()` with `crossOrigin='anonymous'` → get `naturalWidth`, `naturalHeight`
2. Compute `fitScale`, `displayW`, `displayH` and set them via `useState` so the JSX render function can access them for the CSS wrapper. Use a `displayDims` state object: `{ fitScale, displayW, displayH }`, initialized to defaults (`{ fitScale: 1, displayW: MAX_DISPLAY_WIDTH, displayH: MAX_DISPLAY_HEIGHT }`), updated once during init
3. Build mask + tint via `buildMaskFromAlpha` or `buildMaskFromSaved` (existing logic, unchanged)
4. **Wait for DOM reflow:** The `setDisplayDims` call in step 2 triggers a re-render that resizes the CSS wrapper. The Fabric canvas must be created *after* this reflow so its container has the correct dimensions. Use a separate `useEffect` that depends on `displayDims` (and gates on `isLoading`) to create the Fabric canvas, OR defer Fabric creation to a `requestAnimationFrame` / `setTimeout(0)` callback after setting state. The key constraint: do not create Fabric.Canvas until the `<canvas>` element's parent div has reflowed to `displayW x displayH`
5. Set original image as `backgroundImage` — natural size, positioned at (0,0)
6. Add tint `FabricImage` at (0,0) — natural size, exact pixel alignment
7. Configure brush, cursor, `path:created` handler — all in natural coordinate space

### Cleanup (fixes stale strokes)

```typescript
return () => {
  cancelled = true;
  if (tintBlobUrl) URL.revokeObjectURL(tintBlobUrl);
  if (fabricRef.current) {
    fabricRef.current.dispose();
    fabricRef.current = null;
  }
  maskCanvasRef.current = null;
  initialMaskRef.current = null;
  cursorRef.current = null;
};
```

All refs nulled on unmount. Modal starts completely fresh on every open.

**Race condition note:** If the user closes and immediately reopens the modal, the old effect's cleanup runs concurrently with the new effect's init. The `cancelled` flag already gates all async steps in the init sequence (image loads, Fabric setup), including the `buildMaskFromAlpha`/`buildMaskFromSaved` calls that create `tintBlobUrl`. The blob URL is created inside the `init()` closure and only assigned to the outer `tintBlobUrl` variable within that closure, so the cleanup function always revokes the URL that belongs to its own effect instance. No cross-instance leakage is possible because each effect invocation captures its own `tintBlobUrl` in its closure scope.

## Unchanged Components

These are correct as-is and require no changes:

- **`buildMaskFromAlpha()`** — reads extracted foreground alpha → mask canvas + red tint
- **`buildMaskFromSaved()`** — restores mask from saved `maskDataUrl`
- **`mirrorPathToMask()`** — stroke mirroring from Fabric path → hidden mask canvas
- **`applyMaskToAlpha()`** — mask luminance → image alpha (utility file)
- **`proxyUrl()`** — CORS proxy URL helper (utility file)
- **`updateBrush()`** — brush color/size/opacity configuration
- **Brush mode toggle, size slider, opacity slider** — UI controls
- **`handleConfirm()`** — exports mask + applies to original image
- **`handleUndo()`** — replay-based undo (reset mask, replay remaining paths)
- **Keyboard shortcuts** — X (toggle mode), Cmd+Z (undo)
- **CanvasStep integration** — `handleMaskConfirm` signature, `maskDataUrl` prop passing

## Risk: Brush Cursor Coordinate Mapping

With CSS `transform: scale()`, the canvas attribute dimensions (natural) differ from visual CSS dimensions. This can cause Fabric's coordinate system to diverge from mouse event coordinates.

**Current code uses `getScenePoint(e.e)`** which normalizes for the viewport transform. Fabric v7 uses `getBoundingClientRect()` for pointer calculations, which returns the visually scaled dimensions. Fabric divides by the ratio of bounding rect to canvas attribute dimensions, so `getScenePoint` should return correct natural-space coordinates. However, this depends on Fabric's internal implementation and cannot be assumed.

**Implementation requirement:** Pointer accuracy is the **first test checkpoint** after canvas setup, before proceeding to brush/stroke work. The implementer must:

1. Set up the canvas with CSS scaling
2. Verify the brush cursor tracks the mouse accurately (paint a stroke, confirm cursor circle aligns with where the stroke lands)
3. If cursor offset is detected, try these alternatives in order:
   - `getViewportPoint(e.e)` — may work if Fabric already accounts for CSS transform in this method
   - Manual computation: `(e.offsetX / fitScale, e.offsetY / fitScale)` — note: `offsetX` is relative to the target element's padding box which may or may not account for CSS transforms depending on the browser
   - `canvas.getPointer(e.e, true)` — Fabric's legacy pointer method with `ignoreZoom` flag
4. Document which method works in the commit message

**Timebox: 1–2 hours.** If none of the four fallback methods produce clean cursor tracking without browser-specific hacks, that's a signal the CSS scaling approach needs rethinking (e.g., switching to Fabric canvas at display dimensions with manual coordinate remapping for the mask canvas only). Do not stack workarounds — escalate the architectural decision.

**Testing tell:** Cursor circle lagging or leading the actual brush stroke = coordinate method is wrong.

## Simplified Component Structure

### State
- `brushMode`, `brushSize`, `brushOpacity` — brush controls
- `isLoading`, `error`, `isApplying`, `canApply` — UI state
- `displayDims` — `{ fitScale, displayW, displayH }`, computed during init, used by CSS wrapper in JSX

### Refs
- `displayCanvasRef` — the `<canvas>` DOM element
- `fabricRef` — Fabric.Canvas instance
- `maskCanvasRef` — hidden offscreen mask canvas
- `initialMaskRef` — saved `ImageData` for undo replay
- `cursorRef` — Fabric Circle brush cursor
- `currentBrushModeRef` — avoids stale closure in `path:created`
- `imageDimsRef` — natural dimensions, used by CSS wrapper and undo

### Toolbar
- Keep/Erase toggle
- Size slider (5–80px)
- Opacity slider (1–100%)
- Keyboard hints: `X: toggle`, `Cmd+Z: undo`

### Keyboard Shortcuts
- `X` — toggle Keep/Erase
- `Cmd+Z` / `Ctrl+Z` — undo last stroke

## Files Changed

| File | Change | Lines |
|------|--------|-------|
| `src/components/edit-image/steps/MaskEditorModal.tsx` | Rework: remove zoom/pan, fix canvas setup, fix cleanup | Net reduction ~40–50 lines |

No other files change. The utilities, types, and CanvasStep integration are correct as-is.

## HiDPI / Retina Displays

The canvas is set to natural image dimensions and CSS-scaled down. On a 2x retina display, the canvas backing store and the CSS pixel grid won't align in the usual way. This is a **known non-issue** for mask editing — brushes are 5–80px wide, not pixel-precise work. Do not attempt to "fix" this with `devicePixelRatio` scaling, which would reintroduce the exact coordinate complexity this rework is removing.

## Out of Scope

- Zoom/pan (future follow-up, will be a separate spec)
- Server-side mask refinement
- Other edit types (Change Text, Change Colors)
