# Canvas Layer — Design Spec

**Date:** 2026-06-22
**Owner:** Annie Nguyen (annienguyen-pmg)
**Branch:** `feat/canvas-layer` (cut from `dev`, pull remote first)
**Status:** Design approved, implementation plan pending

---

## Goal

Replace `CanvasOverlay.tsx`'s CSS-div zone handles with a Konva-based interactive canvas layer that supports drag-to-reposition, handle-based resize, multi-select/lasso, and user-created new zones (image + text). Base wireframe HTML is never mutated — all layout changes are stored as a declarative override layer applied at injection time.

---

## Scope

**In scope (v1):**
- Konva Stage overlay replacing `CanvasOverlay.tsx`
- Drag, resize (Transformer), multi-select, lasso
- Add Image Zone and Add Text Zone from a toolbar
- Fill image zones from Asset House picker (v1: URL input dialog; see Asset House Picker note below)
- Inline text content for text zones
- Layout overrides stored in `TemplateBuilderStepData`
- `injectIntoHtml` extended to apply layout overrides at render time
- DesignStep.tsx refactored: `FieldMappingPanel`, `CanvasLayer`, `CandidateSelector`, and `PreviewPanel` extracted to `_internal/`

**Out of scope (v1), in TODOS:**
- Full blank canvas pathway (no wireframe HTML, generate from scratch) → v3 TODO
- Full Asset House modal image picker → v2 TODO (v1 uses URL input dialog)

---

## Architecture

### Pipeline

```
base wireframe HTML (immutable)
    + layout overrides  ← Konva drag/resize/new zones → zoneOverrides + customZones
    + feed data         ← feedMappings (unchanged)
        ↓
  injectIntoHtml()
        ↓
  filled preview HTML (ephemeral, never stored)
```

### File structure

```
src/apps/template-builder/_internal/
  CanvasLayer.tsx              ← Konva Stage + orchestration; replaces CanvasOverlay.tsx
  canvas-layer/                ← subdirectory named canvas-layer/ (kebab-case) to avoid
    ZoneRect.tsx               |   name collision with CanvasLayer.tsx above
    NewZoneToolbar.tsx         ← "Add Image Zone" / "Add Text Zone" button strip
    useCanvasLayer.ts          ← selection, drag, lasso, placement mode state
    canvasCoords.ts            ← scale math (display px ↔ adSize native coords)
    canvasCoords.test.ts       ← coord round-trip tests
  FieldMappingPanel.tsx        ← extracted from DesignStep: field rows, slot pickers, Add Field flow
  CandidateSelector.tsx        ← extracted from DesignStep lines 322-413 (~92 lines)
  PreviewPanel.tsx             ← extracted from DesignStep: full right 60% panel content (~320 lines)
  ZoneContentBadge.tsx         ← URL input dialog trigger badge on selected image zones
```

**Naming note:** The subdirectory is `canvas-layer/` (kebab-case), not `CanvasLayer/`. This avoids a naming collision with `CanvasLayer.tsx` in the same directory. TypeScript resolves `.tsx` over a directory today, but adding `CanvasLayer/index.ts` in the future would create ambiguous module resolution. Use `canvas-layer/` throughout.

`CanvasOverlay.tsx` is deleted once `CanvasLayer` is wired up.

---

## Data Model

### Additions to `TemplateBuilderStepData` (`src/apps/template-builder/types.ts`)

```ts
zoneOverrides?: Record<string, ZoneBound>;
// Moved/resized existing wireframe zones, stored in adSize (native) coords.
// Key = slotId (matches existing zoneBounds keys from the zone-reporter).

customZones?: CustomZone[];
// User-created zones. IDs are stable nanoid(6) strings — never sequential counters.

zoneAssets?: Record<string, string>;
// slotId → assetUrl for wireframe-zone image fills.
// SEPARATE from staticValues (which is keyed by fieldId).
// Do NOT reuse staticValues for this purpose — slotId and fieldId namespaces overlap.
// injectIntoHtml applies zoneAssets as <img> src overrides by element ID,
// independently of the fieldId-keyed injection pipeline.
```

Both `zoneOverrides` and `customZones` are optional and additive. Existing templates with neither field continue to work unchanged.

### `ZoneBound` and `CustomZone` types (canonical location: `types.ts`)

Move `ZoneBound` from `CanvasOverlay.tsx` into `types.ts`. Do not keep it in `CanvasOverlay.tsx` — when that file is deleted, any import of `ZoneBound` from it will break. All files (`CanvasLayer.tsx`, `injectIntoHtml.ts`, `FieldMappingPanel.tsx`) import `ZoneBound` from `types.ts`.

```ts
// types.ts

export interface ZoneBound {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Discriminated union — TypeScript will catch mismatched fields at compile time.
// An image zone cannot have textContent; a text zone cannot have assetUrl.
export type CustomZone = {
  id: string;       // nanoid(6) generated at creation — see CustomZone ID Strategy below
  x: number;        // adSize coords
  y: number;
  w: number;
  h: number;
  fieldId?: string; // linked feed column (assigned in FieldMappingPanel)
} & (
  | { type: 'image'; assetUrl?: string; textContent?: never }
  | { type: 'text'; textContent?: string; assetUrl?: never }
);
```

Using a flat optional-all type is wrong: TypeScript will not catch an image zone constructed with `textContent` or a text zone with `assetUrl`, forcing manual runtime checks in `injectIntoHtml` instead of type-narrowed branches.

### CustomZone ID Strategy

**Use `nanoid(6)` at creation time. Never use sequential counters.**

```ts
import { nanoid } from 'nanoid';
id = `custom_zone_${nanoid(6)}`
// e.g. "custom_zone_aB3xYz"
```

Sequential IDs (`custom_zone_1`, `custom_zone_2`) have a silent data-corruption bug: after a delete-then-add cycle, the new zone reuses an old ID, silently re-linking any serialized reference (`fieldId` linkage in `FieldMappingPanel`, saved draft JSON) to the new zone. `nanoid(6)` eliminates this. Store no counter in state.

### Backwards compatibility

- `feedMappings` and `slotMappings` are unchanged
- `zoneBounds` from the iframe zone-reporter continues to drive the initial Konva shape positions; `zoneOverrides` is applied on top

---

## Coordinate System

### Overview

Konva Stage is sized to `displaySize × displaySize` (same pixel dimensions as the iframe display area). Zone bounds from the iframe zone-reporter arrive in **adSize (native) coords**. All stored values (`zoneOverrides`, `customZones`) use adSize coords so the data is resolution-independent.

```
// iframe → Konva display
display_coord = native_coord × (displaySize / adSize)

// Konva display → storage
native_coord = display_coord ÷ (displaySize / adSize)
```

`canvasCoords.ts` is the single location for this math. No other file performs scale conversion.

### Zone-Reporter Coordinate Contract

Zone-reporter `getBoundingClientRect()` values are in the iframe document's own CSS pixel space — **unaffected by the parent-frame `transform: scale()`**. They equal adSize coords because the iframe document renders at adSize resolution with no viewport meta tag applied. This means zone-reporter values can be stored directly as adSize coords without any additional scaling.

### Coordinate Units in Injected CSS

**Injected CSS pixel values (`left`, `top`, `width`, `height`) are adSize (native) coords.** The iframe renders at adSize resolution, so these values are correct without any scaling. Using displaySize coords instead would produce a `adSize/displaySize` position error (typically 3x on 1080px wireframes at 360px displaySize) with no obvious diagnostic output.

Add this comment in `injectIntoHtml.ts` near the `layoutOverrides` block:
```ts
// CSS values here are adSize (native) coords — the iframe renders at adSize resolution.
// Do NOT use displaySize coords here.
```

### HiDPI / devicePixelRatio

Do not set `pixelRatio` manually on the Konva Stage. Let Konva auto-detect it. On Retina displays (`devicePixelRatio=2`), Konva creates a 720×720 backing canvas for a 360×360 Stage, but all position reads (`node.x()`, `node.y()`, `stage.getPointerPosition()`) return CSS-space values. These values are safe to pass directly to `canvasCoords.toNative()` without any `devicePixelRatio` adjustment. Never read raw canvas pixel buffers for coordinate purposes.

### ResizeObserver / Zone-Reporter Race Condition

When the container resizes, the Konva Stage must update its `width`/`height` before zone-bounds postMessages are processed. If a zone-bounds message arrives before the React re-render from `ResizeObserver` completes, `canvasCoords.toDisplay()` will use a stale `displaySize` captured in its closure, producing zones drawn at wrong scale.

**Mitigation:** In `useCanvasLayer.ts`, use a `pendingDisplaySize` ref updated synchronously in the `ResizeObserver` callback (not React state). Alternatively: in `onResizeDetected`, immediately clear `zoneBounds` (DesignStep already calls `setZoneBounds({})`), preventing any Konva Rects from rendering until the next zone-bounds postMessage arrives — guaranteeing `displaySize` and `zoneBounds` are always from the same render cycle.

---

## Stage Placement

**CanvasLayer must be an absolute child of the inner wrapper div at DesignStep.tsx line 1347.**

That div has:
```tsx
style={{ position: 'relative', width: previewBaseSize, height: previewBaseSize }}
```

The Konva Stage `width` and `height` props must equal `displaySize` (i.e., `previewBaseSize`).

**Do NOT place the Stage adjacent to or over the full-size iframe element.** The full-size iframe is `adSize × adSize` CSS pixels, CSS-scaled down with `transform: scale(displaySize / adSize)`. If CanvasLayer overlays the full-size iframe instead of the wrapper div, all hit-testing, drag, and lasso coordinates will be wrong by a factor of `adSize / displaySize` (typically 3× on 1080px wireframes at 360px displaySize).

```
inner wrapper div (position: relative; width: displaySize; height: displaySize)
├── iframe (adSize × adSize, scaled down via transform: scale)
└── CanvasLayer (position: absolute; top: 0; left: 0; width: displaySize; height: displaySize)
    └── Konva Stage (width={displaySize} height={displaySize})
```

Add a unit test in `canvasCoords.test.ts`:
```ts
it('toDisplay maps adSize to displaySize', () => {
  expect(toDisplay(adSize, adSize, displaySize)).toBe(displaySize);
});
```

---

## Pointer Events

The Konva Stage canvas blocks all pointer events over the full `displaySize` area, including gaps between zones, preventing iframe slot-click interaction (`activeSlotField` assignment).

**Rule:** When `activeSlotField !== null`, set `Stage style={{ pointerEvents: 'none' }}` to fall back to iframe slot-click handling. This is the v1 approach; v2 can extend CanvasLayer to forward slot-click events.

**Z-index:** The Stage container must be `position: absolute` with `zIndex` above the iframe's stacking context but below any modal/drawer overlay.

---

## Injection Pipeline Extension

`injectIntoHtml.ts` currently uses a single `InjectOptions` object parameter (see existing signature at `src/apps/template-builder/_internal/injectIntoHtml.ts`). All existing callers pass an options object. **Do not add a 4th positional parameter — this would break every existing call site.**

Instead, add `layoutOverrides` as a new optional field inside `InjectOptions`:

```ts
export interface InjectOptions {
  injections: Record<string, { type: 'image' | 'text'; value: string }>;
  cssOverrides?: Record<string, string>;
  slotOverrides?: Record<string, string>;
  fieldTransforms?: Record<string, string[]>;
  zoneStyles?: Record<string, ZoneStyle>;
  // NEW — additive, zero call-site changes required:
  layoutOverrides?: {
    zoneOverrides?: Record<string, ZoneBound>;
    customZones?: CustomZone[];
  };
  zoneAssets?: Record<string, string>; // slotId → assetUrl image src overrides
}
```

This is a non-breaking additive extension with zero call-site changes, matching the established pattern in the codebase.

When `layoutOverrides` is provided:

1. **`zoneOverrides`:** For each key, find the element by ID. Check the element's computed `position` style. **Only apply `position: absolute; left: Xpx; top: Ypx; width: Wpx; height: Hpx` to elements that already use `position: absolute` or `position: fixed`.** For `position: relative` elements, emit `console.warn('CanvasLayer: zoneOverrides skipped for #id — element uses position:relative. Layout override may produce unexpected results.')` and skip. Forcing `position: absolute` on relative/flex/grid children removes them from document flow and repositions them relative to an unexpected containing block. Confirmed incompatible wireframes: `modern_reveal.html` (`#left`, `#headline1` use `position: relative + display: flex`), `featured_collection.html` (`position: relative`).

2. **`customZones`:** For each entry, append a new `<div>` (text zone) or `<img>` (image zone) element before `</body>`, positioned at the specified adSize coords, with `id` set and `data-canvas-custom="true"` attribute. This allows downstream injection to target it by ID.

3. **`zoneAssets`:** For each `slotId → assetUrl` entry, find the element by ID and set its `src` attribute (for `<img>`) or `background-image` CSS (for `<div>`). This is independent of the `injections` (fieldId-keyed) pipeline.

All values in `left`, `top`, `width`, `height` are adSize (native) coords — see Coordinate Units in Injected CSS above.

Base wireframe HTML is cloned in memory — the original string is never mutated.

---

## CanvasLayer Component

### Props

```ts
interface CanvasLayerProps {
  // geometry
  zoneBounds: Record<string, ZoneBound>;   // from iframe zone-reporter (adSize coords)
  adSize: number;
  displaySize: number;

  // overrides (from stepData)
  zoneOverrides: Record<string, ZoneBound>;
  customZones: CustomZone[];

  // selection
  selectedZoneId: string | null;
  onZoneSelect: (id: string | null) => void;

  // mutations
  onZoneMove: (id: string, bounds: ZoneBound) => void;
  onZoneResize: (id: string, bounds: ZoneBound) => void;
  onZoneCreate: (zone: Omit<CustomZone, 'id'>) => void;
  onZoneReset: (id: string) => void;
  onZoneDelete: (id: string) => void;  // deletes custom zones only; wireframe zones are not deleteable

  // resize detection (from CanvasOverlay, unchanged)
  onResizeDetected?: () => void;
}
```

### useCanvasLayer.ts

Owns all Konva-specific local state:
- `selectedIds: Set<string>` — multi-select set
- `lassoRect: { x, y, w, h } | null` — rubber-band rect while dragging
- `placementMode: 'image' | 'text' | null` — active new-zone draw mode
- `placementRect: { x, y, w, h } | null` — rect being drawn in placement mode

None of this state lives in DesignStep.

### Konva StrictMode Mount Guard

Konva throws `'container is required for Stage'` if initialized before the container div is in the DOM. React StrictMode double-invokes effects, making this a common footgun.

**Guard in `useEffect`:**
```ts
useEffect(() => {
  if (!containerRef.current) return;
  // initialize Konva stage here
  return () => {
    stage.destroy(); // prevent double-mount leak in StrictMode
  };
}, []);
```

Prefer attaching all Konva event handlers via JSX props (`<Stage onClick={...}>`) rather than imperative `stage.on()` calls. This avoids duplicate handler registration on double-mount.

---

## DesignStep Mutation Handlers

All four mutation callbacks must be implemented in DesignStep. Explicit handler bodies:

```ts
// onZoneMove
onZoneMove={(id, bounds) => {
  mergeStepData({
    zoneOverrides: { ...stepData.zoneOverrides, [id]: bounds }
  });
}}

// onZoneResize
onZoneResize={(id, bounds) => {
  mergeStepData({
    zoneOverrides: { ...stepData.zoneOverrides, [id]: bounds }
  });
}}

// onZoneCreate — ID generated here with nanoid, not in CanvasLayer
onZoneCreate={(zoneWithoutId) => {
  const id = `custom_zone_${nanoid(6)}`;
  mergeStepData({
    customZones: [...(stepData.customZones ?? []), { id, ...zoneWithoutId }]
  });
}}

// onZoneReset — use delete key, not undefined assignment
onZoneReset={(id) => {
  const next = { ...stepData.zoneOverrides };
  delete next[id];
  mergeStepData({ zoneOverrides: next });
}}
// WRONG: mergeStepData({ zoneOverrides: { ...stepData.zoneOverrides, [id]: undefined } })
// Setting a key to undefined leaves it in the object. Object.entries() iterates it,
// the key survives JSON serialization round-trips as absent-but-present-in-memory,
// causing ghost overrides. Always use delete.

// onZoneDelete
onZoneDelete={(id) => {
  mergeStepData({
    customZones: (stepData.customZones ?? []).filter(z => z.id !== id)
  });
}}
```

---

## Interaction Design

### Existing wireframe zones

| Action | Trigger | Result |
|---|---|---|
| Select | Click zone | `onZoneSelect(slotId)`, highlights field row in panel |
| Deselect | Click Stage background | `onZoneSelect(null)` |
| Drag | Mousedown + drag zone body | `onZoneMove(slotId, newBounds)` on dragend |
| Resize | Drag Transformer anchor | `onZoneResize(slotId, newBounds)` on transformend |
| Multi-select | Shift + click | Adds to `selectedIds`; all selected zones move together on drag |
| Lasso | Mousedown on Stage background + drag | Rubber-band rect; selects all intersecting zones on mouseup |
| Reset | Right-click → "Reset to original" | `onZoneReset(slotId)` removes key from `zoneOverrides` |

### New zones

A toolbar sits above the canvas:
```
[ + Image Zone ]  [ + Text Zone ]
```

1. Click toolbar button → enters placement mode (crosshair cursor)
2. User draws a rectangle on the canvas
3. On mouseup:
   - If `Math.min(w, h) < MIN_ZONE_PX` (16px in displaySize coords): discard `placementRect`, stay in placement mode, show brief tooltip "Zone too small — draw a larger rectangle". Do not proceed.
   - **Image zone** → opens URL input dialog (v1) → on URL submitted: `onZoneCreate({ type: 'image', assetUrl, x, y, w, h })`
   - **Text zone** → `onZoneCreate({ type: 'text', x, y, w, h })` immediately; field panel row appears for text input
4. Cancel: Escape or click toolbar button again

### Minimum Zone Size

Define `MIN_ZONE_PX = 16` as a named constant in `canvasCoords.ts`:
```ts
/** Minimum zone dimension in displaySize (CSS) pixels. Prevents 0×0 ghost zones. */
export const MIN_ZONE_PX = 16;
```

On mouseup in placement mode: if `Math.min(w, h) < MIN_ZONE_PX`, discard `placementRect`, stay in placement mode. A click without dragging (near-zero rect) is the most common trigger of this guard.

### Filling image zones from Asset House

**v1:** `ZoneContentBadge` opens a URL input dialog (not a full Asset House modal picker). The full Asset House picker is a v2 item — no modal picker component exists in the codebase today. `AssetHouseContext.tsx` provides brand data (colors, fonts, logos), not a media picker. `ClientAssetHousePage.tsx` is a full admin page.

On a selected image zone (wireframe or custom): a `ZoneContentBadge` appears (small image icon in zone corner). Clicking opens a URL input dialog. On URL submission:
- For custom zones: calls `onZoneCreate`/updates `customZones[n].assetUrl` via `mergeStepData`
- For wireframe zones: writes to `zoneAssets[slotId] = assetUrl` (NOT `staticValues`) via `mergeStepData`

**v2 TODO:** Build `AssetHousePicker` modal component (estimated 200–400 lines, warrants its own spec) and replace the URL input dialog. Wire to `zoneAssets` via the same callback path.

### Lasso Intersection Model

Lasso uses the **any-overlap model**: a zone is selected if its rect overlaps the lasso rect by any amount (single pixel of overlap triggers selection). This matches Figma/Sketch convention.

A lasso that matches zero zones **clears `selectedIds` to an empty set** (does not preserve prior selection).

Add a comment in `useCanvasLayer.ts`:
```ts
// Lasso: any-overlap model (single pixel). Zero matches clears selection.
```

### Selection Sync

`DesignStep` owns `selectedZoneId: string | null` (line 76). `useCanvasLayer` owns `selectedIds: Set<string>`.

**Rule:** Call `onZoneSelect(id)` only when `selectedIds.size === 1` (single-select). Call `onZoneSelect(null)` for multi-select or lasso (regardless of match count). This keeps `FieldMappingPanel`'s field-row highlight correct under multi-select and lasso.

`DesignStep.selectedZoneId` is the canonical single-selection for the field panel. `useCanvasLayer.selectedIds` is the canonical multi-select set for Konva rendering.

### Multi-Select Drag Delta

On `dragstart`: record each selected zone's initial bounds (`{ id, initialX, initialY }`). On drag: move each zone by `dx = currentX - dragStartX`, `dy = currentY - dragStartY` (uniform delta applied to all). On `dragend`: call `onZoneMove` for each zone with final bounds.

Do not anchor all zones to the cursor position on dragstart — this collapses all selected zones to the same position, destroying the layout.

### Multi-Select Transformer Scale-Baking

Konva's `Transformer` applies scale to nodes rather than modifying `width`/`height`. On `transformend`, each node's stored dimensions will be wrong unless scale is baked back.

On `transformend`, iterate `transformer.nodes()` and for each node:
```ts
const w = node.width() * node.scaleX();
const h = node.height() * node.scaleY();
node.scaleX(1);
node.scaleY(1);
onZoneResize(node.id(), {
  x: toNative(node.x(), adSize, displaySize),
  y: toNative(node.y(), adSize, displaySize),
  w: toNative(w, adSize, displaySize),
  h: toNative(h, adSize, displaySize),
});
```

Skipping the scale-bake step is the most commonly missed Konva detail.

### Event Throttling

`onZoneMove` and `onZoneResize` fire on `dragend`/`transformend` only — **not** on `dragmove`/`transform`. `ZoneRect` manages its own local position state during drag via Konva's internal node position. No React state updates occur during active drag. This prevents excessive `mergeStepData` calls during drag.

### Keyboard Shortcuts

| Key | Behavior |
|---|---|
| `Delete` / `Backspace` | Delete selected custom zone(s). Wireframe zones are not deleteable — pressing Delete on a wireframe zone is a no-op (do not call `onZoneReset` or remove from `zoneBounds`). Show a brief tooltip if the user tries to delete a wireframe zone. |
| `Escape` | If `placementMode !== null`: cancel placement mode, discard `placementRect`. If `placementMode === null`: deselect all (`selectedIds` → empty set, call `onZoneSelect(null)`). |
| Arrow keys | Nudge selected zone(s) by 1 native-coord unit (v1: optional). |

---

## DesignStep Refactor

### Extractions

| Component | Lines (approx) | What it contains |
|---|---|---|
| `FieldMappingPanel.tsx` | ~870 | Field rows, slot pickers, Add Field flow |
| `CanvasLayer.tsx` | ~300 | Konva Stage, ZoneRect, NewZoneToolbar, useCanvasLayer |
| `PreviewPanel.tsx` | ~320 | Right 60% panel: FilledTemplatePreview, CanvasLayer, AskAlliPanel, wireframe picker, non-social CandidatePreview |
| `CandidateSelector.tsx` | ~92 | Lines 322–413 from DesignStep: candidate wireframe selection |
| `ZoneContentBadge.tsx` | ~40 | URL input dialog trigger badge |

### DesignStep after extraction (~400 lines)

Responsibilities:
- Parse `stepData`, `zoneBounds`, `selectedZoneId` state
- Wire `onZoneMove` / `onZoneResize` / `onZoneCreate` / `onZoneReset` / `onZoneDelete` → `mergeStepData`
- Render split layout: `FieldMappingPanel` (left 40%) + `PreviewPanel` (right 60%)

**Note:** `askAlliOpen` must remain in DesignStep because it also drives the `previewBaseSize` calculation at line 258. Do not lift it into `PreviewPanel`.

### Brand Overrides

Two brand-overrides UI blocks currently exist in DesignStep.tsx:
- Full-form collapsible block in the left panel (lines 1160–1255)
- Compact inline block in the right panel (lines 1446–1495)

**Canonical block:** The compact inline version in PreviewPanel (right 60%) is primary. Remove the full-form collapsible from FieldMappingPanel. Fix the `backgroundColor` default inconsistency: the left panel defaults to `#ffffff` and the right panel defaults to `#2563eb`. Pick one canonical default and apply it consistently — recommended: `#ffffff` (white is the safer default for ad backgrounds).

### FieldMappingPanelProps Interface

Define this interface before implementation begins. At minimum:

```ts
interface FieldMappingPanelProps {
  stepData: TemplateBuilderStepData;
  mergeStepData: (partial: Partial<TemplateBuilderStepData>) => void;
  allFields: FieldRequirement[];
  feedColumns: string[];
  feedSampleData: Record<string, string>[];
  discoveredSlots: string[];
  requirements: FieldRequirement[];
  assetHouse: AssetHouseContextValue | null;
  slotUseCounts: Record<string, number>;
  inferredColTypes: Record<string, string>;
  // callbacks back into DesignStep / PreviewPanel
  onAskAlli: (fieldId: string) => void;         // opens AskAlliPanel for field
  onSlotFieldActive: (fieldId: string | null) => void;  // drives activeSlotField for preview slot-click
  onFieldHover: (fieldId: string | null) => void;
  onAddFieldSlotSelect: (slotId: string) => void;
  getEffectiveSlotId: (fieldId: string) => string | null;
  handleZoneStyleChange: (slotId: string, partial: Partial<ZoneStyle>) => void;
}
```

`askAlliOpen` must remain in DesignStep (drives `previewBaseSize` at line 258). `setAskAlliOpen`, `setAskAlliTargetField`, `setActiveSlotField`, `setHoveredField`, `setAddFieldPendingSlot`, `setAddFieldSelectingSlot` are passed as callbacks, not state setters.

### PreviewPanel Props

```ts
interface PreviewPanelProps {
  injections: Record<string, { type: 'image' | 'text'; value: string }>;
  cssOverrides: Record<string, string>;
  wireframe: string | null;           // wireframe HTML
  previewBaseSize: number;            // displaySize
  askAlliOpen: boolean;
  onAskAlliToggle: () => void;
  slotMappings: Record<string, string>;
  activeSlotField: string | null;
  onSlotFieldActive: (fieldId: string | null) => void;
  zoneBounds: Record<string, ZoneBound>;
  selectedZoneId: string | null;
  onZoneSelect: (id: string | null) => void;
  onResizeDetected: () => void;
  // canvas layer passthrough
  adSize: number;
  zoneOverrides: Record<string, ZoneBound>;
  customZones: CustomZone[];
  onZoneMove: (id: string, bounds: ZoneBound) => void;
  onZoneResize: (id: string, bounds: ZoneBound) => void;
  onZoneCreate: (zone: Omit<CustomZone, 'id'>) => void;
  onZoneReset: (id: string) => void;
  onZoneDelete: (id: string) => void;
}
```

### AppRoot conformance checklist

- [ ] No Konva imports in DesignStep — all Konva logic in `CanvasLayer` + `useCanvasLayer`
- [ ] No field panel logic in DesignStep — extracted to `FieldMappingPanel`
- [ ] Right panel content extracted to `PreviewPanel`
- [ ] `CandidateSelector` extracted (~92 lines, lines 322–413)
- [ ] `canvasCoords.ts` has round-trip tests including edge cases
- [ ] Async effects keep cleanup flags
- [ ] `CanvasOverlay.tsx` deleted after `CanvasLayer` is wired up
- [ ] No imports of `CanvasLayer` from outside `src/apps/template-builder/`
- [ ] `ZoneBound` and `CustomZone` imported from `types.ts` everywhere
- [ ] `backgroundColor` default inconsistency resolved (canonical: `#ffffff`)

---

## Error Handling

| Case | Behavior |
|---|---|
| `zoneOverrides` references a slotId not in wireframe | Silently ignored at injection (no element to update) |
| `zoneOverrides` targets a `position: relative` element | `console.warn` and skip — do not force `position: absolute` |
| Asset House URL dialog returns empty / user submits blank | Discard `placementRect`, clear `placementMode`, zone not created |
| Picker cancel (Escape inside dialog, backdrop click, close button) | Treated identically to empty URL: discard `placementRect`, clear `placementMode`, zone not created. The `onClose`/`onCancel` callback must call the same cleanup path as the no-asset path. |
| `displaySize` or `adSize` is 0 | `CanvasLayer` renders null (same guard as CanvasOverlay). `canvasCoords` functions guard with early return of 0 for zero denominator. |
| Drawn rect smaller than `MIN_ZONE_PX` | Stay in placement mode, show tooltip "Zone too small — draw a larger rectangle". Do not create zone. |
| Konva drag leaves canvas bounds | Clamp coords to `[0, adSize]` in native coords on dragend (apply after `toNative()` conversion) |
| Konva Stage `containerRef` is null on mount | `useEffect` guard: `if (!containerRef.current) return`. Add `stage.destroy()` cleanup on unmount to prevent double-mount leaks in StrictMode. |
| Delete key pressed on wireframe zone | No-op. Show brief tooltip: "Wireframe zones cannot be deleted. Use 'Reset to original' to undo repositioning." |

---

## Testing

### `canvasCoords.test.ts`

Required test cases:

```
- round-trip: toDisplay(toNative(x, adSize, displaySize), adSize, displaySize) === x
- toDisplay(adSize, adSize, displaySize) === displaySize  (Stage placement assertion)
- adSize = 0 → guard returns 0, no divide-by-zero throw
- displaySize = 0 → guard returns 0, no NaN propagation
- negative coord input (drag above/left of canvas origin before clamping) → returns 0 after clamp
- coord > adSize (drag outside bounds before clamping) → clamps to adSize
- displaySize > adSize upscaling case → scale factor > 1, verify correct direction
```

### `injectIntoHtml.test.ts` — new describe block

Add a describe block `'injectIntoHtml — layoutOverrides'` to the existing test file:

```
1. zoneOverrides applies position/left/top/width/height to an absolute-positioned element
2. zoneOverrides silently skips unknown slotId (no error thrown, document unchanged for that key)
3. zoneOverrides does NOT apply to a position:relative element (logs warn, element style unchanged)
4. customZones appends element with correct id, correct adSize position, data-canvas-custom="true"
5. zoneOverrides and customZones together — both applied in one pass
6. layoutOverrides: undefined — document unchanged (regression guard)
7. zoneAssets sets <img> src by element ID
8. zoneAssets does not affect staticValues / injections pipeline
```

All cases are fully testable with `DOMParser` — no browser canvas required.

### `FieldMappingPanel.test.tsx`

Field row rendering, slot picker, Add Field flow (design system mocked).

### Konva interaction tests

Manual QA only for v1 (Konva requires a browser canvas; jsdom support is limited). See Manual QA Checklist below.

---

## Manual QA Checklist

Test at minimum with two wireframe sizes: `adSize = 1080` and `adSize = 603`.

- [ ] Drag a zone — verify `zoneOverrides` stored value is in adSize coords (not displaySize coords)
- [ ] Resize a zone using Transformer — verify scale-baked dimensions stored correctly in adSize coords
- [ ] Inject HTML after drag — verify preview reflects updated position
- [ ] Add image zone via toolbar — draw rect, submit URL, verify zone appears at correct position
- [ ] Add image zone with click (no drag) — verify "Zone too small" tooltip appears, no zone created
- [ ] Add text zone — verify field panel row appears immediately
- [ ] Shift + click multi-select — verify `FieldMappingPanel` row highlight clears (not stale single selection)
- [ ] Lasso zero matches — verify prior selection is cleared
- [ ] Lasso over multiple zones — verify all overlapping zones selected (any-overlap)
- [ ] Cancel placement by Escape — verify `placementMode` cleared, no ghost rect on canvas
- [ ] Cancel URL dialog by Escape / backdrop click — verify no zone created, canvas rect discarded
- [ ] Delete key on custom zone — zone removed
- [ ] Delete key on wireframe zone — no-op, tooltip shown
- [ ] Resize browser window — verify zones re-render at correct positions after resize (no stale displaySize)
- [ ] Test on Retina display — verify no coordinate doubling (hitbox matches visual zone)
- [ ] Reset zone — verify key fully removed from `zoneOverrides` (not set to undefined)
- [ ] `askAlliOpen = true` — verify `previewBaseSize` calculation at DesignStep line 258 still correct after PreviewPanel extraction
- [ ] `activeSlotField !== null` — verify Stage `pointerEvents: none`, iframe slot-click works
- [ ] `activeSlotField === null` — verify Stage captures pointer events normally

---

## V3 TODO (not in scope)

See `TODOS.md`: **Canvas Layer v3 — Blank Canvas Pathway**
Start from scratch, no wireframe HTML. Users place zones on a blank canvas; HTML is generated from Konva state at publish time. Depends on v1 shipped and stable.

---

## Key Files

| File | Action | Notes |
|---|---|---|
| `src/apps/template-builder/types.ts` | Modify | Add `ZoneBound` (move from CanvasOverlay), `CustomZone` discriminated union, `zoneOverrides`, `customZones`, `zoneAssets` to `TemplateBuilderStepData` |
| `src/apps/template-builder/_internal/CanvasLayer.tsx` | Create | Konva Stage orchestrator |
| `src/apps/template-builder/_internal/canvas-layer/ZoneRect.tsx` | Create | Single zone Rect + Transformer |
| `src/apps/template-builder/_internal/canvas-layer/NewZoneToolbar.tsx` | Create | Add Image Zone / Add Text Zone buttons |
| `src/apps/template-builder/_internal/canvas-layer/useCanvasLayer.ts` | Create | Selection, drag, lasso, placement state |
| `src/apps/template-builder/_internal/canvas-layer/canvasCoords.ts` | Create | Scale math + `MIN_ZONE_PX` constant |
| `src/apps/template-builder/_internal/canvas-layer/canvasCoords.test.ts` | Create | 7 required test cases |
| `src/apps/template-builder/_internal/FieldMappingPanel.tsx` | Create (extracted) | ~870 lines from DesignStep; see FieldMappingPanelProps |
| `src/apps/template-builder/_internal/PreviewPanel.tsx` | Create (extracted) | ~320 lines from DesignStep right panel |
| `src/apps/template-builder/_internal/CandidateSelector.tsx` | Create (extracted) | ~92 lines from DesignStep lines 322–413 |
| `src/apps/template-builder/_internal/ZoneContentBadge.tsx` | Create | URL input dialog trigger badge (~40 lines) |
| `src/apps/template-builder/_internal/injectIntoHtml.ts` | Modify | Add `layoutOverrides` + `zoneAssets` to `InjectOptions`; add `position:relative` guard |
| `src/apps/template-builder/_internal/injectIntoHtml.test.ts` | Modify | Add `layoutOverrides` describe block (8 cases) |
| `src/apps/template-builder/_internal/CanvasOverlay.tsx` | Delete | After CanvasLayer is wired up |
| `src/apps/template-builder/steps/DesignStep.tsx` | Modify | Thin to ~400 lines; keep `askAlliOpen` state |
