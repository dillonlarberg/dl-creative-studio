import { describe, it, expect } from 'vitest';
import { paginate, PAGE_SIZE } from '../pagination';

const seq = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe('paginate', () => {
  it('returns a single clamped page for an empty list', () => {
    const p = paginate([], 1);
    expect(p.items).toEqual([]);
    expect(p.page).toBe(1);
    expect(p.pageCount).toBe(1);
    expect(p.total).toBe(0);
    expect(p.start).toBe(0);
    expect(p.end).toBe(0);
    expect(p.hasPrev).toBe(false);
    expect(p.hasNext).toBe(false);
  });

  it('slices the first page and reports the window', () => {
    const p = paginate(seq(60), 1, 24);
    expect(p.items).toHaveLength(24);
    expect(p.items[0]).toBe(1);
    expect(p.items[23]).toBe(24);
    expect(p.pageCount).toBe(3);
    expect(p.start).toBe(1);
    expect(p.end).toBe(24);
    expect(p.hasPrev).toBe(false);
    expect(p.hasNext).toBe(true);
  });

  it('slices a middle page', () => {
    const p = paginate(seq(60), 2, 24);
    expect(p.items[0]).toBe(25);
    expect(p.items).toHaveLength(24);
    expect(p.start).toBe(25);
    expect(p.end).toBe(48);
    expect(p.hasPrev).toBe(true);
    expect(p.hasNext).toBe(true);
  });

  it('handles a partial last page', () => {
    const p = paginate(seq(60), 3, 24);
    expect(p.items).toHaveLength(12);
    expect(p.items[0]).toBe(49);
    expect(p.start).toBe(49);
    expect(p.end).toBe(60);
    expect(p.hasPrev).toBe(true);
    expect(p.hasNext).toBe(false);
  });

  it('clamps a page above the range to the last page', () => {
    const p = paginate(seq(60), 99, 24);
    expect(p.page).toBe(3);
    expect(p.items[0]).toBe(49);
  });

  it('clamps page <= 0 to the first page', () => {
    expect(paginate(seq(60), 0, 24).page).toBe(1);
    expect(paginate(seq(60), -5, 24).page).toBe(1);
  });

  it('treats a list that fits in one page as a single page', () => {
    const p = paginate(seq(10), 1, 24);
    expect(p.pageCount).toBe(1);
    expect(p.items).toHaveLength(10);
    expect(p.hasNext).toBe(false);
  });

  it('defaults to PAGE_SIZE when no size is given', () => {
    const p = paginate(seq(PAGE_SIZE + 5), 1);
    expect(p.items).toHaveLength(PAGE_SIZE);
    expect(p.pageCount).toBe(2);
  });
});
