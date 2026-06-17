import { describe, it, expect } from 'vitest';
import { datasourceToAssets } from '../datasourceToAssets';

const NIKE_VIDEO = 'https://creative-insights-images-prod.creative.alliplatform.com/nike_na/pinterest/video/6436819_687290117084.mp4';
const NIKE_IMG = 'https://creative-insights-images-prod.creative.alliplatform.com/nike_na/meta/image/123_abc.jpg';

describe('datasourceToAssets', () => {
  it('maps an image row → kind image with a stable 16-char assetId', async () => {
    const out = await datasourceToAssets([{ url: NIKE_IMG, creative_type: 'image', ad_id: 'a1' }]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('image');
    expect(out[0].srcUrl).toBe(NIKE_IMG);
    expect(out[0].assetId).toMatch(/^[0-9a-f]{16}$/);
    expect(out[0].name).toBe('a1');
    expect(out[0].channel).toBe('meta');
    expect(out[0].datasourceId).toBe('creative_insights_data_export');
  });

  it('maps a video row → kind video, channel parsed from the URL path', async () => {
    const out = await datasourceToAssets([{ url: NIKE_VIDEO, creative_type: 'video', ad_id: 'v1' }]);
    expect(out[0].kind).toBe('video');
    expect(out[0].channel).toBe('pinterest');
    expect(out[0].thumbUrl).toBe(NIKE_VIDEO);
  });

  it('handles model-prefixed column keys', async () => {
    const out = await datasourceToAssets([
      {
        creative_insights_data_export__url: NIKE_VIDEO,
        creative_insights_data_export__creative_type: 'video',
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('video');
  });

  it('defaults unknown/blank creative_type to image', async () => {
    const out = await datasourceToAssets([{ url: NIKE_IMG }]);
    expect(out[0].kind).toBe('image');
  });

  it('drops rows with no http url (no crash)', async () => {
    const out = await datasourceToAssets([
      { url: NIKE_IMG, creative_type: 'image' },
      { url: '', creative_type: 'image' },
      { creative_type: 'video' },
      { url: 'data:image/png;base64,xxxx', creative_type: 'image' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].srcUrl).toBe(NIKE_IMG);
  });

  it('emits both kinds from a mixed array', async () => {
    const out = await datasourceToAssets([
      { url: NIKE_IMG, creative_type: 'image' },
      { url: NIKE_VIDEO, creative_type: 'video' },
    ]);
    expect(out.map((a) => a.kind)).toEqual(['image', 'video']);
    // distinct ids for distinct urls
    expect(new Set(out.map((a) => a.assetId)).size).toBe(2);
  });
});
