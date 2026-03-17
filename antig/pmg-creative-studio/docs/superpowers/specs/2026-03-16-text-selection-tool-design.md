# Text Selection Tool for Mask Editor

**Date:** 2026-03-16
**Status:** Draft
**Branch:** `new_layers`

## Problem

After background extraction, text in images is often partially removed or kept incorrectly. Analysts need a way to detect text regions and selectively keep or erase them from the foreground mask. Currently the only options are freehand brush or magic wand, which are imprecise for rectangular text regions.

## MVP Scope

1. **Text detection** — Tesseract.js runs in a Web Worker on modal open (background), returns word-level bounding boxes
2. **Word highlights** — semi-transparent overlays on detected words, rendered on the selection overlay canvas
3. **Click-to-select** — click a word highlight to select it, Shift+click to add more, feeds into existing SelectionPipeline
4. **Toolbar integration** — "Text" button with detection status and word count badge

### Out of scope

- Text replacement (future feature)
- Hover tooltips with recognized text
- Multi-language detection (English only for MVP)
- Pixel-precise text contours (rectangles only — refine with magic wand/brush if needed)

## Architecture

The Text tool plugs into the existing tool-per-component architecture. It does **not** implement `SelectionTool` directly — the interface is insufficient because TextTool needs the overlay canvas for highlight rendering and hit-testing, which `activate(imageData)` cannot provide. Instead, TextTool is a standalone class with its own API, but follows the same pattern: it produces `BinaryMask` objects that feed into `SelectionPipeline`.

### TextTool Class API

```ts
class TextTool {
  constructor(config: {
    overlayCanvas: HTMLCanvasElement;
    imageWidth: number;
    imageHeight: number;
  });

  /** Start background OCR detection. Calls onComplete when done. */
  detect(
    imageCanvas: HTMLCanvasElement,
    onComplete: (status: 'ready' | 'error', wordCount: number) => void,
  ): void;

  /** Render word highlights on overlay canvas */
  activate(): void;

  /** Clear highlights from overlay canvas */
  deactivate(): void;

  /** Handle mouse events — returns BinaryMask on mousedown if cursor hits a word, null otherwise.
   *  Handles mousemove internally for hover highlighting (side effect, returns null). */
  onEvent(event: CanvasEvent): BinaryMask | null;

  /** Get detection results */
  getRegions(): TextRegion[];

  /** Check if detection is complete */
  isReady(): boolean;

  /** Cancel in-progress detection and terminate worker */
  destroy(): void;
}
```

The `onEvent` method returns a `BinaryMask` on `mousedown` when the cursor hits a word bbox (same as MagicWandTool's mousedown). On `mousemove`, it updates hover highlights as a side effect and returns `null`. On `mouseup` and drag (mousedown+move), it returns `null` — no drag behavior for text tool.

```
Modal opens → Tesseract Worker (background)
                    ↓ (results arrive)
TextTool renders word highlights on overlay canvas
                    ↓ (analyst clicks word)
Bounding box → BinaryMask → SelectionPipeline (existing)
                    ↓
Marching ants → Enter to commit → mask canvas + tint
```

### New Types

```ts
/** A detected text region from Tesseract OCR */
interface TextRegion {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  confidence: number;
}
```

Added to `types.ts`. The existing `BinaryMask`, `CanvasEvent`, `SelectionTool`, and `UndoEntry` interfaces are unchanged.

## Component Structure

```
src/components/edit-image/steps/mask-editor/
  TextTool.ts              ← NEW: Tesseract integration + word highlight rendering
  types.ts                 ← MODIFY: add TextRegion interface
  (all other mask-editor/ files unchanged)

src/components/edit-image/steps/
  MaskEditorModal.tsx      ← MODIFY: add Text button, detection trigger, event routing
```

## Detection Pipeline

### Trigger

Detection starts in MaskEditorModal's init `useEffect`, after `originalImageDataRef` is cached. It runs regardless of which tool is active (background/lazy).

### Flow

1. Create Tesseract worker: `Tesseract.createWorker('eng')`
2. Run `worker.recognize(originalImageCanvas)` — pass a canvas element with the original image drawn at natural dimensions
3. Extract word-level results from `result.data.words` — each has `{ text, bbox: { x0, y0, x1, y1 }, confidence }`
4. Filter out low-confidence detections (`confidence < 0.5`)
5. Store results as `TextRegion[]` in `textToolRef.current`
6. Update React state: `textDetectionStatus = 'ready'`, `detectedWordCount = N`
7. Terminate worker to free memory
8. If Text tool is already active, trigger highlight rendering

### Performance

- Worker runs in a Web Worker — UI thread is never blocked
- First run downloads ~34 MB (WASM core + English lang data), cached in IndexedDB by Tesseract.js
- Recognition: 1-5 seconds depending on image size
- Other tools (magic wand, brush) fully functional during detection

### Image Source

Detection uses the **original image** (from `originalImageDataRef`), not the extracted/masked version. This ensures text is detected regardless of extraction quality.

### Error Handling

- If Tesseract fails to load or recognize: set `textDetectionStatus = 'error'`, Text button shows disabled state
- Network errors during WASM/lang download: same error state
- No retry — analyst can use other tools. Reopening the modal retries detection.

### Worker Cleanup

TextTool stores the worker reference internally. The `destroy()` method terminates the worker if detection is still in progress. MaskEditorModal's cleanup function calls `textToolRef.current?.destroy()` on unmount, ensuring no orphaned workers if the modal closes mid-detection.

### Import Strategy

Tesseract.js is dynamically imported to avoid adding to the main bundle:
```ts
const Tesseract = await import('tesseract.js');
const worker = await Tesseract.createWorker('eng');
```

## Word Highlight Rendering

When detection is complete AND the Text tool is active, highlights render on the **selection overlay canvas**.

### Rendering

Iterate `TextRegion[]`, draw on overlay canvas 2D context:
- **Default state:** `fillStyle = 'rgba(59, 130, 246, 0.25)'` (soft blue fill) + `strokeStyle = 'rgba(59, 130, 246, 0.6)'` border (1px)
- **Hovered:** `fillStyle = 'rgba(59, 130, 246, 0.4)'` (brighter blue)
- **Selected (keep mode):** `fillStyle = 'rgba(34, 197, 94, 0.35)'` (green)
- **Selected (erase mode):** `fillStyle = 'rgba(239, 68, 68, 0.35)'` (red)

Highlights are drawn via `fillRect` + `strokeRect` at word bbox coordinates (image-space, matching the overlay canvas natural dimensions).

### Canvas Sharing

The selection overlay canvas is shared with marching ants. They never render simultaneously:
- **Text tool active, no selection pending:** highlights visible
- **Text tool active, selection pending (after click):** highlights hidden, marching ants visible
- **Text tool active, after commit/cancel:** MaskEditorModal detects `hasPendingSelection` changing to `false` and calls `textTool.activate()` to re-render highlights
- **Other tool active:** highlights cleared

### Hit Testing

On `mousemove` events (converted to image-space via `fitScale` division):
- Linear scan of `TextRegion[]` to find bbox containing cursor `(x, y)`
- If hit: set `hoveredIndex`, re-render highlights, cursor = `pointer`
- If no hit: clear `hoveredIndex`, re-render, cursor = `crosshair`

Performance: linear scan is fine for typical word counts (<100 words per image).

**Click vs drag:** `onEvent` only produces a `BinaryMask` on `mousedown` when cursor hits a word bbox. Dragging (mousedown followed by mousemove) is ignored — no threshold adjustment like magic wand. This means `mousedown` acts as a click for text selection purposes.

### Deactivation

When switching away from Text tool: clear overlay canvas. Detection results stay cached in the ref — switching back re-renders instantly without re-running Tesseract.

## BinaryMask Conversion

When analyst clicks a word, convert bounding box to `BinaryMask`:

```ts
function bboxToMask(
  bbox: { x0: number; y0: number; x1: number; y1: number },
  imageWidth: number,
  imageHeight: number,
  padding: number = 2,
): BinaryMask {
  const x0 = Math.max(0, bbox.x0 - padding);
  const y0 = Math.max(0, bbox.y0 - padding);
  const x1 = Math.min(imageWidth - 1, bbox.x1 + padding);
  const y1 = Math.min(imageHeight - 1, bbox.y1 + padding);

  const data = new Uint8Array(imageWidth * imageHeight);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      data[y * imageWidth + x] = 1;
    }
  }

  return {
    data,
    width: imageWidth,
    height: imageHeight,
    bounds: { minX: x0, minY: y0, maxX: x1, maxY: y1 },
  };
}
```

2px padding around each bbox to avoid clipping text edges. Clamped to image bounds.

### Multi-word Selection

- Click: `pipeline.setPendingMask(wordMask)` — ants appear around word rectangle
- Shift+click another word: `pipeline.addToSelection(wordMask)` — ants expand
- Alt+click a selected word: `pipeline.subtractFromSelection(wordMask)` — removes it
- Enter: commit to mask canvas. Escape: cancel.

Uses existing `concatMasks` and `subtractMasks` from `SelectionPipeline.ts`.

## MaskEditorModal Integration

### New State

```ts
const textToolRef = useRef<TextTool | null>(null);
const [textDetectionStatus, setTextDetectionStatus] = useState<'loading' | 'ready' | 'error' | 'idle'>('idle');
const [detectedWordCount, setDetectedWordCount] = useState(0);
```

### ActiveTool Expansion

```ts
type ActiveTool = 'magicwand' | 'text' | 'brush';
```

### Toolbar

- "Text" button between "Magic Wand" and "Advanced" toggle
- Detection loading: small spinner or "Detecting text..." label next to button
- Detection found 0 words: button shows "(no text found)", disabled
- Detection ready: button enabled, badge shows word count e.g. "Text (12)"

### Tool Switching

- To Text tool: `textTool.activate()` renders highlights on overlay canvas
- Away from Text tool: `textTool.deactivate()` clears highlights, results stay cached
- Pending selection auto-cancels on switch (same as other tools)

### Overlay Canvas pointer-events

Update the JSX `pointerEvents` expression from `activeTool === 'magicwand' ? 'auto' : 'none'` to:
```ts
pointerEvents: (activeTool === 'magicwand' || activeTool === 'text') ? 'auto' : 'none'
```

Update `handleOverlayPointerEvent` to route events to the active tool:
```ts
if (activeTool === 'magicwand') {
  // existing magic wand event handling
} else if (activeTool === 'text' && textToolRef.current) {
  const mask = textToolRef.current.onEvent(canvasEvent);
  if (mask) {
    // same pipeline routing as magic wand (shift/alt/default)
  }
}
```

The coordinate conversion (`offsetX / fitScale`, clamped to image bounds) is identical for both tools — reuse the same `CanvasEvent` construction.

### Keyboard Shortcuts

Unchanged — Enter, Escape, X, Cmd+Z all work identically to magic wand. No new shortcuts.

## Dependencies

### New

- `tesseract.js` (npm, Apache-2.0) — OCR engine with Web Worker support, hierarchical bounding boxes

### Existing (unchanged)

- `magic-wand-tool` — flood fill for magic wand tool
- Fabric.js 7.2 — display canvas
- Canvas2D API — mask canvas, overlay canvas

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Tesseract ~34 MB first-run download | Cached in IndexedDB automatically; subsequent loads <1s. Loading is background/non-blocking. |
| Poor detection on stylized/decorative text | Rectangular bbox still captures the region even if OCR confidence is low. Analyst can refine with magic wand or brush. Filter threshold at 50% confidence. |
| Bounding boxes are rectangles, not text contours | Acceptable for MVP. 2px padding covers edge cases. Analyst has magic wand for precision. |
| Detection takes 1-5s on large images | Background worker — other tools usable during detection. Status indicator keeps analyst informed. |
| Overlay canvas shared between highlights and marching ants | Never render simultaneously — highlights hide when ants active, re-appear after commit/cancel. |
