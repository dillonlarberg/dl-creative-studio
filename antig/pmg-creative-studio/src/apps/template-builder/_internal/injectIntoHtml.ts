/**
 * Lifted verbatim from src/pages/use-cases/UseCaseWizardPage.tsx lines 108-237.
 * Maps a field requirement label/id to a list of element IDs to try (in
 * priority order), and CSS injection rules for color/font overrides.
 */

import type { ZoneStyle, ZoneBound, CustomZone } from '../types';

export interface InjectOptions {
  injections: Record<string, { type: 'image' | 'text'; value: string }>;
  cssOverrides?: Record<string, string>;
  slotOverrides?: Record<string, string>;
  fieldTransforms?: Record<string, string[]>;
  zoneStyles?: Record<string, ZoneStyle>;
  /**
   * Canvas layer position/size overrides — applied independently of feed injections.
   * All coordinate values are adSize (native) coords. The iframe renders at adSize
   * resolution, so these pixel values map 1:1 to the wireframe's coordinate space.
   * Do NOT use displaySize coords here.
   */
  layoutOverrides?: {
    zoneOverrides?: Record<string, ZoneBound>;
    customZones?: CustomZone[];
  };
  /** slotId → Asset House URL; sets img src or background-image independently of injections. */
  zoneAssets?: Record<string, string>;
}

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

// Serialisable targets map for embedding in the interactive script
const FIELD_TARGETS_JSON = JSON.stringify(
  Object.fromEntries(Object.entries(FIELD_ID_MAP).map(([k, v]) => [k, v.targets]))
);

/** Build CSS override rules string without touching the DOM (safe for postMessage). */
export function buildCssRulesString(cssOverrides?: Record<string, string>): string {
  if (!cssOverrides) return '';
  let rules = '';
  for (const [key, val] of Object.entries(cssOverrides)) {
    if (!val) continue;
    const entries = CSS_INJECTION_MAP[key];
    if (!entries) continue;
    for (const { selector, property } of entries) {
      rules += `${selector} { ${property}: ${val} !important; }\n`;
    }
  }
  return rules;
}

/** Build zone-style rules string without touching the DOM (safe for postMessage). */
export function buildZoneRulesString(zoneStyles?: Record<string, ZoneStyle>): string {
  if (!zoneStyles) return '';
  let rules = '';
  for (const [slotId, style] of Object.entries(zoneStyles)) {
    let r = '';
    if (style.fontSize != null) r += `font-size: ${style.fontSize}px !important; `;
    if (style.color) r += `color: ${style.color} !important; `;
    if (style.backgroundColor) r += `background-color: ${style.backgroundColor} !important; `;
    if (style.fontWeight) r += `font-weight: ${style.fontWeight} !important; `;
    if (style.fontStyle) r += `font-style: ${style.fontStyle} !important; `;
    if (style.textDecoration) r += `text-decoration: ${style.textDecoration} !important; `;
    if (style.fontFamily) r += `font-family: ${style.fontFamily} !important; `;
    if (style.textAlign) r += `text-align: ${style.textAlign} !important; `;
    if (r) rules += `#${slotId} { ${r}}\n`;
  }
  return rules;
}

export function injectIntoHtml(html: string, options: InjectOptions): string {
  const { injections, cssOverrides, slotOverrides, zoneStyles, layoutOverrides, zoneAssets } = options;
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

  // --- Per-zone style overrides (font size, color, background) ---
  if (zoneStyles && Object.keys(zoneStyles).length > 0) {
    let zoneRules = '';
    for (const [slotId, style] of Object.entries(zoneStyles)) {
      const el = doc.getElementById(slotId);
      if (!el) continue;
      let rules = '';
      if (style.fontSize != null) rules += `font-size: ${style.fontSize}px !important; `;
      if (style.color) rules += `color: ${style.color} !important; `;
      if (style.backgroundColor) rules += `background-color: ${style.backgroundColor} !important; `;
      if (style.fontWeight) rules += `font-weight: ${style.fontWeight} !important; `;
      if (style.fontStyle) rules += `font-style: ${style.fontStyle} !important; `;
      if (style.textDecoration) rules += `text-decoration: ${style.textDecoration} !important; `;
      if (style.fontFamily) rules += `font-family: ${style.fontFamily} !important; `;
      if (style.textAlign) rules += `text-align: ${style.textAlign} !important; `;
      if (rules) zoneRules += `#${slotId} { ${rules}}\n`;
    }
    if (zoneRules) {
      const zoneStyleEl = doc.createElement('style');
      zoneStyleEl.id = '__zone-style-overrides__';
      zoneStyleEl.textContent = zoneRules;
      doc.head.appendChild(zoneStyleEl);
    }
  }

  // --- Layout overrides (zoneOverrides + customZones from canvas layer) ---
  // CSS values are adSize (native) coords — the iframe renders at adSize resolution.
  // Do NOT use displaySize coords here.
  if (layoutOverrides) {
    if (layoutOverrides.zoneOverrides) {
      for (const [slotId, bound] of Object.entries(layoutOverrides.zoneOverrides)) {
        const el = doc.getElementById(slotId) as HTMLElement | null;
        if (!el) continue;
        const pos = el.style.position || getComputedStyle(el).position;
        if (pos === 'relative' || pos === 'sticky' || pos === 'static') {
          console.warn(`[injectIntoHtml] Skipping zoneOverride for #${slotId}: position:${pos} is incompatible with absolute override.`);
          continue;
        }
        el.style.position = 'absolute';
        el.style.left = `${bound.x}px`;
        el.style.top = `${bound.y}px`;
        el.style.width = `${bound.w}px`;
        el.style.height = `${bound.h}px`;
      }
    }

    if (layoutOverrides.customZones) {
      for (const zone of layoutOverrides.customZones) {
        const posStyle = `position:absolute;left:${zone.x}px;top:${zone.y}px;width:${zone.w}px;height:${zone.h}px;`;
        if (zone.type === 'image') {
          const img = doc.createElement('img');
          img.id = zone.id;
          img.dataset.canvasCustom = 'true';
          img.style.cssText = posStyle;
          if (zone.assetUrl) img.src = zone.assetUrl;
          doc.body.appendChild(img);
        } else {
          const div = doc.createElement('div');
          div.id = zone.id;
          div.dataset.canvasCustom = 'true';
          div.style.cssText = posStyle;
          if (zone.textContent) div.textContent = zone.textContent;
          doc.body.appendChild(div);
        }
      }
    }
  }

  // --- Zone asset overrides (Asset House URLs for wireframe image zones) ---
  // Independent of the injections pipeline — writes directly to element src/background.
  if (zoneAssets) {
    for (const [slotId, assetUrl] of Object.entries(zoneAssets)) {
      if (!assetUrl) continue;
      const el = doc.getElementById(slotId) as HTMLElement | null;
      if (!el) continue;
      if (el.tagName === 'IMG') {
        (el as HTMLImageElement).src = assetUrl;
        el.removeAttribute('srcset');
      } else {
        el.style.backgroundImage = `url('${assetUrl}')`;
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
      }
    }
  }

  return '<!DOCTYPE html>' + doc.documentElement.outerHTML;
}

/**
 * Returns a self-contained <script> string to append to wireframe HTML when
 * the preview needs to be interactive (slot-selection mode). The script:
 * - Sends `{ type: 'slot-click', slotId }` to the parent when a known slot is clicked
 * - Listens for `{ type: 'highlight-slot', slotId }` to outline a single slot
 * - Listens for `{ type: 'slot-selection-mode', active }` to pulse all known slots
 * - Listens for `{ type: 'clear-highlights' }` to remove all outlines
 * - Listens for `{ type: 'apply-updates', injections, slotOverrides, cssRules, zoneRules }` for live sync
 */
export function buildInteractiveScript(): string {
  const slotsJson = JSON.stringify(ALL_KNOWN_TARGETS);
  // IDs that are structural containers, not content slots
  const skipIds = JSON.stringify(['ad', 'base', 'background', 'bg']);
  return `<script>
(function() {
  var KNOWN = ${slotsJson};
  var SKIP = ${skipIds};
  var FIELD_TARGETS = ${FIELD_TARGETS_JSON};

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
    if (e.data.type === 'apply-updates') {
      var inj = e.data.injections || {};
      var slotOvr = e.data.slotOverrides || {};
      for (var fieldId in inj) {
        var item = inj[fieldId];
        if (!item || !item.value) continue;
        var lf = fieldId.toLowerCase();
        var targets = [];
        if (slotOvr[lf]) {
          targets = [slotOvr[lf]];
        } else if (FIELD_TARGETS[lf]) {
          targets = FIELD_TARGETS[lf];
        } else {
          for (var k in FIELD_TARGETS) {
            if (lf.indexOf(k) !== -1 || k.indexOf(lf) !== -1) { targets = FIELD_TARGETS[k]; break; }
          }
        }
        for (var ti = 0; ti < targets.length; ti++) {
          var el = document.getElementById(targets[ti]) || document.querySelector('[id*="' + targets[ti] + '"]');
          if (!el) continue;
          if (item.type === 'image') { el.src = item.value; el.removeAttribute('srcset'); }
          else { el.textContent = item.value; }
          break;
        }
      }
      var cssRules = e.data.cssRules || '';
      var cssEl = document.getElementById('__dynamic-overrides__');
      if (cssRules) {
        if (!cssEl) { cssEl = document.createElement('style'); cssEl.id = '__dynamic-overrides__'; document.head.appendChild(cssEl); }
        cssEl.textContent = cssRules;
      } else if (cssEl) { cssEl.remove(); }
      var zoneRules = e.data.zoneRules || '';
      var zoneEl = document.getElementById('__zone-style-overrides__');
      if (zoneRules) {
        if (!zoneEl) { zoneEl = document.createElement('style'); zoneEl.id = '__zone-style-overrides__'; document.head.appendChild(zoneEl); }
        zoneEl.textContent = zoneRules;
      } else if (zoneEl) { zoneEl.remove(); }
      setTimeout(reportOverflow, 150);
    }
  });

  // Zone reporter — posts {type:'zone-bounds', zones:{id:{x,y,w,h}}} to parent on load.
  // Uses document.fonts.ready so web fonts have rendered before measuring.
  // 2000ms fallback in case fonts never resolve (e.g. 404).
  function reportZones() {
    var zones = {};
    document.querySelectorAll('[id]').forEach(function(el) {
      var r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        zones[el.id] = { x: r.left, y: r.top, w: r.width, h: r.height };
      }
    });
    window.parent.postMessage({ type: 'zone-bounds', zones: zones }, '*');
    setTimeout(reportOverflow, 150);
  }

  function reportOverflow() {
    var overflowing = [];
    document.querySelectorAll('[id]').forEach(function(el) {
      if (SKIP.indexOf(el.id) !== -1) return;
      // Skip elements with no visible area (hidden, display:none, etc.)
      if (el.clientWidth === 0 && el.clientHeight === 0) return;
      // scrollHeight reflects full content size even when overflow:hidden clips it —
      // so this correctly catches text that is too large for its zone.
      if (el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2) {
        overflowing.push(el.id);
      }
    });
    window.parent.postMessage({ type: 'zone-overflow', overflowing: overflowing }, '*');
  }

  var _zoneReportFired = false;
  function _fireZoneReport() {
    if (_zoneReportFired) return;
    _zoneReportFired = true;
    requestAnimationFrame(reportZones);
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(_fireZoneReport);
  }
  setTimeout(_fireZoneReport, 2000); // fallback if fonts never resolve
})();
</script>`;
}
