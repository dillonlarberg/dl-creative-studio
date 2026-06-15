import { FIELD_ID_MAP } from './injectIntoHtml';

export interface TemplateSlot {
  slotId: string;
  type: 'image' | 'text';
  label: string;
  isKnown: boolean;
}

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

// Build reverse map: elementId → { type, label }
const REVERSE_MAP: Record<string, { type: 'image' | 'text'; label: string }> = {};
for (const [fieldKey, mapping] of Object.entries(FIELD_ID_MAP)) {
  const label =
    SLOT_LABELS[fieldKey] ??
    fieldKey.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  for (const target of mapping.targets) {
    if (!REVERSE_MAP[target]) {
      REVERSE_MAP[target] = { type: mapping.type, label };
    }
  }
}

/**
 * Parse a wireframe HTML string and return all injectable slots.
 * Known slots (present in FIELD_ID_MAP targets) come first; unknown element IDs follow.
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
