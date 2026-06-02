import { describe, it, expect } from 'vitest';
import { isImageUrl, detectImageColumns } from './detect';

describe('isImageUrl', () => {
  it('accepts http image extensions', () => {
    expect(isImageUrl('https://cdn.x.com/a.jpg')).toBe(true);
    expect(isImageUrl('https://cdn.x.com/a.PNG?v=2')).toBe(true);
  });
  it('rejects non-images and non-urls', () => {
    expect(isImageUrl('https://cdn.x.com/clip.mp4')).toBe(false);
    expect(isImageUrl('Nike Air')).toBe(false);
  });
});

describe('detectImageColumns', () => {
  it('flags a column where >=50% of sampled rows are image urls', () => {
    const rows = [
      { hero: 'https://x/1.jpg', name: 'A' },
      { hero: 'https://x/2.png', name: 'B' },
      { hero: '', name: 'C' },
    ];
    expect(detectImageColumns(rows)).toEqual(['hero']);
  });
  it('returns [] for empty input', () => {
    expect(detectImageColumns([])).toEqual([]);
  });
});
