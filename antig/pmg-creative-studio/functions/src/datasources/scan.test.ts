import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as alli from './alliClient';
import { scanClientDatasources, SCAN_VERSION } from './scan';

vi.mock('./alliClient');

beforeEach(() => vi.resetAllMocks());

describe('scanClientDatasources', () => {
  it('classifies models by sampled columns', async () => {
    vi.mocked(alli.listModels).mockResolvedValue([
      { name: 'product_feed', label: 'Product Feed', dimensions: ['hero', 'name'] },
      { name: 'metrics', label: 'Metrics', dimensions: ['clicks'] },
    ]);
    vi.mocked(alli.executeQuery).mockImplementation(async (_s, model) => {
      if (model === 'product_feed') return [{ hero: 'https://x/1.jpg', name: 'A' }];
      return [{ clicks: '12' }];
    });

    const records = await scanClientDatasources('nike_na', 'tok');

    const feed = records.find((r) => r.modelName === 'product_feed')!;
    expect(feed.hasImage).toBe(true);
    expect(feed.imageColumns).toEqual(['hero']);
    expect(feed.scanVersion).toBe(SCAN_VERSION);

    const metrics = records.find((r) => r.modelName === 'metrics')!;
    expect(metrics.hasImage).toBe(false);
    expect(metrics.imageColumns).toEqual([]);
  });

  it('still records a model whose sample query throws (no media)', async () => {
    vi.mocked(alli.listModels).mockResolvedValue([{ name: 'broken' }]);
    vi.mocked(alli.getModelMetadata).mockResolvedValue({});
    vi.mocked(alli.executeQuery).mockRejectedValue(new Error('400'));
    const records = await scanClientDatasources('nike_na', 'tok');
    expect(records).toHaveLength(1);
    expect(records[0].hasImage).toBe(false);
  });
});
