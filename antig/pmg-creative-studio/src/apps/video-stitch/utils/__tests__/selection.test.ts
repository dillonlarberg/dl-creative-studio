import { describe, it, expect } from 'vitest';
import { toggleSelection, orderOf } from '../selection';
import type { PickedAsset } from '../../types';

const asset = (id: string): PickedAsset => ({
  datasourceId: 'creative_insights_data_export',
  assetId: id,
  kind: 'image',
  srcUrl: `https://x/${id}.jpg`,
  thumbUrl: `https://x/${id}.jpg`,
  name: id,
});

describe('toggleSelection', () => {
  it('adds an unselected asset to the end (tap order)', () => {
    const out = toggleSelection([asset('a')], asset('b'));
    expect(out.map((a) => a.assetId)).toEqual(['a', 'b']);
  });

  it('removes a selected asset', () => {
    const out = toggleSelection([asset('a'), asset('b')], asset('a'));
    expect(out.map((a) => a.assetId)).toEqual(['b']);
  });

  it('ignores selecting past the cap', () => {
    const eight = Array.from({ length: 8 }, (_, i) => asset(`a${i}`));
    const out = toggleSelection(eight, asset('a8'), 8);
    expect(out).toHaveLength(8);
    expect(out.map((a) => a.assetId)).not.toContain('a8');
  });

  it('still allows DESELECTING when at the cap', () => {
    const eight = Array.from({ length: 8 }, (_, i) => asset(`a${i}`));
    const out = toggleSelection(eight, asset('a3'), 8);
    expect(out).toHaveLength(7);
    expect(out.map((a) => a.assetId)).not.toContain('a3');
  });

  it('does not mutate the input', () => {
    const orig = [asset('a')];
    toggleSelection(orig, asset('b'));
    expect(orig).toHaveLength(1);
  });
});

describe('orderOf', () => {
  it('returns the 1-based position or null', () => {
    const sel = [asset('a'), asset('b'), asset('c')];
    expect(orderOf(sel, 'a')).toBe(1);
    expect(orderOf(sel, 'c')).toBe(3);
    expect(orderOf(sel, 'z')).toBeNull();
  });
});
