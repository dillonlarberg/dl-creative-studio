import { describe, it, expect } from 'vitest';
import { fmtTime } from '../fmtTime';

describe('fmtTime', () => {
  it('formats sub-minute durations with zero-padded seconds', () => {
    expect(fmtTime(5)).toBe('0:05');
  });

  it('formats over-a-minute durations as m:ss', () => {
    expect(fmtTime(83)).toBe('1:23');
  });

  it('formats exactly one minute', () => {
    expect(fmtTime(60)).toBe('1:00');
  });

  it('formats zero', () => {
    expect(fmtTime(0)).toBe('0:00');
  });

  it('floors fractional seconds', () => {
    expect(fmtTime(83.9)).toBe('1:23');
  });

  it('handles multi-digit minutes', () => {
    expect(fmtTime(605)).toBe('10:05');
  });

  it('clamps negative input to zero', () => {
    expect(fmtTime(-5)).toBe('0:00');
  });
});
