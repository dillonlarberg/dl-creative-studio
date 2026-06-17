/**
 * pagination — pure client-side paging for the source masonry.
 *
 * The picker loads the client's whole creative library in one shot, which can be
 * hundreds of rows. Rendering them all buries the Continue button and floods the
 * page with simultaneously-loading <video> tiles. We page the in-memory array so
 * only PAGE_SIZE tiles mount at a time; selection lives in the parent (keyed by
 * assetId) so it survives page changes.
 */

/** Tiles per page — 24 = a clean 4-col × 6-row grid, few enough videos to load at once. */
export const PAGE_SIZE = 24;

export interface PageInfo<T> {
  /** The slice of items visible on this page. */
  items: T[];
  /** Clamped 1-based current page. */
  page: number;
  /** Total number of pages (always >= 1, even when empty). */
  pageCount: number;
  /** Total number of items across all pages. */
  total: number;
  /** 1-based index of the first visible item (0 when empty). */
  start: number;
  /** 1-based index of the last visible item (0 when empty). */
  end: number;
  hasPrev: boolean;
  hasNext: boolean;
}

/**
 * Slice `all` into the page-sized window for `page`. `page` is clamped into
 * [1, pageCount] so callers can pass an out-of-range value (e.g. after the list
 * shrinks) without crashing.
 */
export function paginate<T>(all: T[], page: number, pageSize: number = PAGE_SIZE): PageInfo<T> {
  const size = Math.max(1, Math.floor(pageSize));
  const total = all.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const clamped = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const startIdx = (clamped - 1) * size;
  const items = all.slice(startIdx, startIdx + size);
  return {
    items,
    page: clamped,
    pageCount,
    total,
    start: total === 0 ? 0 : startIdx + 1,
    end: startIdx + items.length,
    hasPrev: clamped > 1,
    hasNext: clamped < pageCount,
  };
}
