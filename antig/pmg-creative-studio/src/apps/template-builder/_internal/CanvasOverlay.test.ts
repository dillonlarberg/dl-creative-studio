import { describe, it, expect } from 'vitest';

// The scale transform used in CanvasOverlay:
//   const scale = displaySize / adSize;
//   displayX = iframeX * scale  (same for y, w, h)
function applyScale(iframeCoord: number, displaySize: number, adSize: number): number {
  return iframeCoord * (displaySize / adSize);
}

describe('CanvasOverlay scale transform', () => {
  it('scales coordinates correctly at 0.3x (1024 → 306)', () => {
    // adSize=1024, displaySize=306 → scale ≈ 0.2988
    expect(applyScale(200, 306, 1024)).toBeCloseTo(59.8, 1);
    expect(applyScale(100, 306, 1024)).toBeCloseTo(29.9, 1);
    expect(applyScale(400, 306, 1024)).toBeCloseTo(119.5, 1);
    expect(applyScale(80,  306, 1024)).toBeCloseTo(23.9, 1);
  });

  it('scales to identity when displaySize equals adSize', () => {
    expect(applyScale(500, 1024, 1024)).toBe(500);
    expect(applyScale(0,   1024, 1024)).toBe(0);
    expect(applyScale(1024, 1024, 1024)).toBe(1024);
  });

  it('scales to zero when displaySize is zero', () => {
    // This is the edge case guarded by !displaySize in CanvasOverlay
    expect(applyScale(500, 0, 1024)).toBe(0);
  });

  it('scales proportionally at 0.45x (1024 → 460)', () => {
    // adSize=1024, displaySize=460 → scale ≈ 0.449
    expect(applyScale(512, 460, 1024)).toBeCloseTo(230, 0);
    expect(applyScale(1024, 460, 1024)).toBeCloseTo(460, 0);
  });

  it('handles full-size zone spanning entire ad', () => {
    // A zone at x=0, y=0, w=1024, h=1024 should scale to fill displaySize
    expect(applyScale(1024, 306, 1024)).toBeCloseTo(306, 0);
    expect(applyScale(0, 306, 1024)).toBe(0);
  });
});
