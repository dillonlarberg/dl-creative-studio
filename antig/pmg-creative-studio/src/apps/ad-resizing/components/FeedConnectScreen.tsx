import { useState } from 'react';
import {
  CircleStackIcon,
  ChevronRightIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
  PhotoIcon,
  ArrowUpTrayIcon,
} from '@heroicons/react/24/outline';
import { Badge, Button, Input as _Input, Tabs } from '@agencypmg/alli-design-system';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Input = _Input as unknown as React.ComponentType<any>;
import { cn } from '../../../utils/cn';
import { fetchFeedSample, type DatasourceRecord, type SelectedFeed } from '../../../platform/datasources';
import { feedToCreatives } from '../utils/feedToCreatives';
import { useDatasources } from '../hooks/useDatasources';
import type { MockCreative, Creative } from '../types';
import UploadTab from './UploadTab';

interface FeedConnectScreenProps {
  clientSlug: string;
  onConnect: (feed: SelectedFeed, imageColumn: string, creatives: MockCreative[]) => void;
  onUploadConnect: (creatives: Creative[]) => void;
}

const SHIMMER_WIDTHS = ['w-48', 'w-56', 'w-40'];

const TABS = [
  {
    id: 'alli',
    disabled: false,
    title: (
      <span className="flex items-center gap-1.5">
        <CircleStackIcon className="h-3.5 w-3.5" />
        From Alli
      </span>
    ),
  },
  {
    id: 'upload',
    disabled: false,
    title: (
      <span className="flex items-center gap-1.5">
        <ArrowUpTrayIcon className="h-3.5 w-3.5" />
        Upload Files
      </span>
    ),
  },
];

export default function FeedConnectScreen({ clientSlug, onConnect, onUploadConnect }: FeedConnectScreenProps) {
  const { feeds, loading, scanning, error, refresh } = useDatasources(clientSlug);
  const [search, setSearch] = useState('');
  const [pickingFeed, setPickingFeed] = useState<DatasourceRecord | null>(null);
  const [activeTab, setActiveTab] = useState<'alli' | 'upload'>('alli');
  const [selecting, setSelecting] = useState(false);
  const [selectError, setSelectError] = useState<string | null>(null);

  // Fetch rows for the ONE selected feed (the registry stores discovery
  // metadata, not rows), then build creatives from the chosen image column.
  // fetchFeedSample returns an error ENVELOPE (it doesn't throw) on Alli
  // failure, so we must inspect metadata.error before connecting — otherwise
  // a failed feed would land the user on a silently empty grid.
  async function connectFeed(record: DatasourceRecord, imageColumn: string) {
    setSelectError(null);
    setSelecting(true);
    try {
      const sample = await fetchFeedSample({ clientSlug, feed: { name: record.modelName } });
      const meta = sample.metadata as { error?: { error?: string } } | null;
      if (meta?.error) {
        setPickingFeed(null);
        setSelectError(meta.error.error ?? 'Could not load this feed. Try another source.');
        return;
      }
      if (sample.sampleData.length === 0) {
        setPickingFeed(null);
        setSelectError('That feed returned no image rows. Try another source or rescan.');
        return;
      }
      // Ad Resize is images-only: feedToCreatives filters video rows out so they
      // never reach the outpaint pipeline. If filtering leaves nothing usable,
      // don't connect to an empty grid — say why.
      const { creatives, skippedVideo } = await feedToCreatives(sample.sampleData, record.modelName, imageColumn);
      if (creatives.length === 0) {
        setPickingFeed(null);
        setSelectError(
          skippedVideo > 0
            ? "This feed's media is video — Ad Resize is images-only for now."
            : 'That feed returned no usable image rows.',
        );
        return;
      }
      onConnect({ name: record.modelName }, imageColumn, creatives);
    } catch (e) {
      setPickingFeed(null);
      setSelectError((e as Error)?.message ?? 'Could not load this feed. Try another source.');
    } finally {
      setSelecting(false);
    }
  }

  async function handleSelectFeed(record: DatasourceRecord) {
    if (record.imageColumns.length === 1) {
      await connectFeed(record, record.imageColumns[0]);
      return;
    }
    setPickingFeed(record);
  }

  async function handleSelectColumn(col: string) {
    if (!pickingFeed) return;
    await connectFeed(pickingFeed, col);
  }

  /* ── Fetching the selected feed's rows ── */
  if (selecting) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-4 h-10 w-10 animate-spin rounded-full border-[3px] border-blue-100 border-t-blue-500" />
        <p className="text-[13px] font-medium text-gray-500">Loading creatives…</p>
      </div>
    );
  }

  /* ── Error ── */
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
          <CircleStackIcon className="h-6 w-6 text-red-400" />
        </div>
        <p className="text-[14px] font-semibold text-gray-800">Could not load data sources</p>
        <p className="mt-1 max-w-xs text-[12px] text-gray-400">{error}</p>
        <div className="mt-4">
          <Button variant="text" icon={<ArrowPathIcon className="h-3.5 w-3.5" />} onClick={() => void refresh()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  /* ── Column picker ── */
  if (pickingFeed) {
    return (
      <div className="flex flex-col items-center py-10">
        <div className="w-full max-w-md">
          <div className="mb-4">
            <Button
              variant="text"
              icon={<ChevronRightIcon className="h-3 w-3 rotate-180" />}
              onClick={() => setPickingFeed(null)}
            >
              Back to sources
            </Button>
          </div>
          <p className="text-[15px] font-semibold text-gray-900">Choose an image column</p>
          <p className="mt-1 text-[13px] text-gray-400">
            <span className="font-medium text-gray-600">{pickingFeed.modelName}</span> has{' '}
            {pickingFeed.imageColumns.length} image URL columns. Pick one to use as the source.
          </p>
          <div className="mt-4 space-y-2">
            {pickingFeed.imageColumns.map(col => (
              <button key={col} type="button" onClick={() => handleSelectColumn(col)}
                className="group flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-left shadow-sm transition-all hover:border-blue-300 hover:shadow-md">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                    <PhotoIcon className="h-4 w-4 text-blue-500" />
                  </div>
                  <span className="font-mono text-[13px] font-medium text-gray-800">{col}</span>
                </div>
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-gray-300 group-hover:text-blue-500" />
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ── No image feeds ── */
  if (!loading && !scanning && feeds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
          <PhotoIcon className="h-6 w-6 text-gray-400" />
        </div>
        <p className="text-[14px] font-semibold text-gray-800">No image feeds found</p>
        <p className="mt-1 max-w-xs text-[12px] text-gray-400">
          None of the available feeds for this client contain image URL columns.
        </p>
        <div className="mt-4">
          <Button variant="text" icon={<ArrowPathIcon className="h-3.5 w-3.5" />} onClick={() => void refresh()}>
            Rescan
          </Button>
        </div>
      </div>
    );
  }

  const busy = loading || scanning;
  const filteredFeeds = feeds.filter(f =>
    f.modelName.toLowerCase().includes(search.toLowerCase())
  );

  /* ── Main ── */
  return (
    <div className="flex flex-col gap-0">
      <div className="mb-5">
        <Tabs
          tabs={TABS}
          activeKey={activeTab}
          onClick={(tab) => setActiveTab(tab.id as 'alli' | 'upload')}
        />
      </div>

      {activeTab === 'alli' && (
        <>
          <style>{`
            @keyframes feedFadeIn {
              from { opacity: 0; transform: translateY(10px); }
              to   { opacity: 1; transform: translateY(0); }
            }
            .feed-card-enter { animation: feedFadeIn 0.22s ease-out both; }
            @keyframes scanPulse {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.4; }
            }
            .scan-dot { animation: scanPulse 1.2s ease-in-out infinite; }
          `}</style>

          <div className="flex flex-col items-center py-8">
            <div className="w-full max-w-md">

              {scanning && (
                <div className="mb-5 overflow-hidden rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3.5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="scan-dot h-2 w-2 rounded-full bg-blue-500" />
                    <span className="text-[13px] font-semibold text-blue-800">
                      Scanning data sources — first time for this client…
                    </span>
                  </div>
                </div>
              )}

              {!busy && (
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600">
                    <CircleStackIcon className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-[15px] font-semibold text-gray-900">Connect a data source</p>
                    <p className="text-[12px] text-gray-400">
                      {feeds.length} feed{feeds.length !== 1 ? 's' : ''} with image columns
                    </p>
                  </div>
                </div>
              )}

              {selectError && (
                <div className="mb-3 rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5">
                  <p className="text-[12px] font-medium text-red-700">{selectError}</p>
                </div>
              )}

              {!busy && (
                <div className="mb-3">
                  <Input
                    name="search"
                    placeholder="Search feeds…"
                    value={search}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                    leadingIcon={<MagnifyingGlassIcon className="alli-h-4 alli-w-4 alli-text-gray-400" aria-hidden="true" />}
                  />
                </div>
              )}

              <div className={cn('space-y-2', !busy ? 'max-h-[420px] overflow-y-auto pr-0.5' : '')}>
                {filteredFeeds.length === 0 && !busy && search && (
                  <p className="py-6 text-center text-[12px] text-gray-400">No feeds match &ldquo;{search}&rdquo;</p>
                )}

                {filteredFeeds.map(record => (
                  <div key={record.modelName} className="feed-card-enter">
                    <button
                      type="button"
                      onClick={() => handleSelectFeed(record)}
                      className="group flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left shadow-sm transition-all hover:border-blue-300 hover:shadow-md active:scale-[0.99]"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-50 transition-colors group-hover:bg-blue-50">
                        <PhotoIcon className="h-5 w-5 text-gray-400 transition-colors group-hover:text-blue-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-gray-900">{record.modelName}</p>
                        <p className="text-[11px] text-gray-400">
                          {record.imageCount} image{record.imageCount !== 1 ? 's' : ''}
                          {record.imageColumns.length > 1 && (
                            <span className="ml-1.5 inline-flex">
                              <Badge variant="orange">{record.imageColumns.length} columns</Badge>
                            </span>
                          )}
                        </p>
                      </div>
                      <ChevronRightIcon className="h-4 w-4 shrink-0 text-gray-300 transition-colors group-hover:text-blue-500" />
                    </button>
                  </div>
                ))}

                {busy && SHIMMER_WIDTHS.map((w, i) => (
                  <div
                    key={`skel-${i}`}
                    className="flex animate-pulse items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  >
                    <div className="h-9 w-9 shrink-0 rounded-lg bg-gray-100" />
                    <div className="flex-1 space-y-1.5">
                      <div className={cn('h-3 rounded bg-gray-100', w)} />
                      <div className="h-2 w-20 rounded bg-gray-100" />
                    </div>
                  </div>
                ))}
              </div>

              {!busy && (
                <div className="mt-4">
                  <Button variant="text" icon={<ArrowPathIcon className="h-3 w-3" />} onClick={() => void refresh()}>
                    Rescan feeds
                  </Button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {activeTab === 'upload' && (
        <UploadTab clientSlug={clientSlug} onUploadConnect={onUploadConnect} />
      )}
    </div>
  );
}
