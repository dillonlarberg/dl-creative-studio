# Mask Editor Refinement — Design Spec

**Date:** 2026-03-12
**Branch:** `new_layers`
**Status:** Draft
**Depends on:** Vercel `edit-image-api` repo (CORS proxy endpoint)

## Problem Statement

The MaskEditorModal in the edit-image wizard is non-functional:

1. **Image sizing bug:** Fabric.js `FabricImage.width` returns the Fabric object width, not pixel dimensions. The original and extracted images render tiny/mispositioned in the top-left corner of the 800×600 canvas instead of filling it.
2. **CORS tainting:** External images (Alli CDN, Replicate delivery) are loaded without `crossOrigin` to avoid CORS blocks. This taints the Fabric canvas, making `toDataURL()` and `toBlob()` throw `SecurityError`. No pixel data can be read or exported.
3. **No mask pipeline:** `handleConfirm()` returns the original `extractedImageUrl` unchanged. Brush strokes are purely decorative — there is no code path that converts user paint strokes into alpha channel modifications on the foreground PNG.
4. **Latent Save step bug:** `compositeImage.ts` sets `crossOrigin='anonymous'` on external URLs, which will fail on Alli CDN URLs that lack CORS headers. The Save step cannot export the final composite.

**Reference screenshots:** `docs/referances/ImageExtract.png` (extraction result), `docs/referances/modalError.png` (broken modal).

## Solution Overview

Client-side Quick Mask editor with a dual-canvas architecture, backed by a CORS image proxy.

**Pipeline:** Extract (API) → Proxy (CORS) → Mask Editor (Fabric.js) → Apply Mask (Canvas API) → Refined Foreground (data URL)

**Key decisions:**
- Quick Mask mode (Photoshop-style): original image underneath, red tint overlay for removed areas
- Client-side alpha manipulation only (no server round-trip for refinement)
- CORS solved via Vercel image proxy with domain allowlist
- Dual canvas (display + hidden mask) to avoid color blending artifacts in mask data
- No zoom/pan in v1

## Constraint: PNG End-to-End

All image storage and transfer in the edit-image pipeline must use PNG format. JPEG is never acceptable for foreground or mask data.

- Replicate returns PNG (background removal models output PNG for alpha transparency)
- Proxy streams bytes as-is (no re-encoding)
- `extractedImageUrl` is either a URL to a PNG or a `data:image/png` data URL
- `compositeImage.ts` exports as `image/png`
- `maskDataUrl` is always `data:image/png`

This guarantees clean alpha channel data throughout the pipeline. Any lossy format conversion (e.g., JPEG) would destroy alpha information and make mask reconstruction impossible.

## Section 1: CORS Image Proxy

**Where:** Vercel repo (`edit-image-api`, separate from this repo)
**Endpoint:** `GET /api/proxy-image?url=<encoded-url>`

**Behavior:**
- Validates the URL against a domain allowlist:
  - `creative-insights-images-prod.creative.alliplatform.com`
  - `replicate.delivery`
  - `pbxt.replicate.delivery`
- Fetches the image server-side, streams it back with `Access-Control-Allow-Origin: *` and the original `Content-Type`
- Returns 403 for non-allowlisted domains (prevents open proxy / SSRF)
- Size cap: 10MB

**Frontend helper:** `proxyUrl(url: string): string`
- External URLs → prepends Vercel proxy prefix
- `data:` URLs → pass through unchanged
- Same-origin URLs → pass through unchanged

**Impact:** Unblocks both the MaskEditorModal (load images with `crossOrigin='anonymous'`) and `compositeImage.ts` (Save step can export to blob).

## Section 2: MaskEditorModal — Quick Mask Mode

### Bug fixes (prerequisites)

- **Image sizing:** Use `HTMLImageElement.naturalWidth` / `naturalHeight` for scale calculations, not `FabricImage.width`. The canvas dimensions should be computed from the image's natural size, scaled proportionally to fit the modal.
- **Image loading:** Load all images through `proxyUrl()` with `crossOrigin='anonymous'` to get a clean (non-tainted) canvas.

### Layer stack (display canvas, bottom to top)

1. **Original image** — full opacity, acts as reference so the user can see what was cut
2. **Red tint overlay** — semi-transparent red over removed areas. This is the interactive layer:
   - **Keep brush** — erases the red tint where you paint (revealing original image = "I want this area")
   - **Erase brush** — paints red tint where you paint (covering original image = "remove this area")
3. **Brush cursor** — visual indicator showing brush size and current mode

### Initial state — display canvas red tint + mask canvas

Both canvases must be initialized in sync. The algorithm depends on whether a saved mask exists:

**Case A: `maskDataUrl` exists (re-editing)**
1. Load `maskDataUrl` as an `HTMLImageElement`
2. Draw it onto the mask canvas (white/black image restores previous mask state)
3. For the display canvas red tint: create an offscreen canvas at image dimensions, draw the mask image, read its `ImageData`. For each pixel where luminance < 128 (black = removed), draw a red-tinted pixel onto a red overlay image. Load this overlay as a `FabricImage` on top of the original image with opacity ~0.4.

**Case B: No `maskDataUrl` (first edit after API extraction)**

The API's edge detection is encoded in the alpha channel of the foreground PNG. We read that alpha channel to build both the mask canvas and the display red tint. The full sequence:

1. Load `extractedImageUrl` through `proxyUrl()` with `crossOrigin='anonymous'` onto an offscreen canvas
2. Call `getImageData()` to read every pixel's alpha value — this IS the API's selection result
3. **Initialize mask canvas** — for each pixel `i`:
   - `extractedAlpha = pixels[i*4 + 3]`
   - `alpha=0` (API removed) → paint black on mask
   - `alpha=255` (API kept) → paint white on mask
   - Partial alpha (anti-aliased edges) → proportional gray
4. **Generate red tint raster** — create another offscreen canvas at same dimensions. For each pixel `i`:
   - `R=255, G=0, B=0` (always red)
   - `A = Math.round((1 - extractedAlpha/255) * 102)` (~40% red opacity where removed, 0% where kept)
   - Anti-aliased edges get proportional red tint
5. Convert tint canvas to blob → `URL.createObjectURL()` → load as `FabricImage` on display canvas over the original image

**Key insight:** The edges are preserved exactly. Anti-aliased edges in the API result become proportional gray values in the mask and proportional red tint on the display.

**Red tint overlay implementation:** The overlay is a single `FabricImage` object positioned over the original image. It is a raster image (not vector paths) generated from the alpha channel data. When the user paints, new strokes are added as Fabric paths on top of this overlay. On "Apply Refinement", the mask canvas (which tracks all strokes) is the source of truth.

This requires the PNG end-to-end constraint above — any lossy encoding would corrupt the alpha channel used for initialization.

### Brush controls

| Control | Range | Description |
|---------|-------|-------------|
| Mode toggle | Keep / Erase | Keep erases red tint, Erase paints red tint. Keyboard shortcut: `X` toggles between modes. |
| Size slider | 5–80px | Brush diameter |
| Opacity slider | 0–100% | Brush opacity. 100% = hard edge. Lower = softer strokes for feathering |
| Undo | Ctrl+Z | See "Undo behavior" below |

### Undo behavior

Fabric's built-in undo removes the last path from the display canvas, but the hidden mask canvas uses raw 2D context drawing which has no undo stack.

**Strategy: Replay from path history.**

On undo (Ctrl+Z):
1. Remove the last path from the Fabric display canvas (built-in behavior)
2. Clear the mask canvas entirely
3. Re-initialize the mask canvas from the initial state (either `maskDataUrl` or derived from extracted alpha)
4. Replay all remaining Fabric path objects onto the mask canvas in order

This guarantees display/mask sync. Performance is acceptable because individual editing sessions rarely exceed ~50-100 strokes. If performance becomes an issue, a snapshot stack (saving `ImageData` every N strokes) can be added as an optimization.

### Brush cursor

The brush cursor is a custom Fabric `Circle` object that follows the mouse via `mouse:move` event. It reflects the current brush size (diameter matches the slider) and mode (green outline for Keep, red outline for Erase). This replaces Fabric's default crosshair cursor, which does not convey size or mode information.

### No zoom/pan in v1

The display canvas scales the image to fit the modal via CSS. The internal Fabric coordinate space is locked to the image's natural dimensions. This eliminates coordinate transform sync bugs. Zoom/pan is a follow-up feature.

## Section 3: Dual Canvas Architecture

### Problem

The display canvas composites the original image underneath the red tint overlay. Reading pixel data from this canvas returns blended RGB values (red tint mixed with the underlying image colors), not clean mask data. A red threshold check would produce inconsistent results depending on the underlying image — e.g., a blue pixel under red tint becomes muted purple, not a high-red value.

### Solution

Two canvases with identical dimensions and coordinate spaces:

| Canvas | Visibility | Contents | Pixel reads |
|--------|-----------|----------|-------------|
| Display canvas | Visible (Fabric.js) | Original image + red tint overlay. User sees and paints on this. | Never — blended values are unreliable |
| Mask canvas | Hidden (offscreen `<canvas>`) | White = keep, black = remove. No image underneath. | Always — clean white/black/gray values |

### Stroke mirroring

Every brush stroke on the display canvas is duplicated onto the hidden mask canvas:

- **Event:** Fabric's `path:created` fires after each stroke completes (mouse-up)
- **Mirroring:** Read the path's `d` attribute, stroke width, and opacity from the Fabric path object. Draw the identical path onto the mask canvas 2D context.
  - Keep brush → white stroke on mask canvas
  - Erase brush → black stroke on mask canvas
  - Opacity maps directly (50% brush opacity → gray value on mask)
- **Compositing mode on mask canvas:** `globalCompositeOperation = 'source-over'` for both Keep and Erase brushes. This means overlapping strokes accumulate naturally — painting 50% opacity twice over the same area produces ~75% coverage, not 50%. This matches Photoshop's brush behavior and feels intuitive.
- **Coordinate space:** Both canvases are locked to `naturalWidth × naturalHeight`. No transformation needed.

### Real-time UX note

`path:created` fires on mouse-up, not during the drag. This means:
- **Display canvas:** Real-time feedback. Fabric renders the red tint stroke live as the user drags. The user sees the tint appear/disappear immediately.
- **Mask canvas:** Updated on stroke completion only. This is acceptable because the mask canvas is never shown to the user — it's only read when "Apply Refinement" is clicked.

The UX is real-time. The mask sync is on-complete.

### Sync safety

- Both canvases locked to the same pixel dimensions (original image `naturalWidth × naturalHeight`)
- Display canvas may be visually scaled via CSS `transform: scale()` to fit the modal, but Fabric operates in the full-resolution coordinate space internally
- No zoom/pan in v1 eliminates coordinate transform divergence
- **Assertion:** On every `path:created`, verify mask canvas dimensions match display canvas internal dimensions. If they diverge, log a warning and disable "Apply Refinement" rather than silently producing a misaligned mask.

## Section 4: applyMaskToAlpha Utility

**File:** `src/components/edit-image/utils/applyMaskToAlpha.ts`

**Signature:**
```typescript
function applyMaskToAlpha(
  originalImageUrl: string,  // proxied, CORS-safe — the ORIGINAL full image (pre-extraction)
  maskCanvas: HTMLCanvasElement,
): Promise<string>  // returns data:image/png data URL
```

**Intent:** This function replaces the API extraction entirely with the user's mask. It takes the original full image (with background) and applies the mask to create a new foreground. This means:
- Where the user painted "keep" (white mask), the original image pixels are preserved at full alpha
- Where the user painted "remove" (black mask), the original image pixels become fully transparent
- The API extraction result is not blended — the mask is the sole authority on what to keep/remove

This is the correct behavior because the mask editor's purpose is to let the user correct what the API got wrong. If the API missed part of the subject, the user paints "keep" to restore it from the original. If the API included unwanted background, the user paints "remove" to cut it.

**Algorithm:**
1. Load original image onto an offscreen canvas at `naturalWidth × naturalHeight`
2. Get `ImageData` from the offscreen canvas
3. Get `ImageData` from the mask canvas (same dimensions)
4. For each pixel `i`:
   - Read mask luminance: `maskPixels[i*4]` (red channel — on a white/black canvas, R=G=B)
   - Set foreground alpha: `imagePixels[i*4 + 3] = maskLuminance`
   - Luminance 255 (white/keep) → alpha 255 (fully opaque)
   - Luminance 0 (black/remove) → alpha 0 (fully transparent)
   - Luminance 128 (gray/partial) → alpha 128 (semi-transparent edge)
5. Put modified `ImageData` back onto the offscreen canvas
6. Export as `canvas.toDataURL('image/png')`

**Key property:** Linear mapping from mask luminance to alpha. No thresholds, no heuristics. The brush opacity slider gives the user direct control over edge softness.

**Error handling:**
- Image load failure (network error, proxy down) → throw descriptive error, surface in the modal UI, do NOT close the modal so the user can retry
- Dimension mismatch between mask canvas and loaded image → throw error, surface in modal. This should never happen due to the sync assertions but is a safety net

## Section 5: Data Flow & Type Changes

### types.ts additions

```typescript
// Add to EditImageStepData:
maskDataUrl?: string;  // Clean mask canvas export (white=keep, black=remove)
                       // Persisted so user can re-open editor and continue refining
```

`extractedImageUrl` can now hold either:
- An API URL (after initial extraction)
- A `data:image/png` data URL (after mask refinement)

### proxyUrl helper — shared utility

**File:** `src/components/edit-image/utils/proxyUrl.ts`

`proxyUrl(url: string): string` — prepends the Vercel proxy prefix (`VITE_EXTRACT_API_URL + '/api/proxy-image?url='`) for external URLs. Data URLs and same-origin URLs pass through unchanged.

Placed in `utils/` (not `imageEditService.ts`) because both `MaskEditorModal.tsx` and `compositeImage.ts` need it. Keeping it in a utility file avoids a cross-layer import (utility → service).

### imageEditService.ts additions

- `extractForeground()` response already has `maskUrl?: string` — carries the API's initial mask if Replicate provides one. If not, the initial mask is derived from the extracted foreground's alpha channel.

### compositeImage.ts — no changes required for prototype

After mask refinement, `extractedImageUrl` is a `data:image/png` data URL. Data URLs are same-origin, so `compositeImage.ts`'s existing `crossOrigin='anonymous'` in `loadImage()` works fine — the browser ignores `crossOrigin` on data URLs and the canvas is not tainted.

The download button already works and will continue to work with data URL inputs.

**Future improvement (not blocking):** If `extractedImageUrl` is still an external API URL (user skipped mask refinement) and the background is also external, the Save step will fail due to CORS. A future fix would route external URLs through `proxyUrl()` in `loadImage()`. This is deferred — the mask editor prototype does not require it.

### Re-edit flow

When the user opens the mask editor a second time:
1. `maskDataUrl` exists in stepData → load it as the initial mask canvas state (white/black image)
2. No `maskDataUrl` → derive initial mask from `extractedImageUrl`'s alpha channel (alpha 0 → black, alpha 255 → white)
3. User refines → on "Apply Refinement":
   - Export mask canvas → new `maskDataUrl`
   - Run `applyMaskToAlpha()` → new `extractedImageUrl` (data URL)
   - Both stored in stepData

Refinement is cumulative — the user can go back and keep adjusting without losing previous edits.

### MaskEditorModal handleConfirm update

```typescript
const handleConfirm = async () => {
  const maskDataUrl = maskCanvasRef.current.toDataURL('image/png');
  const refinedForeground = await applyMaskToAlpha(
    proxyUrl(originalImageUrl),
    maskCanvasRef.current,
  );
  onConfirm(refinedForeground, maskDataUrl);
};
```

`onConfirm` signature changes from `(refinedImageUrl: string)` to `(refinedImageUrl: string, maskDataUrl: string)`.

### CanvasStep handleMaskConfirm update

```typescript
const handleMaskConfirm = (refinedImageUrl: string, maskDataUrl: string) => {
  onStepDataChange({
    extractedImageUrl: refinedImageUrl,
    extractionMethod: 'manual',
    maskDataUrl,
  });
  setShowMaskEditor(false);
};
```

The `MaskEditorModal` props also gain `maskDataUrl?: string` (from stepData) so it can restore previous mask state on re-open.

### Proxy error handling

If the proxy returns 403 (non-allowlisted domain) or the image exceeds 10MB, the image load in MaskEditorModal or compositeImage will fail. Error handling:
- `MaskEditorModal`: Show error message in the canvas area ("Failed to load image — check network connection"), keep modal open for retry
- `compositeImage.ts`: Throw descriptive error, surfaced by the Save step UI

## Out of Scope (v1)

- Zoom / Pan in the mask editor
- Server-side mask refinement (ML-enhanced edges)
- "Enhance edges" button (API round-trip)
- Change Text edit type
- Change Colors edit type
- "Add to Asset House" button

## Files Changed

| File | Change |
|------|--------|
| `src/components/edit-image/steps/MaskEditorModal.tsx` | Rewrite: dual canvas, Quick Mask mode, proxy loading, real brush controls |
| `src/components/edit-image/utils/applyMaskToAlpha.ts` | New: mask-to-alpha pipeline utility |
| `src/components/edit-image/utils/compositeImage.ts` | No changes needed for prototype (data URLs work as-is) |
| `src/components/edit-image/types.ts` | Add `maskDataUrl` field |
| `src/components/edit-image/utils/proxyUrl.ts` | New: shared `proxyUrl()` helper |
| `src/components/edit-image/steps/CanvasStep.tsx` | Update `handleMaskConfirm` to accept maskDataUrl |
| **Vercel repo** (`edit-image-api`) | New: `/api/proxy-image` endpoint |
