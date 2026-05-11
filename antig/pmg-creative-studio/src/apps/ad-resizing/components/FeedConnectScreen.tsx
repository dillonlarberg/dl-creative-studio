import { useState, useEffect, useRef } from 'react';
import {
  CircleStackIcon,
  ChevronRightIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline';
import { cn } from '../../../utils/cn';
import { fetchDataSources, fetchFeedSample } from '../../template-builder/_internal/handlers';
import type { SelectedFeed } from '../../template-builder/types';
import { detectImageColumns, feedToCreatives } from '../utils/feedToCreatives';
import type { MockCreative } from '../types';

interface VerifiedFeed {
  feed: SelectedFeed;
  imageColumns: string[];
  imageCount: number;
  sampleData: Array<Record<string, unknown>>;
}

interface FeedConnectScreenProps {
  clientSlug: string;
  onConnect: (feed: SelectedFeed, imageColumn: string, creatives: MockCreative[]) => void;
}

const SHIMMER_WIDTHS = ['w-48', 'w-56', 'w-40'];

export default function FeedConnectScreen({ clientSlug, onConnect }: FeedConnectScreenProps) {
  const [scanning, setScanning] = useState(true);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scannedCount, setScannedCount] = useState(0);
  const [totalToScan, setTotalToScan] = useState(0);
  const [currentlyChecking, setCurrentlyChecking] = useState('');
  const [verifiedFeeds, setVerifiedFeeds] = useState<VerifiedFeed[]>([]);
  const [search, setSearch] = useState('');
  const [pickingFeed, setPickingFeed] = useState<VerifiedFeed | null>(null);

  // Run ID guards against StrictMode double-invoke: each runScan() gets a unique ID,
  // and async callbacks only write state if they belong to the current run.
  const runId = useRef(0);

  function runScan() {
    const myId = ++runId.current;

    setScanning(true);
    setScanError(null);
    setVerifiedFeeds([]);
    setScannedCount(0);
    setTotalToScan(0);
    setCurrentlyChecking('');

    fetchDataSources({ clientSlug }).then(async result => {
      if (runId.current !== myId) return;
      if (result.error) { setScanning(false); setScanError(result.error); return; }

      const allFeeds = result.feeds;
      setTotalToScan(allFeeds.length);

      await Promise.allSettled(
        allFeeds.map(async feed => {
          if (runId.current !== myId) return;
          setCurrentlyChecking(feed.name);

          const sample = await fetchFeedSample({ clientSlug, feed });
          if (runId.current !== myId) return;

          setScannedCount(c => c + 1);
          const cols = detectImageColumns(sample.sampleData);
          if (cols.length === 0) return;

          const imageCount = sample.sampleData.filter(row =>
            String(row[cols[0]] ?? '').startsWith('http')
          ).length;

          setVerifiedFeeds(prev =>
            [...prev, { feed, imageColumns: cols, imageCount, sampleData: sample.sampleData }]
              .sort((a, b) => a.feed.name.localeCompare(b.feed.name))
          );
        })
      );

      if (runId.current === myId) setScanning(false);
    });
  }

  useEffect(() => { runScan(); }, [clientSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSelectFeed(verified: VerifiedFeed) {
    if (verified.imageColumns.length === 1) {
      const creatives = await feedToCreatives(verified.sampleData, verified.feed.name, verified.imageColumns[0]);
      onConnect(verified.feed, verified.imageColumns[0], creatives);
      return;
    }
    setPickingFeed(verified);
  }

  async function handleSelectColumn(col: string) {
    if (!pickingFeed) return;
    const creatives = await feedToCreatives(pickingFeed.sampleData, pickingFeed.feed.name, col);
    onConnect(pickingFeed.feed, col, creatives);
  }

  /* ── Error ── */
  if (scanError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
          <CircleStackIcon className="h-6 w-6 text-red-400" />
        </div>
        <p className="text-[14px] font-semibold text-gray-800">Could not load data sources</p>
        <p className="mt-1 max-w-xs text-[12px] text-gray-400">{scanError}</p>
        <button type="button" onClick={runScan}
          className="mt-4 flex items-center gap-1.5 text-[13px] font-medium text-blue-600 hover:text-blue-700">
          <ArrowPathIcon className="h-3.5 w-3.5" /> Retry
        </button>
      </div>
    );
  }

  /* ── Column picker ── */
  if (pickingFeed) {
    return (
      <div className="flex flex-col items-center py-10">
        <div className="w-full max-w-md">
          <button type="button" onClick={() => setPickingFeed(null)}
            className="mb-4 flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-gray-600">
            <ChevronRightIcon className="h-3 w-3 rotate-180" /> Back to sources
          </button>
          <p className="text-[15px] font-semibold text-gray-900">Choose an image column</p>
          <p className="mt-1 text-[13px] text-gray-400">
            <span className="font-medium text-gray-600">{pickingFeed.feed.name}</span> has{' '}
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
  if (!scanning && verifiedFeeds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
          <PhotoIcon className="h-6 w-6 text-gray-400" />
        </div>
        <p className="text-[14px] font-semibold text-gray-800">No image feeds found</p>
        <p className="mt-1 max-w-xs text-[12px] text-gray-400">
          None of the available feeds for this client contain image URL columns.
        </p>
        <button type="button" onClick={runScan}
          className="mt-4 flex items-center gap-1.5 text-[13px] font-medium text-blue-600 hover:text-blue-700">
          <ArrowPathIcon className="h-3.5 w-3.5" /> Rescan
        </button>
      </div>
    );
  }

  const progress = totalToScan > 0 ? Math.round((scannedCount / totalToScan) * 100) : 0;
  const filteredFeeds = verifiedFeeds.filter(v =>
    v.feed.name.toLowerCase().includes(search.toLowerCase())
  );

  /* ── Main (scanning + done merged) ── */
  return (
    <>
      <style>{`
        @keyframes feedFadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .feed-card-enter {
          animation: feedFadeIn 0.22s ease-out both;
        }
        @keyframes scanPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .scan-dot {
          animation: scanPulse 1.2s ease-in-out infinite;
        }
      `}</style>

      <div className="flex flex-col items-center py-8">
        <div className="w-full max-w-md">

          {/* Scanning banner — shown while scanning */}
          {scanning && (
            <div className="mb-5 overflow-hidden rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3.5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="scan-dot h-2 w-2 rounded-full bg-blue-500" />
                  <span className="text-[13px] font-semibold text-blue-800">
                    {totalToScan === 0
                      ? 'Fetching data sources…'
                      : `Scanning feeds — ${scannedCount} / ${totalToScan}`}
                  </span>
                </div>
                {verifiedFeeds.length > 0 && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                    {verifiedFeeds.length} found
                  </span>
                )}
              </div>

              {totalToScan > 0 && (
                <>
                  <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-blue-100">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all duration-500 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  {currentlyChecking && (
                    <p className="mt-1.5 truncate text-[11px] text-blue-500/70">
                      Checking <span className="font-mono">{currentlyChecking}</span>…
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Static header — shown when done */}
          {!scanning && (
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600">
                <CircleStackIcon className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-[15px] font-semibold text-gray-900">Connect a data source</p>
                <p className="text-[12px] text-gray-400">
                  {verifiedFeeds.length} feed{verifiedFeeds.length !== 1 ? 's' : ''} with image columns
                </p>
              </div>
            </div>
          )}

          {/* Search — always shown once we have something to show */}
          {(verifiedFeeds.length > 0 || !scanning) && (
            <div className="relative mb-3">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search feeds…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-4 text-[13px] text-gray-800 placeholder-gray-400 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
          )}

          {/* Feed list */}
          <div className={cn('space-y-2', (verifiedFeeds.length > 0 || !scanning) ? 'max-h-[420px] overflow-y-auto pr-0.5' : '')}>
            {filteredFeeds.length === 0 && !scanning && search && (
              <p className="py-6 text-center text-[12px] text-gray-400">No feeds match &ldquo;{search}&rdquo;</p>
            )}

            {filteredFeeds.map(verified => (
              <div key={verified.feed.name} className="feed-card-enter">
                <button
                  type="button"
                  onClick={() => handleSelectFeed(verified)}
                  className="group flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left shadow-sm transition-all hover:border-blue-300 hover:shadow-md active:scale-[0.99]"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-50 transition-colors group-hover:bg-blue-50">
                    <PhotoIcon className="h-5 w-5 text-gray-400 transition-colors group-hover:text-blue-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-gray-900">{verified.feed.name}</p>
                    <p className="text-[11px] text-gray-400">
                      {verified.imageCount} image{verified.imageCount !== 1 ? 's' : ''}
                      {verified.imageColumns.length > 1 && (
                        <span className="ml-1.5 rounded bg-amber-50 px-1 py-0.5 text-[10px] font-medium text-amber-600">
                          {verified.imageColumns.length} columns
                        </span>
                      )}
                    </p>
                  </div>
                  <ChevronRightIcon className="h-4 w-4 shrink-0 text-gray-300 transition-colors group-hover:text-blue-500" />
                </button>
              </div>
            ))}

            {/* Shimmer skeletons while scanning */}
            {scanning && SHIMMER_WIDTHS.map((w, i) => (
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

          {!scanning && (
            <button type="button" onClick={runScan}
              className="mt-4 flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-gray-600">
              <ArrowPathIcon className="h-3 w-3" /> Rescan feeds
            </button>
          )}
        </div>
      </div>
    </>
  );
}
