/**
 * SourcePicker — stage 1: multi-select masonry over the client's creative library.
 *
 * Sources creative_insights_data_export (media:'all') → mixed image/video tiles.
 * Tap order = initial sequence (reordered later on Arrange). Gates 2..8 (MIN/MAX).
 * D1 aspect via tile onDims → "letterboxed" badge. D2 proactive validation → bad
 * assets dimmed + unselectable. Covers scanning / empty / error states.
 */
import { useEffect, useMemo, useState } from 'react';
import { cn } from '../../../utils/cn';
import { useStitchSource } from '../hooks/useStitchSource';
import { isValidAsset } from '../utils/validateAssets';
import { isOffAspect } from '../utils/aspect';
import { toggleSelection, orderOf } from '../utils/selection';
import { paginate } from '../utils/pagination';
import SourceTile from './SourceTile';
import { MIN_ASSETS, MAX_ASSETS, type PickedAsset } from '../types';

interface Props {
  clientSlug: string;
  selected: PickedAsset[];
  onChange: (next: PickedAsset[]) => void;
  onContinue: () => void;
}

export default function SourcePicker({ clientSlug, selected, onChange, onContinue }: Props) {
  const { assets, loading, error, reload } = useStitchSource(clientSlug);
  const [dims, setDims] = useState<Record<string, { w: number; h: number }>>({});
  const [page, setPage] = useState(1);

  const n = selected.length;
  const canContinue = n >= MIN_ASSETS && n <= MAX_ASSETS;
  const setDim = (id: string, w: number, h: number) =>
    setDims((prev) => (prev[id] ? prev : { ...prev, [id]: { w, h } }));

  // A fresh library load (or client switch) returns a new `assets` array → reset
  // to page 1 so we never strand the user on a page that no longer exists.
  useEffect(() => setPage(1), [assets]);

  const pageInfo = useMemo(() => paginate(assets, page), [assets, page]);

  const body = useMemo(() => {
    if (loading) return <ShimmerGrid />;
    if (error) return <ErrorState message={error} onRetry={reload} />;
    if (assets.length === 0) return <EmptyState />;
    return (
      <div className="[column-gap:0.75rem] columns-2 sm:columns-3 lg:columns-4">
        {pageInfo.items.map((a) => {
          const d = dims[a.assetId];
          return (
            <SourceTile
              key={a.assetId}
              asset={a}
              order={orderOf(selected, a.assetId)}
              unusable={!isValidAsset(a)}
              offAspect={isOffAspect(d?.w, d?.h)}
              onToggle={() => onChange(toggleSelection(selected, a))}
              onDims={(w, h) => setDim(a.assetId, w, h)}
            />
          );
        })}
      </div>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, error, assets, pageInfo, dims, selected]);

  const goToPage = (next: number) => {
    setPage(next);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <section data-stage="source">
      <div className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-gray-500">
        <b className="font-medium text-gray-700">Your creative library</b>
        <span className="text-gray-300">·</span>
        <span className="font-mono text-[12px]">{clientSlug}</span>
      </div>

      <p className="mb-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-[12px] text-blue-700">
        Pick {MIN_ASSETS}–{MAX_ASSETS} clips — tap to add them. The number shows the order they'll
        appear (you can re-order next). Vertical clips look best; off-aspect ones letterbox.
      </p>

      {!loading && !error && assets.length > 0 && (
        <div className="mb-2 text-[12px] text-gray-400">
          Showing {pageInfo.start}–{pageInfo.end} of {pageInfo.total}
        </div>
      )}

      {body}

      {!loading && !error && pageInfo.pageCount > 1 && (
        <Pager pageInfo={pageInfo} onGo={goToPage} />
      )}

      <div className="sticky bottom-0 z-10 -mx-6 mt-6 flex items-center justify-between gap-3 border-t border-gray-200 bg-white/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <span className="text-[12px] text-gray-500">
          {n >= MIN_ASSETS
            ? `${n} selected · they'll appear in tap order`
            : `Select at least ${MIN_ASSETS} clips to stitch (${n}/${MIN_ASSETS})`}
        </span>
        <button
          type="button"
          onClick={onContinue}
          disabled={!canContinue}
          className={cn(
            'inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-colors',
            canContinue
              ? 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'
              : 'cursor-not-allowed bg-gray-100 text-gray-400',
          )}
        >
          Continue to arrange
        </button>
      </div>
    </section>
  );
}

function Pager({
  pageInfo,
  onGo,
}: {
  pageInfo: { page: number; pageCount: number; hasPrev: boolean; hasNext: boolean };
  onGo: (next: number) => void;
}) {
  const btn =
    'inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-[13px] font-medium text-gray-700 transition-colors hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:border-gray-100 disabled:text-gray-300 disabled:hover:border-gray-100';
  return (
    <nav className="mt-5 flex items-center justify-center gap-3" aria-label="Library pages">
      <button type="button" className={btn} disabled={!pageInfo.hasPrev} onClick={() => onGo(pageInfo.page - 1)}>
        ← Prev
      </button>
      <span className="text-[13px] tabular-nums text-gray-500">
        Page {pageInfo.page} of {pageInfo.pageCount}
      </span>
      <button type="button" className={btn} disabled={!pageInfo.hasNext} onClick={() => onGo(pageInfo.page + 1)}>
        Next →
      </button>
    </nav>
  );
}

function ShimmerGrid() {
  return (
    <div className="[column-gap:0.75rem] columns-2 sm:columns-3 lg:columns-4" aria-busy="true">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="shimmer mb-3 block w-full break-inside-avoid rounded-lg"
          style={{ height: 140 + (i % 3) * 60 }}
        />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-6 py-12 text-center">
      <p className="text-[14px] font-semibold text-gray-900">No stitchable creatives yet</p>
      <p className="mx-auto mt-1 max-w-sm text-[13px] text-gray-500">
        We couldn't find image or video creatives in this client's library. Try another client, or
        check that the creative export has run.
      </p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-12 text-center">
      <p className="text-[14px] font-semibold text-gray-900">Couldn't reach your library</p>
      <p className="mx-auto mt-1 max-w-md text-[13px] text-gray-500">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-blue-700"
      >
        Retry
      </button>
    </div>
  );
}
