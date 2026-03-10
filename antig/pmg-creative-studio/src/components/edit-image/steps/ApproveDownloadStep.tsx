import { useState } from 'react';
import { ArrowDownTrayIcon, CheckCircleIcon, CircleStackIcon } from '@heroicons/react/24/outline';
import type { EditImageStepProps } from '../types';

const API_BASE = import.meta.env.VITE_IMAGE_EDIT_API_URL || 'http://127.0.0.1:8001';

export function ApproveDownloadStep({ stepData, onStepDataChange }: EditImageStepProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const variation = stepData.selectedVariation;

  const handleDownload = async () => {
    if (!variation) return;
    setIsDownloading(true);
    try {
      const downloadSrc = variation.downloadUrl.startsWith('http') ? variation.downloadUrl : `${API_BASE}${variation.downloadUrl}`;
      const response = await fetch(downloadSrc);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = variation.fileName || 'edited-image.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onStepDataChange({ finalUrl: `${API_BASE}${variation.url}` });
    } catch {
      // User can retry
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="text-center space-y-2">
        <CheckCircleIcon className="h-10 w-10 mx-auto text-green-500" />
        <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">
          Your edited image is ready
        </h3>
      </div>

      {/* Before / After */}
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-2">
          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest text-center">Before</p>
          <div className="overflow-hidden rounded-2xl border border-gray-200 shadow-sm">
            <img src={stepData.imageUrl} alt="Original" className="w-full object-contain" />
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest text-center">After</p>
          <div className="overflow-hidden rounded-2xl border-2 border-blue-200 shadow-sm ring-2 ring-blue-100">
            {variation && (
              <img src={variation.url.startsWith('http') ? variation.url : `${API_BASE}${variation.url}`} alt="Edited" className="w-full object-contain" />
            )}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-center gap-4">
        {/* Download — active */}
        <button
          onClick={handleDownload}
          disabled={isDownloading || !variation}
          className="flex items-center gap-2 rounded-2xl bg-blue-600 px-8 py-3 text-xs font-black text-white uppercase tracking-widest hover:bg-blue-700 transition-colors disabled:opacity-40 shadow-lg shadow-blue-600/20"
        >
          <ArrowDownTrayIcon className="h-4 w-4" />
          {isDownloading ? 'Downloading...' : 'Download Image'}
        </button>

        {/* Add to Asset House — grayed out */}
        <div className="relative group">
          <button
            disabled
            className="flex items-center gap-2 rounded-2xl border-2 border-gray-200 bg-gray-50 px-8 py-3 text-xs font-black text-gray-300 uppercase tracking-widest cursor-not-allowed"
          >
            <CircleStackIcon className="h-4 w-4" />
            Add to Asset House
          </button>
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 rounded-lg bg-gray-900 px-3 py-1 text-[9px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            Coming Soon
          </div>
        </div>
      </div>
    </div>
  );
}
