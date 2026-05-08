import { useState, useEffect } from 'react';
import { XMarkIcon, ChevronLeftIcon, ChevronRightIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { cn } from '../../../utils/cn';
import type { GeneratedOutput, MockCreative } from '../types';
import { downloadImage } from '../utils/downloadImage';
import DownloadDropdown from './DownloadDropdown';

interface SingleImageModalProps {
  outputs: GeneratedOutput[];
  initialIndex: number;
  sourceCreative?: MockCreative;
  onClose: () => void;
  onReiterate?: (outputId: string, prompt: string) => void;
}

export default function SingleImageModal({ outputs, initialIndex, sourceCreative, onClose, onReiterate }: SingleImageModalProps) {
  const [index, setIndex] = useState(initialIndex);
  const [recropOpen, setRecropOpen] = useState(false);
  const [recropText, setRecropText] = useState('');

  const output = outputs[index];
  const canPrev = index > 0;
  const canNext = index < outputs.length - 1;

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowLeft' && canPrev) setIndex(i => i - 1);
      if (e.key === 'ArrowRight' && canNext) setIndex(i => i + 1);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [canPrev, canNext, onClose]);

  if (!output) return null;

  const filename = `${output.dimension.label.replace(':', 'x')}-${output.dimension.width}x${output.dimension.height}`;

  function submitRecrop() {
    if (!recropText.trim() || !onReiterate) return;
    onReiterate(output.id, recropText.trim());
    setRecropText('');
    setRecropOpen(false);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <div>
            <p className="text-[14px] font-semibold text-gray-900">{output.dimension.label}</p>
            <p className="text-[11px] text-gray-400">
              {output.dimension.width}×{output.dimension.height} · {output.dimension.channelLabel}
            </p>
          </div>
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

        {/* Before / After image area */}
        <div className="relative flex flex-1 overflow-hidden bg-gray-50">
          {sourceCreative ? (
            /* Split view */
            <>
              {/* Before */}
              <div className="flex flex-1 flex-col">
                <div className="border-b border-gray-100 bg-white px-4 py-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Before</span>
                  <span className="ml-2 text-[10px] text-gray-400">{sourceCreative.width}×{sourceCreative.height} · {sourceCreative.fileType}</span>
                </div>
                <div className="flex flex-1 items-center justify-center p-5">
                  <img
                    src={sourceCreative.thumbnailUrl}
                    alt="Source creative"
                    className="max-h-[52vh] w-auto rounded object-contain shadow-sm"
                    title={sourceCreative.name}
                  />
                </div>
              </div>

              {/* Divider */}
              <div className="w-px bg-gray-200" />

              {/* After */}
              <div className="flex flex-1 flex-col">
                <div className="border-b border-gray-100 bg-white px-4 py-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-500">After</span>
                  <span className="ml-2 text-[10px] text-gray-400">{output.dimension.width}×{output.dimension.height} · {output.dimension.channelLabel}</span>
                </div>
                <div className="relative flex flex-1 items-center justify-center p-5">
                  {output.imageUrl && (
                    <img
                      src={output.imageUrl}
                      alt={output.dimension.label}
                      className="max-h-[52vh] w-auto rounded object-contain shadow-sm"
                    />
                  )}

                  {canPrev && (
                    <button
                      type="button"
                      onClick={() => setIndex(i => i - 1)}
                      aria-label="Previous (←)"
                      className="absolute left-3 flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-md hover:bg-gray-50"
                    >
                      <ChevronLeftIcon className="h-5 w-5 text-gray-600" />
                    </button>
                  )}
                  {canNext && (
                    <button
                      type="button"
                      onClick={() => setIndex(i => i + 1)}
                      aria-label="Next (→)"
                      className="absolute right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-md hover:bg-gray-50"
                    >
                      <ChevronRightIcon className="h-5 w-5 text-gray-600" />
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : (
            /* Single view (no source) */
            <div className="relative flex flex-1 items-center justify-center p-6">
              {output.imageUrl && (
                <img
                  src={output.imageUrl}
                  alt={output.dimension.label}
                  className="max-h-[60vh] w-auto rounded object-contain shadow-sm"
                />
              )}
              {canPrev && (
                <button
                  type="button"
                  onClick={() => setIndex(i => i - 1)}
                  aria-label="Previous (←)"
                  className="absolute left-3 flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-md hover:bg-gray-50"
                >
                  <ChevronLeftIcon className="h-5 w-5 text-gray-600" />
                </button>
              )}
              {canNext && (
                <button
                  type="button"
                  onClick={() => setIndex(i => i + 1)}
                  aria-label="Next (→)"
                  className="absolute right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-md hover:bg-gray-50"
                >
                  <ChevronRightIcon className="h-5 w-5 text-gray-600" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Re-crop input */}
        {recropOpen && (
          <div className="border-t border-gray-200 bg-gray-50 px-5 py-3">
            <p className="mb-1.5 text-[12px] font-medium text-gray-700">Describe what to adjust in this crop</p>
            <p className="mb-2 text-[11px] text-gray-400">e.g. "show more of the product," "tighter on the logo," "shift focus left"</p>
            <div className="flex gap-2">
              <input
                autoFocus
                type="text"
                value={recropText}
                onChange={(e) => setRecropText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submitRecrop(); }}
                placeholder="Describe the adjustment…"
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-[13px] placeholder:text-gray-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
              <button
                type="button"
                disabled={!recropText.trim()}
                onClick={submitRecrop}
                className="rounded-md bg-blue-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
              >
                Re-crop
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3">
          <button
            type="button"
            onClick={() => { setRecropOpen(open => !open); setRecropText(''); }}
            className={cn(
              'flex items-center gap-1.5 rounded-md border px-3 py-2 text-[13px] font-medium transition-colors',
              recropOpen
                ? 'border-blue-200 bg-blue-50 text-blue-600'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            )}
          >
            <ArrowPathIcon className="h-4 w-4" />
            Re-crop
          </button>
          {output.imageUrl && (
            <DownloadDropdown
              openUp
              onDownload={fmt => downloadImage(output.imageUrl!, filename, fmt)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
