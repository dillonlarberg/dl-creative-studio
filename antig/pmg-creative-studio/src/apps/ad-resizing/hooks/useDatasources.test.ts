import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const getScanMarker = vi.fn();
const getDatasources = vi.fn();
const scanDatasources = vi.fn();
vi.mock('../../../platform/datasources', () => ({
  getScanMarker: (...a: unknown[]) => getScanMarker(...a),
  getDatasources: (...a: unknown[]) => getDatasources(...a),
  scanDatasources: (...a: unknown[]) => scanDatasources(...a),
  EXPECTED_SCAN_VERSION: 3,
}));

import { useDatasources } from './useDatasources';

beforeEach(() => {
  getScanMarker.mockReset();
  getDatasources.mockReset();
  scanDatasources.mockReset();
});

describe('useDatasources', () => {
  it('reads the registry instantly when the marker is fresh', async () => {
    getScanMarker.mockResolvedValue({ datasourcesScanVersion: 3, datasourcesFeedCount: 2, datasourcesScannedAt: 1 });
    getDatasources.mockResolvedValue([{ modelName: 'product_feed', hasImage: true, imageColumns: ['hero'], imageCount: 3 }]);
    const { result } = renderHook(() => useDatasources('nike_na'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(scanDatasources).not.toHaveBeenCalled();
    expect(result.current.feeds).toHaveLength(1);
  });

  it('lazily scans once when the marker is missing, then reads', async () => {
    getScanMarker.mockResolvedValueOnce(null);
    scanDatasources.mockResolvedValue({ feedCount: 1, scanVersion: 1 });
    getDatasources.mockResolvedValue([{ modelName: 'product_feed', hasImage: true, imageColumns: ['hero'], imageCount: 3 }]);
    const { result } = renderHook(() => useDatasources('nike_na'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(scanDatasources).toHaveBeenCalledWith('nike_na');
    expect(result.current.feeds).toHaveLength(1);
  });

  it('rescans when the marker version is stale', async () => {
    getScanMarker.mockResolvedValue({ datasourcesScanVersion: 0, datasourcesFeedCount: 0, datasourcesScannedAt: 1 });
    scanDatasources.mockResolvedValue({ feedCount: 0, scanVersion: 1 });
    getDatasources.mockResolvedValue([]);
    const { result } = renderHook(() => useDatasources('nike_na'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(scanDatasources).toHaveBeenCalledWith('nike_na');
  });

  it('surfaces an error when the scan fails', async () => {
    getScanMarker.mockResolvedValue(null);
    scanDatasources.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useDatasources('nike_na'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('boom');
  });
});
