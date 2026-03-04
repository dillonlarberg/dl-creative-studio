# Image Resize: Interactive Crop & AI Outpaint

**Date:** 2026-03-04
**Branch:** `resize-images`
**Target size:** Instagram Story (1080×1920) only

## Problem

The current image-resize flow uses a hardcoded cover-fit crop with no user control over positioning. Two scenarios need better UX:

1. **Large image → small frame:** User needs to choose which part of the image fills the 9:16 frame
2. **Small image → large frame:** Image doesn't cover the frame; gaps need to be filled with AI-generated content

## Design

### Wizard Steps

1. **Select Image** — Alli browser or local upload (unchanged)
2. **Crop & Position** — Interactive editor with drag+zoom and optional AI outpaint
3. **Download** — Preview final output + download (unchanged)

### Crop & Position Editor

- **Library:** `react-easy-crop` — provides drag, zoom, pinch-to-zoom out of the box
- **Aspect ratio:** Fixed 9:16 (`aspect={9/16}`)
- **Preview size:** Scaled crop area (e.g., 270×480) that maps to 1080×1920 on export
- **Controls:** Drag to pan, zoom slider (1x–3x range)
- **Object fit:** `contain` so the full source image is visible initially

#### Coverage Detection

After each crop/zoom change, compare `croppedAreaPixels` against source image dimensions:
- If `croppedAreaPixels` stays within source bounds → image covers the frame → standard crop
- If `croppedAreaPixels` extends beyond source bounds → gaps exist → show "Expand with AI" button
- Gap regions shown as checkerboard or gray pattern

#### Standard Crop Export

1. Use `croppedAreaPixels` from `onCropComplete` callback
2. Draw cropped region onto a 1080×1920 Canvas
3. Export as JPEG (quality 0.92)
4. Background upload to Firebase Storage (existing async pattern)

### AI Outpainting (Imagen)

#### Client-side flow

1. Composite source image at current position/zoom onto 1080×1920 Canvas
2. Generate mask: white where image exists, black where gaps need filling
3. Send composite + mask to Cloud Function
4. Receive outpainted result
5. Replace source image in editor with expanded result for fine-tuning

#### Cloud Function (`functions/src/imagen.ts`)

- **Endpoint:** `outpaintImage`
- **Input:** base image (base64), mask (base64), optional prompt
- **Processing:** Call Google Imagen API edit/outpaint endpoint
- **Output:** outpainted image (base64)
- **Resources:** 1GB memory, 120s timeout
- **Default prompt:** "Extend the image naturally, maintaining consistent style, lighting, and content"

### Data Flow

```typescript
// Step: upload
{ imageName: string, imageUrl: string, source: 'alli' | 'local', assetId?: string }

// Step: preview (crop & position)
{
  crop: { x: number, y: number },
  zoom: number,
  croppedAreaPixels: { x: number, y: number, width: number, height: number },
  wasOutpainted: boolean,
  outpaintedImageUrl?: string,
  outputUrl: string,
}

// Step: download
{ outputUrl: string, width: 1080, height: 1920, format: 'jpeg' }
```

**Persistence:** `creativeService.updateCreative()` saves step data to Firestore. Output JPEG uploaded to Firebase Storage via background async upload.

### Dependencies

- `react-easy-crop` — npm package for crop editor UI
- Google Imagen API — for outpainting (server-side via Cloud Function)

### Approach Rationale

Chose `react-easy-crop` over custom Canvas or CSS-transform approaches because this is a prototype. The library provides battle-tested drag/zoom/pinch UX with minimal code and outputs `croppedAreaPixels` that map directly to Canvas crop coordinates.
