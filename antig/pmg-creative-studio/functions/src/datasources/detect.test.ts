import { describe, it, expect } from 'vitest';
import { isImageUrl, detectImageColumns, isVideoUrl, detectVideoColumns } from './detect';

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

describe('isVideoUrl', () => {
  it('accepts http video extensions', () => {
    expect(isVideoUrl('https://x/clip.mp4')).toBe(true);
    expect(isVideoUrl('https://x/a.MOV?t=1')).toBe(true);
    expect(isVideoUrl('https://x/stream.m3u8')).toBe(true);
  });
  it('rejects images and non-urls', () => {
    expect(isVideoUrl('https://x/a.jpg')).toBe(false);
    expect(isVideoUrl('Nike Air')).toBe(false);
  });
});

describe('detectVideoColumns', () => {
  it('flags a column where >=50% of sampled rows are video urls', () => {
    const rows = [
      { media: 'https://x/1.mp4', name: 'A' },
      { media: 'https://x/2.mov', name: 'B' },
    ];
    expect(detectVideoColumns(rows)).toEqual(['media']);
  });
  it('does not flag an image column as video', () => {
    const rows = [{ hero: 'https://x/1.jpg' }];
    expect(detectVideoColumns(rows)).toEqual([]);
  });
});
