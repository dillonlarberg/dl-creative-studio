import { describe, it, expect } from 'vitest';
import { CHANNELS, getDeduplicatedDimensions } from './channels';

describe('CHANNELS — 8.5×11" print preset removal', () => {
  const allDimensions = CHANNELS.flatMap((c) => c.dimensions);

  it('does not include a dimension with id "print-8x11"', () => {
    const ids = allDimensions.map((d) => d.id);
    expect(ids).not.toContain('print-8x11');
  });

  it('does not include a print dimension at 2550×3300', () => {
    const printChannel = CHANNELS.find((c) => c.id === 'print');
    expect(printChannel).toBeDefined();
    const has8x11 = printChannel!.dimensions.some(
      (d) => d.width === 2550 && d.height === 3300,
    );
    expect(has8x11).toBe(false);
  });
});

describe('CHANNELS — Print channel regression floor', () => {
  const printChannel = CHANNELS.find((c) => c.id === 'print');

  it('still contains print-4x6 and print-5x7', () => {
    expect(printChannel).toBeDefined();
    const ids = printChannel!.dimensions.map((d) => d.id);
    expect(ids).toContain('print-4x6');
    expect(ids).toContain('print-5x7');
  });
});

describe('getDeduplicatedDimensions(["print"])', () => {
  it('returns exactly 2 dimensions and none are 2550×3300', () => {
    const dims = getDeduplicatedDimensions(['print']);
    expect(dims).toHaveLength(2);
    const has8x11 = dims.some((d) => d.width === 2550 && d.height === 3300);
    expect(has8x11).toBe(false);
  });
});
