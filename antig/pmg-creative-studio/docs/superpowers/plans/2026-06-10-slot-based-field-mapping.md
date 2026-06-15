# Slot-Based Field Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users in the template builder add custom field mappings and explicitly assign each field to a named visual zone (slot) in the template wireframe, with bidirectional sync between the left panel and the live preview iframe.

**Architecture:** A new `discoverSlots` utility parses loaded wireframe HTML to enumerate injectable element IDs. `injectIntoHtml` gains a `slotOverrides` param and injects a postMessage script into the template. `FilledTemplatePreview` gets interactive props (`onSlotClick`, `highlightSlot`, `slotSelectionMode`) and handles postMessage internally. `DesignStep` gains a slot picker per field row, an Add Field flow for custom fields, and an `activeSlotField` state that drives slot-selection mode.

**Tech Stack:** React, TypeScript, Vite/Vitest, existing `injectIntoHtml.ts` + `FIELD_ID_MAP`, iframe `postMessage` API, Tailwind CSS, Heroicons.

**Branch:** `feature/template-library` — all work goes here.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/apps/template-builder/types.ts` | Modify | Add `slotMappings`, `customFields` to `TemplateBuilderStepData` |
| `src/services/templateLibrary.types.ts` | Modify | Add `slotId?: string` to `FieldMapping` feed variant |
| `src/apps/template-builder/_internal/discoverSlots.ts` | **Create** | Parse wireframe HTML → list of injectable `TemplateSlot` objects |
| `src/apps/template-builder/_internal/discoverSlots.test.ts` | **Create** | Unit tests for slot discovery |
| `src/apps/template-builder/_internal/injectIntoHtml.ts` | Modify | Add `slotOverrides` param; append postMessage script to HTML |
| `src/apps/template-builder/_internal/FilledTemplatePreview.tsx` | Modify | New interactive props; enable scripts + pointer events conditionally |
| `src/apps/template-builder/steps/DesignStep.tsx` | Modify | Slot picker per row, Add Field flow, postMessage listener, slot-selection mode |
| `src/apps/template-builder/steps/PublishStep.tsx` | Modify | Pass `slotMappings` through `buildFieldMappings` |

---

## Task 1: Data Model — Add `slotMappings`, `customFields`, and `slotId` to types

**Files:**
- Modify: `src/apps/template-builder/types.ts`
- Modify: `src/services/templateLibrary.types.ts`

- [ ] **Step 1: Add new fields to `TemplateBuilderStepData`**

Open `src/apps/template-builder/types.ts`. Add two fields to the `TemplateBuilderStepData` interface inside the `// ── design step` section, after `uploadValues`:

```typescript
export interface TemplateBuilderStepData {
  // ── setup step ────────────────────────────────────────────────────
  templateName?: string;
  channel?: Channel;
  ratios?: string[];
  selectedFeedId?: string;
  selectedFeedName?: string;
  brief?: string;

  // ── design step ───────────────────────────────────────────────────
  selectedCandidateIndex?: number | null;
  feedMappings?: Record<string, string>;    // fieldId → columnName
  uploadValues?: Record<string, string>;    // fieldId → dataURL or URL
  slotMappings?: Record<string, string>;    // fieldId → explicit slotId override
  customFields?: Array<{                    // user-added fields beyond Gemini
    id: string;
    label: string;
    type: 'text' | 'image' | 'currency' | 'button' | 'asset';
  }>;
  logoVariant?: LogoVariant;
  backgroundColor?: string;
  accentColor?: string;
  textColor?: string;
  fontFamily?: string;

  // ── wireframe (Social channel only) ───────────────────────────────
  selectedWireframeId?: string;
  wireframeFile?: string;

  // index signature — required by WizardStep<S> constraint
  [k: string]: unknown;
}
```

- [ ] **Step 2: Add `slotId` to the `feed` FieldMapping variant**

Open `src/services/templateLibrary.types.ts`. Change the `feed` variant of the `FieldMapping` discriminated union:

```typescript
export type FieldMapping =
  | { source: 'feed'; column: string; slotId?: string }
  | { source: 'upload'; assetPath: string }
  | { source: 'brand'; brandKey: string }
  | { source: 'static'; value: string };
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio && git add src/apps/template-builder/types.ts src/services/templateLibrary.types.ts && git commit -m "feat: add slotMappings, customFields to TemplateBuilderStepData; slotId to FieldMapping"
```

---

## Task 2: Create `discoverSlots` utility

**Files:**
- Create: `src/apps/template-builder/_internal/discoverSlots.ts`
- Create: `src/apps/template-builder/_internal/discoverSlots.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/apps/template-builder/_internal/discoverSlots.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { discoverSlots } from './discoverSlots';

const HTML_WITH_KNOWN_SLOTS = `
  <html><body>
    <img id="image1" src="placeholder.jpg" />
    <div id="headline">Placeholder headline</div>
    <div id="promo">SALE</div>
    <img id="logo" src="logo.png" />
    <div id="unknown-zone">something</div>
  </body></html>
`;

const HTML_NO_IDS = `<html><body><div>no ids here</div></body></html>`;

describe('discoverSlots', () => {
  it('returns known slots for matching element IDs', () => {
    const slots = discoverSlots(HTML_WITH_KNOWN_SLOTS);
    const ids = slots.map((s) => s.slotId);
    expect(ids).toContain('image1');
    expect(ids).toContain('headline');
    expect(ids).toContain('promo');
    expect(ids).toContain('logo');
  });

  it('marks known slots as isKnown: true', () => {
    const slots = discoverSlots(HTML_WITH_KNOWN_SLOTS);
    const image1 = slots.find((s) => s.slotId === 'image1');
    expect(image1?.isKnown).toBe(true);
    expect(image1?.type).toBe('image');
  });

  it('includes unknown element IDs as isKnown: false', () => {
    const slots = discoverSlots(HTML_WITH_KNOWN_SLOTS);
    const unknown = slots.find((s) => s.slotId === 'unknown-zone');
    expect(unknown).toBeDefined();
    expect(unknown?.isKnown).toBe(false);
  });

  it('returns known slots before unknown slots', () => {
    const slots = discoverSlots(HTML_WITH_KNOWN_SLOTS);
    const firstUnknownIndex = slots.findIndex((s) => !s.isKnown);
    const lastKnownIndex = slots.reduce(
      (acc, s, i) => (s.isKnown ? i : acc),
      -1
    );
    if (firstUnknownIndex !== -1 && lastKnownIndex !== -1) {
      expect(lastKnownIndex).toBeLessThan(firstUnknownIndex);
    }
  });

  it('returns empty array for HTML with no element IDs', () => {
    const slots = discoverSlots(HTML_NO_IDS);
    expect(slots).toEqual([]);
  });

  it('deduplicates slot IDs', () => {
    const html = `<html><body>
      <img id="image1" /><img id="image1" />
    </body></html>`;
    const slots = discoverSlots(html);
    const image1Slots = slots.filter((s) => s.slotId === 'image1');
    expect(image1Slots).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio && npm test -- discoverSlots --run 2>&1 | tail -20
```

Expected: FAIL — `discoverSlots` not defined.

- [ ] **Step 3: Implement `discoverSlots.ts`**

Create `src/apps/template-builder/_internal/discoverSlots.ts`:

```typescript
import { FIELD_ID_MAP } from './injectIntoHtml';

export interface TemplateSlot {
  slotId: string;
  type: 'image' | 'text';
  label: string;
  isKnown: boolean;
}

// Human-readable labels for known FIELD_ID_MAP keys
const SLOT_LABELS: Record<string, string> = {
  image: 'Product Image',
  image_url: 'Product Image',
  image_2: 'Secondary Image',
  background_image: 'Background Image',
  background: 'Background',
  logo: 'Logo',
  headline: 'Headline',
  headline_1: 'Headline',
  headline_2: 'Headline 2',
  callout: 'Callout',
  tag: 'Tag',
  tag_callout: 'Tag / Callout',
  promo: 'Promo Badge',
  promo_label: 'Promo Label',
  label: 'Label',
  cta: 'CTA',
  price: 'Price',
  price_note: 'Price Note',
  callout_text: 'Callout Text',
};

// Build reverse map: slotId (element ID) → { type, label }
const REVERSE_MAP: Record<string, { type: 'image' | 'text'; label: string }> = {};
for (const [fieldKey, mapping] of Object.entries(FIELD_ID_MAP)) {
  const label = SLOT_LABELS[fieldKey] ?? fieldKey.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  for (const target of mapping.targets) {
    if (!REVERSE_MAP[target]) {
      REVERSE_MAP[target] = { type: mapping.type, label };
    }
  }
}

/**
 * Parse a wireframe HTML string and return all injectable slots.
 * Known slots (present in FIELD_ID_MAP) come first; unknown element IDs follow.
 */
export function discoverSlots(html: string): TemplateSlot[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const seen = new Set<string>();
  const known: TemplateSlot[] = [];
  const unknown: TemplateSlot[] = [];

  for (const el of Array.from(doc.querySelectorAll('[id]'))) {
    const id = el.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);

    if (REVERSE_MAP[id]) {
      known.push({
        slotId: id,
        type: REVERSE_MAP[id].type,
        label: REVERSE_MAP[id].label,
        isKnown: true,
      });
    } else {
      unknown.push({
        slotId: id,
        type: el.tagName === 'IMG' ? 'image' : 'text',
        label: id,
        isKnown: false,
      });
    }
  }

  return [...known, ...unknown];
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio && npm test -- discoverSlots --run 2>&1 | tail -20
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio && git add src/apps/template-builder/_internal/discoverSlots.ts src/apps/template-builder/_internal/discoverSlots.test.ts && git commit -m "feat: add discoverSlots utility — parse wireframe HTML to enumerate injectable slots"
```

---

## Task 3: Update `injectIntoHtml` — add `slotOverrides` + postMessage script

**Files:**
- Modify: `src/apps/template-builder/_internal/injectIntoHtml.ts`

The `injectIntoHtml` function gets:
1. An optional 4th argument `slotOverrides?: Record<string, string>` — when provided, resolves a field's target element directly by ID instead of going through `FIELD_ID_MAP`.
2. A new exported function `buildInteractiveScript()` that returns a self-contained `<script>` block for postMessage-based slot interaction.

- [ ] **Step 1: Add `slotOverrides` param and `buildInteractiveScript` to `injectIntoHtml.ts`**

Open `src/apps/template-builder/_internal/injectIntoHtml.ts`. Replace the `injectIntoHtml` function signature and body, and add the new `buildInteractiveScript` export at the end of the file:

```typescript
// All known injectable target IDs (flattened from FIELD_ID_MAP) for the
// interactive postMessage script to listen on.
const ALL_KNOWN_TARGETS: string[] = Array.from(
  new Set(Object.values(FIELD_ID_MAP).flatMap((m) => m.targets))
);

export function injectIntoHtml(
  html: string,
  injections: Record<string, { type: 'image' | 'text'; value: string }>,
  cssOverrides?: Record<string, string>,
  slotOverrides?: Record<string, string>
): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // --- Element-level injections (img src, textContent) ---
  for (const [fieldId, { type, value }] of Object.entries(injections)) {
    if (!value) continue;

    const lowerField = fieldId.toLowerCase();
    let targetIds: string[] = [];

    // 1. Explicit slot override takes priority
    if (slotOverrides?.[lowerField]) {
      targetIds = [slotOverrides[lowerField]];
    } else if (FIELD_ID_MAP[lowerField]) {
      // 2. Direct FIELD_ID_MAP lookup
      targetIds = FIELD_ID_MAP[lowerField].targets;
    } else {
      // 3. Partial match fallback
      for (const [key, mapping] of Object.entries(FIELD_ID_MAP)) {
        if (lowerField.includes(key) || key.includes(lowerField)) {
          targetIds = mapping.targets;
          break;
        }
      }
    }

    for (const tid of targetIds) {
      const el =
        doc.querySelector(`#${tid}`) ||
        (doc.querySelector(`[id*="${tid}"]`) as HTMLElement | null);
      if (!el) continue;

      if (type === 'image') {
        (el as HTMLImageElement).src = value;
        el.removeAttribute('srcset');
      } else {
        el.textContent = value;
      }
      break;
    }
  }

  // --- CSS-level overrides (colors, fonts) ---
  if (cssOverrides && Object.keys(cssOverrides).length > 0) {
    let styleRules = '';
    for (const [key, val] of Object.entries(cssOverrides)) {
      if (!val) continue;
      const rules = CSS_INJECTION_MAP[key];
      if (!rules) continue;
      for (const { selector, property } of rules) {
        if (doc.querySelector(selector)) {
          styleRules += `${selector} { ${property}: ${val} !important; }\n`;
        }
      }
    }
    if (styleRules) {
      const styleEl = doc.createElement('style');
      styleEl.id = '__dynamic-overrides__';
      styleEl.textContent = styleRules;
      doc.head.appendChild(styleEl);
    }
  }

  return new XMLSerializer().serializeToString(doc);
}

/**
 * Returns a self-contained <script> string to append to wireframe HTML when
 * the preview needs to be interactive (slot-selection mode). The script:
 * - Sends `{ type: 'slot-click', slotId }` to the parent when a known slot is clicked
 * - Listens for `{ type: 'highlight-slot', slotId }` to outline a single slot
 * - Listens for `{ type: 'slot-selection-mode', active }` to pulse all known slots
 */
export function buildInteractiveScript(): string {
  const slotsJson = JSON.stringify(ALL_KNOWN_TARGETS);
  return `<script>
(function() {
  var KNOWN = ${slotsJson};
  KNOWN.forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      window.parent.postMessage({ type: 'slot-click', slotId: id }, '*');
    });
    el.style.transition = 'outline 0.15s';
  });
  window.addEventListener('message', function(e) {
    if (!e.data || !e.data.type) return;
    if (e.data.type === 'highlight-slot') {
      KNOWN.forEach(function(id) {
        var el = document.getElementById(id);
        if (el) { el.style.outline = ''; el.style.cursor = ''; }
      });
      if (e.data.slotId) {
        var t = document.getElementById(e.data.slotId);
        if (t) { t.style.outline = '3px solid #2563eb'; t.style.cursor = 'default'; }
      }
    }
    if (e.data.type === 'slot-selection-mode') {
      KNOWN.forEach(function(id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.style.outline = e.data.active ? '2px dashed #2563eb' : '';
        el.style.cursor = e.data.active ? 'pointer' : '';
      });
    }
    if (e.data.type === 'clear-highlights') {
      KNOWN.forEach(function(id) {
        var el = document.getElementById(id);
        if (el) { el.style.outline = ''; el.style.cursor = ''; }
      });
    }
  });
})();
</script>`;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 3: Run existing tests to confirm nothing broke**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio && npm test -- --run 2>&1 | tail -10
```

Expected: same passing count as before.

- [ ] **Step 4: Commit**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio && git add src/apps/template-builder/_internal/injectIntoHtml.ts && git commit -m "feat: add slotOverrides param and buildInteractiveScript to injectIntoHtml"
```

---

## Task 4: Update `FilledTemplatePreview` — interactive props

**Files:**
- Modify: `src/apps/template-builder/_internal/FilledTemplatePreview.tsx`

Add 4 new optional props: `slotOverrides`, `onSlotClick`, `highlightSlot`, `slotSelectionMode`. When any interactive prop is present, the component:
- Passes `slotOverrides` to `injectIntoHtml`
- Appends `buildInteractiveScript()` to the HTML
- Adds `allow-scripts` to the iframe sandbox
- Removes `pointerEvents: 'none'` from the iframe
- Listens for `slot-click` postMessages and calls `onSlotClick`
- Sends `highlight-slot` / `slot-selection-mode` messages into the iframe when props change

- [ ] **Step 1: Rewrite `FilledTemplatePreview.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { injectIntoHtml, buildInteractiveScript } from './injectIntoHtml';

export const FilledTemplatePreview = ({
  templateFile,
  name,
  scale = 0.3,
  adSize = 1024,
  injections,
  cssOverrides,
  slotOverrides,
  onSlotClick,
  highlightSlot,
  slotSelectionMode = false,
}: {
  templateFile: string;
  name: string;
  scale?: number;
  adSize?: number;
  injections: Record<string, { type: 'image' | 'text'; value: string }>;
  cssOverrides?: Record<string, string>;
  slotOverrides?: Record<string, string>;
  onSlotClick?: (slotId: string) => void;
  highlightSlot?: string | null;
  slotSelectionMode?: boolean;
}) => {
  const [srcdoc, setSrcdoc] = useState<string>('');
  const [loaded, setLoaded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const clipSize = Math.round(adSize * scale);
  const isInteractive = Boolean(onSlotClick || slotSelectionMode);

  // Rebuild srcdoc when template or injections change
  useEffect(() => {
    setLoaded(false);
    setSrcdoc('');
    fetch(`/template_examples/social/${templateFile}`)
      .then((r) => r.text())
      .then((html) => {
        let filled = injectIntoHtml(html, injections, cssOverrides, slotOverrides);
        if (isInteractive) {
          filled = filled.replace('</body>', `${buildInteractiveScript()}</body>`);
        }
        setSrcdoc(filled);
      })
      .catch((err) =>
        console.error('[FilledTemplatePreview] fetch error:', err)
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateFile, JSON.stringify(injections), JSON.stringify(cssOverrides), JSON.stringify(slotOverrides), isInteractive]);

  // Send highlight-slot message when highlightSlot prop changes
  useEffect(() => {
    if (!loaded || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      { type: 'highlight-slot', slotId: highlightSlot ?? null },
      '*'
    );
  }, [highlightSlot, loaded]);

  // Send slot-selection-mode message when prop changes
  useEffect(() => {
    if (!loaded || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      { type: 'slot-selection-mode', active: slotSelectionMode },
      '*'
    );
  }, [slotSelectionMode, loaded]);

  // Listen for slot-click postMessages from the iframe
  useEffect(() => {
    if (!onSlotClick) return;
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'slot-click' && e.data.slotId) {
        onSlotClick(e.data.slotId as string);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onSlotClick]);

  return (
    <div
      style={{
        width: `${clipSize}px`,
        height: `${clipSize}px`,
        overflow: 'hidden',
        borderRadius: '4px',
        position: 'relative',
        flexShrink: 0,
        background: '#f3f4f6',
        boxShadow: slotSelectionMode
          ? '0 0 0 2px #2563eb'
          : '0 0 0 1px rgba(0,0,0,0.07)',
      }}
    >
      {!loaded && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite',
            zIndex: 2,
          }}
        />
      )}
      <div
        style={{
          width: `${adSize}px`,
          height: `${adSize}px`,
          transformOrigin: 'top left',
          transform: `scale(${scale})`,
          opacity: loaded ? 1 : 0,
          transition: 'opacity 0.3s ease',
        }}
      >
        {srcdoc && (
          <iframe
            ref={iframeRef}
            srcDoc={srcdoc}
            onLoad={() => setLoaded(true)}
            style={{
              width: `${adSize}px`,
              height: `${adSize}px`,
              border: 'none',
              pointerEvents: isInteractive ? 'auto' : 'none',
              display: 'block',
              cursor: slotSelectionMode ? 'crosshair' : 'default',
            }}
            title={name}
            scrolling="no"
            sandbox={isInteractive ? 'allow-same-origin allow-scripts' : 'allow-same-origin'}
          />
        )}
      </div>
    </div>
  );
};

export default FilledTemplatePreview;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio && git add src/apps/template-builder/_internal/FilledTemplatePreview.tsx && git commit -m "feat: add interactive slot props to FilledTemplatePreview (onSlotClick, highlightSlot, slotSelectionMode)"
```

---

## Task 5: DesignStep — slot picker per existing field row

**Files:**
- Modify: `src/apps/template-builder/steps/DesignStep.tsx`

Add `activeSlotField` state and a slot dropdown to each existing field row. When the slot dropdown opens, it enters slot-selection mode on the preview. When a slot is picked (either from the dropdown OR by clicking the preview), `slotMappings` is updated and slot-selection mode exits.

- [ ] **Step 1: Add imports and `activeSlotField` state to `DesignStepBody`**

At the top of `DesignStep.tsx`, add to the existing imports:

```typescript
import { discoverSlots } from '../_internal/discoverSlots';
import type { TemplateSlot } from '../_internal/discoverSlots';
import { PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
```

Inside `DesignStepBody`, add after the existing `useState` declarations:

```typescript
const [activeSlotField, setActiveSlotField] = useState<string | null>(null);
```

Add a derived value for discovered slots (after the `cssOverrides` block):

```typescript
const discoveredSlots: TemplateSlot[] = stepData.wireframeFile
  ? (() => {
      // discoverSlots needs the raw HTML — we cache it in a ref to avoid re-parsing
      return _lastDiscoveredSlots;
    })()
  : [];
```

Add a module-level cache ref just below the existing `let _designCtx` line:

```typescript
let _lastDiscoveredSlots: TemplateSlot[] = [];
```

Update the wireframe fetch effect to also discover slots. Inside the `useEffect` that builds injections — actually, slots need to be discovered from the fetched HTML. The cleanest way is to add a `useEffect` inside `DesignStepBody`:

```typescript
useEffect(() => {
  if (!stepData.wireframeFile) {
    _lastDiscoveredSlots = [];
    return;
  }
  fetch(`/template_examples/social/${stepData.wireframeFile}`)
    .then((r) => r.text())
    .then((html) => {
      _lastDiscoveredSlots = discoverSlots(html);
    })
    .catch(() => { _lastDiscoveredSlots = []; });
}, [stepData.wireframeFile]);
```

Actually, since `discoverSlots` needs to trigger a re-render, use local state instead of a module-level cache:

Replace the module-level `_lastDiscoveredSlots` approach with local state inside `DesignStepBody`:

```typescript
const [discoveredSlots, setDiscoveredSlots] = useState<TemplateSlot[]>([]);

useEffect(() => {
  if (!stepData.wireframeFile) { setDiscoveredSlots([]); return; }
  fetch(`/template_examples/social/${stepData.wireframeFile}`)
    .then((r) => r.text())
    .then((html) => setDiscoveredSlots(discoverSlots(html)))
    .catch(() => setDiscoveredSlots([]));
}, [stepData.wireframeFile]);
```

- [ ] **Step 2: Update the field mapping section to show slot pickers**

Find the field mapping `<div>` inside `DesignStepBody` (the section that maps `dynamicRequirements`). Replace the `return (...)` block for each field row with this extended version that adds a slot picker row below the column dropdown:

```tsx
{dynamicRequirements.map((field) => {
  const isSuggested = suggestedFields.has(field.id);
  const currentVal = feedMappings[field.id] ?? '';
  const slotMappings = stepData.slotMappings ?? {};
  const assignedSlot = slotMappings[field.id];
  const isSelectingSlot = activeSlotField === field.id;

  return (
    <div
      key={field.id}
      className={cn(
        'space-y-1.5 p-3 rounded-xl transition-all',
        isSelectingSlot ? 'bg-blue-50 border-2 border-blue-200' : 'bg-transparent border-2 border-transparent'
      )}
    >
      <div className="flex items-center gap-2">
        <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest flex-1">
          {field.label}
        </label>
        <span
          className={cn(
            'px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest',
            field.type === 'image'
              ? 'bg-amber-50 text-amber-600'
              : 'bg-gray-100 text-gray-400'
          )}
        >
          {field.type}
        </span>
        {isSuggested && (
          <span className="px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest bg-gray-50 text-gray-400 flex items-center gap-1">
            <CheckIcon className="h-2.5 w-2.5" />
            AI suggested
          </span>
        )}
      </div>

      {/* Column dropdown */}
      <select
        value={currentVal}
        onChange={(e) =>
          mergeStepData({
            feedMappings: { ...feedMappings, [field.id]: e.target.value },
          })
        }
        className={cn(
          'w-full px-3 py-2 rounded-xl border-2 focus:ring-4 outline-none transition-all text-[10px] font-bold text-gray-900 bg-white',
          field.type === 'image' && currentVal && !IMAGE_COLUMN_KEYWORDS.some((k) => currentVal.toLowerCase().includes(k))
            ? 'border-amber-300 focus:border-amber-400 focus:ring-amber-50'
            : 'border-gray-100 focus:border-blue-600 focus:ring-blue-50'
        )}
      >
        <option value="">— Select column —</option>
        {feedColumns.map((col) => (
          <option key={col} value={col}>{col}</option>
        ))}
      </select>

      {field.type === 'image' && currentVal && !IMAGE_COLUMN_KEYWORDS.some((k) => currentVal.toLowerCase().includes(k)) && (
        <div className="flex items-center gap-1.5">
          <ExclamationTriangleIcon className="h-3 w-3 text-amber-500 shrink-0" />
          <p className="text-[9px] font-bold text-amber-600">
            "{currentVal}" may not contain image URLs — check this column has image links, not text or dates.
          </p>
        </div>
      )}

      {/* Slot picker row */}
      {discoveredSlots.length > 0 && (
        <div className="flex items-center gap-2 pt-0.5">
          <span className="text-[8px] font-black text-gray-300 uppercase tracking-widest shrink-0">Slot</span>
          {isSelectingSlot ? (
            <div className="flex items-center gap-1.5 flex-1">
              <span className="text-[9px] text-blue-600 font-bold animate-pulse">
                Click a zone in the preview →
              </span>
              <button
                type="button"
                onClick={() => setActiveSlotField(null)}
                className="text-[8px] text-gray-400 hover:text-gray-600"
              >
                cancel
              </button>
            </div>
          ) : (
            <select
              value={assignedSlot ?? ''}
              onFocus={() => setActiveSlotField(field.id)}
              onChange={(e) => {
                const slotId = e.target.value;
                mergeStepData({
                  slotMappings: { ...(stepData.slotMappings ?? {}), [field.id]: slotId },
                });
                setActiveSlotField(null);
              }}
              onBlur={() => {
                // Only clear if not picking via preview click
                setTimeout(() => setActiveSlotField((prev) => prev === field.id ? null : prev), 150);
              }}
              className="flex-1 px-2 py-1 rounded-lg border border-gray-100 focus:border-blue-400 outline-none text-[9px] font-medium text-gray-700 bg-white"
            >
              <option value="">— auto —</option>
              {discoveredSlots.map((slot) => (
                <option key={slot.slotId} value={slot.slotId}>
                  {slot.isKnown ? slot.label : slot.slotId} ({slot.slotId})
                </option>
              ))}
            </select>
          )}
          {assignedSlot && !isSelectingSlot && (
            <button
              type="button"
              title="Clear slot assignment"
              onClick={() => {
                const next = { ...(stepData.slotMappings ?? {}) };
                delete next[field.id];
                mergeStepData({ slotMappings: next });
              }}
              className="text-gray-300 hover:text-red-400 transition-colors"
            >
              <XMarkIcon className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
})}
```

- [ ] **Step 3: Wire `activeSlotField` and slots into the `FilledTemplatePreview` in the right panel**

Find the `<FilledTemplatePreview ... />` call in the right panel (`isSocial && hasWireframe`). Update it to pass the interactive props:

```tsx
<FilledTemplatePreview
  templateFile={wireframe.file}
  name={wireframe.name}
  scale={360 / (wireframe.adSize || 1024)}
  adSize={wireframe.adSize || 1024}
  injections={injections}
  cssOverrides={cssOverrides}
  slotOverrides={stepData.slotMappings}
  slotSelectionMode={activeSlotField !== null}
  highlightSlot={activeSlotField !== null ? (stepData.slotMappings?.[activeSlotField] ?? null) : null}
  onSlotClick={(slotId) => {
    if (activeSlotField) {
      mergeStepData({
        slotMappings: { ...(stepData.slotMappings ?? {}), [activeSlotField]: slotId },
      });
      setActiveSlotField(null);
    }
  }}
/>
```

Also add a slot-selection mode banner above the preview when `activeSlotField !== null`:

```tsx
{activeSlotField !== null && (
  <div className="flex items-center justify-between px-4 py-2 bg-blue-600 rounded-xl text-white">
    <span className="text-[10px] font-black uppercase tracking-widest">
      Click a zone to assign to "{allFields.find(r => r.id === activeSlotField)?.label ?? activeSlotField}"
    </span>
    <button
      type="button"
      onClick={() => setActiveSlotField(null)}
      className="text-blue-200 hover:text-white text-[9px] font-bold uppercase tracking-widest"
    >
      Cancel
    </button>
  </div>
)}
```

Place this banner just before the `<div className="bg-white rounded-3xl ...">` preview container.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio && npx tsc --noEmit 2>&1
```

Fix any errors before committing.

- [ ] **Step 5: Run tests**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio && npm test -- --run 2>&1 | tail -10
```

- [ ] **Step 6: Commit**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio && git add src/apps/template-builder/steps/DesignStep.tsx && git commit -m "feat: add slot picker to field mapping rows in DesignStep"
```

---

## Task 6: DesignStep — Add Field flow

**Files:**
- Modify: `src/apps/template-builder/steps/DesignStep.tsx`

Add a "+ Add Field" button below the field mapping list. It opens an inline form to create a custom field with type, label, feed column, and optional slot assignment.

- [ ] **Step 1: Add `addFieldOpen` state and `AddFieldForm` component**

At the top of `DesignStepBody` add:

```typescript
const [addFieldOpen, setAddFieldOpen] = useState(false);
const [newFieldType, setNewFieldType] = useState<'text' | 'image' | 'currency'>('text');
const [newFieldPreset, setNewFieldPreset] = useState('');
const [newFieldCustomLabel, setNewFieldCustomLabel] = useState('');
const [newFieldColumn, setNewFieldColumn] = useState('');
```

- [ ] **Step 2: Add the "+ Add Field" button and inline form below the existing field rows**

Directly after the closing `</div>` of the field mapping rows (after `dynamicRequirements.map(...)`), inside the `dynamicRequirements.length > 0` block, add:

```tsx
{/* Add Field */}
{!addFieldOpen ? (
  <button
    type="button"
    onClick={() => setAddFieldOpen(true)}
    className="flex items-center gap-1.5 text-[9px] font-black text-blue-600 uppercase tracking-widest hover:text-blue-800 transition-colors mt-2"
  >
    <PlusIcon className="h-3 w-3" />
    Add Field
  </button>
) : (
  <div className="border-2 border-blue-100 rounded-xl p-4 space-y-3 bg-blue-50/30">
    <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">New Field</p>

    {/* Preset picker */}
    <div className="grid grid-cols-3 gap-1.5">
      {[
        { id: 'headline_2', label: 'Headline 2', type: 'text' as const },
        { id: 'callout', label: 'Callout', type: 'text' as const },
        { id: 'price', label: 'Price', type: 'currency' as const },
        { id: 'background_image', label: 'BG Image', type: 'image' as const },
        { id: 'cta', label: 'CTA', type: 'text' as const },
        { id: '__custom__', label: 'Custom', type: 'text' as const },
      ].map((preset) => (
        <button
          key={preset.id}
          type="button"
          onClick={() => {
            setNewFieldPreset(preset.id);
            setNewFieldType(preset.type);
            if (preset.id !== '__custom__') setNewFieldCustomLabel('');
          }}
          className={cn(
            'px-2 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-wide border-2 transition-all',
            newFieldPreset === preset.id
              ? 'border-blue-500 bg-blue-50 text-blue-700'
              : 'border-gray-100 text-gray-400 hover:border-blue-200'
          )}
        >
          {preset.label}
        </button>
      ))}
    </div>

    {/* Custom label input */}
    {newFieldPreset === '__custom__' && (
      <input
        type="text"
        placeholder="Field label (e.g. Sub-headline)"
        value={newFieldCustomLabel}
        onChange={(e) => setNewFieldCustomLabel(e.target.value)}
        className="w-full px-3 py-2 rounded-xl border-2 border-gray-100 focus:border-blue-600 focus:ring-4 focus:ring-blue-50 outline-none text-[10px] font-bold text-gray-900 bg-white"
      />
    )}

    {/* Column picker */}
    <select
      value={newFieldColumn}
      onChange={(e) => setNewFieldColumn(e.target.value)}
      className="w-full px-3 py-2 rounded-xl border-2 border-gray-100 focus:border-blue-600 outline-none text-[10px] font-bold text-gray-900 bg-white"
    >
      <option value="">— Select feed column —</option>
      {feedColumns.map((col) => (
        <option key={col} value={col}>{col}</option>
      ))}
    </select>

    {/* Actions */}
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={!newFieldPreset || !newFieldColumn || (newFieldPreset === '__custom__' && !newFieldCustomLabel.trim())}
        onClick={() => {
          const id = newFieldPreset === '__custom__'
            ? newFieldCustomLabel.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
            : newFieldPreset;
          const label = newFieldPreset === '__custom__'
            ? newFieldCustomLabel.trim()
            : { headline_2: 'Headline 2', callout: 'Callout', price: 'Price', background_image: 'Background Image', cta: 'CTA' }[newFieldPreset] ?? newFieldPreset;

          const existingCustom = stepData.customFields ?? [];
          // Don't add if id already exists
          if (existingCustom.some((f) => f.id === id) || requirements.some((r) => r.id === id)) return;

          mergeStepData({
            customFields: [...existingCustom, { id, label, type: newFieldType }],
            feedMappings: { ...feedMappings, [id]: newFieldColumn },
          });
          setAddFieldOpen(false);
          setNewFieldPreset('');
          setNewFieldCustomLabel('');
          setNewFieldColumn('');
        }}
        className="flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest bg-blue-600 text-white disabled:bg-gray-100 disabled:text-gray-300 transition-all"
      >
        Add
      </button>
      <button
        type="button"
        onClick={() => { setAddFieldOpen(false); setNewFieldPreset(''); setNewFieldCustomLabel(''); setNewFieldColumn(''); }}
        className="py-2 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest text-gray-400 hover:text-gray-600"
      >
        Cancel
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 3: Render custom fields alongside Gemini fields**

Find the `const dynamicRequirements = requirements.filter(...)` line and update it to also include custom fields:

```typescript
const customFields = stepData.customFields ?? [];
const allFields: Array<RequirementField> = [
  ...requirements.filter((r) => r.category === 'Dynamic'),
  ...customFields.map((f) => ({
    id: f.id,
    label: f.label,
    category: 'Dynamic' as const,
    source: 'Feed',
    type: f.type,
  })),
];
```

Then replace all references to `dynamicRequirements` in the JSX (the `.map()` and the `dynamicRequirements.length > 0` check) with `allFields`.

Also add a delete button for custom fields — in the field row, after the slot picker row, add:

```tsx
{customFields.some((f) => f.id === field.id) && (
  <button
    type="button"
    onClick={() => {
      mergeStepData({
        customFields: customFields.filter((f) => f.id !== field.id),
        feedMappings: (() => {
          const next = { ...feedMappings };
          delete next[field.id];
          return next;
        })(),
        slotMappings: (() => {
          const next = { ...(stepData.slotMappings ?? {}) };
          delete next[field.id];
          return next;
        })(),
      });
    }}
    className="text-[8px] font-bold text-red-400 hover:text-red-600 uppercase tracking-widest transition-colors mt-0.5"
  >
    Remove field
  </button>
)}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio && npx tsc --noEmit 2>&1
```

- [ ] **Step 5: Commit**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio && git add src/apps/template-builder/steps/DesignStep.tsx && git commit -m "feat: Add Field flow in DesignStep — custom fields with type, column, and slot assignment"
```

---

## Task 7: Wire `slotMappings` through `PublishStep` to persistence

**Files:**
- Modify: `src/apps/template-builder/steps/PublishStep.tsx`

`buildFieldMappings` currently converts `feedMappings + uploadValues` into `Record<string, FieldMapping>`. Update it to also include `slotId` from `slotMappings` on feed-sourced fields.

- [ ] **Step 1: Update `buildFieldMappings` in `PublishStep.tsx`**

Find the `buildFieldMappings` function and update its signature and body:

```typescript
function buildFieldMappings(
  feedMappings: Record<string, string>,
  uploadValues: Record<string, string>,
  slotMappings?: Record<string, string>
): Record<string, FieldMapping> {
  const result: Record<string, FieldMapping> = {};
  for (const [fieldId, column] of Object.entries(feedMappings)) {
    result[fieldId] = {
      source: 'feed',
      column,
      ...(slotMappings?.[fieldId] ? { slotId: slotMappings[fieldId] } : {}),
    };
  }
  for (const [fieldId, assetPath] of Object.entries(uploadValues)) {
    result[fieldId] = { source: 'upload', assetPath };
  }
  return result;
}
```

- [ ] **Step 2: Update the `newTemplateData` construction to pass `slotMappings`**

Find the `newTemplateData` object in `PublishStepBody` and update the `fieldMappings` line:

```typescript
fieldMappings: buildFieldMappings(feedMappings, uploadValues, stepData.slotMappings),
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 4: Run all tests**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio && npm test -- --run 2>&1 | tail -15
```

- [ ] **Step 5: Commit**

```bash
cd /Users/annienguyen/Documents/GitHub/dl-creative-studio/antig/pmg-creative-studio && git add src/apps/template-builder/steps/PublishStep.tsx && git commit -m "feat: persist slotMappings as slotId on FieldMapping feed records"
```

---

## Testing the Full Flow

After all tasks complete, test end-to-end on localhost:

1. Open `http://localhost:5177/adlabs/ralph_lauren/template-builder`
2. Complete Step 1 — pick PRODUCT_FEED, Social channel, 1:1 ratio
3. On Step 2 — select a wireframe template
4. Verify: each field row shows a "Slot" dropdown populated with available slots from the template
5. Open the slot dropdown for "Headline" — the preview should enter slot-selection mode (blue dashed outlines on all zones)
6. Click a zone in the preview — it should assign to the Headline field and exit selection mode
7. Hover over the assigned slot in the dropdown — the preview should highlight that zone
8. Click "+ Add Field" → pick "Callout" preset → select a feed column → confirm
9. Assign the new Callout field to a slot via the preview
10. Proceed to Step 3 — publish
11. Check Firestore: the published template's `fieldMappings` should have `slotId` on feed-sourced fields
