import { describe, it, expect } from 'vitest';
import { isOffAspect, aspectRatioOf, TARGET_AR } from '../aspect';

describe('aspect', () => {
  it('9:16 portrait is NOT off-aspect', () => {
    expect(isOffAspect(1080, 1920)).toBe(false);
    expect(aspectRatioOf(1080, 1920)).toBeCloseTo(TARGET_AR, 4);
  });

  it('square, 16:9, and 4:5 ARE off-aspect (would letterbox)', () => {
    expect(isOffAspect(1080, 1080)).toBe(true); // 1.0
    expect(isOffAspect(1920, 1080)).toBe(true); // 1.78
    expect(isOffAspect(1080, 1350)).toBe(true); // 0.8
  });

  it('near-9:16 within tolerance is NOT off-aspect', () => {
    expect(isOffAspect(1000, 1700)).toBe(false); // 0.588, |Δ|≈0.026
  });

  it('unknown dimensions → not off-aspect (do not badge while loading)', () => {
    expect(isOffAspect(undefined, undefined)).toBe(false);
    expect(isOffAspect(0, 0)).toBe(false);
    expect(isOffAspect(1080, 0)).toBe(false);
    expect(aspectRatioOf(1080, 0)).toBeNull();
  });
});
