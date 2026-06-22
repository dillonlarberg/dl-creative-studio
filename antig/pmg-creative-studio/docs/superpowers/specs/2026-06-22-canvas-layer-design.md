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
- Fill image zones from Asset House picker
- Inline text content for text zones
- Layout overrides stored in `TemplateBuilderStepData`
- `injectIntoHtml` extended to apply layout overrides at render time
- DesignStep.tsx refactored: `FieldMappingPanel` + `CanvasLayer` extracted to `_internal/`

**Out of scope (v1), in TODOS:**
- Full blank canvas pathway (no wireframe HTML, generate from scratch) → v3 TODO

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
  CanvasLayer/
    ZoneRect.tsx               ← single zone: Konva Rect + Transformer handles
    NewZoneToolbar.tsx         ← "Add Image Zone" / "Add Text Zone" button strip
    useCanvasLayer.ts          ← selection, drag, lasso, placement mode state
    canvasCoords.ts            ← scale math (display px ↔ adSize native coords)
    canvasCoords.test.ts       ← coord round-trip tests
  FieldMappingPanel.tsx        ← extracted from DesignStep: field rows, slot pickers, Add Field flow
  ZoneContentBadge.tsx         ← Asset House trigger badge on selected image zones
```

`CanvasOverlay.tsx` is deleted once `CanvasLayer` is wired up.

---

## Data Model

### Additions to `TemplateBuilderStepData` (`src/apps/template-builder/types.ts`)

```ts
zoneOverrides?: Record<string, { x: number; y: number; w: number; h: number }>;
// Moved/resized existing wireframe zones, stored in adSize (native) coords.
// Key = slotId (matches existing zoneBounds keys from the zone-reporter).

customZones?: Array<{
  id: string;              // stable generated ID (e.g. "custom_zone_1")
  type: 'image' | 'text';
  x: number;              // adSize coords
  y: number;
  w: number;
  h: number;
  fieldId?: string;        // linked feed column (assigned in FieldMappingPanel)
  assetUrl?: string;       // Asset House URL (image zones only)
  textContent?: string;    // inline value (text zones only)
}>;
```

Both fields are optional and additive. Existing templates with neither field continue to work unchanged.

### Backwards compatibility

- `feedMappings` and `slotMappings` are unchanged
- `zoneBounds` from the iframe zone-reporter continues to drive the initial Konva shape positions; `zoneOverrides` is applied on top

---

## Coordinate System

Konva Stage is sized to `displaySize × displaySize` (same pixel dimensions as the iframe display area). Zone bounds from the iframe zone-reporter arrive in **adSize (native) coords**. All stored values (`zoneOverrides`, `customZones`) use adSize coords so the data is resolution-independent.

```
// iframe → Konva display
display_coord = native_coord × (displaySize / adSize)

// Konva display → storage
native_coord = display_coord ÷ (displaySize / adSize)
```

`canvasCoords.ts` is the single location for this math. No other file performs scale conversion.

---

## Injection Pipeline Extension

`injectIntoHtml.ts` receives a new optional 4th parameter:

```ts
function injectIntoHtml(
  html: string,
  feedValues: Record<string, string>,
  slotOverrides?: Record<string, string>,
  layoutOverrides?: {
    zoneOverrides?: Record<string, { x: number; y: number; w: number; h: number }>;
    customZones?: CustomZone[];
  }
): string
```

When `layoutOverrides` is provided:
1. For each key in `zoneOverrides`: find the element with that ID, apply `position: absolute; left: Xpx; top: Ypx; width: Wpx; height: Hpx` as inline style
2. For each entry in `customZones`: append a new `<div>` or `<img>` element positioned at the specified coords before `</body>`, using the element's `id` so downstream injection can target it

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
   - **Image zone** → opens Asset House picker → on asset selected: `onZoneCreate({ type: 'image', assetUrl, x, y, w, h })`
   - **Text zone** → `onZoneCreate({ type: 'text', x, y, w, h })` immediately; field panel row appears for text input
4. Cancel: Escape or click toolbar button again

### Filling image zones from Asset House

On a selected image zone (wireframe or custom): a `ZoneContentBadge` appears (small image icon in zone corner). Clicking opens the Asset House picker. On selection:
- For custom zones: updates `customZones[n].assetUrl`
- For wireframe zones: writes to existing `staticValues[slotId] = assetUrl` (already in `TemplateBuilderStepData`; injected as the field's static content at render time)

---

## DesignStep Refactor

### Extractions

| Component | Lines (approx) | What it contains |
|---|---|---|
| `FieldMappingPanel.tsx` | ~500 | Field rows, slot pickers, Add Field flow, brand overrides |
| `CanvasLayer.tsx` | ~300 | Konva Stage, ZoneRect, NewZoneToolbar, useCanvasLayer |
| `ZoneContentBadge.tsx` | ~40 | Asset House trigger badge |

### DesignStep after extraction (~400 lines)

Responsibilities:
- Parse `stepData`, `zoneBounds`, `selectedZoneId` state
- Wire `onZoneMove` / `onZoneResize` / `onZoneCreate` / `onZoneReset` → `mergeStepData`
- Render split layout: `FieldMappingPanel` (left 40%) + iframe + `CanvasLayer` overlay (right 60%)

### AppRoot conformance checklist

- [ ] No Konva imports in DesignStep — all Konva logic in `CanvasLayer` + `useCanvasLayer`
- [ ] No field panel logic in DesignStep — extracted to `FieldMappingPanel`
- [ ] `canvasCoords.ts` has round-trip tests
- [ ] Async effects keep cleanup flags
- [ ] `CanvasOverlay.tsx` deleted after `CanvasLayer` is wired up
- [ ] No imports of `CanvasLayer` from outside `src/apps/template-builder/`

---

## Error Handling

| Case | Behavior |
|---|---|
| `zoneOverrides` references a slotId not in wireframe | Silently ignored at injection (no element to update) |
| Asset House returns no asset | Placement mode cancelled, zone not created |
| `displaySize` or `adSize` is 0 | `CanvasLayer` renders null (same guard as CanvasOverlay) |
| Konva drag leaves canvas bounds | Clamp coords to `[0, displaySize]` on dragend |

---

## Testing

- `canvasCoords.test.ts` — round-trip: `toDisplay(toNative(x)) === x` for edge values
- `FieldMappingPanel.test.tsx` — field row rendering, slot picker, Add Field flow (design system mocked)
- `CanvasLayer` Konva interactions — manual QA only for v1 (Konva requires a browser canvas; jsdom support is limited)

---

## V3 TODO (not in scope)

See `TODOS.md`: **Canvas Layer v3 — Blank Canvas Pathway**
Start from scratch, no wireframe HTML. Users place zones on a blank canvas; HTML is generated from Konva state at publish time. Depends on v1 shipped and stable.

---

## Key Files

| File | Action |
|---|---|
| `src/apps/template-builder/types.ts` | Add `zoneOverrides`, `customZones` to `TemplateBuilderStepData` |
| `src/apps/template-builder/_internal/CanvasLayer.tsx` | Create — Konva Stage orchestrator |
| `src/apps/template-builder/_internal/CanvasLayer/ZoneRect.tsx` | Create |
| `src/apps/template-builder/_internal/CanvasLayer/NewZoneToolbar.tsx` | Create |
| `src/apps/template-builder/_internal/CanvasLayer/useCanvasLayer.ts` | Create |
| `src/apps/template-builder/_internal/CanvasLayer/canvasCoords.ts` | Create |
| `src/apps/template-builder/_internal/CanvasLayer/canvasCoords.test.ts` | Create |
| `src/apps/template-builder/_internal/FieldMappingPanel.tsx` | Create (extracted from DesignStep) |
| `src/apps/template-builder/_internal/ZoneContentBadge.tsx` | Create |
| `src/apps/template-builder/_internal/injectIntoHtml.ts` | Modify — add `layoutOverrides` param |
| `src/apps/template-builder/_internal/CanvasOverlay.tsx` | Delete |
| `src/apps/template-builder/steps/DesignStep.tsx` | Modify — thin to ~400 lines |
