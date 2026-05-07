import { useState, useCallback, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeftIcon, SparklesIcon, CircleStackIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { cn } from '../../utils/cn';
import { getDeduplicatedDimensions } from './data/channels';
import type { MockCreative, GenerationJob, GeneratedOutput, AppTab } from './types';
import type { SelectedFeed } from '../template-builder/types';
import { downloadImage, type DownloadFormat } from './utils/downloadImage';
import CreativeTile from './components/CreativeTile';
import ResizeConfigPanel from './components/ResizeConfigPanel';
import GeneratedTile from './components/GeneratedTile';
import SingleImageModal from './components/SingleImageModal';
import FilterSortBar, { type FormatFilter, type FileTypeFilter, type SortOption } from './components/FilterSortBar';
import GeneratedFilterBar, { type GenFormatFilter, type GenSortOption } from './components/GeneratedFilterBar';
import DownloadDropdown from './components/DownloadDropdown';
import FeedConnectScreen from './components/FeedConnectScreen';

function detectFormat(width: number, height: number): 'landscape' | 'square' | 'portrait' {
  const ratio = width / height;
  if (ratio > 1.2) return 'landscape';
  if (ratio < 0.85) return 'portrait';
  return 'square';
}

export default function AdResizingAppRoot() {
  const { clientSlug } = useParams<{ clientSlug: string }>();

  const [activeTab, setActiveTab] = useState<AppTab>('all-creatives');
  const [selectedCreative, setSelectedCreative] = useState<MockCreative | null>(null);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [selectedDimensions, setSelectedDimensions] = useState<Set<string>>(new Set());
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [singleView, setSingleView] = useState<{ index: number } | null>(null);
  const [sourcePreviewOpen, setSourcePreviewOpen] = useState(false);

  const [filterFormat, setFilterFormat] = useState<FormatFilter>('all');
  const [filterFileType, setFilterFileType] = useState<FileTypeFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  const [genFilterFormat, setGenFilterFormat] = useState<GenFormatFilter>('all');
  const [genFilterChannel, setGenFilterChannel] = useState<string>('all');
  const [genSort, setGenSort] = useState<GenSortOption>('default');

  const [feedCreatives, setFeedCreatives] = useState<MockCreative[] | null>(null);
  const [connectedFeedLabel, setConnectedFeedLabel] = useState<string | null>(null);

  function handleFeedConnect(feed: SelectedFeed, _imageColumn: string, creatives: MockCreative[]) {
    setFeedCreatives(creatives);
    setConnectedFeedLabel(feed.name);
    setSelectedCreative(null);
    setSelectedChannels([]);
    setSelectedDimensions(new Set());
  }

  function handleDisconnectFeed() {
    setFeedCreatives(null);
    setConnectedFeedLabel(null);
    setSelectedCreative(null);
    setSelectedChannels([]);
    setSelectedDimensions(new Set());
  }

  const jobChannelOptions = useMemo(() => {
    if (!job) return [];
    return [...new Set(job.outputs.map(o => o.dimension.channelLabel))];
  }, [job]);

  const filteredOutputs = useMemo(() => {
    if (!job) return [];
    let list = [...job.outputs];
    if (genFilterFormat !== 'all') {
      list = list.filter(o => detectFormat(o.dimension.width, o.dimension.height) === genFilterFormat);
    }
    if (genFilterChannel !== 'all') {
      list = list.filter(o => o.dimension.channelLabel === genFilterChannel);
    }
    list.sort((a, b) => {
      if (genSort === 'label-az') return a.dimension.label.localeCompare(b.dimension.label);
      if (genSort === 'size-desc') return (b.dimension.width * b.dimension.height) - (a.dimension.width * a.dimension.height);
      if (genSort === 'size-asc') return (a.dimension.width * a.dimension.height) - (b.dimension.width * b.dimension.height);
      return 0;
    });
    return list;
  }, [job, genFilterFormat, genFilterChannel, genSort]);

  const filteredCreatives = useMemo(() => {
    let list = [...(feedCreatives ?? [])];

    if (filterFormat !== 'all') {
      list = list.filter(c => detectFormat(c.width, c.height) === filterFormat);
    }
    if (filterFileType !== 'all') {
      list = list.filter(c => c.fileType === filterFileType);
    }

    list.sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
      if (sortBy === 'oldest') return new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime();
      if (sortBy === 'az') return a.name.localeCompare(b.name);
      if (sortBy === 'za') return b.name.localeCompare(a.name);
      return 0;
    });

    return list;
  }, [feedCreatives, filterFormat, filterFileType, sortBy]);

  const handleSelectCreative = useCallback((creative: MockCreative) => {
    if (selectedCreative?.id === creative.id) {
      setSelectedCreative(null);
      setSelectedChannels([]);
      setSelectedDimensions(new Set());
    } else {
      setSelectedCreative(creative);
      setSelectedChannels([]);
      setSelectedDimensions(new Set());
    }
  }, [selectedCreative]);

  const handleSetChannels = useCallback((channelIds: string[]) => {
    setSelectedChannels(channelIds);
    if (channelIds.length === 0) {
      setSelectedDimensions(new Set());
    } else {
      const dims = getDeduplicatedDimensions(channelIds);
      setSelectedDimensions(new Set(dims.map(d => d.id)));
    }
  }, []);

  const handleToggleChannel = useCallback((channelId: string) => {
    setSelectedChannels(prev => {
      const isRemoving = prev.includes(channelId);
      const next = isRemoving
        ? prev.filter(id => id !== channelId)
        : [...prev, channelId];

      const available = getDeduplicatedDimensions(next);
      const availableIds = new Set(available.map(d => d.id));
      setSelectedDimensions(prev => {
        // Always drop dims that no longer exist in the remaining channels
        const kept = new Set([...prev].filter(id => availableIds.has(id)));
        // Only auto-select new dims when adding a channel, not when removing
        if (!isRemoving) available.forEach(d => kept.add(d.id));
        return kept;
      });

      return next;
    });
  }, []);

  const handleToggleDimension = useCallback((dimId: string) => {
    setSelectedDimensions(prev => {
      const next = new Set(prev);
      if (next.has(dimId)) next.delete(dimId);
      else next.add(dimId);
      return next;
    });
  }, []);

  const handleRun = useCallback(() => {
    if (!selectedCreative || selectedDimensions.size === 0) return;

    const dims = getDeduplicatedDimensions(selectedChannels).filter(d => selectedDimensions.has(d.id));
    const outputs: GeneratedOutput[] = dims.map(dim => ({
      id: `output-${dim.id}-${Date.now()}`,
      dimension: dim,
      status: 'pending',
    }));

    const newJob: GenerationJob = {
      id: `job-${Date.now()}`,
      sourceCreative: selectedCreative,
      outputs,
      startedAt: Date.now(),
    };

    setJob(newJob);
    setActiveTab('ai-generated');
    setSelectedCreative(null);
    setSelectedChannels([]);
    setSelectedDimensions(new Set());
    setGenFilterFormat('all');
    setGenFilterChannel('all');
    setGenSort('default');

    // Simulate progressive completion
    outputs.forEach((output, i) => {
      const delay = (i + 1) * 900 + Math.random() * 300;
      setTimeout(() => {
        setJob(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            outputs: prev.outputs.map(o =>
              o.id === output.id
                ? {
                    ...o,
                    status: 'complete' as const,
                    imageUrl: (() => {
                      const scale = Math.min(1, 800 / output.dimension.width, 800 / output.dimension.height);
                      const w = Math.round(output.dimension.width * scale);
                      const h = Math.round(output.dimension.height * scale);
                      return `https://picsum.photos/seed/${output.dimension.id}/${w}/${h}`;
                    })(),
                  }
                : o
            ),
          };
        });
      }, delay);
    });
  }, [selectedCreative, selectedChannels, selectedDimensions]);

  const completedOutputs = job?.outputs.filter(o => o.status === 'complete') ?? [];
  const allComplete = job !== null && job.outputs.every(o => o.status === 'complete');
  const inProgress = job !== null && !allComplete;

  function handleDownloadAll(format: DownloadFormat) {
    completedOutputs.forEach((output, i) => {
      if (!output.imageUrl) return;
      setTimeout(() => {
        const filename = `${output.dimension.label.replace(':', 'x')}-${output.dimension.width}x${output.dimension.height}`;
        downloadImage(output.imageUrl!, filename, format);
      }, i * 150);
    });
  }

  return (
    <div className="flex flex-col gap-0">
      {/* Page header */}
      <div className="mb-5">
        <Link
          to={`/adlabs/${clientSlug}/`}
          className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-700"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          Back to AdLabs
        </Link>
        <h1 className="text-[20px] font-semibold text-gray-900">Resize Image</h1>
        <p className="mt-0.5 text-[13px] text-gray-500">
          Select a creative, choose target channels, and generate resized outputs.
        </p>
      </div>

      {/* Tab bar */}
      <div className="mb-0 flex items-center justify-between border-b border-gray-200">
        <div className="flex gap-0">
          {(['all-creatives', 'ai-generated'] as AppTab[]).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={cn(
                'relative px-4 pb-3 pt-1 text-[13px] font-medium transition-colors',
                activeTab === tab
                  ? 'text-blue-600 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {tab === 'all-creatives' ? 'All Creatives' : 'Variants'}
              {tab === 'ai-generated' && job && (
                <span className={cn(
                  'ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                  inProgress ? 'bg-amber-100 text-amber-600' : 'bg-green-100 text-green-600'
                )}>
                  {inProgress ? `${completedOutputs.length}/${job.outputs.length}` : job.outputs.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab-level actions */}
        {activeTab === 'ai-generated' && allComplete && job && (
          <div className="mb-1">
            <DownloadDropdown count={job.outputs.length} onDownload={handleDownloadAll} size="sm" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex min-h-[60vh] gap-0 pt-5">
        {/* All Creatives tab */}
        {activeTab === 'all-creatives' && (
          feedCreatives === null ? (
            <div className="flex-1">
              <FeedConnectScreen
                clientSlug={clientSlug ?? ''}
                onConnect={handleFeedConnect}
              />
            </div>
          ) : (
            <>
              <div className={cn('flex-1 min-w-0 transition-all duration-200', selectedCreative ? 'pr-5' : '')}>
                {/* Connected source indicator */}
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[12px] text-gray-400">
                    <CircleStackIcon className="h-3.5 w-3.5" />
                    <span>{connectedFeedLabel}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleDisconnectFeed}
                    className="text-[12px] text-gray-400 hover:text-gray-600"
                  >
                    Change source
                  </button>
                </div>
                <FilterSortBar
                  format={filterFormat}
                  fileType={filterFileType}
                  sort={sortBy}
                  onFormatChange={setFilterFormat}
                  onFileTypeChange={setFilterFileType}
                  onSortChange={setSortBy}
                  totalCount={feedCreatives.length}
                  filteredCount={filteredCreatives.length}
                />
                <div className={cn(
                  'grid gap-3',
                  selectedCreative ? 'grid-cols-2 xl:grid-cols-3' : 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4'
                )}>
                  {filteredCreatives.map(creative => (
                    <CreativeTile
                      key={creative.id}
                      creative={creative}
                      selected={selectedCreative?.id === creative.id}
                      onSelect={handleSelectCreative}
                    />
                  ))}
                </div>
              </div>

              {selectedCreative && (
                <ResizeConfigPanel
                  creative={selectedCreative}
                  selectedChannels={selectedChannels}
                  selectedDimensions={selectedDimensions}
                  onToggleChannel={handleToggleChannel}
                  onToggleDimension={handleToggleDimension}
                  onSetChannels={handleSetChannels}
                  onRun={handleRun}
                  onClose={() => {
                    setSelectedCreative(null);
                    setSelectedChannels([]);
                    setSelectedDimensions(new Set());
                  }}
                />
              )}
            </>
          )
        )}

        {/* AI Generated tab */}
        {activeTab === 'ai-generated' && (
          <div className="flex-1">
            {!job ? (
              /* Empty state */
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
                  <SparklesIcon className="h-7 w-7 text-blue-400" />
                </div>
                <p className="text-[15px] font-medium text-gray-700">No generations yet</p>
                <p className="mt-1 max-w-xs text-[13px] text-gray-400">
                  Select a creative from All Creatives, choose your channels, and click Run.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('all-creatives')}
                  className="mt-4 text-[13px] font-medium text-blue-600 hover:text-blue-700"
                >
                  Browse creatives →
                </button>
              </div>
            ) : (
              <>
                {/* Job header */}
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-[14px] font-semibold text-gray-900">
                      {inProgress
                        ? `Generating ${job.outputs.length} sizes…`
                        : `${job.outputs.length} sizes ready`}
                    </p>
                    {/* Source creative pill */}
                    <button
                      type="button"
                      onClick={() => setSourcePreviewOpen(true)}
                      className="mt-1 flex items-center gap-1.5 rounded-full border border-gray-200 bg-white py-0.5 pl-0.5 pr-2.5 text-left shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50"
                    >
                      <img
                        src={job.sourceCreative.thumbnailUrl}
                        alt={job.sourceCreative.name}
                        className="h-5 w-5 rounded-full object-cover"
                      />
                      <span className="text-[11px] text-gray-500">
                        Source: <span className="font-medium text-gray-700">{job.sourceCreative.name}</span>
                      </span>
                    </button>
                  </div>
                  {allComplete && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveTab('all-creatives')}
                        className="text-[13px] font-medium text-gray-500 hover:text-gray-700"
                      >
                        Resize another →
                      </button>
                    </div>
                  )}
                </div>

                {/* Filter bar */}
                <GeneratedFilterBar
                  format={genFilterFormat}
                  channel={genFilterChannel}
                  sort={genSort}
                  channelOptions={jobChannelOptions}
                  onFormatChange={setGenFilterFormat}
                  onChannelChange={setGenFilterChannel}
                  onSortChange={setGenSort}
                  totalCount={job.outputs.length}
                  filteredCount={filteredOutputs.length}
                />

                {/* Generated grid */}
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                  {filteredOutputs.map((output) => (
                    <GeneratedTile
                      key={output.id}
                      output={output}
                      onView={() => {
                        const completedFiltered = filteredOutputs.filter(o => o.status === 'complete');
                        setSingleView({ index: completedFiltered.findIndex(o => o.id === output.id) });
                      }}
                    />
                  ))}
                </div>

                {/* Bottom actions when complete */}
                {allComplete && (
                  <div className="mt-6 flex items-center justify-end gap-3 border-t border-gray-200 pt-4">
                    <button
                      type="button"
                      onClick={() => setActiveTab('all-creatives')}
                      className="rounded-lg border border-gray-300 px-4 py-2 text-[13px] font-medium text-gray-600 hover:bg-gray-50"
                    >
                      Resize Another
                    </button>
                    <DownloadDropdown count={job.outputs.length} onDownload={handleDownloadAll} />
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Single image modal */}
      {singleView !== null && job && (
        <SingleImageModal
          outputs={filteredOutputs.filter(o => o.status === 'complete')}
          initialIndex={singleView.index}
          onClose={() => setSingleView(null)}
        />
      )}

      {/* Source creative preview modal */}
      {sourcePreviewOpen && job && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setSourcePreviewOpen(false)}
        >
          <div
            className="flex w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
              <div>
                <p className="text-[13px] font-semibold text-gray-900">Source Creative</p>
                <p className="mt-0.5 text-[11px] text-gray-400">
                  {job.sourceCreative.name} · {job.sourceCreative.width}×{job.sourceCreative.height} · {job.sourceCreative.fileType}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSourcePreviewOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>

            {/* Image */}
            <div className="flex items-center justify-center bg-gray-50 p-6">
              <img
                src={job.sourceCreative.thumbnailUrl}
                alt={job.sourceCreative.name}
                className="max-h-[55vh] w-auto rounded-lg object-contain shadow-sm"
              />
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3">
              <p className="text-[11px] text-gray-400">
                Original used to generate {job.outputs.length} size{job.outputs.length !== 1 ? 's' : ''}
              </p>
              <DownloadDropdown
                openUp
                onDownload={fmt => downloadImage(job.sourceCreative.thumbnailUrl, job.sourceCreative.name, fmt)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
