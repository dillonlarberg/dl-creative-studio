import { describe, it, expect } from 'vitest';
import { diffRemovedIds } from './registry';

describe('diffRemovedIds', () => {
  it('returns ids present in existing but not in current', () => {
    expect(diffRemovedIds(['a', 'b', 'c'], ['a', 'c'])).toEqual(['b']);
  });
  it('returns [] when nothing was removed', () => {
    expect(diffRemovedIds(['a'], ['a', 'b'])).toEqual([]);
  });
});
