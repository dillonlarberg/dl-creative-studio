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
