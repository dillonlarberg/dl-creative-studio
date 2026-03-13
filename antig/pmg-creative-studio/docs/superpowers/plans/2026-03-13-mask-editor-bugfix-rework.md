# Mask Editor Bugfix Rework — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four bugs in MaskEditorModal by replacing Fabric zoom-based display fitting with CSS scaling, fixing cleanup to prevent stale state, and removing all zoom/pan code.

**Architecture:** Single-file rework of `MaskEditorModal.tsx`. Fabric canvas created at natural image dimensions (`naturalWidth x naturalHeight`), CSS `transform: scale()` handles visual fitting. All module-level helpers, utilities, and CanvasStep integration remain unchanged.

**Tech Stack:** React 19, Fabric.js 7.2, Canvas API, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-13-mask-editor-bugfix-rework-design.md`

**Note:** No test framework is configured. Verification uses `npm run build` (TypeScript) and manual browser testing via `npm run dev`.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/components/edit-image/steps/MaskEditorModal.tsx` | Modify | Remove zoom/pan, fix canvas setup, fix cleanup |

No other files change.

---

## Chunk 1: MaskEditorModal Rework

### Task 1: Remove zoom/pan imports, constants, and callbacks

**Files:**
- Modify: `src/components/edit-image/steps/MaskEditorModal.tsx:1-2,20-21,259-287`

- [ ] **Step 1: Update imports — remove zoom icons**

Replace line 2:

```typescript
// BEFORE
import { XMarkIcon, MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon } from '@heroicons/react/24/outline';

// AFTER
import { XMarkIcon } from '@heroicons/react/24/outline';
```

- [ ] **Step 2: Remove zoom constants**

Delete lines 20-21:

```typescript
// DELETE these two lines
const MIN_ZOOM_FACTOR = 0.5;  // Allow zooming out to 50% of fit scale
const MAX_ZOOM = 4;
```

- [ ] **Step 3: Remove zoomTo and handleFitToView callbacks**

Delete the entire zoom helpers section (lines 259-287):

```typescript
// DELETE this entire block (lines 259-287)
  // ── Zoom helpers ────────────────────────────────────────────────────

  const zoomTo = useCallback((targetZoom: number, centerX?: number, centerY?: number) => {
    // ... entire function
  }, []);

  const handleFitToView = useCallback(() => {
    // ... entire function
  }, []);
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build will fail — `zoomTo`, `handleFitToView`, `zoomPercent`, `fitScaleRef`, `displayDimsRef`, `fabricModuleRef` still referenced. This is expected; we'll fix those references in subsequent tasks.

---

### Task 2: Replace refs and state for new canvas setup

**Files:**
- Modify: `src/components/edit-image/steps/MaskEditorModal.tsx:236-257`

- [ ] **Step 1: Remove old refs, add displayDims state**

Replace the refs/state section (lines 236-257) with:

```typescript
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<any>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const initialMaskRef = useRef<ImageData | null>(null);
  const cursorRef = useRef<any>(null);
  const currentBrushModeRef = useRef<BrushMode>('erase');

  const [brushMode, setBrushMode] = useState<BrushMode>('erase');
  const [brushSize, setBrushSize] = useState(20);
  const [brushOpacity, setBrushOpacity] = useState(100);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [canApply, setCanApply] = useState(true);

  // Display dimensions for CSS wrapper — computed during init, drives JSX layout.
  // Includes natural dimensions (w, h) so JSX can size the inner CSS wrapper
  // without reading a ref (ref updates don't trigger re-renders).
  const [displayDims, setDisplayDims] = useState({
    w: 0,
    h: 0,
    fitScale: 1,
    displayW: MAX_DISPLAY_WIDTH,
    displayH: MAX_DISPLAY_HEIGHT,
  });

  // Also stored in a ref for use by undo replay and mask operations
  // (which run outside the render cycle and need synchronous access)
  const imageDimsRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
```

What was removed:
- `fabricModuleRef` — no longer needed (zoom used `fabric.Point`)
- `fitScaleRef` — replaced by `displayDims.fitScale` state
- `displayDimsRef` — replaced by `displayDims` state
- `zoomPercent` state — zoom UI removed

What was added:
- `displayDims` state — `{ w, h, fitScale, displayW, displayH }` for CSS wrapper (includes natural dims so JSX avoids reading refs)

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Still fails (init effect and JSX still reference removed items). Progressing.

---

### Task 3: Rewrite the init effect

**Files:**
- Modify: `src/components/edit-image/steps/MaskEditorModal.tsx:289-423`

This is the core fix. The init effect changes from "canvas at display dims + Fabric zoom" to "canvas at natural dims + CSS scaling via state".

- [ ] **Step 1: Replace the entire init effect**

Replace lines 289-423 (the `// ── Init effect` section through the cleanup return) with:

```typescript
  // ── Init effect ───────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    let tintBlobUrl = '';

    const init = async () => {
      try {
        const origImg = await loadImg(proxyUrl(originalImageUrl), true);
        if (cancelled) return;

        const w = origImg.naturalWidth;
        const h = origImg.naturalHeight;
        imageDimsRef.current = { w, h };

        // Compute display dimensions for CSS wrapper
        const fitScale = Math.min(MAX_DISPLAY_WIDTH / w, MAX_DISPLAY_HEIGHT / h, 1);
        const displayW = Math.round(w * fitScale);
        const displayH = Math.round(h * fitScale);
        setDisplayDims({ w, h, fitScale, displayW, displayH });

        // Build mask canvas + tint
        let maskCanvas: HTMLCanvasElement;
        if (savedMaskDataUrl) {
          const maskImg = await loadImg(savedMaskDataUrl);
          if (cancelled) return;
          ({ maskCanvas, tintBlobUrl } = await buildMaskFromSaved(maskImg, w, h));
        } else {
          const extractedImg = await loadImg(proxyUrl(extractedImageUrl), true);
          if (cancelled) return;
          ({ maskCanvas, tintBlobUrl } = await buildMaskFromAlpha(extractedImg, w, h));
        }

        maskCanvasRef.current = maskCanvas;
        const maskCtx = maskCanvas.getContext('2d')!;
        initialMaskRef.current = maskCtx.getImageData(0, 0, w, h);

        // Defer Fabric creation to next frame so DOM has reflowed
        // with the new displayDims (CSS wrapper sized correctly).
        // NOTE: requestAnimationFrame is not guaranteed to run after React 19's
        // concurrent commit. If Fabric's Canvas constructor reads incorrect
        // container dimensions on init, the fallback is to split Fabric creation
        // into a separate useEffect gated on displayDims state.
        await new Promise((resolve) => requestAnimationFrame(resolve));
        if (cancelled || !displayCanvasRef.current) return;

        // Initialize Fabric.js — canvas at NATURAL dimensions, no zoom
        const fabric = await import('fabric');
        if (cancelled || !displayCanvasRef.current) return;

        const canvas = new fabric.Canvas(displayCanvasRef.current, {
          isDrawingMode: true,
          width: w,
          height: h,
          selection: false,
        });
        fabricRef.current = canvas;

        // Layer 1: Original image as background (natural size)
        const bgFabric = new fabric.FabricImage(origImg);
        canvas.backgroundImage = bgFabric;

        // Layer 2: Red tint overlay (natural size, positioned at origin)
        const tintImg = await loadImg(tintBlobUrl);
        if (cancelled) return;
        const tintFabric = new fabric.FabricImage(tintImg);
        tintFabric.set({ selectable: false, evented: false });
        canvas.add(tintFabric);

        // Configure brush
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
        canvas.freeDrawingBrush.width = brushSize;
        updateBrush(canvas, 'erase', brushSize, brushOpacity);

        // Brush cursor
        const cursor = setupBrushCursor(canvas, fabric);
        cursorRef.current = cursor;
        updateBrushCursor(cursor, 'erase', brushSize);

        // Stroke mirroring: path:created → tag + mirror to mask canvas
        canvas.on('path:created', (e: any) => {
          const path = e.path;
          if (!path || !maskCanvasRef.current) return;

          path.data = { maskMode: currentBrushModeRef.current };

          const mc = maskCanvasRef.current;
          if (mc.width !== w || mc.height !== h) {
            console.error('Mask canvas dimension mismatch — disabling Apply');
            setCanApply(false);
            return;
          }

          mirrorPathToMask(path, mc);
        });

        canvas.renderAll();
        setIsLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to initialize editor');
          setIsLoading(false);
        }
      }
    };

    init();

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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
```

Key changes from current code:
- `width: w, height: h` instead of `width: displayW, height: displayH` — canvas at natural dimensions
- `setDisplayDims(...)` instead of storing in refs — makes values available to JSX
- `requestAnimationFrame` wait between `setDisplayDims` and Fabric creation — ensures DOM reflow
- No `canvas.setZoom(fitScale)` — CSS handles scaling
- No `fabricModuleRef.current = fabric` — not needed
- No `mouse:wheel` handler — zoom removed
- Cleanup nulls all refs (`fabricRef.current = null`, `maskCanvasRef.current = null`, etc.)

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Still fails — JSX still references `zoomPercent`, zoom buttons, etc. Next task fixes JSX.

---

### Task 4: Update keyboard shortcuts effect

**Files:**
- Modify: `src/components/edit-image/steps/MaskEditorModal.tsx:435-453`

- [ ] **Step 1: Remove Cmd+0 shortcut and handleFitToView dependency**

Replace the keyboard shortcuts effect with:

```typescript
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'x' || e.key === 'X') {
        setBrushMode(prev => prev === 'keep' ? 'erase' : 'keep');
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
```

Removed:
- `Cmd+0` / `Ctrl+0` handler (was `handleFitToView()`)
- `handleFitToView` from dependency array

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Still fails — JSX references remain. Next task.

---

### Task 5: Rewrite JSX — CSS wrapper and remove zoom UI

**Files:**
- Modify: `src/components/edit-image/steps/MaskEditorModal.tsx:499-641` (the render/return block)

- [ ] **Step 1: Replace the entire return JSX**

Replace the return block (from `return (` to the closing `);`) with:

```tsx
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-[880px] w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">
            Refine Selection
          </h3>
          <button
            onClick={onCancel}
            className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-4 px-6 py-3 bg-gray-50 border-b border-gray-100 flex-wrap">
          {/* Brush mode toggle */}
          <div className="flex p-1 bg-gray-200 rounded-xl">
            {(['keep', 'erase'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setBrushMode(mode)}
                className={cn(
                  'px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all',
                  brushMode === mode
                    ? mode === 'keep'
                      ? 'bg-green-500 text-white shadow-sm'
                      : 'bg-red-500 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700',
                )}
              >
                {mode === 'keep' ? 'Keep' : 'Erase'}
              </button>
            ))}
          </div>

          {/* Brush size */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Size</span>
            <input
              type="range"
              min={5}
              max={80}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="w-24 accent-blue-600"
            />
            <span className="text-[9px] font-bold text-gray-400 w-6 text-right">{brushSize}</span>
          </div>

          {/* Brush opacity */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Opacity</span>
            <input
              type="range"
              min={1}
              max={100}
              value={brushOpacity}
              onChange={(e) => setBrushOpacity(Number(e.target.value))}
              className="w-24 accent-blue-600"
            />
            <span className="text-[9px] font-bold text-gray-400 w-8 text-right">{brushOpacity}%</span>
          </div>

          {/* Keyboard hints */}
          <div className="ml-auto flex items-center gap-2 text-[8px] text-gray-400 font-bold uppercase tracking-widest">
            <span>X: toggle</span>
            <span>⌘Z: undo</span>
          </div>
        </div>

        {/* Canvas area — CSS transform handles scaling, Fabric at natural dimensions */}
        <div className="flex items-center justify-center p-6 bg-gray-100 overflow-hidden"
             style={{ minHeight: '400px' }}>
          {isLoading && !error && (
            <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest animate-pulse">
              Loading editor...
            </p>
          )}
          {error && !isLoading && (
            <div className="text-center space-y-2">
              <p className="text-[10px] font-bold text-red-500">{error}</p>
              <p className="text-[9px] text-gray-400">Check network connection and try again</p>
            </div>
          )}
          {/* Outer div: sized to display dimensions. Inner div: CSS-scales from natural to display. */}
          <div
            style={{
              width: displayDims.displayW,
              height: displayDims.displayH,
              overflow: 'hidden',
            }}
            className={cn(isLoading && 'hidden')}
          >
            <div
              style={{
                transform: `scale(${displayDims.fitScale})`,
                transformOrigin: 'top left',
                width: displayDims.w || undefined,
                height: displayDims.h || undefined,
              }}
            >
              <canvas
                ref={displayCanvasRef}
                className="rounded-xl shadow-sm"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onCancel}
            className="rounded-xl border border-gray-200 px-6 py-2.5 text-[10px] font-black text-gray-500 uppercase tracking-widest hover:border-gray-300 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isApplying || !canApply}
            className="rounded-xl bg-blue-600 px-6 py-2.5 text-[10px] font-black text-white uppercase tracking-widest hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20 disabled:opacity-40"
          >
            {isApplying ? 'Applying...' : 'Apply Refinement'}
          </button>
        </div>
      </div>
    </div>
  );
```

Key changes:
- **Zoom controls removed** — entire `{/* Zoom controls */}` div deleted from toolbar
- **Keyboard hints simplified** — removed "Scroll: zoom"
- **CSS wrapper added** — outer div at `displayDims.displayW x displayDims.displayH`, inner div with `transform: scale(displayDims.fitScale)` and `transformOrigin: top left`
- **Canvas comment updated** — "CSS transform handles scaling" instead of "Fabric handles zoom"

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: **Clean build.** All removed references (`zoomPercent`, `zoomTo`, `handleFitToView`, `fitScaleRef`, `displayDimsRef`, `fabricModuleRef`, `MIN_ZOOM_FACTOR`, `MAX_ZOOM`) are gone. All new references (`displayDims`, `imageDimsRef`) are defined.

If build fails, check for any remaining references to removed symbols and delete them.

---

### Task 6: Manual testing — pointer accuracy checkpoint

**Files:** None (browser testing only)

This is the **first test checkpoint** per the spec. If pointer accuracy fails, see the fallback chain in the spec (Section: Risk: Brush Cursor Coordinate Mapping). **Timebox: 1–2 hours** for fallbacks.

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Navigate to mask editor**

1. Go to edit-image use case
2. Select an image
3. Choose "Extract Background"
4. Wait for extraction to complete
5. Click the "Edit" button (pencil icon, top-right of canvas)

- [ ] **Step 3: Verify image fills the canvas (Bug 1 & 2 fix)**

Expected:
- The original image fills the modal canvas area proportionally
- No part of the image is cut off or offset
- The image is NOT tiny in the top-left corner

- [ ] **Step 4: Verify red tint overlay (Bug 4 fix)**

Expected:
- Red tint is visible over removed background areas
- Subject/foreground area is clear (no red tint)
- Tint aligns perfectly with the image (no offset)

- [ ] **Step 5: Verify pointer accuracy (cursor risk)**

Expected:
- Move the mouse over the canvas — the brush cursor circle follows accurately
- Paint a stroke — the stroke lands where the cursor was, not offset
- If cursor lags/leads the stroke, try fallbacks in order:
  1. Replace `getScenePoint` with `getViewportPoint` in `setupBrushCursor`
  2. Replace with manual `(e.offsetX / fitScale, e.offsetY / fitScale)` — need to pass fitScale to setupBrushCursor
  3. Replace with `canvas.getPointer(e.e, true)`
- Document which method works

- [ ] **Step 6: Verify no stale strokes (Bug 3 fix)**

1. Paint several strokes in the mask editor
2. Click "Cancel" to close the modal
3. Reopen the mask editor
Expected: Canvas is clean — no strokes from the previous session

- [ ] **Step 7: Verify brush controls**

1. Toggle Keep/Erase (click buttons and press X) — cursor color changes (green/red)
2. Drag Size slider — cursor circle resizes
3. Drag Opacity slider — stroke transparency changes
4. Press Cmd+Z — last stroke is undone

---

### Task 7: Manual testing — full flow

**Files:** None (browser testing only)

- [ ] **Step 1: Test apply refinement**

1. Paint some strokes (keep an area, erase an area)
2. Click "Apply Refinement"
Expected:
- Modal closes
- Canvas step shows the refined foreground
- Checkerboard background reflects updated transparency

- [ ] **Step 2: Test re-edit (mask persistence)**

1. After applying refinement, click "Edit" again
2. Modal should load with the previous mask state (red tint matches last refinement, not the original API extraction)
3. Paint additional strokes, apply again — cumulative refinement

- [ ] **Step 3: Test full pipeline**

1. After mask refinement, proceed to New Background step
2. Select or upload a background
3. Go to Preview — composite should show refined foreground on new background
4. Go to Save — download works, PNG has correct transparency

---

### Task 8: Commit

**Files:**
- Modified: `src/components/edit-image/steps/MaskEditorModal.tsx`

- [ ] **Step 1: Commit the rework**

```bash
git add src/components/edit-image/steps/MaskEditorModal.tsx
git commit -m "fix: rework MaskEditorModal canvas setup — CSS scaling replaces Fabric zoom

Fixes 4 bugs:
- Image positioning: canvas now at natural dimensions, CSS transform scales to fit
- Zoom misalignment: removed all zoom/pan code
- Stale strokes: all refs nulled on cleanup
- Missing mask edges: tint overlay now positioned correctly at natural dimensions

Removed ~50 lines of zoom/pan code (zoomTo, handleFitToView, mouse:wheel,
zoom buttons, Cmd+0 shortcut, MIN_ZOOM_FACTOR, MAX_ZOOM constants).

Added CSS wrapper with displayDims state for visual fitting.
Cursor coordinate method: getScenePoint (or document fallback if changed)."
```

---

## Execution Order

Tasks 1–5 are sequential code changes (each builds on the previous). Task 5 produces a clean build. Tasks 6–7 are manual browser testing. Task 8 is the commit.

The build will be broken during Tasks 1–4 — this is expected and intentional. Each task removes one category of zoom/pan code. Task 5 (JSX rewrite) is where all the references resolve and the build goes green.

## Verification Checklist

After all tasks:

- [ ] `npm run build` passes cleanly
- [ ] Image fills the modal canvas (not tiny/offset)
- [ ] Red tint visible over removed areas
- [ ] Brush cursor tracks the mouse accurately
- [ ] No stale strokes on reopen
- [ ] Keep/Erase brushes work with size and opacity
- [ ] X toggles mode, Cmd+Z undoes
- [ ] Apply Refinement produces correct foreground
- [ ] Re-edit restores previous mask state
- [ ] Full pipeline works through to download
