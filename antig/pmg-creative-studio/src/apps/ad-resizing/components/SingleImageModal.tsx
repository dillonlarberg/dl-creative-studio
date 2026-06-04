import { useState, useEffect } from 'react';
import { XMarkIcon, ChevronLeftIcon, ChevronRightIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { cn } from '../../../utils/cn';
import type { GeneratedOutput, MockCreative } from '../types';
import { downloadImage } from '../utils/downloadImage';
import { buildOutputFilename } from '../utils/outputFilename';
import { useStorageUrl } from '../hooks/useStorageUrl';
import DownloadDropdown from './DownloadDropdown';

// TODO: Replace with AI-generated suggestions (Claude API call with image + target dimensions)
const STATIC_SUGGESTIONS = [
  {
    title: 'Show more product, less background',
    description: 'Pull back slightly to give the subject more breathing room within the frame.',
  },
  {
    title: 'Tighter crop — center the main subject',
    description: 'Zoom in and center the focal point for a more impactful composition.',
  },
  {
    title: 'Shift the focal point slightly left',
    description: 'Apply the rule of thirds — move the subject off-center for visual balance.',
  },
];

const LOADING_COPY = [
  'Reframing your shot…',
  'Finding the perfect crop…',
  'Adjusting the composition…',
];

interface SingleImageModalProps {
  outputs: GeneratedOutput[];
  initialIndex: number;
  sourceCreative?: MockCreative;
  onClose: () => void;
  onReiterate?: (outputId: string, prompt: string) => void;
}

export default function SingleImageModal({ outputs, initialIndex, sourceCreative, onClose, onReiterate }: SingleImageModalProps) {
  const [index, setIndex] = useState(initialIndex);
  const [askAlliOpen, setAskAlliOpen] = useState(false);
  const [recropText, setRecropText] = useState('');
  const [recropSent, setRecropSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadingCopy] = useState(() => LOADING_COPY[Math.floor(Math.random() * LOADING_COPY.length)]!);

  const output = outputs[index];
  const resolvedUrl = useStorageUrl(output?.storageRef, output?.completedAtMs);
  const displayUrl = output?.imageUrl ?? resolvedUrl ?? undefined;
  const canPrev = index > 0;
  const canNext = index < outputs.length - 1;

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (askAlliOpen) { setAskAlliOpen(false); return; }
        onClose();
        return;
      }
      if (e.key === 'ArrowLeft' && canPrev) setIndex(i => i - 1);
      if (e.key === 'ArrowRight' && canNext) setIndex(i => i + 1);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [canPrev, canNext, onClose, askAlliOpen]);

  // Reset panel when navigating to a new output
  useEffect(() => {
    setRecropSent(false);
    setAskAlliOpen(false);
    setSubmitting(false);
  }, [index]);

  if (!output) return null;

  const filename = buildOutputFilename(
    sourceCreative?.name ?? 'output',
    'ad-resizing',
    output.dimension.width,
    output.dimension.height,
  );
  const outRatio = output.dimension.width / output.dimension.height;
  const modalWidth = outRatio < 0.75 ? 'max-w-3xl' : outRatio < 1.5 ? 'max-w-4xl' : 'max-w-5xl';

  function openAskAlli() {
    setRecropText('');
    setAskAlliOpen(true);
  }

  function submitRecrop(promptText: string) {
    const trimmed = promptText.trim();
    if (!trimmed || !onReiterate) return;
    setSubmitting(true);
    onReiterate(output.id, trimmed);
    setRecropText('');
    // Show loading briefly then resolve to sent state
    setTimeout(() => {
      setSubmitting(false);
      setAskAlliOpen(false);
      setRecropSent(true);
      setTimeout(() => setRecropSent(false), 5000);
    }, 1200);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1F2E]/75 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={cn('relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl bg-white shadow-2xl', modalWidth)}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <p className="text-[14px] font-semibold text-gray-900">{output.dimension.label}</p>
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-gray-400">{index + 1} of {outputs.length}</span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close (Esc)"
              className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Image area */}
        <div className="relative flex flex-1 overflow-hidden bg-gray-50">
          {canPrev && (
            <button
              type="button"
              onClick={() => setIndex(i => i - 1)}
              aria-label="Previous (←)"
              className="absolute left-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-md hover:bg-gray-50"
            >
              <ChevronLeftIcon className="h-5 w-5 text-gray-600" />
            </button>
          )}
          {canNext && (
            <button
              type="button"
              onClick={() => setIndex(i => i + 1)}
              aria-label="Next (→)"
              className="absolute right-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-md hover:bg-gray-50"
            >
              <ChevronRightIcon className="h-5 w-5 text-gray-600" />
            </button>
          )}

          {sourceCreative ? (
            <>
              {/* Source panel */}
              <div className="flex flex-1 flex-col">
                <div className="border-b border-gray-100 bg-white px-4 py-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Source</span>
                  <span className="ml-2 text-[10px] text-gray-400">{sourceCreative.width}×{sourceCreative.height} · {sourceCreative.fileType}</span>
                </div>
                <div className="flex flex-1 items-center justify-center p-5">
                  <img
                    src={sourceCreative.thumbnailUrl}
                    alt="Source creative"
                    style={{ aspectRatio: `${sourceCreative.width} / ${sourceCreative.height}` }}
                    className="max-h-[52vh] w-auto rounded object-contain shadow-sm"
                    title={sourceCreative.name}
                  />
                </div>
              </div>

              <div className="w-px bg-gray-200" />

              {/* Output panel — hover overlay triggers Ask Alli */}
              <div className="group relative flex flex-1 flex-col">
                <div className="border-b border-gray-100 bg-white px-4 py-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-600">Output</span>
                  <span className="ml-2 text-[10px] text-gray-400">{output.dimension.width}×{output.dimension.height} · {output.dimension.channelLabel}</span>
                </div>
                <div className="relative flex flex-1 items-center justify-center p-5">
                  {displayUrl && (
                    <img
                      src={displayUrl}
                      alt={output.dimension.label}
                      style={{ aspectRatio: `${output.dimension.width} / ${output.dimension.height}` }}
                      className="max-h-[52vh] w-auto rounded object-contain shadow-sm"
                      fetchPriority="high"
                    />
                  )}
                  {/* Hover overlay — Ask Alli to Recrop */}
                  {!askAlliOpen && onReiterate && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={openAskAlli}
                        className="flex items-center gap-1.5 rounded-full border border-indigo-300 bg-indigo-600 px-4 py-2 text-[13px] font-medium text-white shadow-lg transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                      >
                        <SparklesIcon className="h-4 w-4" />
                        Ask Alli to Recrop
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            /* Single view (no source) — hover overlay on the whole area */
            <div className="group relative flex flex-1 items-center justify-center p-6">
              {displayUrl && (
                <img
                  src={displayUrl}
                  alt={output.dimension.label}
                  className="max-h-[60vh] w-auto rounded object-contain shadow-sm"
                  fetchPriority="high"
                />
              )}
              {!askAlliOpen && onReiterate && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={openAskAlli}
                    className="flex items-center gap-1.5 rounded-full border border-indigo-300 bg-indigo-600 px-4 py-2 text-[13px] font-medium text-white shadow-lg transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  >
                    <SparklesIcon className="h-4 w-4" />
                    Ask Alli to Recrop
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Re-crop sent confirmation */}
        {recropSent && (
          <div className="border-t border-green-100 bg-green-50 px-5 py-2.5">
            <p className="text-[12px] font-medium text-green-700">Re-crop request sent — a new version is being generated.</p>
          </div>
        )}

        {/* Ask Alli recrop panel */}
        {askAlliOpen && (
          <div className="border-t border-indigo-100 bg-white">
            {submitting ? (
              /* Loading state */
              <div className="flex flex-col items-center justify-center px-5 py-8 gap-3">
                <div className="flex items-center gap-1.5">
                  <SparklesIcon className="h-5 w-5 animate-pulse text-indigo-500" />
                  <SparklesIcon className="h-4 w-4 animate-pulse text-indigo-400 [animation-delay:150ms]" />
                  <SparklesIcon className="h-3 w-3 animate-pulse text-indigo-300 [animation-delay:300ms]" />
                </div>
                <p className="text-[13px] font-medium text-gray-700">{loadingCopy}</p>
              </div>
            ) : (
              <>
                {/* Panel header */}
                <div className="flex items-center justify-between px-5 pt-4 pb-2">
                  <div className="flex items-center gap-1.5">
                    <SparklesIcon className="h-4 w-4 text-indigo-600" />
                    <span className="text-[13px] font-semibold text-indigo-600">Ask Alli</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAskAlliOpen(false)}
                    aria-label="Close Ask Alli"
                    className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  >
                    <XMarkIcon className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Thumbnail + title */}
                <div className="flex items-start gap-3 px-5 pb-3">
                  {displayUrl && (
                    <img
                      src={displayUrl}
                      alt="Current output"
                      className="h-14 w-14 shrink-0 rounded border border-gray-200 object-cover shadow-sm"
                    />
                  )}
                  <div>
                    <p className="text-[13px] font-medium text-gray-900">Enter a prompt to recrop the image above.</p>
                    <p className="mt-0.5 text-[11px] text-gray-500">Pick a suggestion or describe the adjustment you want.</p>
                  </div>
                </div>

                {/* Suggestion cards */}
                <div className="flex flex-col gap-1.5 px-5 pb-3">
                  {STATIC_SUGGESTIONS.map((s) => (
                    <button
                      key={s.title}
                      type="button"
                      onClick={() => submitRecrop(s.title)}
                      className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-left transition-colors hover:border-indigo-400 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    >
                      <p className="text-[12px] font-semibold text-gray-800">{s.title}</p>
                      <p className="mt-0.5 text-[11px] text-gray-500 leading-relaxed">{s.description}</p>
                    </button>
                  ))}
                </div>

                {/* Custom prompt input */}
                <div className="px-5 pb-3">
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      type="text"
                      value={recropText}
                      onChange={(e) => setRecropText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') submitRecrop(recropText); }}
                      placeholder="Enter prompt to recrop image"
                      className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-[13px] placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      disabled={!recropText.trim()}
                      onClick={() => submitRecrop(recropText)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
                      aria-label="Submit recrop"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                      </svg>
                    </button>
                  </div>
                  <p className="mt-1.5 text-[10px] text-gray-400">
                    <span className="font-medium">Caution:</span> AI outputs may require additional review before use.
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3">
          {onReiterate ? (
            <button
              type="button"
              onClick={openAskAlli}
              className={cn(
                'flex items-center gap-1.5 rounded-md border px-3 py-2 text-[13px] font-medium transition-colors',
                askAlliOpen
                  ? 'border-indigo-200 bg-indigo-50 text-indigo-600'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              )}
            >
              <SparklesIcon className="h-4 w-4" />
              Ask Alli to Recrop
            </button>
          ) : (
            <div />
          )}
          {displayUrl && (
            <DownloadDropdown
              openUp
              onDownload={async (fmt) => {
                try {
                  await downloadImage(displayUrl, filename, fmt);
                } catch (err) {
                  console.error('SingleImageModal download failed', err);
                  // eslint-disable-next-line no-alert
                  alert(`Failed to download: ${err instanceof Error ? err.message : 'unknown error'}`);
                }
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
