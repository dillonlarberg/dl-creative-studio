/**
 * Lifted verbatim from src/pages/use-cases/UseCaseWizardPage.tsx lines 108-237.
 * Maps a field requirement label/id to a list of element IDs to try (in
 * priority order), and CSS injection rules for color/font overrides.
 */

export const FIELD_ID_MAP: Record<
  string,
  { type: 'image' | 'text'; targets: string[] }
> = {
  // ---- image fields ----
  image: {
    type: 'image',
    targets: [
      'image1',
      'image_1',
      'singe-image-1',
      'image_1_single',
      'double_image_1',
      'image_1_double',
      'main-image',
      'image_3',
    ],
  },
  image_url: {
    type: 'image',
    targets: ['image1', 'image_1', 'double_image_1', 'main-image', 'image_3'],
  },
  image_2: {
    type: 'image',
    targets: ['image2', 'image_2', 'double_image_2', 'image_2_double', 'image_1_double'],
  },
  background_image: {
    type: 'image',
    targets: [
      'background-image',
      'image_background',
      'background_image',
      'bg',
      'background_asset',
      'background_test',
    ],
  },
  background: {
    type: 'image',
    targets: ['background-image', 'image_background', 'bg', 'background'],
  },
  logo: { type: 'image', targets: ['logo', 'logo_1', 'logo_2', 'fbg-logo'] },
  // ---- text fields ----
  headline: {
    type: 'text',
    targets: ['headline', 'headline1', 'headline2', 'tag', 'callout', 'promo', 'label'],
  },
  headline_1: { type: 'text', targets: ['headline1', 'headline', 'headline_1'] },
  headline_2: { type: 'text', targets: ['headline2', 'headline_2'] },
  callout: { type: 'text', targets: ['callout', 'tag', 'promo', 'label'] },
  tag: { type: 'text', targets: ['tag', 'callout', 'label'] },
  tag_callout: { type: 'text', targets: ['tag', 'callout', 'label', 'promo'] },
  promo: { type: 'text', targets: ['promo', 'label', 'callout', 'tag'] },
  promo_label: { type: 'text', targets: ['promo', 'label', 'callout'] },
  label: { type: 'text', targets: ['label', 'promo', 'callout'] },
  cta: { type: 'text', targets: ['cta', 'promo', 'label'] },
  price: { type: 'text', targets: ['price', 'price-note', 'promo', 'label'] },
  price_note: { type: 'text', targets: ['price-note', 'promo'] },
  callout_text: { type: 'text', targets: ['callout', 'tag', 'label'] },
};

export const CSS_INJECTION_MAP: Record<
  string,
  { selector: string; property: string }[]
> = {
  background_color: [
    { selector: '#ad', property: 'background-color' },
    { selector: '#base', property: 'background-color' },
    { selector: '#bg', property: 'background-color' },
    { selector: '#background', property: 'background-color' },
    { selector: '#left', property: 'background-color' },
  ],
  accent_color: [
    { selector: '#callout-container', property: 'background-color' },
    { selector: '#promo', property: 'background-color' },
    { selector: '#label', property: 'background-color' },
    { selector: '#tag', property: 'background-color' },
    { selector: '#left-bar', property: 'background-color' },
    { selector: '#logo-group', property: 'background-color' },
  ],
  text_color: [
    { selector: '#headline', property: 'color' },
    { selector: '#headline1', property: 'color' },
    { selector: '#headline2', property: 'color' },
    { selector: '#callout', property: 'color' },
    { selector: '#promo', property: 'color' },
    { selector: '#tag', property: 'color' },
    { selector: '#label', property: 'color' },
    { selector: '#cta', property: 'color' },
  ],
  font_family: [
    { selector: '#headline', property: 'font-family' },
    { selector: '#headline1', property: 'font-family' },
    { selector: '#headline2', property: 'font-family' },
    { selector: '#callout', property: 'font-family' },
    { selector: '#promo', property: 'font-family' },
    { selector: '#tag', property: 'font-family' },
    { selector: '#label', property: 'font-family' },
    { selector: '#cta', property: 'font-family' },
    { selector: 'body', property: 'font-family' },
  ],
};

// All known injectable target IDs (flattened from FIELD_ID_MAP, deduplicated)
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
 * - Listens for `{ type: 'clear-highlights' }` to remove all outlines
 */
export function buildInteractiveScript(): string {
  const slotsJson = JSON.stringify(ALL_KNOWN_TARGETS);
  // IDs that are structural containers, not content slots
  const skipIds = JSON.stringify(['ad', 'base', 'background', 'bg']);
  return `<script>
(function() {
  var KNOWN = ${slotsJson};
  var SKIP = ${skipIds};

  // Find the nearest ancestor (or self) that has an ID worth selecting
  function findSlotEl(target) {
    var node = target;
    while (node && node.tagName !== 'BODY') {
      if (node.id && SKIP.indexOf(node.id) === -1) return node;
      node = node.parentElement;
    }
    return null;
  }

  // Global click — fires for ANY element, not just known slots
  document.addEventListener('click', function(e) {
    var found = findSlotEl(e.target);
    if (!found) return;
    e.preventDefault();
    e.stopPropagation();
    window.parent.postMessage({
      type: 'slot-click',
      slotId: found.id,
      isKnown: KNOWN.indexOf(found.id) !== -1,
    }, '*');
  });

  // Hover — show which element will be selected
  var _lastHovered = null;
  document.addEventListener('mouseover', function(e) {
    var found = findSlotEl(e.target);
    if (_lastHovered && _lastHovered !== found) {
      _lastHovered.dataset.hoverOutline = '';
      if (!_lastHovered.dataset.pinned) _lastHovered.style.outline = _lastHovered.dataset.savedOutline || '';
    }
    if (found) {
      found.dataset.savedOutline = found.dataset.savedOutline || found.style.outline || '';
      found.style.outline = '2px solid rgba(99,102,241,0.5)';
      found.style.cursor = 'pointer';
      _lastHovered = found;
    }
  });
  document.addEventListener('mouseout', function(e) {
    var found = findSlotEl(e.target);
    if (found && !found.dataset.pinned) {
      found.style.outline = found.dataset.savedOutline || '';
      found.style.cursor = '';
    }
  });

  // Parent messages
  window.addEventListener('message', function(e) {
    if (!e.data || !e.data.type) return;
    if (e.data.type === 'highlight-slot') {
      document.querySelectorAll('[id]').forEach(function(el) {
        if (SKIP.indexOf(el.id) !== -1) return;
        el.style.outline = el.dataset.savedOutline || '';
        el.style.cursor = '';
        delete el.dataset.pinned;
      });
      if (e.data.slotId) {
        var t = document.getElementById(e.data.slotId);
        if (t) {
          t.style.outline = '3px solid #2563eb';
          t.dataset.pinned = '1';
        }
      }
    }
    if (e.data.type === 'slot-selection-mode') {
      document.querySelectorAll('[id]').forEach(function(el) {
        if (SKIP.indexOf(el.id) !== -1) return;
        el.style.outline = e.data.active ? '2px dashed #6366f1' : (el.dataset.savedOutline || '');
        el.style.cursor = e.data.active ? 'crosshair' : '';
      });
    }
    if (e.data.type === 'clear-highlights') {
      document.querySelectorAll('[id]').forEach(function(el) {
        el.style.outline = '';
        el.style.cursor = '';
        delete el.dataset.pinned;
      });
    }
  });
})();
</script>`;
}
