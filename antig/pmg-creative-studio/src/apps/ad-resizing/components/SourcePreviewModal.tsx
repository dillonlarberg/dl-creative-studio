import { XMarkIcon } from '@heroicons/react/24/outline';
import type { Creative } from '../types';
import { downloadImage } from '../utils/downloadImage';
import DownloadDropdown from './DownloadDropdown';

interface SourcePreviewModalProps {
  creative: Creative;
  outputCount: number;
  onClose: () => void;
}

export default function SourcePreviewModal({ creative, outputCount, onClose }: SourcePreviewModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <div>
            <p className="text-[13px] font-semibold text-gray-900">Source Creative</p>
            <p className="mt-0.5 text-[11px] text-gray-400">
              {creative.name} · {creative.width}×{creative.height} · {creative.fileType}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center justify-center bg-gray-50 p-6">
          <img
            src={creative.thumbnailUrl}
            alt={creative.name}
            className="max-h-[55vh] w-auto rounded-lg object-contain shadow-sm"
          />
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3">
          <p className="text-[11px] text-gray-400">
            Used to generate {outputCount} size{outputCount !== 1 ? 's' : ''}
          </p>
          <DownloadDropdown
            openUp
            onDownload={async (fmt) => {
              try {
                await downloadImage(creative.thumbnailUrl, creative.name, fmt);
              } catch (err) {
                console.error('Source download failed', err);
                // eslint-disable-next-line no-alert
                alert(`Failed to download source: ${err instanceof Error ? err.message : 'unknown error'}`);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
