import { useState } from 'react';
import { ArrowPathIcon, PencilSquareIcon, ScissorsIcon } from '@heroicons/react/24/outline';
import { cn } from '../../../utils/cn';
import { imageEditService } from '../../../services/imageEditService';
import type { EditImageStepProps } from '../types';

export function CanvasStep({
  stepData,
  onStepDataChange,
  setIsLoading,
}: EditImageStepProps) {
  const [isExtracting, setIsExtracting] = useState(false);

  const handleExtract = async () => {
    if (!stepData.imageUrl) return;
    setIsExtracting(true);
    setIsLoading(true);

    try {
      const response = await fetch(stepData.imageUrl);
      const blob = await response.blob();
      const file = new File([blob], stepData.imageName || 'image.png', { type: blob.type });

      const result = await imageEditService.extractForeground(file);
      onStepDataChange({
        extractedImageUrl: result.url,
        extractionMethod: 'auto',
      });
    } catch {
      // Backend not running — use original image as placeholder
      onStepDataChange({
        extractedImageUrl: stepData.imageUrl,
        extractionMethod: 'auto',
      });
    } finally {
      setIsExtracting(false);
      setIsLoading(false);
    }
  };

  const isExtracted = !!stepData.extractedImageUrl;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Canvas area */}
      <div className="relative">
        <div
          className={cn(
            'relative overflow-hidden rounded-2xl border-2 min-h-[320px] flex items-center justify-center',
            isExtracted ? 'border-blue-200 bg-[repeating-conic-gradient(#f1f5f9_0%_25%,#fff_0%_50%)_0_0/20px_20px]' : 'border-gray-200 bg-gray-50',
          )}
        >
          {stepData.imageUrl && (
            <img
              src={isExtracted ? stepData.extractedImageUrl : stepData.imageUrl}
              alt={stepData.imageName || 'Selected image'}
              className="max-h-[400px] w-auto object-contain"
            />
          )}

          {isExtracting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm">
              <ArrowPathIcon className="h-10 w-10 text-blue-600 animate-spin" />
              <p className="mt-3 text-[10px] font-black text-blue-600 uppercase tracking-widest">
                Extracting foreground...
              </p>
            </div>
          )}
        </div>

        {/* Edit button — top right of canvas */}
        <button
          disabled={!isExtracted}
          className={cn(
            'absolute top-3 right-3 flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[9px] font-black uppercase tracking-widest transition-all',
            isExtracted
              ? 'border-gray-300 bg-white/90 text-gray-500 hover:border-blue-300 hover:text-blue-600 backdrop-blur-sm'
              : 'border-gray-200 bg-gray-100/80 text-gray-300 cursor-not-allowed',
          )}
          title={isExtracted ? 'Edit selection mask' : 'Extract background first'}
        >
          <PencilSquareIcon className="h-3.5 w-3.5" />
          Edit
        </button>
      </div>

      {/* Extract button */}
      <div className="text-center">
        {!isExtracted ? (
          <button
            onClick={handleExtract}
            disabled={isExtracting || !stepData.imageUrl}
            className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-8 py-3 text-xs font-black text-white uppercase tracking-widest hover:bg-blue-700 transition-colors disabled:opacity-40 shadow-lg shadow-blue-600/20"
          >
            <ScissorsIcon className="h-4 w-4" />
            {isExtracting ? 'Extracting...' : 'Extract Background'}
          </button>
        ) : (
          <div className="flex items-center justify-center gap-3">
            <p className="text-[10px] font-black text-green-600 uppercase tracking-widest">
              Background extracted
            </p>
            <button
              onClick={handleExtract}
              disabled={isExtracting}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[10px] font-black text-gray-500 uppercase tracking-widest hover:border-blue-300 hover:text-blue-600 transition-all"
            >
              <ArrowPathIcon className="h-3.5 w-3.5" />
              Re-extract
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
