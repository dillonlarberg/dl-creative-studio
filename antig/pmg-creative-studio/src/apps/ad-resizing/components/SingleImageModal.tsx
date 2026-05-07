import { useState } from 'react';
import { XMarkIcon, ChevronLeftIcon, ChevronRightIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import type { GeneratedOutput } from '../types';
import { downloadImage } from '../utils/downloadImage';
import DownloadDropdown from './DownloadDropdown';

interface SingleImageModalProps {
  outputs: GeneratedOutput[];
  initialIndex: number;
  onClose: () => void;
}

export default function SingleImageModal({ outputs, initialIndex, onClose }: SingleImageModalProps) {
  const [index, setIndex] = useState(initialIndex);
  const [reiterateOpen, setReiterateOpen] = useState(false);
  const [reiterateText, setReiterateText] = useState('');

  const output = outputs[index];
  if (!output) return null;

  const canPrev = index > 0;
  const canNext = index < outputs.length - 1;

  const filename = `${output.dimension.label.replace(':', 'x')}-${output.dimension.width}x${output.dimension.height}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
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
              className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Image */}
        <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-gray-50 p-6">
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
              className="absolute left-3 flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-md hover:bg-gray-50"
            >
              <ChevronLeftIcon className="h-5 w-5 text-gray-600" />
            </button>
          )}
          {canNext && (
            <button
              type="button"
              onClick={() => setIndex(i => i + 1)}
              className="absolute right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-md hover:bg-gray-50"
            >
              <ChevronRightIcon className="h-5 w-5 text-gray-600" />
            </button>
          )}
        </div>

        {/* Reiterate input */}
        {reiterateOpen && (
          <div className="border-t border-gray-200 bg-gray-50 px-5 py-3">
            <p className="mb-2 text-[12px] font-medium text-gray-700">What would you like to change?</p>
            <div className="flex gap-2">
              <input
                autoFocus
                type="text"
                value={reiterateText}
                onChange={(e) => setReiterateText(e.target.value)}
                placeholder="e.g. more padding around the logo, brighter background..."
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-[13px] placeholder:text-gray-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
              <button
                type="button"
                disabled={!reiterateText.trim()}
                className="rounded-md bg-blue-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400"
              >
                Regenerate
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3">
          <button
            type="button"
            onClick={() => setReiterateOpen(open => !open)}
            className="flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-[13px] font-medium text-gray-600 hover:bg-gray-50"
          >
            <ArrowPathIcon className="h-4 w-4" />
            Reiterate
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
