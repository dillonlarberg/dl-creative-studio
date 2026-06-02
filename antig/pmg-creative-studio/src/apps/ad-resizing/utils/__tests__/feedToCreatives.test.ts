import { describe, it, expect } from 'vitest';
import { feedToCreatives } from '../feedToCreatives';

describe('feedToCreatives', () => {
  it('maps a WebP URL to fileType WEBP', async () => {
    const rows = [{ img: 'https://cdn.example.com/ad.webp', name: 'Ad 1' }];
    const creatives = await feedToCreatives(rows, 'my-feed', 'img');
    expect(creatives[0].fileType).toBe('WEBP');
  });

  it('maps a PNG URL to fileType PNG', async () => {
    const rows = [{ img: 'https://cdn.example.com/ad.png', name: 'Ad 1' }];
    const creatives = await feedToCreatives(rows, 'my-feed', 'img');
    expect(creatives[0].fileType).toBe('PNG');
  });

  it('defaults non-png non-webp URLs to JPG', async () => {
    const rows = [{ img: 'https://cdn.example.com/ad.jpg', name: 'Ad 1' }];
    const creatives = await feedToCreatives(rows, 'my-feed', 'img');
    expect(creatives[0].fileType).toBe('JPG');
  });

  it('sets sourceKind to alli', async () => {
    const rows = [{ img: 'https://cdn.example.com/ad.png', name: 'Ad 1' }];
    const creatives = await feedToCreatives(rows, 'my-feed', 'img');
    expect(creatives[0].sourceKind).toBe('alli');
  });

  it('skips rows where the image column is not a URL', async () => {
    const rows = [
      { img: 'not-a-url', name: 'Bad' },
      { img: 'https://cdn.example.com/ad.png', name: 'Good' },
    ];
    const creatives = await feedToCreatives(rows, 'my-feed', 'img');
    expect(creatives).toHaveLength(1);
    expect(creatives[0].name).toBe('Good');
  });
});
