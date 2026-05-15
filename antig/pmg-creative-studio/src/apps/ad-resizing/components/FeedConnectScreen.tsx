import { useState, useEffect, useRef } from 'react';
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
import { fetchDataSources, fetchFeedSample } from '../../template-builder/_internal/handlers';
import type { SelectedFeed } from '../../template-builder/types';
import { detectImageColumns, feedToCreatives } from '../utils/feedToCreatives';
import { clearFeedCache, getCachedDataSources, getCachedFeedSample } from '../../template-builder/_internal/handlers';
import type { MockCreative } from '../types';
import type { Creative } from '../types';
import UploadTab from './UploadTab';

interface VerifiedFeed {
  feed: SelectedFeed;
  imageColumns: string[];
  imageCount: number;
  sampleData: Array<Record<string, unknown>>;
}

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
  const [scanning, setScanning] = useState(true);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scannedCount, setScannedCount] = useState(0);
  const [totalToScan, setTotalToScan] = useState(0);
  const [currentlyChecking, setCurrentlyChecking] = useState('');
  const [verifiedFeeds, setVerifiedFeeds] = useState<VerifiedFeed[]>([]);
  const [search, setSearch] = useState('');
  const [pickingFeed, setPickingFeed] = useState<VerifiedFeed | null>(null);
  const [activeTab, setActiveTab] = useState<'alli' | 'upload'>('alli');

  const runId = useRef(0);

  function runScan(bustCache = false) {
    const myId = ++runId.current;
    if (bustCache) clearFeedCache(clientSlug);

    setScanError(null);

    const cachedSources = !bustCache ? getCachedDataSources(clientSlug) : null;
    if (cachedSources && !cachedSources.error) {
      const allFeeds = cachedSources.feeds;
      const fromCache: VerifiedFeed[] = [];
      const needsFetch: typeof allFeeds = [];

      for (const feed of allFeeds) {
        const sample = getCachedFeedSample(clientSlug, feed.name);
        if (sample) {
          const cols = detectImageColumns(sample.sampleData);
          if (cols.length > 0) {
            const imageCount = sample.sampleData.filter(row => String(row[cols[0]] ?? '').startsWith('http')).length;
            fromCache.push({ feed, imageColumns: cols, imageCount, sampleData: sample.sampleData });
          }
        } else {
          needsFetch.push(feed);
        }
      }

      setVerifiedFeeds(fromCache.sort((a, b) => a.feed.name.localeCompare(b.feed.name)));
      setTotalToScan(allFeeds.length);
      setScannedCount(allFeeds.length - needsFetch.length);

      if (needsFetch.length === 0) {
        setScanning(false);
        setCurrentlyChecking('');
        return;
      }

      setScanning(true);
      setCurrentlyChecking('');

      async function processFeed(feed: typeof allFeeds[number]) {
        if (runId.current !== myId) return;
        setCurrentlyChecking(feed.name);
        const sample = await fetchFeedSample({ clientSlug, feed });
        if (runId.current !== myId) return;
        setScannedCount(c => c + 1);
        const cols = detectImageColumns(sample.sampleData);
        if (cols.length === 0) return;
        const imageCount = sample.sampleData.filter(row => String(row[cols[0]] ?? '').startsWith('http')).length;
        setVerifiedFeeds(prev =>
          [...prev, { feed, imageColumns: cols, imageCount, sampleData: sample.sampleData }]
            .sort((a, b) => a.feed.name.localeCompare(b.feed.name))
        );
      }

      const BATCH = 3;
      (async () => {
        for (let i = 0; i < needsFetch.length; i += BATCH) {
          if (runId.current !== myId) break;
          await Promise.allSettled(needsFetch.slice(i, i + BATCH).map(processFeed));
        }
        if (runId.current === myId) setScanning(false);
      })();
      return;
    }

    setScanning(true);
    setVerifiedFeeds([]);
    setScannedCount(0);
    setTotalToScan(0);
    setCurrentlyChecking('');

    fetchDataSources({ clientSlug }).then(async result => {
      if (runId.current !== myId) return;
      if (result.error) { setScanning(false); setScanError(result.error); return; }

      const allFeeds = result.feeds;
      setTotalToScan(allFeeds.length);

      async function processFeed(feed: typeof allFeeds[number]) {
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
      }

      const BATCH = 3;
      for (let i = 0; i < allFeeds.length; i += BATCH) {
        if (runId.current !== myId) break;
        await Promise.allSettled(allFeeds.slice(i, i + BATCH).map(processFeed));
      }
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
        <div className="mt-4">
          <Button variant="text" icon={<ArrowPathIcon className="h-3.5 w-3.5" />} onClick={() => runScan(true)}>
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
        <div className="mt-4">
          <Button variant="text" icon={<ArrowPathIcon className="h-3.5 w-3.5" />} onClick={() => runScan(true)}>
            Rescan
          </Button>
        </div>
      </div>
    );
  }

  const progress = totalToScan > 0 ? Math.round((scannedCount / totalToScan) * 100) : 0;
  const filteredFeeds = verifiedFeeds.filter(v =>
    v.feed.name.toLowerCase().includes(search.toLowerCase())
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
                      <Badge variant="blue">{verifiedFeeds.length} found</Badge>
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

              {(verifiedFeeds.length > 0 || !scanning) && (
                <div className="mb-3">
                  <Input
                    name="search"
                    placeholder="Search feeds…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    leadingIcon={<MagnifyingGlassIcon className="alli-h-4 alli-w-4 alli-text-gray-400" aria-hidden="true" />}
                  />
                </div>
              )}

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
                            <span className="ml-1.5 inline-flex">
                              <Badge variant="orange">{verified.imageColumns.length} columns</Badge>
                            </span>
                          )}
                        </p>
                      </div>
                      <ChevronRightIcon className="h-4 w-4 shrink-0 text-gray-300 transition-colors group-hover:text-blue-500" />
                    </button>
                  </div>
                ))}

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
                <div className="mt-4">
                  <Button variant="text" icon={<ArrowPathIcon className="h-3 w-3" />} onClick={() => runScan(true)}>
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
