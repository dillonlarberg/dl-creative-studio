import { useState } from 'react';
import { ArrowDownTrayIcon, CheckCircleIcon, CircleStackIcon } from '@heroicons/react/24/outline';
import { compositeImage } from '../utils/compositeImage';
import { imageEditService } from '../../../services/imageEditService';
import type { EditImageStepProps } from '../types';

export function ApproveDownloadStep({ stepData, onStepDataChange, clientSlug }: EditImageStepProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const bg = stepData.selectedBackground;
  const bgStyle: React.CSSProperties = bg?.type === 'color'
    ? { backgroundColor: bg.value }
    : bg?.type === 'image'
      ? { backgroundImage: `url(${bg.url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : { backgroundColor: '#f1f5f9' };

  const handleDownload = async () => {
    if (!stepData.extractedImageUrl || !stepData.selectedBackground) return;
    setIsExporting(true);
    setExportError(null);

    try {
      // Composite via Canvas API
      const blob = await compositeImage(stepData.extractedImageUrl, stepData.selectedBackground);

      // Download locally
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `edited_${stepData.imageName || 'image'}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Optionally save to Firebase Storage
      try {
        const saved = await imageEditService.saveEditedImage(blob, {
          clientSlug,
          imageName: stepData.imageName || 'image.png',
        });
        onStepDataChange({ finalUrl: saved.url });
      } catch {
        // Storage save is optional — download still succeeded
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
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
          <div
            className="overflow-hidden rounded-2xl border-2 border-blue-200 shadow-sm ring-2 ring-blue-100"
            style={bgStyle}
          >
            {stepData.extractedImageUrl && (
              <img src={stepData.extractedImageUrl} alt="Edited" className="w-full object-contain" />
            )}
          </div>
        </div>
      </div>

      {/* Error */}
      {exportError && (
        <p className="text-center text-[10px] font-bold text-red-500">{exportError}</p>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={handleDownload}
          disabled={isExporting || !stepData.extractedImageUrl}
          className="flex items-center gap-2 rounded-2xl bg-blue-600 px-8 py-3 text-xs font-black text-white uppercase tracking-widest hover:bg-blue-700 transition-colors disabled:opacity-40 shadow-lg shadow-blue-600/20"
        >
          <ArrowDownTrayIcon className="h-4 w-4" />
          {isExporting ? 'Exporting...' : 'Download Image'}
        </button>

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
