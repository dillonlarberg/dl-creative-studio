# Canvas Layer — Implementation Plan

**Date:** 2026-06-22
**Author:** Principal Eng (generated)
**Spec:** `docs/superpowers/specs/2026-06-22-canvas-layer-design.md`
**Branch:** `feat/canvas-layer` (cut from `dev`)
**Estimated total:** ~3–4 days (2 engineers or 1 focused sprint)

---

## Branch Setup (before any task)

```bash
git pull origin dev
git checkout -b feat/canvas-layer
```

---

## Phase 1 — Foundation

### Task 1 — Install Konva dependencies
**Complexity:** S  
**Files:** `package.json`

```bash
npm install konva react-konva nanoid
```

- Verify `konva` and `react-konva` resolve to compatible versions (react-konva v18+ for React 18).
- Verify `nanoid` resolves (already likely a transitive dep — confirm it is importable as a named export).

**Acceptance:** `import { nanoid } from 'nanoid'` and `import { Stage } from 'react-konva'` compile without TS errors.

---

### Task 2 — Move `ZoneBound` into `types.ts`; add `CustomZone`, `zoneOverrides`, `customZones`, `zoneAssets`
**Complexity:** S  
**Files:** `src/apps/template-builder/types.ts`  
**Risk:** `ZoneBound` is currently exported from `CanvasOverlay.tsx`. Any file importing it from there (confirmed: `DesignStep.tsx` line 14) must be updated. Fix the import in DesignStep now to avoid a cascading break when `CanvasOverlay.tsx` is deleted later.

What to do:
1. Add to `types.ts`:
   - `ZoneBound` interface (move from `CanvasOverlay.tsx`, identical shape)
   - `CustomZone` discriminated union (image | text, with `id`, `x`, `y`, `w`, `h`, `fieldId?`)
   - `zoneOverrides?: Record<string, ZoneBound>` field on `TemplateBuilderStepData`
   - `customZones?: CustomZone[]` field on `TemplateBuilderStepData`
   - `zoneAssets?: Record<string, string>` field on `TemplateBuilderStepData`
2. Update `DesignStep.tsx` line 14: change import source from `'../_internal/CanvasOverlay'` to `'../types'`.
3. Keep `ZoneBound` re-exported from `CanvasOverlay.tsx` temporarily (for safety during transition) — add `export type { ZoneBound } from '../types';` to `CanvasOverlay.tsx`. Remove the local interface definition there.

**Acceptance:**
- TypeScript compiles with no errors.
- `TemplateBuilderStepData` has `zoneOverrides`, `customZones`, `zoneAssets` as optional fields.
- `CustomZone` discriminated union: `{ type: 'image'; assetUrl?: string; textContent?: never }` vs `{ type: 'text'; textContent?: string; assetUrl?: never }`.
- `DesignStep.tsx` imports `ZoneBound` from `'../types'`, not from `CanvasOverlay`.

---

### Task 3 — Create `canvasCoords.ts` with scale math and `MIN_ZONE_PX`
**Complexity:** S  
**Files:** `src/apps/template-builder/_internal/canvas-layer/canvasCoords.ts`

```
mkdir -p src/apps/template-builder/_internal/canvas-layer/
```

Implement:
- `toDisplay(nativeCoord: number, adSize: number, displaySize: number): number`
- `toNative(displayCoord: number, adSize: number, displaySize: number): number`
- `clampNative(val: number, adSize: number): number` — clamps to `[0, adSize]`
- `export const MIN_ZONE_PX = 16`
- Zero-denominator guards: if `adSize === 0` or `displaySize === 0`, return `0` (no NaN/Infinity).

**Acceptance:** File exists, exports all four symbols, no divide-by-zero at runtime.

---

### Task 4 — Create `canvasCoords.test.ts` with all 7 required cases
**Complexity:** S  
**Files:** `src/apps/template-builder/_internal/canvas-layer/canvasCoords.test.ts`

Required cases (from spec):
1. Round-trip: `toDisplay(toNative(x, adSize, displaySize), adSize, displaySize) === x`
2. `toDisplay(adSize, adSize, displaySize) === displaySize` (Stage placement assertion)
3. `adSize = 0` → returns `0`, no throw
4. `displaySize = 0` → returns `0`, no NaN propagation
5. Negative coord input → `clampNative` returns `0`
6. `coord > adSize` → `clampNative` clamps to `adSize`
7. `displaySize > adSize` (upscaling) → scale factor > 1, correct direction

**Acceptance:** `npm test -- canvasCoords` passes all 7 cases.

---

## Phase 2 — Konva Canvas Layer

### Task 5 — Create `ZoneRect.tsx` (single zone Rect + Transformer)
**Complexity:** M  
**Files:** `src/apps/template-builder/_internal/canvas-layer/ZoneRect.tsx`  
**Risk (Transformer scale-baking):** On `transformend`, Konva stores scale in `scaleX`/`scaleY`, not `width`/`height`. Must bake scale before calling `onZoneResize`. Missing this step is the most common Konva bug.

Props:
```ts
interface ZoneRectProps {
  id: string;
  x: number;         // display coords (already scaled by caller)
  y: number;
  w: number;
  h: number;
  isSelected: boolean;
  isWireframe: boolean;   // wireframe zones show different color; cannot be deleted
  adSize: number;
  displaySize: number;
  onSelect: () => void;
  onMove: (bounds: ZoneBound) => void;
  onResize: (bounds: ZoneBound) => void;
}
```

Implement:
- Konva `<Rect>` at display coords, blue border when selected.
- `<Transformer>` attached when `isSelected`.
- On `dragend`: call `toNative` on final position, then `clampNative`, then `onMove`.
- On `transformend`: bake scale (`w = node.width() * node.scaleX()`; `node.scaleX(1)`; same for Y), then `toNative`, then `clampNative`, then `onResize`.
- No React state for drag position — let Konva manage internally during drag.
- Fire `onMove`/`onResize` on end events only (not on `dragmove`/`transform`).

**Acceptance:**
- Drag a zone: `onMove` called once with adSize coords.
- Resize: `onResize` called once with scale-baked adSize coords.
- No React state updates during active drag.

---

### Task 6 — Create `useCanvasLayer.ts` (selection, lasso, placement mode)
**Complexity:** M  
**Files:** `src/apps/template-builder/_internal/canvas-layer/useCanvasLayer.ts`

State owned:
- `selectedIds: Set<string>` — multi-select set
- `lassoRect: { x: number; y: number; w: number; h: number } | null`
- `placementMode: 'image' | 'text' | null`
- `placementRect: { x: number; y: number; w: number; h: number } | null`

Key behaviors:
- Lasso: any-overlap model. Zero matches clears `selectedIds`. Comment: `// Lasso: any-overlap model (single pixel). Zero matches clears selection.`
- Selection sync rule: call `onZoneSelect(id)` only when `selectedIds.size === 1`. Call `onZoneSelect(null)` for multi-select or lasso.
- Placement mode draw: track mousedown → mousemove → mouseup on Stage. On mouseup: if `Math.min(w, h) < MIN_ZONE_PX`, discard, stay in placement mode.
- Multi-select drag delta: on dragstart record initial bounds per zone; on dragend apply uniform `(dx, dy)` delta to all.
- Keyboard: `Delete`/`Backspace` → delete custom zone(s); no-op on wireframe zones. `Escape` → cancel placement or deselect all.
- `pendingDisplaySize` ref updated synchronously in `ResizeObserver` callback (not React state) to avoid stale-displaySize race.
- All async effects use cleanup flags: `let cancelled = false; return () => { cancelled = true; }`.

**Acceptance:**
- `placementMode`, `selectedIds`, `lassoRect`, `placementRect` are only in this hook.
- No Konva imports in this file (pure state logic).
- Cleanup flags present in all `useEffect` calls.

---

### Task 7 — Create `NewZoneToolbar.tsx`
**Complexity:** S  
**Files:** `src/apps/template-builder/_internal/canvas-layer/NewZoneToolbar.tsx`

Props:
```ts
interface NewZoneToolbarProps {
  placementMode: 'image' | 'text' | null;
  onEnterPlacementMode: (mode: 'image' | 'text') => void;
  onCancelPlacementMode: () => void;
}
```

Renders two buttons: `+ Image Zone` and `+ Text Zone`. Active mode button shows pressed state. Clicking the active button again cancels placement mode.

**Acceptance:** Buttons toggle `placementMode` correctly. No Konva imports.

---

### Task 8 — Create `ZoneContentBadge.tsx` (URL input dialog trigger)
**Complexity:** S  
**Files:** `src/apps/template-builder/_internal/ZoneContentBadge.tsx`

Props:
```ts
interface ZoneContentBadgeProps {
  zoneId: string;
  isWireframe: boolean;
  onUrlSubmit: (zoneId: string, url: string) => void;
}
```

Renders a small image-icon badge in the zone's corner. On click: shows a URL input dialog (inline popover or browser `prompt` for v1). On URL submitted with a non-empty string: calls `onUrlSubmit`. On cancel or empty: discards, no callback.

**Acceptance:** Non-empty URL submission calls `onUrlSubmit`. Empty/cancel does not. Cancel path (Escape, backdrop click, close button) uses the same cleanup as the no-asset path.

---

### Task 9 — Create `CanvasLayer.tsx` (Konva Stage orchestrator)
**Complexity:** L  
**Files:** `src/apps/template-builder/_internal/CanvasLayer.tsx`  
**Risk (StrictMode mount guard):** Konva throws `'container is required for Stage'` if initialized before container div is in DOM. React StrictMode double-invokes effects. Guard with `if (!containerRef.current) return` in `useEffect` and call `stage.destroy()` on cleanup.  
**Risk (pointer events):** Stage blocks iframe slot-click when `activeSlotField !== null`. Apply `style={{ pointerEvents: 'none' }}` on Stage when this is true.  
**Risk (Stage placement):** Stage must overlay the `position: relative` inner wrapper div (width/height = `displaySize`), NOT the full-size iframe.

Props: (canonical `CanvasLayerProps` from spec, see above)

Implement:
- Position: `position: absolute; top: 0; left: 0; zIndex: 10` inside the wrapper div.
- Konva `<Stage width={displaySize} height={displaySize}>` — do NOT set `pixelRatio` manually.
- One `<Layer>` containing all `<ZoneRect>` instances.
- Merge `zoneBounds` + `zoneOverrides` before rendering: for each `slotId` in `zoneBounds`, if `zoneOverrides[slotId]` exists, use override coords; else use `zoneBounds` coords. Convert to display coords with `toDisplay()`.
- Render `customZones` as additional `<ZoneRect>` instances using their stored adSize coords converted to display.
- Lasso rubber-band: draw a `<Rect>` on the Stage during lasso drag (dashed blue stroke, no fill).
- `NewZoneToolbar` rendered above the Stage container (not inside Konva Layer).
- Placement mode: render a ghost `<Rect>` while drawing.
- `onZoneSelect` called per selection sync rule from `useCanvasLayer`.
- `onResizeDetected`: wire ResizeObserver on the container div; use `pendingDisplaySize` ref.
- Guard: if `!adSize || !displaySize` return null.

**Acceptance:**
- No Konva imports anywhere except this file and `ZoneRect.tsx`.
- Stage overlays wrapper div at correct `displaySize`.
- `pointerEvents: 'none'` toggled correctly when `activeSlotField !== null`.

---

## Phase 3 — DesignStep Refactor

> All tasks in Phase 3 depend on Phase 1 (types) and Phase 2 (CanvasLayer). Do Phases 1-2 first, then Phase 3 tasks can be done in parallel on separate branches or sequentially.

### Task 10 — Extract `CandidateSelector.tsx`
**Complexity:** S  
**Files:** `src/apps/template-builder/_internal/CandidateSelector.tsx`  
**Source:** DesignStep.tsx lines 322–413 (~92 lines)

Define props interface before extracting. Move the JSX block that renders the candidate wireframe grid/picker into this component. Pass all needed values as props.

**Acceptance:** `DesignStep.tsx` renders `<CandidateSelector ... />` where the block was. No behavior change.

---

### Task 11 — Extract `FieldMappingPanel.tsx`
**Complexity:** L  
**Files:** `src/apps/template-builder/_internal/FieldMappingPanel.tsx`  
**Source:** DesignStep left-panel content (~870 lines — field rows, slot pickers, Add Field flow, full-form brand overrides block)

Define `FieldMappingPanelProps` interface first (from spec). Callbacks replace direct state setters. Remove the full-form collapsible brand-overrides block from this panel (canonical brand override moves to PreviewPanel). Fix `backgroundColor` default: use `#ffffff` consistently (remove the `#2563eb` default from the left panel block).

Async effects within this panel must use cleanup flags.

**Acceptance:**
- DesignStep left panel renders `<FieldMappingPanel ... />`.
- Full-form brand overrides block is gone from left panel.
- `DesignStep.tsx` no longer contains field row JSX.
- `askAlliOpen` state remains in DesignStep (not lifted into FieldMappingPanel).

---

### Task 12 — Extract `PreviewPanel.tsx`
**Complexity:** M  
**Files:** `src/apps/template-builder/_internal/PreviewPanel.tsx`  
**Source:** DesignStep right-panel content (~320 lines)

Define `PreviewPanelProps` interface (from spec). This panel owns:
- `FilledTemplatePreview` wrapper div (the `position: relative; width: previewBaseSize; height: previewBaseSize` div at line 1347)
- `<CanvasLayer>` inside that wrapper div (replaces `<CanvasOverlay>`)
- Feed row navigator
- Compact brand overrides block (canonical version; `backgroundColor` default = `#ffffff`)
- Ratio toggle
- AskAlliPanel container
- Header row (Live Mapped Preview label, Brand Kit button, Ask Alli button)

**Critical:** `askAlliOpen` must NOT be moved into `PreviewPanel` — it stays in DesignStep because it drives `previewBaseSize` at line 258. Pass `askAlliOpen` and `onAskAlliToggle` as props.

**Acceptance:**
- DesignStep right panel renders `<PreviewPanel ... />`.
- `askAlliOpen` state is in DesignStep.
- `previewBaseSize` calculation at DesignStep line 258 (`askAlliOpen ? 280 : 360`) unchanged.
- `<CanvasLayer>` is inside the inner wrapper div (position: relative, width = displaySize).

---

### Task 13 — Wire DesignStep mutation handlers + slim to ~400 lines
**Complexity:** M  
**Files:** `src/apps/template-builder/steps/DesignStep.tsx`

Add the four mutation callbacks (using exact handler bodies from spec):
- `onZoneMove` → `mergeStepData({ zoneOverrides: { ...stepData.zoneOverrides, [id]: bounds } })`
- `onZoneResize` → same pattern
- `onZoneCreate` → generate id with `nanoid(6)` here (not in CanvasLayer), push to `customZones`
- `onZoneReset` → use `delete next[id]` (NEVER assign `undefined`)
- `onZoneDelete` → filter `customZones`

Also add `zoneAssets` mutation for image zone fills.

After extraction of Tasks 10–12, DesignStep should be ~400 lines. Remove all extracted JSX from DesignStep body.

**Acceptance:**
- DesignStep renders `<CandidateSelector>` + `<FieldMappingPanel>` + `<PreviewPanel>`.
- No Konva imports in DesignStep.
- No field-row JSX in DesignStep.
- `nanoid` import present in DesignStep (for `onZoneCreate`).
- `onZoneReset` uses `delete`, not `undefined` assignment.

---

## Phase 4 — Inject Pipeline Extension

### Task 14 — Extend `InjectOptions` + implement `layoutOverrides` in `injectIntoHtml.ts`
**Complexity:** M  
**Files:** `src/apps/template-builder/_internal/injectIntoHtml.ts`  
**Risk:** Adding a 4th positional parameter would break every existing call site. Add `layoutOverrides` and `zoneAssets` as optional fields inside `InjectOptions` — zero call-site changes required.  
**Risk (`position: relative` guard):** Do not force `position: absolute` on elements that use `position: relative`. Check computed style; emit `console.warn` and skip.

Add to `InjectOptions`:
```ts
layoutOverrides?: {
  zoneOverrides?: Record<string, ZoneBound>;
  customZones?: CustomZone[];
};
zoneAssets?: Record<string, string>; // slotId → assetUrl
```

Implement in `injectIntoHtml`:

1. **`zoneOverrides`:** For each `slotId`, find element by ID. Check `el.style.position` (or computed style in DOMParser context). If `relative`, `console.warn` and skip. Otherwise: `el.style.position = 'absolute'; el.style.left = ...; el.style.top = ...; el.style.width = ...; el.style.height = ...`. All values are adSize (native) coords — add comment per spec.

2. **`customZones`:** For each zone, append new element before `</body>`: `<div>` for text, `<img>` for image. Set `id`, `data-canvas-custom="true"`, and `position: absolute; left: Xpx; top: Ypx; width: Wpx; height: Hpx` (adSize coords).

3. **`zoneAssets`:** For each `slotId → assetUrl`, find element by ID. If `<img>`: set `src`. If `<div>`: set `style.backgroundImage`. Independent of `injections` pipeline.

Add comment near layoutOverrides block:
```ts
// CSS values here are adSize (native) coords — the iframe renders at adSize resolution.
// Do NOT use displaySize coords here.
```

**Acceptance:**
- All existing call sites compile unchanged.
- `layoutOverrides: undefined` path leaves document unchanged.
- `position: relative` element logs warn, element untouched.

---

### Task 15 — Pass `layoutOverrides` + `zoneAssets` through to `FilledTemplatePreview` / preview call site
**Complexity:** S  
**Files:** `src/apps/template-builder/_internal/FilledTemplatePreview.tsx`, `PreviewPanel.tsx`

Confirm where `injectIntoHtml` is called in `FilledTemplatePreview.tsx`. Add `layoutOverrides` and `zoneAssets` to its props and pass them through.

**Acceptance:**
- After drag/resize in the canvas, the filled preview HTML reflects the new position.
- After creating a custom zone with an image URL, the preview shows the image at the drawn position.

---

## Phase 5 — Asset House Integration (zoneAssets write path)

### Task 16 — Wire `ZoneContentBadge` into `CanvasLayer` + `zoneAssets` write path
**Complexity:** S  
**Files:** `src/apps/template-builder/_internal/CanvasLayer.tsx`, `DesignStep.tsx` (or `PreviewPanel.tsx`)

On selected image zone (wireframe or custom): render `<ZoneContentBadge>` overlaid on the zone.

On URL submission callback:
- Custom zone: update `customZones[n].assetUrl` via `mergeStepData`.
- Wireframe zone: write `zoneAssets[slotId] = assetUrl` via `mergeStepData` (NOT `staticValues`).

**Acceptance:**
- Submitting a URL for a wireframe zone writes to `zoneAssets`, not `staticValues`.
- Submitting a URL for a custom zone updates that zone's `assetUrl`.
- Blank/cancel does not write anything.

---

## Phase 6 — Tests + QA

### Task 17 — Add `injectIntoHtml.test.ts` layoutOverrides describe block (8 cases)
**Complexity:** S  
**Files:** `src/apps/template-builder/_internal/injectIntoHtml.test.ts`

Add describe block `'injectIntoHtml — layoutOverrides'` with these 8 cases (from spec):
1. `zoneOverrides` applies `position/left/top/width/height` to an absolute-positioned element
2. `zoneOverrides` silently skips unknown slotId (no error, document unchanged)
3. `zoneOverrides` does NOT apply to a `position:relative` element (logs warn, element style unchanged)
4. `customZones` appends element with correct `id`, correct adSize position, `data-canvas-custom="true"`
5. `zoneOverrides` and `customZones` together — both applied in one pass
6. `layoutOverrides: undefined` — document unchanged (regression guard)
7. `zoneAssets` sets `<img>` `src` by element ID
8. `zoneAssets` does not affect `staticValues` / `injections` pipeline

All cases testable with `DOMParser` — no browser canvas required.

**Acceptance:** `npm test -- injectIntoHtml` passes all 8 new cases + all existing cases.

---

### Task 18 — Add `FieldMappingPanel.test.tsx` unit tests
**Complexity:** S  
**Files:** `src/apps/template-builder/_internal/FieldMappingPanel.test.tsx`

Cover: field row rendering, slot picker render, Add Field flow trigger. Mock design system components. 3–5 cases minimum.

**Acceptance:** Tests pass. No snapshot tests (brittle for UI components).

---

### Task 19 — Delete `CanvasOverlay.tsx` after `CanvasLayer` is verified
**Complexity:** S  
**Files:** `src/apps/template-builder/_internal/CanvasOverlay.tsx`

**BLOCKER:** Do NOT delete until:
- `CanvasLayer` is wired into `PreviewPanel` and confirmed working in the browser.
- All imports of `ZoneBound` have been migrated to `types.ts` (Task 2).
- No file imports from `CanvasOverlay.tsx` (verify with `grep -r "CanvasOverlay" src/apps/template-builder/`).

Delete the file. Remove the re-export shim added in Task 2.

**Acceptance:**
- `grep -r "CanvasOverlay" src/` returns 0 results.
- TypeScript compiles with no errors.

---

### Task 20 — Manual QA Checklist (from spec)
**Complexity:** M  
**Files:** none (QA only)

Test at minimum two wireframe sizes: `adSize = 1080` and `adSize = 603`.

Run every item in the Manual QA Checklist from the spec:
- [ ] Drag zone → `zoneOverrides` stored in adSize coords
- [ ] Resize with Transformer → scale-baked dimensions in adSize coords
- [ ] Inject HTML after drag → preview reflects updated position
- [ ] Add image zone (draw rect → submit URL) → correct position
- [ ] Add image zone with click-only → "Zone too small" tooltip, no zone created
- [ ] Add text zone → field panel row appears immediately
- [ ] Shift+click multi-select → `FieldMappingPanel` row highlight clears
- [ ] Lasso zero matches → prior selection cleared
- [ ] Lasso over multiple zones → all overlapping selected
- [ ] Cancel placement with Escape → `placementMode` cleared
- [ ] Cancel URL dialog → no zone created, canvas rect discarded
- [ ] Delete on custom zone → zone removed
- [ ] Delete on wireframe zone → no-op, tooltip shown
- [ ] Resize browser window → zones at correct positions, no stale `displaySize`
- [ ] Retina display → no coordinate doubling
- [ ] Reset zone → key fully removed from `zoneOverrides` (not `undefined`)
- [ ] `askAlliOpen = true` → `previewBaseSize` still 280
- [ ] `activeSlotField !== null` → Stage `pointerEvents: none`; iframe slot-click works
- [ ] `activeSlotField === null` → Stage captures pointer events normally

---

## AppRoot Conformance Final Checklist

Run before merging to `dev`:

- [ ] No Konva imports in `DesignStep.tsx`
- [ ] No field panel logic in `DesignStep.tsx`
- [ ] `CanvasOverlay.tsx` deleted
- [ ] No imports of `CanvasLayer` from outside `src/apps/template-builder/`
- [ ] `ZoneBound` and `CustomZone` imported from `types.ts` everywhere
- [ ] `zoneOverrides` key removal uses `delete`, not `undefined` assignment
- [ ] `backgroundColor` default is `#ffffff` in both `FieldMappingPanel` and `PreviewPanel`
- [ ] `canvasCoords.ts` is the ONLY file that does scale math
- [ ] All async effects have cleanup flags (`let cancelled = false`)
- [ ] `nanoid(6)` used for `customZones` IDs (no sequential counters)
- [ ] `displaySize === 0` guard in `CanvasLayer` renders null
- [ ] `zoneAssets` write path does NOT touch `staticValues`

---

## Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| Transformer scale not baked on `transformend` | High | See Task 5 — explicit `scaleX(1)` calls; covered in QA checklist |
| Stage placed over full-size iframe instead of wrapper div | High | See Task 9 — overlay `position:relative` inner wrapper, not iframe |
| `ZoneBound` import still from `CanvasOverlay.tsx` when it's deleted | High | Task 2 migrates import; Task 19 blocks deletion on grep check |
| `zoneOverrides` key set to `undefined` (ghost override bug) | Medium | `onZoneReset` uses `delete`; Task 13 acceptance criteria checks this |
| `position:relative` wireframe elements forced to `absolute` | Medium | Task 14 guards with console.warn + skip |
| stale `displaySize` on resize (race with zone-reporter postMessage) | Medium | Task 6 — `pendingDisplaySize` ref updated synchronously in ResizeObserver |
| Konva double-mount in StrictMode | Medium | Task 9 — `if (!containerRef.current) return`; `stage.destroy()` on cleanup |
| `nanoid` sequential ID reuse after delete-then-add | Low | Task 13 — `nanoid(6)` at creation; no counters |
| `zoneAssets` confused with `staticValues` | Low | Task 16 acceptance criteria; separate namespaces enforced |

---

## Task Dependency Order (strict)

```
Task 1 (install)
  └─► Task 2 (types)
        └─► Task 3 (canvasCoords)
              └─► Task 4 (canvasCoords tests)
              └─► Task 5 (ZoneRect)
                    └─► Task 6 (useCanvasLayer)
                          └─► Task 7 (NewZoneToolbar)
                          └─► Task 8 (ZoneContentBadge)
                          └─► Task 9 (CanvasLayer) ←── needs 5, 6, 7, 8
                                └─► Task 10 (CandidateSelector)
                                └─► Task 11 (FieldMappingPanel)
                                └─► Task 12 (PreviewPanel) ←── needs CanvasLayer
                                      └─► Task 13 (DesignStep wiring) ←── needs 10, 11, 12
                                            └─► Task 14 (injectIntoHtml extension)
                                                  └─► Task 15 (pass layoutOverrides to preview)
                                                        └─► Task 16 (zoneAssets write path)
                                                              └─► Task 17 (inject tests)
                                                              └─► Task 18 (FieldMappingPanel tests)
                                                              └─► Task 19 (delete CanvasOverlay) ←── LAST
                                                                    └─► Task 20 (Manual QA)
```

---

## Complexity Summary

| Task | Description | Complexity |
|---|---|---|
| 1 | Install Konva + nanoid | S |
| 2 | Move ZoneBound; add CustomZone, new stepData fields | S |
| 3 | canvasCoords.ts (scale math) | S |
| 4 | canvasCoords.test.ts (7 cases) | S |
| 5 | ZoneRect.tsx (single zone + Transformer, scale-bake) | M |
| 6 | useCanvasLayer.ts (selection, lasso, placement) | M |
| 7 | NewZoneToolbar.tsx | S |
| 8 | ZoneContentBadge.tsx (URL dialog) | S |
| 9 | CanvasLayer.tsx (Stage orchestrator) | L |
| 10 | Extract CandidateSelector.tsx (~92 lines) | S |
| 11 | Extract FieldMappingPanel.tsx (~870 lines) | L |
| 12 | Extract PreviewPanel.tsx (~320 lines) | M |
| 13 | DesignStep wiring + slim to ~400 lines | M |
| 14 | injectIntoHtml layoutOverrides + zoneAssets | M |
| 15 | Pass layoutOverrides through preview chain | S |
| 16 | Wire ZoneContentBadge + zoneAssets write path | S |
| 17 | injectIntoHtml.test.ts (8 new cases) | S |
| 18 | FieldMappingPanel.test.tsx | S |
| 19 | Delete CanvasOverlay.tsx | S |
| 20 | Manual QA (full checklist) | M |
