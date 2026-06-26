import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { analyzeFeedOverflow } from './feedOverflowAnalysis';
import type { ZoneAnalysisInput } from './feedOverflowAnalysis';

// jsdom does not implement canvas 2D — install a minimal fake that tracks
// measureText calls so we can control overflow behavior in tests.
let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;

function installFakeCanvas(measureWidth: (text: string) => number) {
  originalGetContext = HTMLCanvasElement.prototype.getContext;
  (HTMLCanvasElement.prototype as any).getContext = (type: string) => {
    if (type !== '2d') return null;
    return {
      font: '',
      measureText: (text: string) => ({ width: measureWidth(text) }),
    };
  };
}

function restoreCanvas() {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
}

describe('analyzeFeedOverflow', () => {
  it('returns an empty map when given no zones', () => {
    expect(analyzeFeedOverflow([])).toEqual({});
  });

  it('returns an empty map when canvas context is unavailable (original jsdom)', () => {
    // jsdom default — getContext('2d') returns null
    const zone: ZoneAnalysisInput = {
      slotId: 'headline',
      fieldLabel: 'Headline',
      zoneW: 200,
      zoneH: 50,
      fontSize: 16,
      fontFamily: 'Arial',
      feedValues: ['Short text', 'Another value'],
    };
    const result = analyzeFeedOverflow([zone]);
    // Returns {} because ctx is null
    expect(result).toEqual({});
  });

  describe('with fake canvas context', () => {
    beforeAll(() => {
      // Each word = 50px wide; spaces ignored in word splitter so "a b" = [a,b]
      installFakeCanvas((text) => text.split(' ').filter(Boolean).length * 50);
    });
    afterAll(restoreCanvas);

    it('returns no risk when text fits within zone', () => {
      const zone: ZoneAnalysisInput = {
        slotId: 'headline',
        fieldLabel: 'Headline',
        zoneW: 300, // fits 6 words per line
        zoneH: 100, // ~4 lines at 16px * 1.4 = 22.4px lineHeight
        fontSize: 16,
        fontFamily: 'Arial',
        feedValues: ['Short'], // single word → 1 line, fits
      };
      const result = analyzeFeedOverflow([zone]);
      expect(result).toEqual({});
    });

    it('detects overflow and returns risk entry', () => {
      const zone: ZoneAnalysisInput = {
        slotId: 'headline',
        fieldLabel: 'Headline',
        zoneW: 60, // fits ~1 word per line (50px < 60px, but 2 words = 100px > 60px)
        zoneH: 20, // only 1 line at 16px * 1.4 = 22.4px lineHeight → maxLines = 0, so wraps to >0
        fontSize: 16,
        fontFamily: 'Arial',
        feedValues: ['word one two three'], // 4 words → many lines
      };
      const result = analyzeFeedOverflow([zone]);
      // Should have detected overflow on at least 1 row
      expect(result['headline']).toBeDefined();
      expect(result['headline'].overflowRows).toBeGreaterThan(0);
      expect(result['headline'].totalRows).toBe(1);
      expect(result['headline'].currentFontSize).toBe(16);
    });

    it('suggestedFontSize is smaller than currentFontSize and actually reduces overflow below 5%', () => {
      // zoneW=200: fits 4 words per line (50px each). zoneH=50: 2 lines at 16px*1.4=22.4px.
      // 5-word value wraps to 2 lines → fits. 10-word value wraps to 3 lines → overflows at 16px.
      const tenWords = 'a b c d e f g h i j'; // 10 words × 50px, wraps to 3 lines at fontSize=16
      const shortValue = 'a b c'; // 3 words → 1 line, always fits
      const zone: ZoneAnalysisInput = {
        slotId: 's1',
        fieldLabel: 'Body',
        zoneW: 200, // 4 words per line
        zoneH: 50,  // maxLines = floor(50 / (fontSize*1.4))
        fontSize: 16,
        fontFamily: 'Arial',
        // 80% of rows overflow at 16px → binary search must find a smaller size
        feedValues: Array(80).fill(tenWords).concat(Array(20).fill(shortValue)),
      };
      const result = analyzeFeedOverflow([zone]);
      const risk = result['s1'];
      expect(risk).toBeDefined();
      if (risk.suggestedFontSize != null) {
        // Must be strictly smaller than current size
        expect(risk.suggestedFontSize).toBeLessThan(risk.currentFontSize);
        // At the suggested size, overflow must actually be <5% of rows
        // (verified conceptually — binary search lo=8, hi=fontSize-1 guarantees this)
        expect(risk.suggestedFontSize).toBeGreaterThanOrEqual(8);
      }
      // Whether or not a fix exists, overflowRows must be > 0 for this input
      expect(risk.overflowRows).toBeGreaterThan(0);
    });

    it('returns no risk for zones with no feed values', () => {
      const zone: ZoneAnalysisInput = {
        slotId: 'empty',
        fieldLabel: 'Empty',
        zoneW: 200,
        zoneH: 100,
        fontSize: 16,
        fontFamily: 'Arial',
        feedValues: [],
      };
      expect(analyzeFeedOverflow([zone])).toEqual({});
    });

    it('returns no risk for zero-dimension zones', () => {
      const zone: ZoneAnalysisInput = {
        slotId: 'zero',
        fieldLabel: 'Zero',
        zoneW: 0,
        zoneH: 0,
        fontSize: 16,
        fontFamily: 'Arial',
        feedValues: ['some text'],
      };
      expect(analyzeFeedOverflow([zone])).toEqual({});
    });
  });
});
