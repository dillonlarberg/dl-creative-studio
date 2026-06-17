import { describe, it, expect } from 'vitest';
import { arrayMove } from '../reorder';

describe('arrayMove', () => {
  it('moves an item forward', () => {
    expect(arrayMove(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('moves an item backward', () => {
    expect(arrayMove(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('is a no-op (copy) for from === to', () => {
    expect(arrayMove(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c']);
  });

  it('returns an unchanged copy for out-of-range indices', () => {
    expect(arrayMove(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
    expect(arrayMove(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
  });

  it('does not mutate the input', () => {
    const orig = ['a', 'b', 'c'];
    const out = arrayMove(orig, 0, 2);
    expect(orig).toEqual(['a', 'b', 'c']);
    expect(out).not.toBe(orig);
  });
});
