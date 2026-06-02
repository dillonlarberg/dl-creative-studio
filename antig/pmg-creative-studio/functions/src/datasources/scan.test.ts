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

  it('still records a feed candidate whose sample query throws (no media)', async () => {
    vi.mocked(alli.listModels).mockResolvedValue([{ name: 'broken_feed', dimensions: ['x'] }]);
    vi.mocked(alli.executeQuery).mockRejectedValue(new Error('400'));
    const records = await scanClientDatasources('nike_na', 'tok');
    expect(records).toHaveLength(1);
    expect(records[0].hasImage).toBe(false);
  });

  it('falls back to getModelMetadata when a feed candidate has no schema', async () => {
    vi.mocked(alli.listModels).mockResolvedValue([{ name: 'sparse_feed' }]);
    vi.mocked(alli.getModelMetadata).mockResolvedValue({ dimensions: ['hero'], measures: [] });
    vi.mocked(alli.executeQuery).mockResolvedValue([{ hero: 'https://x/1.jpg' }]);
    const records = await scanClientDatasources('nike_na', 'tok');
    expect(alli.getModelMetadata).toHaveBeenCalledWith('nike_na', 'sparse_feed', 'tok');
    expect(records[0].hasImage).toBe(true);
    expect(records[0].imageColumns).toEqual(['hero']);
  });

  it('does not sample non-feed models, but still records them with no media', async () => {
    vi.mocked(alli.listModels).mockResolvedValue([
      { name: 'fiscal_calendar' }, // warehouse table — NOT a feed candidate
      { name: 'product_feed', dimensions: ['hero'] },
    ]);
    vi.mocked(alli.executeQuery).mockResolvedValue([{ hero: 'https://x/1.jpg' }]);
    const records = await scanClientDatasources('nike_na', 'tok');
    // The expensive sample must NEVER run for the warehouse table.
    expect(alli.executeQuery).not.toHaveBeenCalledWith('nike_na', 'fiscal_calendar', expect.anything(), 'tok');
    expect(alli.getModelMetadata).not.toHaveBeenCalledWith('nike_na', 'fiscal_calendar', 'tok');
    expect(records).toHaveLength(2);
    expect(records.find((r) => r.modelName === 'fiscal_calendar')!.hasImage).toBe(false);
    expect(records.find((r) => r.modelName === 'product_feed')!.hasImage).toBe(true);
  });
});
