# Structured Selection Tools for Background Removal

**Date:** 2026-03-16
**Status:** Draft
**Branch:** `new_layers`

## Problem

The mask editor's freehand brush gives analysts too much freedom for background removal. PM feedback: analysts should use structured selection tools (object selection, polygon, color picker) rather than painting freehand. The brush remains available behind an "Advanced" toggle.

## MVP Scope

1. **Magic Wand Tool** (primary) — click to flood-fill select by color similarity, drag to adjust tolerance in real-time
2. **Brush Tool** (advanced) — current keep/erase brush extracted and hidden behind toggle
3. **Selection Pipeline** — shared infrastructure: marching ants preview, Enter/Escape commit/cancel, Cmd+Z undo, shift/alt add/subtract
4. **Toolbar redesign** — magic wand as default, brush behind "Advanced" disclosure

### Post-MVP (designed, not built)

- **Pen Tool** — click to place polygon vertices, drag to create Bezier curves
- **Color Pick Tool** — click to pick a color, select all matching pixels globally with drag-to-adjust tolerance

## Architecture

### Approach: Tool-per-component with shared Selection Pipeline

Each tool is an isolated module that produces a binary mask. A shared `SelectionPipeline` consumes that mask, renders marching ants, handles add/subtract logic, and on commit writes to the existing hidden mask canvas + red tint overlay.

```
MagicWandTool  ──┐
PenTool*       ──┼──▶ SelectionPipeline ──▶ MaskCanvas + Tint
ColorPickTool* ──┘
BrushTool (advanced)─┘  (* post-MVP)
```

### Core Types

```ts
// types.ts

/** Binary selection mask — matches magic-wand-tool output format */
interface BinaryMask {
  data: Uint8Array;  // 1 byte per pixel: 0 = not selected, 1 = selected
  width: number;
  height: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

/** Normalized canvas event with image-space coordinates */
type CanvasEvent = {
  type: 'mousedown' | 'mousemove' | 'mouseup';
  x: number;  // image-space (display offsetX / fitScale, clamped to [0, width-1])
  y: number;  // image-space (display offsetY / fitScale, clamped to [0, height-1])
  shiftKey: boolean;
  altKey: boolean;
  nativeEvent: MouseEvent;
};

/** Common interface for all selection tools */
interface SelectionTool {
  activate(canvas: fabric.Canvas, imageData: ImageData): void
  deactivate(): void
  onEvent(event: CanvasEvent): BinaryMask | null  // null = still selecting
}
```

All tools implement `SelectionTool`. The pipeline doesn't know or care which tool produced the mask.

## Component Structure

```
src/components/edit-image/steps/
  MaskEditorModal.tsx          <- slimmed: toolbar, layout, tool switching
  mask-editor/
    SelectionPipeline.ts       <- marching ants, add/subtract, commit to mask
    MagicWandTool.ts           <- click -> binary mask via magic-wand-tool
    PenTool.ts                 <- post-MVP: polygon/bezier -> binary mask
    ColorPickTool.ts           <- post-MVP: color match -> binary mask
    BrushTool.ts               <- extracted current brush logic
    marchingAnts.ts            <- hatch pattern rendering on overlay canvas
    colorDistance.ts            <- pixel color comparison utility
    types.ts                   <- SelectionTool, BinaryMask, etc.
```

`MaskEditorModal` stays as the orchestrator — owns the Fabric canvas, hidden mask canvas, red tint layer, and toolbar UI. Passes canvas refs to the active tool.

## Canvas Stack

Three canvas layers stacked via `position: absolute` (bottom to top):

1. **Fabric.js display canvas** — original image + red tint overlay + brush strokes (existing)
2. **Selection overlay canvas** (plain Canvas2D, transparent) — marching ants only. Same natural dimensions as Fabric canvas (`w x h`), wrapped in the same CSS `transform: scale(fitScale)` container so ants align pixel-perfectly with the image.
3. **Event capture layer** — the selection overlay canvas itself captures pointer events

### Event Delegation

The selection overlay canvas (layer 2) receives all pointer events. `MaskEditorModal` converts native `MouseEvent` to `CanvasEvent` by dividing `offsetX`/`offsetY` by `fitScale` and clamping to image bounds `[0, width-1]` x `[0, height-1]`. The resulting `CanvasEvent` is passed to `activeTool.onEvent()`.

**When brush is active:** the selection overlay canvas gets `pointer-events: none` via CSS, allowing events to reach the Fabric canvas below. Fabric's `isDrawingMode` is set to `true`. When switching back to a selection tool, `pointer-events` is restored to `auto` and Fabric's `isDrawingMode` is set to `false`.

## Selection Pipeline

### State

- `pendingMask: BinaryMask | null` — current uncommitted selection (marching ants visible)
- `undoStack: Array<{ mask: BinaryMask; mode: 'keep' | 'erase' }>` — committed selections for replay-based undo (avoids storing full ImageData snapshots)

### Flow

1. **Tool produces a mask** -> pipeline receives it, stores as `pendingMask`
2. **Render marching ants** -> `getBorderIndices(pendingMask)` returns border pixel indices, drawn as animated hatch pattern via `putImageData` on the selection overlay canvas
3. **Modify selection** (while ants are active):
   - Shift+click -> new mask OR'd with `pendingMask` via `concatMasks()` from `magic-wand-tool` (additive)
   - Alt+click -> subtract: `result.data[i] = pendingMask.data[i] & (1 - newMask.data[i])` for each pixel
   - Ants re-render after each modification
4. **Enter / "Apply" button** -> commit:
   - Push `{ mask: pendingMask, mode: currentMode }` onto `undoStack`
   - Write `pendingMask` to hidden mask canvas (white for keep mode, black for erase mode)
   - Regenerate tint: read full mask canvas, build new tint ImageData (red pixels with opacity inversely proportional to mask luminance), convert to blob URL, swap Fabric `FabricImage` tint object on display canvas
   - Clear marching ants interval, clear `pendingMask`
5. **Escape** -> discard `pendingMask`, clear marching ants interval
6. **Cmd+Z** -> pop `undoStack`, restore mask canvas from `initialMaskRef` by replaying remaining stack entries, regenerate tint

### Marching Ants Rendering

Pixel-based hatch pattern, not Fabric.js paths. Follows the `magic-wand-tool` example approach:

- `getBorderIndices(mask)` returns pixel indices along selection boundary
- `hatchTick()` on 300ms `setInterval` animates the march by offsetting the hatch pattern
- Each tick: `clearRect(0, 0, w, h)`, create fresh `ImageData`, iterate border indices with alternating black/white pixels based on `(x + y + hatchOffset) % (hatchLength * 2)`, then `putImageData`
- Cached border indices (`cacheInd`) reused across ticks; recalculated only when selection changes
- Interval lifecycle: started when `pendingMask` becomes non-null, cleared when `pendingMask` is set to null (commit, cancel, tool switch), also cleared on component unmount
- Non-interactive — purely visual overlay, `pointer-events: none` always (events go to the event capture logic above)

## Tool Implementations

### Magic Wand Tool (MVP)

**Library:** `magic-wand-tool` (npm, MIT, stable)

**Interaction:**
- Mouse down -> seed point `(x, y)`, initial `MagicWand.floodFill()` at default threshold (15)
- Mouse drag -> tolerance adjusts in real-time: `threshold = clamp(defaultThreshold + sign * len, 1, 255)` where `len` is pixel distance from seed, `sign = (adx > ady ? dx/adx : dy/ady)` scaled by `/5` (decrease) or `/3` (increase). Same formula as `magic-wand-tool` example.
- `MagicWand.gaussBlurOnlyBorder()` softens edges on each recalculation (only processes border pixels, not full image — performant even during drag)
- Marching ants re-render on every threshold change during drag
- Mouse up -> selection is "pending" (ants keep animating)

**Additive/subtractive:**
- Shift+click -> additive: `concatMasks()` from `magic-wand-tool` merges selections
- Alt+click -> subtractive: `result.data[i] = pendingMask.data[i] & (1 - newMask.data[i])`

**Image data source:** During init, the original image is drawn to a temporary offscreen canvas to extract `ImageData` at natural dimensions. This is cached as `originalImageDataRef` and passed to selection tools. This must be the raw original image — never the display canvas (which includes tint overlay).

**Output:** `BinaryMask` — matches `magic-wand-tool` mask format

**Threshold display:** current threshold shown as integer 0-255, updated in real-time during drag

### Brush Tool (MVP, Advanced Toggle)

- Current keep/erase brush logic extracted from `MaskEditorModal.tsx` into `BrushTool.ts`
- Hidden behind "Advanced" toggle in toolbar
- Bypasses selection pipeline entirely — writes directly to mask canvas + tint on each stroke (existing behavior)
- Retains: size slider (5-80px), opacity slider (1-100%), X to toggle mode, Cmd+Z undo
- Undo is separate from pipeline: remove last Fabric path, replay remaining paths from `initialMaskRef`

### Pen Tool (Post-MVP)

- Built on Fabric.js `Path` primitives with custom interaction layer
- Click places vertex (straight `L` segment), click+drag pulls symmetric Bezier control handles (cubic `C` segment)
- Double-click or clicking first vertex closes path
- On close: rasterize closed path to binary mask on offscreen canvas, feed into selection pipeline
- Escape cancels in-progress path

### Color Pick Tool (Post-MVP)

- Click picks reference color from image `ImageData` at pixel
- Scan all pixels, Euclidean RGB distance from reference
- Pixels within tolerance marked in binary mask
- Click+drag adjusts tolerance in real-time (same distance-based scaling as magic wand), ants update live
- MVP tolerance: default 15, no slider. Ideal: drag-to-adjust (same as magic wand interaction)

## Toolbar Layout

**Primary toolbar (left):**
- Magic Wand button (active by default, wand icon)
- Keep/Erase mode toggle (same segmented control as current)

**Secondary toolbar (right):**
- "Advanced" toggle — expands to reveal brush tool + size/opacity sliders
- Keyboard shortcuts: "Enter: apply | Esc: cancel | X: toggle mode | Cmd+Z: undo"

**When magic wand is active:** minimal toolbar, no sliders. Current threshold shown as read-only label.

**When brush is active:** size + opacity sliders appear. Selection pipeline bypassed.

## Undo & State Management

### Two undo contexts

**Pipeline undo (magic wand):**
- `undoStack: Array<{ mask: BinaryMask; mode: 'keep' | 'erase' }>` — committed selections stored for replay
- Cmd+Z pops last entry, restores mask canvas from `initialMaskRef`, replays remaining stack entries, regenerates tint
- Max depth: 20
- Persists across tool switches

**Brush undo (advanced):**
- Remove last Fabric path, replay remaining paths on mask from `initialMaskRef`
- Separate from pipeline stack

**Cmd+Z dispatch:** keyboard handler checks active tool. When brush is active, Cmd+Z does brush undo. When a selection tool is active, Cmd+Z does pipeline undo.

### Tool switching

- Pending selection (marching ants) auto-cancels on tool switch (same as Escape)
- Pipeline undo stack persists — Cmd+Z still undoes last committed selection

### Cross-tool undo constraint

Pipeline undo replays from `initialMaskRef` using only the pipeline's `undoStack`. Brush strokes write directly to the mask canvas and are not captured in the pipeline stack. To prevent cross-contamination: **switching from brush to a selection tool snapshots the current mask canvas as a new `initialMaskRef`**, effectively "baking in" any brush work. This means pipeline undo cannot undo past a brush→selection tool switch, which is acceptable since each tool has its own undo within its session.

## Integration Points

### What changes
- `MaskEditorModal.tsx` slimmed down: brush logic extracted, tool switching added, selection overlay canvas added
- New `mask-editor/` directory with tool modules
- New npm dependency: `magic-wand-tool`
- Third canvas element in modal DOM

### What stays the same
- Hidden mask canvas (offscreen) — authoritative mask source
- Red tint overlay on Fabric canvas — committed selections
- `applyMaskToAlpha()` export flow
- `proxyUrl()` for CORS
- PNG end-to-end constraint
- `onConfirm(refinedImageUrl, maskDataUrl)` callback to CanvasStep
- Fabric.js 7 origin fix (`originX/Y: 'left'/'top'`)
- CSS `transform: scale(fitScale)` for display fitting

### Initialization change
Current: load image -> build mask from alpha -> create tint -> setup brush
New: load image -> build mask from alpha -> create tint -> create selection overlay canvas -> initialize magic wand with image `ImageData` -> ready for clicks

## Dependencies

### New
- `magic-wand-tool` (npm, MIT) — flood fill, border tracing, Gaussian blur, mask concatenation

### Existing (unchanged)
- Fabric.js 7.2 — display canvas, brush tool, pen tool (post-MVP)
- Canvas2D API — mask canvas, selection overlay, pixel manipulation

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Enter | Commit pending selection |
| Escape | Cancel pending selection / cancel in-progress pen path |
| X | Toggle Keep/Erase mode |
| Cmd+Z (Ctrl+Z) | Undo last committed selection (pipeline) or last stroke (brush) |
| Shift+click | Add to pending selection |
| Alt+click | Subtract from pending selection |

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| `magic-wand-tool` unmaintained (5yr) | Algorithm is stable; no runtime deps; could vendor if needed |
| Real-time tolerance drag may lag on large images | `floodFill` operates within bounds; `gaussBlurOnlyBorder` only processes border pixels; profile and debounce if needed |
| Three stacked canvases may cause rendering issues | CSS stacking is proven pattern in this codebase (already using positioned overlays); z-index ordering explicit |
| Brush extraction may break existing undo | Brush undo is self-contained via Fabric path replay; isolated from pipeline stack |
