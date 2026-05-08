import { useState, useCallback, useMemo, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeftIcon, SparklesIcon, CircleStackIcon, XMarkIcon, PencilSquareIcon, CheckCircleIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { cn } from '../../utils/cn';
import { getDeduplicatedDimensions } from './data/channels';
import type { MockCreative, GenerationJob, GeneratedOutput } from './types';
import type { SelectedFeed } from '../template-builder/types';
import { downloadImage, type DownloadFormat } from './utils/downloadImage';
import CreativeTile from './components/CreativeTile';
import ResizeConfigPanel from './components/ResizeConfigPanel';
import GeneratedTile from './components/GeneratedTile';
import SingleImageModal from './components/SingleImageModal';
import FilterSortBar, { type FormatFilter, type FileTypeFilter, type SortOption } from './components/FilterSortBar';
import GeneratedFilterBar, { type GenSortOption } from './components/GeneratedFilterBar';
import DownloadDropdown from './components/DownloadDropdown';
import FeedConnectScreen from './components/FeedConnectScreen';

type Stage = 'browse' | 'results';

function detectFormat(width: number, height: number): 'landscape' | 'square' | 'portrait' {
  const ratio = width / height;
  if (ratio > 1.2) return 'landscape';
  if (ratio < 0.85) return 'portrait';
  return 'square';
}

const STEPS: { id: Stage | 'download'; label: string }[] = [
  { id: 'browse', label: 'Browse' },
  { id: 'results', label: 'Generate' },
  { id: 'download', label: 'Download' },
];

export default function AdResizingAppRoot() {
  const { clientSlug } = useParams<{ clientSlug: string }>();

  const [stage, setStage] = useState<Stage>('browse');
  const [selectedCreative, setSelectedCreative] = useState<MockCreative | null>(null);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [selectedDimensions, setSelectedDimensions] = useState<Set<string>>(new Set());

  // Multi-job state — each batch is a saved job; activeJobId tracks which is in view
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [addingToJob, setAddingToJob] = useState(false);

  const [singleView, setSingleView] = useState<{ index: number } | null>(null);
  const [sourcePreviewOpen, setSourcePreviewOpen] = useState(false);

  const [filterFormat, setFilterFormat] = useState<FormatFilter>('all');
  const [filterFileType, setFilterFileType] = useState<FileTypeFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  const [genFilterChannel, setGenFilterChannel] = useState<string>('all');
  const [genSort, setGenSort] = useState<GenSortOption>('default');
  const [selectedOutputIds, setSelectedOutputIds] = useState<Set<string>>(new Set());

  const [feedCreatives, setFeedCreatives] = useState<MockCreative[] | null>(null);
  const [connectedFeedLabel, setConnectedFeedLabel] = useState<string | null>(null);

  const activeJob = jobs.find(j => j.id === activeJobId) ?? null;

  // Clear tile selection whenever the active job changes
  useEffect(() => { setSelectedOutputIds(new Set()); }, [activeJobId]);

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
    setAddingToJob(false);
    // Jobs are intentionally preserved — existing generated outputs survive a feed change
  }

  const jobChannelOptions = useMemo(() => {
    if (!activeJob) return [];
    return [...new Set(activeJob.outputs.map(o => o.dimension.channelLabel))];
  }, [activeJob]);

  const filteredOutputs = useMemo(() => {
    if (!activeJob) return [];
    let list = [...activeJob.outputs];
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
  }, [activeJob, genFilterChannel, genSort]);

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
        const kept = new Set([...prev].filter(id => availableIds.has(id)));
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

  function simulateOutputCompletion(jobId: string, outputId: string, dimensionId: string, width: number, height: number, seed?: string) {
    const delay = 900 + Math.random() * 400;
    setTimeout(() => {
      setJobs(prev => {
        const scale = Math.min(1, 800 / width, 800 / height);
        const w = Math.round(width * scale);
        const h = Math.round(height * scale);
        const imageSeed = seed ?? dimensionId;
        return prev.map(j =>
          j.id === jobId
            ? {
                ...j,
                outputs: j.outputs.map(o =>
                  o.id === outputId
                    ? { ...o, status: 'complete' as const, imageUrl: `https://picsum.photos/seed/${imageSeed}/${w}/${h}` }
                    : o
                ),
              }
            : j
        );
      });
    }, delay);
  }

  const handleRun = useCallback(() => {
    if (!selectedCreative || selectedDimensions.size === 0) return;

    const dims = getDeduplicatedDimensions(selectedChannels).filter(d => selectedDimensions.has(d.id));
    const newOutputs: GeneratedOutput[] = dims.map(dim => ({
      id: `output-${dim.id}-${Date.now()}`,
      dimension: dim,
      status: 'pending',
    }));

    let targetJobId: string;

    const currentActiveJob = jobs.find(j => j.id === activeJobId);
    const shouldAppend = addingToJob && activeJobId &&
      selectedCreative.id === currentActiveJob?.sourceCreative.id;

    if (shouldAppend) {
      targetJobId = activeJobId!;
      setJobs(prev => prev.map(j =>
        j.id === activeJobId
          ? { ...j, outputs: [...j.outputs, ...newOutputs] }
          : j
      ));
    } else {
      const newJob: GenerationJob = {
        id: `job-${Date.now()}`,
        sourceCreative: selectedCreative,
        outputs: newOutputs,
        startedAt: Date.now(),
      };
      targetJobId = newJob.id;
      setJobs(prev => [...prev, newJob]);
      setActiveJobId(newJob.id);
    }

    setStage('results');
    setAddingToJob(false);
    setSelectedCreative(null);
    setSelectedChannels([]);
    setSelectedDimensions(new Set());
    setGenFilterChannel('all');
    setGenSort('default');

    newOutputs.forEach((output, i) => {
      setTimeout(() => {
        simulateOutputCompletion(targetJobId, output.id, output.dimension.id, output.dimension.width, output.dimension.height);
      }, i * 900);
    });
  }, [selectedCreative, selectedChannels, selectedDimensions, addingToJob, activeJobId, jobs]);

  const handleRetry = useCallback((outputId: string) => {
    if (!activeJobId) return;
    const currentJob = jobs.find(j => j.id === activeJobId);
    if (!currentJob) return;
    const output = currentJob.outputs.find(o => o.id === outputId);
    if (!output) return;
    setJobs(prev => prev.map(j =>
      j.id === activeJobId
        ? { ...j, outputs: j.outputs.map(o => o.id === outputId ? { ...o, status: 'pending' as const, imageUrl: undefined } : o) }
        : j
    ));
    simulateOutputCompletion(activeJobId, outputId, output.dimension.id, output.dimension.width, output.dimension.height, `retry-${outputId}-${Date.now()}`);
  }, [activeJobId, jobs]);

  const handleReiterate = useCallback((outputId: string, _prompt: string) => {
    if (!activeJobId) return;
    const currentJob = jobs.find(j => j.id === activeJobId);
    if (!currentJob) return;
    const output = currentJob.outputs.find(o => o.id === outputId);
    if (!output) return;
    setJobs(prev => prev.map(j =>
      j.id === activeJobId
        ? { ...j, outputs: j.outputs.map(o => o.id === outputId ? { ...o, status: 'pending' as const, imageUrl: undefined } : o) }
        : j
    ));
    simulateOutputCompletion(activeJobId, outputId, output.dimension.id, output.dimension.width, output.dimension.height, `recrop-${outputId}-${Date.now()}`);
  }, [activeJobId, jobs]);

  const handleToggleOutputSelection = useCallback((outputId: string) => {
    setSelectedOutputIds(prev => {
      const next = new Set(prev);
      if (next.has(outputId)) next.delete(outputId); else next.add(outputId);
      return next;
    });
  }, []);

  function handleDownloadSelected(format: DownloadFormat) {
    if (!activeJob) return;
    activeJob.outputs
      .filter(o => selectedOutputIds.has(o.id) && o.imageUrl)
      .forEach((o, i) => {
        setTimeout(() => {
          const filename = `${o.dimension.label.replace(':', 'x')}-${o.dimension.width}x${o.dimension.height}`;
          downloadImage(o.imageUrl!, filename, format);
        }, i * 150);
      });
  }

  const completedOutputs = activeJob?.outputs.filter(o => o.status === 'complete') ?? [];
  const allComplete = activeJob !== null && activeJob.outputs.every(o => o.status === 'complete');

  function handleDownloadAll(format: DownloadFormat) {
    completedOutputs.forEach((output, i) => {
      if (!output.imageUrl) return;
      setTimeout(() => {
        const filename = `${output.dimension.label.replace(':', 'x')}-${output.dimension.width}x${output.dimension.height}`;
        downloadImage(output.imageUrl!, filename, format);
      }, i * 150);
    });
  }

  const activeStep = stage === 'results' && allComplete ? 'download' : stage;

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
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[20px] font-semibold text-gray-900">Resize Image</h1>
            <p className="mt-0.5 text-[13px] text-gray-500">
              Pick a creative, choose your target channels, and generate resized outputs.
            </p>
          </div>
        </div>
      </div>

      {/* Step indicator */}
      <div className="mb-6 flex items-center gap-0">
        {STEPS.map((step, i) => {
          const isDone = (step.id === 'browse' && stage === 'results') ||
                         (step.id === 'results' && allComplete);
          const isActive = step.id === activeStep;
          const isLast = i === STEPS.length - 1;
          return (
            <div key={step.id} className="flex items-center">
              <div className="flex items-center gap-1.5">
                <div className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold transition-colors',
                  isDone ? 'bg-green-500 text-white' : isActive ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-400'
                )}>
                  {isDone ? '✓' : i + 1}
                </div>
                <span className={cn(
                  'text-[12px] font-medium transition-colors',
                  isDone ? 'text-green-600' : isActive ? 'text-blue-600' : 'text-gray-400'
                )}>
                  {step.label}
                </span>
              </div>
              {!isLast && (
                <div className={cn(
                  'mx-3 h-px w-10 transition-colors',
                  isDone ? 'bg-green-300' : 'bg-gray-200'
                )} />
              )}
            </div>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex items-start gap-0">

        {/* ── BROWSE STAGE ── */}
        {stage === 'browse' && (
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
                {/* Add-to-batch banner */}
                {addingToJob && activeJob && (
                  <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5">
                    <p className="text-[13px] font-medium text-amber-800">
                      Adding to batch — {activeJob.outputs.length} size{activeJob.outputs.length !== 1 ? 's' : ''} already generated from{' '}
                      <span className="font-semibold">{activeJob.sourceCreative.name}</span>
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setAddingToJob(false);
                        setStage('results');
                        setSelectedCreative(null);
                        setSelectedChannels([]);
                        setSelectedDimensions(new Set());
                      }}
                      className="shrink-0 text-[12px] font-medium text-amber-700 hover:text-amber-900"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {/* Connected feed indicator */}
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
                    Change feed
                  </button>
                </div>

                <FilterSortBar
                  format={filterFormat}
                  fileType={filterFileType}
                  sort={sortBy}
                  onFormatChange={setFilterFormat}
                  onFileTypeChange={setFilterFileType}
                  onSortChange={setSortBy}
                  onClearFilters={() => { setFilterFormat('all'); setFilterFileType('all'); }}
                  totalCount={feedCreatives.length}
                  filteredCount={filteredCreatives.length}
                />

                {filteredCreatives.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <p className="text-[14px] font-medium text-gray-600">No creatives match your filters</p>
                    <p className="mt-1 text-[13px] text-gray-400">Try a different format or file type.</p>
                    <button
                      type="button"
                      onClick={() => { setFilterFormat('all'); setFilterFileType('all'); }}
                      className="mt-3 text-[13px] font-medium text-blue-600 hover:text-blue-700"
                    >
                      Clear filters
                    </button>
                  </div>
                ) : (
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
                )}
              </div>

              {selectedCreative && (
                <div className="sticky top-14 self-start h-[calc(100vh-3.5rem)]">
                  <ResizeConfigPanel
                    creative={selectedCreative}
                    selectedChannels={selectedChannels}
                    selectedDimensions={selectedDimensions}
                    onToggleChannel={handleToggleChannel}
                    onToggleDimension={handleToggleDimension}
                    onSetChannels={handleSetChannels}
                    onRun={handleRun}
                    addMode={addingToJob}
                    onClose={() => {
                      setSelectedCreative(null);
                      setSelectedChannels([]);
                      setSelectedDimensions(new Set());
                      if (addingToJob) { setAddingToJob(false); setStage('results'); }
                    }}
                  />
                </div>
              )}
            </>
          )
        )}

        {/* ── RESULTS STAGE ── */}
        {stage === 'results' && (
          <div className="flex-1">
            {jobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
                  <SparklesIcon className="h-7 w-7 text-blue-400" />
                </div>
                <p className="text-[15px] font-medium text-gray-700">No variants yet</p>
                <p className="mt-1 max-w-xs text-[13px] text-gray-400">
                  Go to Browse, select a creative, choose your channels, and click Generate.
                </p>
                <button
                  type="button"
                  onClick={() => setStage('browse')}
                  className="mt-4 text-[13px] font-medium text-blue-600 hover:text-blue-700"
                >
                  Browse creatives →
                </button>
              </div>
            ) : (
              <>
                {/* Job tabs — visible once there are multiple batches */}
                {jobs.length > 1 && (
                  <div className="mb-4 flex items-center gap-1.5 overflow-x-auto pb-1">
                    {jobs.map(j => {
                      const isActive = j.id === activeJobId;
                      const jDone = j.outputs.every(o => o.status === 'complete');
                      return (
                        <button
                          key={j.id}
                          type="button"
                          onClick={() => {
                            setActiveJobId(j.id);
                            setGenFilterChannel('all');
                            setGenSort('default');
                          }}
                          className={cn(
                            'flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-left transition-all',
                            isActive
                              ? 'border-blue-200 bg-blue-50'
                              : 'border-gray-200 bg-white hover:border-blue-200 hover:bg-gray-50'
                          )}
                        >
                          <img
                            src={j.sourceCreative.thumbnailUrl}
                            alt=""
                            className="h-5 w-5 shrink-0 rounded-full object-cover"
                          />
                          <span className={cn(
                            'max-w-[120px] truncate text-[12px] font-medium',
                            isActive ? 'text-blue-700' : 'text-gray-700'
                          )}>
                            {j.sourceCreative.name}
                          </span>
                          <span className={cn('text-[11px]', isActive ? 'text-blue-400' : 'text-gray-400')}>
                            {j.outputs.length}
                          </span>
                          {!jDone && (
                            <div className="h-2.5 w-2.5 shrink-0 animate-spin rounded-full border border-gray-300 border-t-blue-500" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {activeJob && (
                  <>
                    {/* Results header */}
                    <div className="mb-5 flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {allComplete ? (
                          <div className="mb-3 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5">
                            <CheckCircleIcon className="h-4 w-4 shrink-0 text-green-500" />
                            <p className="text-[13px] font-medium text-green-800">
                              {activeJob.outputs.length} variant{activeJob.outputs.length !== 1 ? 's' : ''} generated
                              {' '}from{' '}
                              <span className="font-semibold">{activeJob.sourceCreative.name}</span>
                            </p>
                          </div>
                        ) : (
                          <div className="mb-3 flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3.5 py-2.5">
                            <div className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
                            <p className="text-[13px] font-medium text-blue-800">
                              Generating {activeJob.outputs.length} sizes — {completedOutputs.length} of {activeJob.outputs.length} ready
                            </p>
                          </div>
                        )}

                        {/* Source creative pill */}
                        <button
                          type="button"
                          onClick={() => setSourcePreviewOpen(true)}
                          title="View source creative"
                          className="group flex items-center gap-2 rounded-full border border-gray-200 bg-white py-1 pl-1 pr-3 text-left shadow-sm transition-all hover:border-blue-300 hover:bg-blue-50 hover:shadow-md"
                        >
                          <img
                            src={activeJob.sourceCreative.thumbnailUrl}
                            alt={activeJob.sourceCreative.name}
                            className="h-6 w-6 rounded-full object-cover"
                          />
                          <span className="text-[11px] text-gray-500" title={activeJob.sourceCreative.name}>
                            Source: <span className="max-w-[180px] truncate font-semibold text-gray-800">{activeJob.sourceCreative.name}</span>
                          </span>
                          <PencilSquareIcon className="h-3.5 w-3.5 shrink-0 text-gray-300 group-hover:text-blue-500" />
                        </button>
                      </div>

                      {allComplete && (
                        <div className="flex shrink-0 items-center gap-3 pt-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              setAddingToJob(true);
                              setStage('browse');
                              setSelectedCreative(activeJob.sourceCreative);
                            }}
                            className="rounded-lg border border-gray-300 px-4 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50"
                          >
                            + Add more sizes
                          </button>
                          <DownloadDropdown count={activeJob.outputs.length} onDownload={handleDownloadAll} />
                        </div>
                      )}
                    </div>

                    {/* Filter bar */}
                    <GeneratedFilterBar
                      channel={genFilterChannel}
                      sort={genSort}
                      channelOptions={jobChannelOptions}
                      onChannelChange={setGenFilterChannel}
                      onSortChange={setGenSort}
                      onClearFilters={() => { setGenFilterChannel('all'); }}
                      totalCount={activeJob.outputs.length}
                      filteredCount={filteredOutputs.length}
                    />

                    {/* Selection action bar */}
                    {selectedOutputIds.size > 0 && (
                      <div className="mb-3 flex items-center gap-3 rounded-lg border border-blue-100 bg-blue-50 px-3.5 py-2.5">
                        <span className="text-[13px] font-medium text-blue-800">
                          {selectedOutputIds.size} selected
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedOutputIds(new Set())}
                          className="text-[12px] text-blue-500 hover:text-blue-700"
                        >
                          Clear
                        </button>
                        <div className="ml-auto flex items-center gap-1.5">
                          <span className="mr-1 text-[11px] text-blue-400">Download as:</span>
                          {(['png', 'jpg', 'webp'] as const).map(fmt => (
                            <button
                              key={fmt}
                              type="button"
                              onClick={() => handleDownloadSelected(fmt)}
                              className="flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700"
                            >
                              <ArrowDownTrayIcon className="h-3 w-3" />
                              {fmt.toUpperCase()}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Generated grid */}
                    {filteredOutputs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <p className="text-[14px] font-medium text-gray-600">No sizes match your filters</p>
                        <button
                          type="button"
                          onClick={() => { setGenFilterChannel('all'); }}
                          className="mt-3 text-[13px] font-medium text-blue-600 hover:text-blue-700"
                        >
                          Clear filters
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                        {filteredOutputs.map((output) => (
                          <GeneratedTile
                            key={output.id}
                            output={output}
                            onView={() => {
                              const completedFiltered = filteredOutputs.filter(o => o.status === 'complete');
                              setSingleView({ index: completedFiltered.findIndex(o => o.id === output.id) });
                            }}
                            onRetry={() => handleRetry(output.id)}
                            selected={selectedOutputIds.has(output.id)}
                            anySelected={selectedOutputIds.size > 0}
                            onToggleSelect={() => handleToggleOutputSelection(output.id)}
                          />
                        ))}
                      </div>
                    )}

                    {/* Bottom actions */}
                    {allComplete && (
                      <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
                        <div className="flex items-center gap-4">
                          <button
                            type="button"
                            onClick={() => {
                              setStage('browse');
                              setGenFilterChannel('all');
                              setGenSort('default');
                            }}
                            className="text-[13px] font-medium text-gray-500 hover:text-gray-700"
                          >
                            + Resize another creative
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              handleDisconnectFeed();
                              setStage('browse');
                            }}
                            className="text-[13px] text-gray-400 hover:text-gray-600"
                          >
                            Change feed
                          </button>
                        </div>
                        <DownloadDropdown count={activeJob.outputs.length} onDownload={handleDownloadAll} />
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Single image modal */}
      {singleView !== null && activeJob && (
        <SingleImageModal
          outputs={filteredOutputs.filter(o => o.status === 'complete')}
          initialIndex={singleView.index}
          sourceCreative={activeJob.sourceCreative}
          onClose={() => setSingleView(null)}
          onReiterate={handleReiterate}
        />
      )}

      {/* Source creative preview modal */}
      {sourcePreviewOpen && activeJob && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setSourcePreviewOpen(false)}
        >
          <div
            className="flex w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
              <div>
                <p className="text-[13px] font-semibold text-gray-900">Source Creative</p>
                <p className="mt-0.5 text-[11px] text-gray-400">
                  {activeJob.sourceCreative.name} · {activeJob.sourceCreative.width}×{activeJob.sourceCreative.height} · {activeJob.sourceCreative.fileType}
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

            <div className="flex items-center justify-center bg-gray-50 p-6">
              <img
                src={activeJob.sourceCreative.thumbnailUrl}
                alt={activeJob.sourceCreative.name}
                className="max-h-[55vh] w-auto rounded-lg object-contain shadow-sm"
              />
            </div>

            <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3">
              <p className="text-[11px] text-gray-400">
                Used to generate {activeJob.outputs.length} size{activeJob.outputs.length !== 1 ? 's' : ''}
              </p>
              <DownloadDropdown
                openUp
                onDownload={fmt => downloadImage(activeJob.sourceCreative.thumbnailUrl, activeJob.sourceCreative.name, fmt)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
