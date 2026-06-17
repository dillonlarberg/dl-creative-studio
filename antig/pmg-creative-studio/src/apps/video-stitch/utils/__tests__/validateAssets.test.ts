import { describe, it, expect } from 'vitest';
import { validateAssets, isValidAsset } from '../validateAssets';
import type { AssetRef } from '../../types';

const ref = (over: Partial<AssetRef>): AssetRef => ({
  datasourceId: 'creative_insights_data_export',
  assetId: 'id000000',
  kind: 'video',
  srcUrl: 'https://x/a.mp4',
  ...over,
});

describe('isValidAsset', () => {
  it('accepts direct video files', () => {
    expect(isValidAsset(ref({ kind: 'video', srcUrl: 'https://x/a.mp4' }))).toBe(true);
    expect(isValidAsset(ref({ kind: 'video', srcUrl: 'https://x/a.mov' }))).toBe(true);
    expect(isValidAsset(ref({ kind: 'video', srcUrl: 'https://x/a.webm' }))).toBe(true);
  });

  it('rejects HLS and non-direct video', () => {
    expect(isValidAsset(ref({ kind: 'video', srcUrl: 'https://x/a.m3u8' }))).toBe(false);
    expect(isValidAsset(ref({ kind: 'video', srcUrl: 'https://x/stream' }))).toBe(false);
  });

  it('accepts supported images, rejects others', () => {
    expect(isValidAsset(ref({ kind: 'image', srcUrl: 'https://x/a.jpg' }))).toBe(true);
    expect(isValidAsset(ref({ kind: 'image', srcUrl: 'https://x/a.png' }))).toBe(true);
    expect(isValidAsset(ref({ kind: 'image', srcUrl: 'https://x/a.webp' }))).toBe(true);
    expect(isValidAsset(ref({ kind: 'image', srcUrl: 'https://x/a.gif' }))).toBe(false);
  });

  it('rejects non-http urls', () => {
    expect(isValidAsset(ref({ srcUrl: 'ftp://x/a.mp4' }))).toBe(false);
    expect(isValidAsset(ref({ srcUrl: '' }))).toBe(false);
  });
});

describe('validateAssets', () => {
  it('ok=true when all assets are valid', () => {
    const r = validateAssets([
      ref({ assetId: 'a', kind: 'video', srcUrl: 'https://x/a.mp4' }),
      ref({ assetId: 'b', kind: 'image', srcUrl: 'https://x/b.png' }),
    ]);
    expect(r.ok).toBe(true);
    expect(r.invalid).toEqual([]);
  });

  it('flags each invalid asset with a reason + assetId', () => {
    const r = validateAssets([
      ref({ assetId: 'good', kind: 'video', srcUrl: 'https://x/g.mp4' }),
      ref({ assetId: 'hls', kind: 'video', srcUrl: 'https://x/s.m3u8' }),
      ref({ assetId: 'badimg', kind: 'image', srcUrl: 'https://x/i.gif' }),
    ]);
    expect(r.ok).toBe(false);
    expect(r.invalid.map((i) => i.assetId)).toEqual(['hls', 'badimg']);
    expect(r.invalid[0].reason).toMatch(/HLS/i);
  });
});
