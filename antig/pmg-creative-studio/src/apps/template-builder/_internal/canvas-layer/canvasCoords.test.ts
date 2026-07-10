import { describe, it, expect } from 'vitest';
import { toDisplay, toNative, clampNative, MIN_ZONE_PX } from './canvasCoords';

describe('canvasCoords', () => {
  const adSize = 1080;
  const displaySize = 360;

  // 1. Round-trip: converting to display and back yields the original value
  it('round-trips: toDisplay(toNative(x)) === x', () => {
    const x = 540;
    const display = toDisplay(x, adSize, displaySize);
    expect(toNative(display, adSize, displaySize)).toBeCloseTo(x, 10);
  });

  // 2. Stage placement assertion: toDisplay(adSize) === displaySize
  // This confirms the Stage is correctly sized when placed over the wrapper div.
  it('toDisplay(adSize) === displaySize (Stage placement assertion)', () => {
    expect(toDisplay(adSize, adSize, displaySize)).toBe(displaySize);
  });

  // 3. adSize = 0 returns 0, no throw
  it('returns 0 when adSize is 0 (no NaN/Infinity)', () => {
    expect(toDisplay(100, 0, displaySize)).toBe(0);
    expect(toNative(100, 0, displaySize)).toBe(0);
  });

  // 4. displaySize = 0 returns 0, no NaN propagation
  it('returns 0 when displaySize is 0', () => {
    expect(toDisplay(100, adSize, 0)).toBe(0);
    expect(toNative(100, adSize, 0)).toBe(0);
  });

  // 5. Negative coord input: clampNative returns 0
  it('clampNative clamps negative coords to 0', () => {
    expect(clampNative(-50, adSize)).toBe(0);
  });

  // 6. coord > adSize: clampNative clamps to adSize
  it('clampNative clamps coords above adSize to adSize', () => {
    expect(clampNative(adSize + 200, adSize)).toBe(adSize);
  });

  // 7. Upscaling (displaySize > adSize): scale > 1, correct direction
  it('handles upscaling (displaySize > adSize) correctly', () => {
    const smallAdSize = 100;
    const largeDisplay = 300; // 3x upscale
    const native = 50;
    const display = toDisplay(native, smallAdSize, largeDisplay);
    expect(display).toBe(150); // 50 * (300/100)
    expect(toNative(display, smallAdSize, largeDisplay)).toBeCloseTo(native, 10);
  });

  it('MIN_ZONE_PX is 16', () => {
    expect(MIN_ZONE_PX).toBe(16);
  });
});
