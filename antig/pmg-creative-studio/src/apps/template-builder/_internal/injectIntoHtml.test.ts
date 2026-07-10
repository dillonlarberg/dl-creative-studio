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

describe('injectIntoHtml — layoutOverrides', () => {
  const html = `<html><head></head><body>
    <div id="headline" style="position:absolute;left:10px;top:10px;width:200px;height:50px;">text</div>
    <img id="image1" style="position:absolute;left:10px;top:80px;width:200px;height:200px;" src="old.jpg" />
    <div id="relative-zone" style="position:relative;width:100px;height:100px;">relative</div>
  </body></html>`;

  // 1. zoneOverrides applies position/left/top/width/height to an absolute-positioned element
  it('applies position overrides to an absolute-positioned element', () => {
    const result = injectIntoHtml(html, {
      injections: {},
      layoutOverrides: { zoneOverrides: { headline: { x: 50, y: 60, w: 300, h: 80 } } },
    });
    expect(result).toContain('left: 50px');
    expect(result).toContain('top: 60px');
    expect(result).toContain('width: 300px');
    expect(result).toContain('height: 80px');
  });

  // 2. zoneOverrides silently skips unknown slotId
  it('silently skips unknown slotId in zoneOverrides', () => {
    const before = injectIntoHtml(html, { injections: {} });
    const result = injectIntoHtml(html, {
      injections: {},
      layoutOverrides: { zoneOverrides: { nonexistent_zone: { x: 0, y: 0, w: 100, h: 100 } } },
    });
    expect(result).toBe(before);
  });

  // 3. zoneOverrides does NOT apply to a position:relative element
  it('skips position:relative elements and does not force position:absolute', () => {
    const result = injectIntoHtml(html, {
      injections: {},
      layoutOverrides: { zoneOverrides: { 'relative-zone': { x: 0, y: 0, w: 50, h: 50 } } },
    });
    // The relative-zone element should remain relative
    expect(result).toContain('position:relative');
    // Should NOT have been forced to absolute with the new dimensions
    expect(result).not.toContain('width: 50px');
  });

  // 4. customZones appends element with correct id, correct position, data-canvas-custom="true"
  it('appends a custom image zone element with correct attributes', () => {
    const result = injectIntoHtml(html, {
      injections: {},
      layoutOverrides: {
        customZones: [{ id: 'custom_zone_abc', type: 'image', x: 100, y: 200, w: 150, h: 150, assetUrl: 'https://example.com/img.jpg' }],
      },
    });
    expect(result).toContain('id="custom_zone_abc"');
    expect(result).toContain('data-canvas-custom="true"');
    expect(result).toContain('100px');  // left position present
    expect(result).toContain('200px');  // top position present
    expect(result).toContain('src="https://example.com/img.jpg"');
  });

  // 5. zoneOverrides and customZones together — both applied in one pass
  it('applies both zoneOverrides and customZones in the same call', () => {
    const result = injectIntoHtml(html, {
      injections: {},
      layoutOverrides: {
        zoneOverrides: { headline: { x: 20, y: 30, w: 250, h: 60 } },
        customZones: [{ id: 'custom_zone_xyz', type: 'text', x: 0, y: 0, w: 100, h: 40, textContent: 'hello' }],
      },
    });
    expect(result).toContain('left: 20px');
    expect(result).toContain('id="custom_zone_xyz"');
    expect(result).toContain('hello');
  });

  // 6. layoutOverrides: undefined — document unchanged (regression guard)
  it('leaves document unchanged when layoutOverrides is undefined', () => {
    const without = injectIntoHtml(html, { injections: {} });
    const withUndefined = injectIntoHtml(html, { injections: {}, layoutOverrides: undefined });
    expect(withUndefined).toBe(without);
  });

  // 7. zoneAssets sets <img> src by element ID
  it('sets img src via zoneAssets', () => {
    const result = injectIntoHtml(html, {
      injections: {},
      zoneAssets: { image1: 'https://cdn.example.com/asset.jpg' },
    });
    expect(result).toContain('src="https://cdn.example.com/asset.jpg"');
  });

  // 8. zoneAssets does not affect the injections pipeline
  it('zoneAssets write path does not alter injections results', () => {
    const withBoth = injectIntoHtml(html, {
      injections: { headline: { type: 'text', value: 'injected headline' } },
      zoneAssets: { image1: 'https://cdn.example.com/asset.jpg' },
    });
    // The injection result should be present in both
    expect(withBoth).toContain('injected headline');
    // zoneAssets added the asset URL — injections result unchanged
    expect(withBoth).toContain('src="https://cdn.example.com/asset.jpg"');
    // headline content unaffected by zoneAssets
    expect(withBoth.replace('src="https://cdn.example.com/asset.jpg"', '')).toContain('injected headline');
  });
});

describe('injectIntoHtml — CSS value sanitization (XSS prevention)', () => {
  const baseHtml = `<html><head></head><body><div id="ad"><div id="headline">text</div></div></body></html>`;

  it('strips </style> escape sequences from cssOverrides values (stored XSS vector)', () => {
    const payload = `Inter } </style><script>alert(1)</script><style> body { font-family: Inter`;
    const result = injectIntoHtml(baseHtml, {
      injections: {},
      cssOverrides: { font_family: payload },
    });
    expect(result).not.toContain('</style><script>');
    expect(result).not.toContain('<script>');
    // The sanitized value should still appear (without the injection chars)
    expect(result).toContain('font-family');
  });

  it('strips CSS block delimiters from zoneStyles fontFamily to prevent rule injection', () => {
    // { } characters stripped — no valid CSS rule block can form
    const payload = `Arial } body { background: red; } #ad { font-family: Arial`;
    const result = injectIntoHtml(baseHtml, {
      injections: {},
      zoneStyles: { headline: { fontFamily: payload } },
    });
    // The { } were stripped so the injected content cannot form a valid CSS rule
    expect(result).not.toContain('body {');
    expect(result).not.toContain('} body');
    expect(result).toContain('font-family');
  });
});
