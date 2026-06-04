import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeftIcon, SparklesIcon, CircleStackIcon, ArrowUpTrayIcon, PencilSquareIcon, CheckCircleIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { Button } from '@agencypmg/alli-design-system';
import { cn } from '../../utils/cn';
import { newId } from '../../utils/ids';
import { getDeduplicatedDimensions } from './data/channels';
import type { Creative, GenerationJob, GeneratedOutput, Dimension } from './types';
import type { SelectedFeed } from '../template-builder/types';
import { downloadImage, type DownloadFormat } from './utils/downloadImage';
import { buildOutputFilename } from './utils/outputFilename';
import CreativeTile from './components/CreativeTile';
import ResizeConfigPanel from './components/ResizeConfigPanel';
import GeneratedTile from './components/GeneratedTile';
import SingleImageModal from './components/SingleImageModal';
import FilterSortBar, { type FormatFilter, type FileTypeFilter, type SortOption } from './components/FilterSortBar';
import GeneratedFilterBar, { type GenSortOption } from './components/GeneratedFilterBar';
import DownloadDropdown from './components/DownloadDropdown';
import FeedConnectScreen from './components/FeedConnectScreen';
import MasonryGrid from './components/MasonryGrid';
import SourcePreviewModal from './components/SourcePreviewModal';
import StepIndicator, { type StepId } from './components/StepIndicator';
import ConfirmBanner from './components/ConfirmBanner';
import { useOutpaintRunner } from './hooks/useOutpaintRunner';
import { useBatchOutputs } from './hooks/useBatchOutputs';

/** UI-side summary kept per started batch. The active job's live outputs come
 * from `useBatchOutputs`; non-active tabs reuse the last snapshot. */
interface JobSummary {
  id: string;                    // batchId
  sourceCreative: Creative;
  dimensions: Dimension[];       // requested dims at runtime (for retry/reiterate dim lookup)
  outputsSnapshot: GeneratedOutput[]; // last seen live outputs, persisted on tab switch
  startedAt: number;
}

/** One entry in the multi-photo config queue. Channels/dimensions are saved
 *  per-photo as the user navigates between them in ResizeConfigPanel. */
interface ConfigQueueEntry {
  creative: Creative;
  channels: string[];
  dimensions: Set<string>;
}


function newOutputId(dimId: string): string {
  return `${dimId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

type Stage = 'browse' | 'results';

function useNumCols(panelOpen: boolean): number {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const handler = () => setW(window.innerWidth);
    window.addEventListener('resize', handler, { passive: true });
    return () => window.removeEventListener('resize', handler);
  }, []);
  if (panelOpen) return w >= 1280 ? 3 : 2;
  if (w >= 1280) return 5;
  if (w >= 768) return 3;
  return 2;
}

function detectFormat(width: number, height: number): 'landscape' | 'square' | 'portrait' {
  const ratio = width / height;
  if (ratio > 1.2) return 'landscape';
  if (ratio < 0.85) return 'portrait';
  return 'square';
}

export default function AdResizingAppRoot() {
  const { clientSlug } = useParams<{ clientSlug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const runner = useOutpaintRunner(clientSlug ?? '');

  const [stage, setStage] = useState<Stage>('browse');
  const [navConfirmPending, setNavConfirmPending] = useState<StepId | null>(null);

  // Multi-select browse state
  const [browseSelectedIds, setBrowseSelectedIds] = useState<Set<string>>(new Set());
  // Active config queue (populated when user clicks "Configure & Resize")
  const [configQueue, setConfigQueue] = useState<ConfigQueueEntry[]>([]);
  const [configQueueIdx, setConfigQueueIdx] = useState(0);

  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [selectedDimensions, setSelectedDimensions] = useState<Set<string>>(new Set());

  // Multi-job state — each batch is a saved job; activeJobId tracks which is in view.
  // `outputsSnapshot` mirrors the last live state from useBatchOutputs so non-active
  // tabs keep showing their counts after the user navigates away.
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [addingToJob, setAddingToJob] = useState(false);

  const [singleView, setSingleView] = useState<{ index: number } | null>(null);
  const [sourcePreviewOpen, setSourcePreviewOpen] = useState(false);

  const [filterFormat, setFilterFormat] = useState<FormatFilter>('all');
  const [filterFileType, setFilterFileType] = useState<FileTypeFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('az');

  const [genFilterChannel, setGenFilterChannel] = useState<string>('all');
  const [genSort, setGenSort] = useState<GenSortOption>('default');
  const [selectedOutputIds, setSelectedOutputIds] = useState<Set<string>>(new Set());

  const [feedCreatives, setFeedCreatives] = useState<Creative[] | null>(null);
  const [connectedFeedLabel, setConnectedFeedLabel] = useState<string | null>(null);

  // Last callable error surfaced to the user as a dismissible banner. Cleared
  // on next successful action OR via the X button.
  const [runError, setRunError] = useState<string | null>(null);

  // Honor ?batchId=… on mount: switch to results stage when arriving via deep link.
  // The actual job summary will hydrate once the user visits the corresponding tab;
  // for a cold deep-link with no jobs[] entry yet we still surface the live outputs.
  const deepLinkBatchId = searchParams.get('batchId');
  useEffect(() => {
    if (deepLinkBatchId && !activeJobId) {
      setActiveJobId(deepLinkBatchId);
      setStage('results');
    }
  }, [deepLinkBatchId, activeJobId]);

  // Live subscription to the active batch's outputs (Firestore onSnapshot).
  const liveBatch = useBatchOutputs(clientSlug ?? null, activeJobId);

  // Persist the live outputs into the matching jobs[] entry so tab strips keep
  // accurate counts after switching away. We do NOT clobber the snapshot while
  // liveBatch.outputs is empty — the initial subscription render races ahead of
  // the callable's per-output Firestore seed, and the local pending shells set
  // in `handleRun` are the only source of truth during that window.
  useEffect(() => {
    if (!activeJobId) return;
    if (liveBatch.outputs.length === 0) return;
    setJobs((prev) =>
      prev.map((j) =>
        j.id === activeJobId ? { ...j, outputsSnapshot: liveBatch.outputs } : j,
      ),
    );
  }, [activeJobId, liveBatch.outputs]);

  // Compose the active job view-model. Falls back to a synthetic summary when
  // arriving via deep link before jobs[] has been seeded.
  const activeJob: GenerationJob | null = useMemo(() => {
    if (!activeJobId) return null;
    const stored = jobs.find((j) => j.id === activeJobId);
    if (stored) {
      return {
        id: stored.id,
        sourceCreative: stored.sourceCreative,
        outputs: liveBatch.outputs.length > 0 ? liveBatch.outputs : stored.outputsSnapshot,
        startedAt: stored.startedAt,
      };
    }
    // Deep-linked batch — synthesise a job shell from the live BatchRecord.
    if (liveBatch.batch?.sourceCreative) {
      const sc = liveBatch.batch.sourceCreative;
      return {
        id: activeJobId,
        sourceCreative: {
          id: sc.creativeId,
          name: liveBatch.batch.feedName ?? sc.creativeId,
          thumbnailUrl: sc.originalUrl,
          originalUrl: sc.originalUrl,
          width: sc.width,
          height: sc.height,
          fileType: 'JPG',
          uploadedAt: '',
          source: liveBatch.batch.feedId ?? '',
          tags: [],
        },
        outputs: liveBatch.outputs,
        startedAt: 0,
      };
    }
    return null;
  }, [activeJobId, jobs, liveBatch.outputs, liveBatch.batch]);

  // Clear tile selection whenever the active job changes
  useEffect(() => { setSelectedOutputIds(new Set()); }, [activeJobId]);

  // Defense-in-depth: if clientSlug ever changes while AppRoot stays mounted
  // (e.g. a future refactor reintroduces an in-place slug swap), wipe every
  // piece of per-client state so we never show client A's creatives while
  // writes land under client B (issue #30). In production today, AppLayout's
  // handleSelectClient navigates to /adlabs/{slug}/ which unmounts AppRoot,
  // so this guard is belt-and-suspenders.
  const prevSlugRef = useRef(clientSlug);
  useEffect(() => {
    if (prevSlugRef.current && prevSlugRef.current !== clientSlug) {
      setStage('browse');
      setBrowseSelectedIds(new Set());
      setConfigQueue([]);
      setConfigQueueIdx(0);
      setSelectedChannels([]);
      setSelectedDimensions(new Set());
      setJobs([]);
      setActiveJobId(null);
      setAddingToJob(false);
      setSingleView(null);
      setSourcePreviewOpen(false);
      setSelectedOutputIds(new Set());
      setFeedCreatives(null);
      setConnectedFeedLabel(null);
      setRunError(null);
      const next = new URLSearchParams(searchParams);
      if (next.has('batchId')) {
        next.delete('batchId');
        setSearchParams(next, { replace: true });
      }
    }
    prevSlugRef.current = clientSlug;
  }, [clientSlug, searchParams, setSearchParams]);

  // Mirror activeJobId into ?batchId= so deep links work + browser-back is sane.
  useEffect(() => {
    const current = searchParams.get('batchId');
    if (activeJobId && current !== activeJobId) {
      const next = new URLSearchParams(searchParams);
      next.set('batchId', activeJobId);
      setSearchParams(next, { replace: true });
    } else if (!activeJobId && current) {
      const next = new URLSearchParams(searchParams);
      next.delete('batchId');
      setSearchParams(next, { replace: true });
    }
  }, [activeJobId, searchParams, setSearchParams]);

  function handleFeedConnect(feed: SelectedFeed, _imageColumn: string, creatives: Creative[]) {
    setFeedCreatives(creatives);
    setConnectedFeedLabel(feed.name);
    setBrowseSelectedIds(new Set());
    setConfigQueue([]);
    setConfigQueueIdx(0);
    setSelectedChannels([]);
    setSelectedDimensions(new Set());
  }

  function handleUploadConnect(creatives: Creative[]) {
    setFeedCreatives(creatives);
    setConnectedFeedLabel('Uploaded Files');
    setBrowseSelectedIds(new Set());
    setConfigQueue([]);
    setConfigQueueIdx(0);
    setSelectedChannels([]);
    setSelectedDimensions(new Set());
  }

  // Batch dimension patches so hundreds of concurrent image-load events produce
  // one state update per 100 ms instead of one per image (avoids useMemo storm).
  const pendingDimsRef = useRef<Map<string, { width: number; height: number }>>(new Map());
  const dimFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (dimFlushTimerRef.current) clearTimeout(dimFlushTimerRef.current);
  }, []);

  const handleDimensionsResolved = useCallback(
    (creativeId: string, width: number, height: number) => {
      pendingDimsRef.current.set(creativeId, { width, height });
      if (dimFlushTimerRef.current) clearTimeout(dimFlushTimerRef.current);
      dimFlushTimerRef.current = setTimeout(() => {
        const batch = new Map(pendingDimsRef.current);
        pendingDimsRef.current.clear();
        dimFlushTimerRef.current = null;
        setFeedCreatives((prev) =>
          prev?.map((c) => { const d = batch.get(c.id); return d ? { ...c, ...d } : c; }) ?? prev,
        );
        // Patch dimension updates into any config queue entries that reference the updated creative
        setConfigQueue((prev) =>
          prev.map((e) => { const d = batch.get(e.creative.id); return d ? { ...e, creative: { ...e.creative, ...d } } : e; }),
        );
      }, 100);
    },
    [],
  );

  function handleDisconnectFeed() {
    setFeedCreatives(null);
    setConnectedFeedLabel(null);
    setBrowseSelectedIds(new Set());
    setConfigQueue([]);
    setConfigQueueIdx(0);
    setSelectedChannels([]);
    setSelectedDimensions(new Set());
    setAddingToJob(false);
    // Jobs are intentionally preserved — existing generated outputs survive a feed change
  }

  function handleStepClick(step: StepId) {
    if (step !== 'browse') return;
    const isGenerating = stage === 'results' && activeJob !== null && !allComplete;
    if (isGenerating) {
      setNavConfirmPending('browse');
      return;
    }
    setStage('browse');
    setAddingToJob(false);
    // activeJobId preserved: if user re-selects the same creative it merges into the existing job
  }

  function handleConfirmBack() {
    setStage('browse');
    setAddingToJob(false);
    setNavConfirmPending(null);
    // activeJobId preserved intentionally — see handleStepClick
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
    list.sort((a, b) => sortBy === 'az'
      ? a.name.localeCompare(b.name)
      : b.name.localeCompare(a.name)
    );
    return list;
  }, [feedCreatives, filterFormat, filterFileType, sortBy]);

  const handleToggleBrowseSelect = useCallback((creative: Creative) => {
    setBrowseSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(creative.id)) next.delete(creative.id);
      else next.add(creative.id);
      return next;
    });
  }, []);

  function handleStartConfigQueue() {
    const ordered = filteredCreatives.filter(c => browseSelectedIds.has(c.id));
    if (ordered.length === 0) return;
    const queue: ConfigQueueEntry[] = ordered.map(creative => ({ creative, channels: [], dimensions: new Set() }));
    setConfigQueue(queue);
    setConfigQueueIdx(0);
    setSelectedChannels([]);
    setSelectedDimensions(new Set());
  }

  function handleConfigNavigate(newIdx: number) {
    const snapshot = configQueue.map((e, i) =>
      i === configQueueIdx
        ? { ...e, channels: [...selectedChannels], dimensions: new Set(selectedDimensions) }
        : e,
    );
    setConfigQueue(snapshot);
    setConfigQueueIdx(newIdx);
    setSelectedChannels(snapshot[newIdx].channels);
    setSelectedDimensions(snapshot[newIdx].dimensions);
  }

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

  async function handleRunQueue() {
    if (!clientSlug || configQueue.length === 0) return;

    // Merge the live channel/dimension state into the current queue entry
    const finalQueue = configQueue.map((e, i) =>
      i === configQueueIdx
        ? { ...e, channels: [...selectedChannels], dimensions: new Set(selectedDimensions) }
        : e,
    );

    if (addingToJob && activeJobId && finalQueue.length === 1) {
      // Append more sizes to the existing batch
      const entry = finalQueue[0];
      const dims = getDeduplicatedDimensions(entry.channels).filter(d => entry.dimensions.has(d.id));
      if (dims.length === 0) return;
      const outputIds = dims.map(d => newOutputId(d.id));
      const pendingOutputs: GeneratedOutput[] = dims.map((dim, i) => ({
        id: outputIds[i], outputId: outputIds[i], dimension: dim, status: 'pending',
      }));
      setJobs(prev => prev.map(j =>
        j.id === activeJobId
          ? { ...j, dimensions: [...j.dimensions, ...dims], outputsSnapshot: [...j.outputsSnapshot, ...pendingOutputs] }
          : j,
      ));
      setStage('results');
      setConfigQueue([]); setConfigQueueIdx(0);
      setSelectedChannels([]); setSelectedDimensions(new Set());
      setAddingToJob(false); setGenFilterChannel('all'); setGenSort('default');
      try {
        await runner.runBatch({ batchId: activeJobId, creative: entry.creative, feedName: connectedFeedLabel ?? undefined, dimensions: dims, outputIds });
      } catch (err) {
        console.error('runOutpaintBatch failed', err);
        setRunError(err instanceof Error ? err.message : String(err));
      }
      return;
    }

    // Build a new batch per configured photo, fire concurrently
    const batchRuns = finalQueue
      .map(entry => {
        const dims = getDeduplicatedDimensions(entry.channels).filter(d => entry.dimensions.has(d.id));
        if (dims.length === 0) return null;
        const batchId = newId();
        const outputIds = dims.map(d => newOutputId(d.id));
        const pendingOutputs: GeneratedOutput[] = dims.map((dim, i) => ({
          id: outputIds[i], outputId: outputIds[i], dimension: dim, status: 'pending',
        }));
        const job: JobSummary = { id: batchId, sourceCreative: entry.creative, dimensions: dims, outputsSnapshot: pendingOutputs, startedAt: Date.now() };
        return { batchId, dims, outputIds, entry, job };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (batchRuns.length === 0) return;

    setJobs(prev => [...prev, ...batchRuns.map(r => r.job)]);
    setActiveJobId(batchRuns[batchRuns.length - 1].batchId);
    setStage('results');
    setConfigQueue([]); setConfigQueueIdx(0);
    setBrowseSelectedIds(new Set());
    setSelectedChannels([]); setSelectedDimensions(new Set());
    setGenFilterChannel('all'); setGenSort('default');

    await Promise.allSettled(
      batchRuns.map(({ batchId, dims, outputIds, entry }) =>
        runner.runBatch({ batchId, creative: entry.creative, feedName: connectedFeedLabel ?? undefined, dimensions: dims, outputIds })
          .catch(err => { console.error('runOutpaintBatch failed for', entry.creative.name, err); setRunError(err instanceof Error ? err.message : String(err)); }),
      ),
    );
  }

  const handleRetry = useCallback(async (outputId: string) => {
    if (!activeJobId || !activeJob) return;
    const target = activeJob.outputs.find(o => o.id === outputId);
    if (!target) return;
    try {
      await runner.retryOutput({
        batchId: activeJobId,
        creative: activeJob.sourceCreative,
        outputId,
        dimension: target.dimension,
      });
    } catch (err) {
      console.error('retryOutput failed', err);
      setRunError(err instanceof Error ? err.message : String(err));
    }
  }, [activeJobId, activeJob, runner]);

  const handleReiterate = useCallback(async (outputId: string, prompt: string) => {
    if (!activeJobId || !activeJob) return;
    const target = activeJob.outputs.find(o => o.id === outputId);
    if (!target) return;
    try {
      await runner.reiterateOutput({
        batchId: activeJobId,
        creative: activeJob.sourceCreative,
        outputId,
        dimension: target.dimension,
        retryPrompt: prompt,
      });
    } catch (err) {
      console.error('reiterateOutput failed', err);
      setRunError(err instanceof Error ? err.message : String(err));
    }
  }, [activeJobId, activeJob, runner]);

  const handleToggleOutputSelection = useCallback((outputId: string) => {
    setSelectedOutputIds(prev => {
      const next = new Set(prev);
      if (next.has(outputId)) next.delete(outputId); else next.add(outputId);
      return next;
    });
  }, []);

  const completedOutputs = activeJob?.outputs.filter(o => o.status === 'complete') ?? [];
  const allComplete = activeJob !== null && activeJob.outputs.length > 0 && activeJob.outputs.every(o => o.status === 'complete');

  function downloadFilename(output: GeneratedOutput): string {
    return buildOutputFilename(
      activeJob?.sourceCreative.name ?? 'output',
      'ad-resizing',
      output.dimension.width,
      output.dimension.height,
    );
  }

  async function downloadOutput(output: GeneratedOutput, format: DownloadFormat): Promise<void> {
    if (!output.storageRef) return;
    try {
      const { getDownloadURL, ref } = await import('firebase/storage');
      const { storage } = await import('../../firebase');
      const url = await getDownloadURL(ref(storage, output.storageRef));
      await downloadImage(url, downloadFilename(output), format);
    } catch (err) {
      console.error('downloadOutput failed', err);
      // eslint-disable-next-line no-alert
      alert(`Failed to download ${output.dimension.label}: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  async function handleDownloadSelected(format: DownloadFormat) {
    if (!activeJob) return;
    const targets = activeJob.outputs.filter(o => selectedOutputIds.has(o.id) && o.storageRef);
    // Slight stagger keeps the browser happy; await ensures errors surface.
    for (const o of targets) {
      await downloadOutput(o, format);
      await new Promise(r => setTimeout(r, 150));
    }
  }

  async function handleDownloadAll(format: DownloadFormat) {
    for (const output of completedOutputs) {
      await downloadOutput(output, format);
      await new Promise(r => setTimeout(r, 150));
    }
  }

  const numCols = useNumCols(configQueue.length > 0);

  const queueReadyCount = configQueue.reduce((count, e, i) => {
    const dims = i === configQueueIdx ? selectedDimensions : e.dimensions;
    return count + (dims.size > 0 ? 1 : 0);
  }, 0);
  const activeStep = stage === 'results' && allComplete ? 'download' : stage;

  return (
    <div className="rounded-2xl bg-white px-6 py-6 shadow-sm ring-1 ring-gray-900/5 min-h-[calc(100vh-132px)]">
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

      <div className="mb-5 flex items-center justify-between">
        <StepIndicator
          activeStep={activeStep}
          resultsDone={stage === 'results' && allComplete}
          browseDone={stage === 'results'}
          onStepClick={handleStepClick}
        />
        {stage === 'results' && !navConfirmPending && (
          <Button
            variant="text"
            icon={<ArrowLeftIcon className="alli-h-3.5 alli-w-3.5" />}
            onClick={() => handleStepClick('browse')}
          >
            Back to Browse
          </Button>
        )}
      </div>
      {navConfirmPending && (
        <ConfirmBanner
          message="Going back will cancel this generation."
          confirmLabel="Go back"
          cancelLabel="Stay"
          onConfirm={handleConfirmBack}
          onCancel={() => setNavConfirmPending(null)}
        />
      )}

      {/* Callable error banner — surfaces auth/IAM/server failures the live
          subscription can't show because the batch never got seeded. */}
      {runError && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-red-800">Generation request failed</p>
            <p className="mt-0.5 break-words text-[12px] text-red-700">{runError}</p>
          </div>
          <button
            type="button"
            onClick={() => setRunError(null)}
            className="shrink-0 text-[12px] font-medium text-red-700 hover:text-red-900"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex items-start gap-0">

        {/* ── BROWSE STAGE ── */}
        {stage === 'browse' && (
          feedCreatives === null ? (
            <div className="flex-1">
              <FeedConnectScreen
                clientSlug={clientSlug ?? ''}
                onConnect={handleFeedConnect}
                onUploadConnect={handleUploadConnect}
              />
            </div>
          ) : (
            <>
              <div className={cn('flex-1 min-w-0 transition-all duration-200', configQueue.length > 0 ? 'pr-5' : '')}>
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
                        setConfigQueue([]);
                        setConfigQueueIdx(0);
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
                    {connectedFeedLabel === 'Uploaded Files'
                      ? <ArrowUpTrayIcon className="h-3.5 w-3.5" />
                      : <CircleStackIcon className="h-3.5 w-3.5" />
                    }
                    <span>{connectedFeedLabel}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleDisconnectFeed}
                    className="flex items-center gap-1 text-[12px] font-medium text-[#4B5675] hover:text-[#1A1F2E]"
                  >
                    <ArrowLeftIcon className="h-3 w-3" />
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
                  <MasonryGrid
                    items={filteredCreatives}
                    numCols={numCols}
                    renderItem={(creative) => (
                      <CreativeTile
                        key={creative.id}
                        creative={creative}
                        selected={browseSelectedIds.has(creative.id)}
                        onSelect={handleToggleBrowseSelect}
                        onDimensionsResolved={handleDimensionsResolved}
                      />
                    )}
                  />
                )}

                {/* Sticky footer: "Configure & Resize (N)" — breaks out of card padding to feel like a docked action bar */}
                {browseSelectedIds.size > 0 && configQueue.length === 0 && (
                  <div className="sticky bottom-0 -mx-6 xl:-mx-10 flex items-center justify-between bg-white px-6 xl:px-10 py-4 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
                    <span className="text-[13px] text-gray-500">
                      {browseSelectedIds.size} photo{browseSelectedIds.size !== 1 ? 's' : ''} selected
                    </span>
                    <button
                      type="button"
                      onClick={handleStartConfigQueue}
                      className="rounded-lg bg-blue-600 px-5 py-2.5 text-[13px] font-medium text-white shadow-sm hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                    >
                      Configure & Resize ({browseSelectedIds.size})
                    </button>
                  </div>
                )}
              </div>

              {configQueue.length > 0 && (() => {
                const currentCreative = configQueue[configQueueIdx].creative;
                const isMulti = configQueue.length > 1 && !addingToJob;
                return (
                  <div className="sticky top-14 self-start h-[calc(100vh-3.5rem)]">
                    <ResizeConfigPanel
                      creative={currentCreative}
                      selectedChannels={selectedChannels}
                      selectedDimensions={selectedDimensions}
                      onToggleChannel={handleToggleChannel}
                      onToggleDimension={handleToggleDimension}
                      onSetChannels={handleSetChannels}
                      onRun={handleRunQueue}
                      addMode={addingToJob}
                      queuePosition={isMulti ? { current: configQueueIdx + 1, total: configQueue.length } : undefined}
                      queueReadyCount={isMulti ? queueReadyCount : undefined}
                      onPrev={isMulti ? () => handleConfigNavigate(configQueueIdx - 1) : undefined}
                      onNext={isMulti ? () => handleConfigNavigate(configQueueIdx + 1) : undefined}
                      onClose={() => {
                        setConfigQueue([]);
                        setConfigQueueIdx(0);
                        if (!addingToJob) setBrowseSelectedIds(new Set());
                        setSelectedChannels([]);
                        setSelectedDimensions(new Set());
                        if (addingToJob) { setAddingToJob(false); setStage('results'); }
                      }}
                    />
                  </div>
                );
              })()}
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
                      const snap = j.outputsSnapshot;
                      const jDone = snap.length > 0 && snap.every(o => o.status === 'complete');
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
                            {snap.length}
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
                              setConfigQueue([{ creative: activeJob.sourceCreative, channels: [], dimensions: new Set() }]);
                              setConfigQueueIdx(0);
                              setSelectedChannels([]);
                              setSelectedDimensions(new Set());
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
                            creativeName={activeJob?.sourceCreative.name}
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
                            className="flex items-center gap-1 text-[13px] font-medium text-[#4B5675] hover:text-[#1A1F2E]"
                          >
                            <ArrowLeftIcon className="h-3.5 w-3.5" />
                            Change source
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
        <SourcePreviewModal
          creative={activeJob.sourceCreative}
          outputCount={activeJob.outputs.length}
          onClose={() => setSourcePreviewOpen(false)}
        />
      )}
    </div>
  );
}
