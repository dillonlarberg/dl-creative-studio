import { describe, it, expect } from 'vitest';
import { injectIntoHtml } from './injectIntoHtml';

describe('injectIntoHtml (regression)', () => {
  const baseHtml = `<html><head></head><body><div id="headline">old</div><img id="image1" src="old.jpg" /></body></html>`;

  it('injects text content into a known slot', () => {
    const result = injectIntoHtml(baseHtml, {
      injections: { headline: { type: 'text', value: 'New Headline' } },
    });
    expect(result).toContain('New Headline');
    expect(result).not.toContain('>old<');
  });

  it('injects image src into a known slot', () => {
    const result = injectIntoHtml(baseHtml, {
      injections: { image: { type: 'image', value: 'https://example.com/img.jpg' } },
    });
    expect(result).toContain('https://example.com/img.jpg');
  });

  it('applies cssOverrides as !important rules in __dynamic-overrides__ style', () => {
    const html = `<html><head></head><body><div id="ad"></div></body></html>`;
    const result = injectIntoHtml(html, {
      injections: {},
      cssOverrides: { background_color: '#ff0000' },
    });
    expect(result).toContain('id="__dynamic-overrides__"');
    expect(result).toContain('background-color');
    expect(result).toContain('#ff0000');
    expect(result).toContain('!important');
  });

  it('applies slotOverride to target a specific element', () => {
    const html = `<html><head></head><body><div id="custom-slot">old</div></body></html>`;
    const result = injectIntoHtml(html, {
      injections: { my_field: { type: 'text', value: 'Overridden' } },
      slotOverrides: { my_field: 'custom-slot' },
    });
    expect(result).toContain('Overridden');
  });

  it('returns original html when injections is empty and no overrides', () => {
    const result = injectIntoHtml(baseHtml, { injections: {} });
    // Should still serialize correctly, headline content unchanged
    expect(result).toContain('old');
  });
});

describe('injectIntoHtml — zoneStyles', () => {
  const html = `<html><head></head><body><div id="headline1">text</div><div id="cta">button</div></body></html>`;

  it('injects a __zone-style-overrides__ style block when zoneStyles is provided', () => {
    const result = injectIntoHtml(html, {
      injections: {},
      zoneStyles: { headline1: { color: '#123456' } },
    });
    expect(result).toContain('id="__zone-style-overrides__"');
    expect(result).toContain('#headline1');
    expect(result).toContain('#123456');
    expect(result).toContain('!important');
  });

  it('zone style block appears AFTER __dynamic-overrides__ block when both present', () => {
    const htmlWithAd = `<html><head></head><body><div id="ad"></div><div id="headline1">text</div></body></html>`;
    const result = injectIntoHtml(htmlWithAd, {
      injections: {},
      cssOverrides: { background_color: '#aaaaaa' },
      zoneStyles: { headline1: { color: '#bbbbbb' } },
    });
    const dynamicIdx = result.indexOf('__dynamic-overrides__');
    const zoneIdx = result.indexOf('__zone-style-overrides__');
    expect(dynamicIdx).toBeGreaterThan(-1);
    expect(zoneIdx).toBeGreaterThan(-1);
    expect(zoneIdx).toBeGreaterThan(dynamicIdx); // zone block comes AFTER global overrides
  });

  it('applies fontSize as font-size with !important', () => {
    const result = injectIntoHtml(html, {
      injections: {},
      zoneStyles: { headline1: { fontSize: 24 } },
    });
    expect(result).toContain('font-size: 24px !important');
  });

  it('applies backgroundColor as background-color with !important', () => {
    const result = injectIntoHtml(html, {
      injections: {},
      zoneStyles: { cta: { backgroundColor: '#ff0000' } },
    });
    expect(result).toContain('background-color: #ff0000 !important');
  });

  it('skips slots that do not exist in the document', () => {
    const result = injectIntoHtml(html, {
      injections: {},
      zoneStyles: { nonexistent_slot: { color: '#ffffff' } },
    });
    expect(result).not.toContain('#nonexistent_slot');
    expect(result).not.toContain('__zone-style-overrides__');
  });

  it('does not inject zone style block when zoneStyles is empty', () => {
    const result = injectIntoHtml(html, {
      injections: {},
      zoneStyles: {},
    });
    expect(result).not.toContain('__zone-style-overrides__');
  });

  it('does not inject zone style block when zoneStyles is undefined', () => {
    const result = injectIntoHtml(html, { injections: {} });
    expect(result).not.toContain('__zone-style-overrides__');
  });
});
