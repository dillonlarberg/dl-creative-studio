# Slot-Based Field Mapping Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users add custom field mappings in the template builder and explicitly assign each field to a visual zone (slot) in the template, with bidirectional sync between the left panel and the live preview.

**Architecture:** Slot discovery parses the loaded wireframe HTML to extract injectable element IDs. The DesignStep field mapping panel is extended with slot pickers and an Add Field flow. A small script injected into the template iframe handles click → postMessage communication for bidirectional sync between preview zones and the React panel.

**Tech Stack:** React, TypeScript, existing `injectIntoHtml.ts` + `FIELD_ID_MAP`, `TemplateBuilderStepData`, `DesignStep.tsx`, iframe postMessage API.

---

## Data Model

### Changes to `TemplateBuilderStepData` (in `src/apps/template-builder/types.ts`)

Two new optional fields:

```typescript
slotMappings?: Record<string, string>;
// fieldId → explicit slotId override (e.g. { "headline": "headline1", "callout": "promo" })
// When present, used instead of FIELD_ID_MAP fallback during injection.

customFields?: Array<{ id: string; label: string; type: 'text' | 'image' | 'currency' | 'button' | 'asset' }>;
// User-added fields beyond what Gemini synthesized.
// Combined with tbCtx.requirements at render time for the full field list.
```

### Backwards compatibility
- `feedMappings` stays as `Record<string, string>` (fieldId → column) — unchanged
- `slotMappings` is additive — if absent, injection falls back to existing `FIELD_ID_MAP` logic
- Existing published templates with no `slotMappings` continue to work

### Injection update (`injectIntoHtml.ts`)
The `injectIntoHtml` function gets an optional 4th argument `slotOverrides?: Record<string, string>`. When provided, a field's injection target is resolved as:
1. If `slotOverrides[fieldId]` exists → use that slot ID directly
2. Otherwise → existing `FIELD_ID_MAP` lookup as before

---

## Slot Discovery

### New utility: `src/apps/template-builder/_internal/discoverSlots.ts`

```typescript
export interface TemplateSlot {
  slotId: string;           // HTML element ID (e.g. "image1", "promo")
  type: 'image' | 'text';   // inferred from FIELD_ID_MAP or element tag
  label: string;            // human-readable (e.g. "Product Image", "Promo Text")
  isKnown: boolean;         // true if in FIELD_ID_MAP; false = advanced/raw slot
}

export function discoverSlots(html: string): TemplateSlot[]
```

**Algorithm:**
1. Parse the HTML string with `DOMParser`
2. Collect all element IDs from the document
3. Build a reverse map from `FIELD_ID_MAP` — for each `target` ID, find its parent field key and infer type + label
4. Any element ID found in the document but NOT in the reverse map → returned as `isKnown: false` with raw ID as label
5. Return deduplicated, sorted list (known slots first, then advanced)

---

## DesignStep UI

### Field row anatomy
Each field (Gemini-generated + custom) renders as a row in the mapping panel:

```
[Field Label]  [TYPE]  [feed column ▾]  →  [slot ▾]  [🗑]
```

- **Label + type badge**: existing display
- **Feed column dropdown**: existing behavior unchanged
- **Slot dropdown** (new): populated from `discoverSlots()`, shows slot label + raw ID. Hovering an option highlights that zone in the preview. Selecting assigns `slotMappings[fieldId] = slotId`.
- **Delete button**: shown on all fields. Gemini-generated fields show a confirmation tooltip ("This will remove the field from the template").

### Add Field flow
A "+ Add Field" button below the field list opens an inline form:

1. **Preset picker**: grid of known field types — Headline 2, Callout, Price, Background Image, CTA, Logo Variant, Custom
2. **If Custom**: text input for label (auto-generates snake_case id)
3. **Feed column dropdown**: same as existing
4. **Slot assignment**: "Assign slot" button that enters slot-selection mode OR "Skip for now"
5. **Confirm**: adds to `customFields` + `feedMappings` + optionally `slotMappings`

### Slot-selection mode
Activated when:
- User opens the slot dropdown on a field row
- User clicks "Assign slot" in Add Field flow
- User clicks an unassigned zone in the preview

**Behavior:**
- All known injectable zones in the preview get a pulsing blue outline overlay
- The active field row in the left panel shows a "Click a zone in the preview to assign" hint
- Clicking a zone fires `slot-click` postMessage → assigns slot → exits mode
- Pressing Escape or clicking outside the preview → cancels, exits mode

---

## Preview Interaction (Bidirectional Sync)

### Injected script (added by `injectIntoHtml`)

A self-contained `<script>` block appended to the HTML before the closing `</body>`:

```javascript
(function() {
  // Build list of all injectable element IDs (from FIELD_ID_MAP targets)
  const KNOWN_SLOTS = [/* flattened list of all target IDs from FIELD_ID_MAP */];

  // Click → parent: slot selected
  KNOWN_SLOTS.forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      window.parent.postMessage({ type: 'slot-click', slotId: id }, '*');
    });
  });

  // Parent → iframe: highlight or clear
  window.addEventListener('message', function(e) {
    if (e.data.type === 'highlight-slot') {
      KNOWN_SLOTS.forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.style.outline = '';
      });
      if (e.data.slotId) {
        var target = document.getElementById(e.data.slotId);
        if (target) target.style.outline = '3px solid #2563eb';
      }
    }
    if (e.data.type === 'slot-selection-mode') {
      KNOWN_SLOTS.forEach(function(id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.style.outline = e.data.active ? '2px dashed #2563eb' : '';
        el.style.cursor = e.data.active ? 'pointer' : '';
      });
    }
  });
})();
```

### React side (DesignStep)

**State additions:**
```typescript
const [activeSlotField, setActiveSlotField] = useState<string | null>(null);
// fieldId currently waiting for a slot assignment. null = not in selection mode.
```

**postMessage listener:**
```typescript
useEffect(() => {
  const handler = (e: MessageEvent) => {
    if (e.data.type !== 'slot-click') return;
    if (!activeSlotField) {
      // No field waiting → create new field pre-assigned to this slot
      openAddFieldForSlot(e.data.slotId);
    } else {
      // Assign slot to waiting field
      mergeStepData({ slotMappings: { ...stepData.slotMappings, [activeSlotField]: e.data.slotId } });
      setActiveSlotField(null);
    }
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}, [activeSlotField, stepData.slotMappings]);
```

**Sending highlights to iframe:**
```typescript
function highlightSlot(slotId: string | null) {
  iframeRef.current?.contentWindow?.postMessage({ type: 'highlight-slot', slotId }, '*');
}
```

---

## Error Handling

- **Slot not found in template**: if `slotMappings[fieldId]` points to an element that doesn't exist in the HTML, injection silently skips it (same as current `FIELD_ID_MAP` miss behavior)
- **Duplicate slot assignments**: allowed — two fields can target the same slot; last one wins at injection time. A warning badge shown on both rows.
- **No slots discovered**: if `discoverSlots()` returns empty (e.g. non-standard template), slot picker shows "No injectable slots found — this template may not support field injection" and the slot column is hidden

---

## Files Changed

| File | Action | Change |
|---|---|---|
| `src/apps/template-builder/types.ts` | Modify | Add `slotMappings`, `customFields` to `TemplateBuilderStepData` |
| `src/apps/template-builder/_internal/discoverSlots.ts` | Create | Slot discovery utility |
| `src/apps/template-builder/_internal/injectIntoHtml.ts` | Modify | Add `slotOverrides` param + injected postMessage script |
| `src/apps/template-builder/_internal/FilledTemplatePreview.tsx` | Modify | Add `slotOverrides`, `onSlotClick`, `highlightSlot`, `slotSelectionMode` props; handle postMessage internally |
| `src/apps/template-builder/steps/DesignStep.tsx` | Modify | Slot picker, Add Field flow, `activeSlotField` state, pass slot props to FilledTemplatePreview |
| `src/services/templateLibrary.types.ts` | Modify | Add `slotMappings` to `NewTemplateData` for persistence |

### `FilledTemplatePreview` new props

```typescript
interface FilledTemplatePreviewProps {
  // ...existing props...
  slotOverrides?: Record<string, string>;     // passed to injectIntoHtml
  highlightSlot?: string | null;              // slot to outline in preview
  slotSelectionMode?: boolean;               // pulse all known slots
  onSlotClick?: (slotId: string) => void;    // fired when user clicks a zone
}
```

The component handles postMessage internally — DesignStep only deals with React props/callbacks, never the raw iframe ref.
