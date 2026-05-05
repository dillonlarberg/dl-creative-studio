import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fetchDataSources, fetchFeedSample } from './handlers';
import { alliService } from '../../../services/alli';

describe('fetchDataSources', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns an error when no client slug is provided', async () => {
    const result = await fetchDataSources({ clientSlug: '' });
    expect(result.feeds).toEqual([]);
    expect(result.error).toBe('No client slug');
  });

  it('filters models by feed-name keywords', async () => {
    vi.spyOn(alliService, 'getDataSources').mockResolvedValue([
      { name: 'product_feed', description: '' },
      { name: 'sales_data', description: 'unrelated' },
      { name: 'creative_insights_data_export', description: '' },
    ]);

    const result = await fetchDataSources({ clientSlug: 'acme' });
    expect(result.error).toBeUndefined();
    expect(result.feeds).toHaveLength(2);
    expect(result.feeds.map((f) => f.name)).toEqual([
      'product_feed',
      'creative_insights_data_export',
    ]);
  });

  it('falls back to all models when no feed-named ones match', async () => {
    vi.spyOn(alliService, 'getDataSources').mockResolvedValue([
      { name: 'sales_data', description: '' },
      { name: 'inventory', description: '' },
    ]);

    const result = await fetchDataSources({ clientSlug: 'acme' });
    expect(result.feeds).toHaveLength(2);
  });

  it('returns an error message when the service throws', async () => {
    vi.spyOn(alliService, 'getDataSources').mockRejectedValue(
      new Error('Boom')
    );

    const result = await fetchDataSources({ clientSlug: 'acme' });
    expect(result.feeds).toEqual([]);
    expect(result.error).toBe('Boom');
  });
});

describe('fetchFeedSample', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Stub the proxy ping so failure paths don't try to actually fetch.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, type: 'opaque' })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns sampleData and computes a stress map on success', async () => {
    vi.spyOn(alliService, 'executeQuery').mockResolvedValue({
      results: [
        { headline: 'short', price: '1' },
        { headline: 'a longer headline value', price: '999.99' },
      ],
    });

    const result = await fetchFeedSample({
      clientSlug: 'acme',
      feed: { name: 'feed_a', dimensions: ['headline', 'price'] },
    });

    expect(result.sampleData).toHaveLength(2);
    expect(result.stressMap).toBeDefined();
    expect(result.stressMap!.shortest.headline).toBe('short');
    expect(result.stressMap!.longest.headline).toBe('a longer headline value');
  });

  it('returns a metadata.error envelope when every attempt fails', async () => {
    vi.spyOn(alliService, 'executeQuery').mockRejectedValue(
      new Error('403 Forbidden')
    );

    const result = await fetchFeedSample({
      clientSlug: 'acme',
      feed: { name: 'feed_a', dimensions: ['x'] },
    });

    expect(result.sampleData).toEqual([]);
    const meta = result.metadata as { error: { category: string; modelName: string } };
    expect(meta.error.category).toBe('Unauthorized');
    expect(meta.error.modelName).toBe('feed_a');
  });

  it('filters out thumbnail rows on creative_insights_data_export', async () => {
    vi.spyOn(alliService, 'executeQuery').mockResolvedValue({
      results: [
        { ad_id: '1', creative_type: 'image' },
        { ad_id: '2', creative_type: 'thumbnail' },
        { ad_id: '3', creative_type: 'video' },
      ],
    });

    const result = await fetchFeedSample({
      clientSlug: 'acme',
      feed: 'creative_insights_data_export',
    });

    expect(result.sampleData).toHaveLength(2);
    expect(
      result.sampleData.every(
        (r) => String(r.creative_type).toLowerCase() !== 'thumbnail'
      )
    ).toBe(true);
  });
});
