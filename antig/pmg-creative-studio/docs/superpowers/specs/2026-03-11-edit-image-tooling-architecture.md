# Edit Image Tooling Research & Architecture Sketch

**Date:** 2026-03-11
**Status:** Draft
**Related spec:** `2026-03-11-edit-image-ui-redesign-design.md`

## Decision Framing

The current local FastAPI service was useful for prototyping, but it is not the preferred long-term direction for the redesigned `edit-image` workflow. The new flow is tool-oriented: extract foreground, choose or upload a new background, preview one result, then save. That favors adopting existing segmentation/masking tooling rather than extending a bespoke local image pipeline.

## Research Considerations

### 1. Keep the existing app stack

The frontend already runs on React + Vite + TypeScript, with Firebase Functions available for server-side work. That makes a thin Firebase-backed tool layer a better fit than introducing a second long-lived application backend.

### 2. Do not call Replicate directly from the browser

Replicate's JavaScript client is intended for server-side use. Use Firebase Functions as the secure integration layer for predictions, polling, and webhook handling.

### 3. Prefer existing segmentation tools over custom masking logic

Good candidates:

- **Replicate-hosted background removal** for reliable one-click extraction
- **Replicate-hosted SAM/SAM2-style segmentation** for future promptable or interactive masking
- **MediaPipe InteractiveSegmenter** if manual mask refinement should happen fully in-browser later
- **Transformers.js** if a browser-only JS segmentation path is needed

### 4. Avoid locking the UI to one provider

The frontend should call an internal service abstraction such as `imageEditService.extractForeground()` rather than provider-specific APIs. That keeps the UI aligned to the spec while allowing provider swaps.

### 5. Licensing and operational constraints matter

Some browser-side background removal libraries are easy to adopt but may introduce license constraints or large client-side model downloads. These should be evaluated before adoption, not after implementation.

## Recommended Architecture

### Preferred path: React + Firebase Functions + Replicate

**Flow**

1. User selects an image in the React wizard.
2. Frontend uploads the source image to Firebase Storage or sends a signed URL reference.
3. Firebase Function calls Replicate for foreground extraction.
4. Function stores or returns the extracted PNG with transparency.
5. Frontend renders the `canvas` step using that extracted asset.
6. User picks a solid color, Alli asset, or uploaded image for the new background.
7. Frontend performs lightweight local preview compositing when possible.
8. Optional server render step creates the final output for download/storage consistency.

**Why this is the best fit**

- Reuses the current stack
- Keeps API keys off the client
- Avoids maintaining a custom Python image service
- Leaves room for higher-quality hosted models later

## Service Boundaries

### Frontend (`src/components/edit-image/*`)

- Owns wizard state and step transitions
- Requests foreground extraction
- Handles local preview composition for the `preview` step
- Never knows whether extraction came from Replicate, MediaPipe, or another provider

### Frontend service (`src/services/imageEditService.ts`)

Refactor toward methods like:

- `extractForeground(input)`
- `composePreview({ foreground, background })`
- `saveEditedImage(payload)`
- `segmentInteractive(input, prompt)` later if needed

### Firebase Functions

- Provider orchestration
- Replicate API calls
- Prediction status handling
- Optional final image composition/storage pipeline

## Alternative Paths

### Browser-first path

Use MediaPipe or Transformers.js in the client for extraction and masking, and skip Replicate entirely.

Use this only if:

- low-latency local interaction matters more than consistency
- the target devices are strong enough for browser inference
- you are comfortable with larger client bundles and model asset loading

### Not recommended as the main path

Continue extending `local-services/image-edit-api/`.

Reason:

- duplicates capability already available in stronger libraries and hosted models
- adds another backend surface to maintain
- is misaligned with the current spec direction

## Recommended Next Step

Implement the redesigned UI against a provider-agnostic `imageEditService` contract, then back `extractForeground` with Firebase Functions + Replicate first. Add an in-browser segmentation/refinement path only if the product later requires interactive masking.

## References

- Replicate JavaScript client: https://github.com/replicate/replicate-javascript
- Replicate web app guide: https://replicate.com/docs/guides/run/nextjs
- MediaPipe Image Segmenter / Interactive Segmenter: https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter/web_js
- MediaPipe InteractiveSegmenter API: https://ai.google.dev/edge/api/mediapipe/js/tasks-vision.interactivesegmenter
- Transformers.js: https://huggingface.co/docs/hub/main/transformers-js
- IMG.LY background removal JS: https://github.com/imgly/background-removal-js
- Replicate remove background example: https://replicate.com/lucataco/remove-bg
- Replicate segmentation example: https://replicate.com/lucataco/segment-anything-2
