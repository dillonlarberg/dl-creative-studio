import { useState, useEffect } from 'react';
import { XMarkIcon, ChevronLeftIcon, ChevronRightIcon, SparklesIcon } from '@heroicons/react/24/solid';
import { cn } from '../../../utils/cn';
import type { GeneratedOutput, MockCreative } from '../types';
import { downloadImage } from '../utils/downloadImage';
import { buildOutputFilename } from '../utils/outputFilename';
import { useStorageUrl } from '../hooks/useStorageUrl';
import DownloadDropdown from './DownloadDropdown';

const LOADING_COPY = [
  'Assembling frames — no thumbtacks required…',
  'Finding the perfect crop…',
  'Reframing your shot…',
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
    setTimeout(() => {
      setSubmitting(false);
      setAskAlliOpen(false);
      setRecropSent(true);
      setTimeout(() => setRecropSent(false), 5000);
    }, 1200);
  }

  // Circle that expands to pill on hover — gradient + glow for the magical feel
  const outputOverlay = onReiterate && !askAlliOpen ? (
    <div className="absolute inset-0 pointer-events-none">
      <button
        type="button"
        onClick={openAskAlli}
        aria-label="Ask Alli to Recrop"
        className="group/badge pointer-events-auto absolute right-2.5 top-2.5 z-10 inline-flex h-8 items-center overflow-hidden rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 pl-2 pr-2 text-white shadow-lg shadow-indigo-500/40 transition-all duration-200 ease-out hover:pr-4 focus:outline-none"
      >
        <SparklesIcon className="h-4 w-4 shrink-0" />
        <span className="inline-block max-w-0 overflow-hidden whitespace-nowrap text-[12px] font-semibold opacity-0 transition-all duration-200 ease-out group-hover/badge:ml-1.5 group-hover/badge:max-w-[9rem] group-hover/badge:opacity-100">
          Ask Alli to Recrop
        </span>
      </button>
    </div>
  ) : null;

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
              className="absolute left-2 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-md hover:bg-gray-50"
            >
              <ChevronLeftIcon className="h-5 w-5 text-gray-600" />
            </button>
          )}
          {canNext && (
            <button
              type="button"
              onClick={() => setIndex(i => i + 1)}
              aria-label="Next (→)"
              className="absolute right-2 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-md hover:bg-gray-50"
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

              {/* Output panel */}
              <div className="relative flex flex-1 flex-col">
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
                  {outputOverlay}
                </div>
              </div>
            </>
          ) : (
            /* Single view */
            <div className="relative flex flex-1 items-center justify-center p-6">
              {displayUrl && (
                <img
                  src={displayUrl}
                  alt={output.dimension.label}
                  className="max-h-[60vh] w-auto rounded object-contain shadow-sm"
                  fetchPriority="high"
                />
              )}
              {outputOverlay}
            </div>
          )}
        </div>

        {/* Re-crop sent banner */}
        {recropSent && (
          <div className="border-t border-green-100 bg-green-50 px-5 py-2.5">
            <p className="text-[12px] font-medium text-green-700">Re-crop request sent — a new version is being generated.</p>
          </div>
        )}

        {/* Ask Alli panel */}
        {askAlliOpen && (
          <div className="border-t border-gray-200 bg-white">
            {submitting ? (
              /* Keyframes defined in index.css — class names: alli-breathe, alli-orbit-a/b/c */
              <div className="flex flex-col items-center justify-center px-5 py-10 gap-5">
                <div className="relative flex h-20 w-20 items-center justify-center">
                  <div className="alli-breathe">
                    <SparklesIcon className="h-12 w-12 text-indigo-600" />
                  </div>
                  <div className="absolute alli-orbit-a">
                    <SparklesIcon className="h-5 w-5 text-violet-500" />
                  </div>
                  <div className="absolute alli-orbit-b">
                    <SparklesIcon className="h-3.5 w-3.5 text-indigo-400" />
                  </div>
                  <div className="absolute alli-orbit-c">
                    <SparklesIcon className="h-3 w-3 text-violet-300" />
                  </div>
                </div>
                <p className="text-[13px] font-medium text-gray-700">{loadingCopy}</p>
              </div>
            ) : (
              <>
                {/* Panel header */}
                <div className="flex items-center justify-between px-5 pt-4 pb-3">
                  <div className="flex items-center gap-1.5">
                    <SparklesIcon className="h-3.5 w-3.5 text-indigo-600" />
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

                {/* Centered thumbnail + prompt label */}
                <div className="flex flex-col items-center gap-2 px-5 pb-3">
                  {displayUrl && (
                    <img
                      src={displayUrl}
                      alt="Current output"
                      className="h-20 w-20 rounded-lg border border-gray-200 object-cover shadow-sm"
                    />
                  )}
                  <div className="text-center">
                    <p className="text-[13px] font-semibold text-gray-900">Enter a prompt to recrop the image above.</p>
                    <p className="mt-0.5 text-[11px] text-gray-500">Describe the adjustment you want.</p>
                  </div>
                </div>

                {/* Pure inline-style pill — no Tailwind for any visual property */}
                <div className="px-5 pb-4">
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: '#eef0f6',
                    borderRadius: 9999,
                    padding: '6px 6px 6px 16px',
                    gap: 8,
                  }}>
                    <input
                      autoFocus
                      type="text"
                      value={recropText}
                      onChange={(e) => setRecropText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') submitRecrop(recropText); }}
                      placeholder="Enter prompt to recrop image"
                      style={{
                        flex: 1,
                        minWidth: 0,
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        fontSize: 13,
                        color: '#374151',
                        padding: 0,
                      }}
                    />
                    <button
                      type="button"
                      disabled={!recropText.trim()}
                      onClick={() => submitRecrop(recropText)}
                      style={{
                        flexShrink: 0,
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: recropText.trim()
                          ? 'linear-gradient(135deg, #6366f1, #7c3aed)'
                          : '#c4c6d4',
                        border: 'none',
                        cursor: recropText.trim() ? 'pointer' : 'default',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                      }}
                      aria-label="Submit recrop"
                    >
                      <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                      </svg>
                    </button>
                  </div>
                  <p className="mt-2 text-center text-[10px] text-gray-400">
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
              <SparklesIcon className="h-3.5 w-3.5" />
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