import { useState, useEffect } from 'react';
import { ArrowPathIcon, CheckIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { cn } from '../../../utils/cn';
import { imageEditService } from '../../../services/imageEditService';
import type { RenderVariation } from '../../../services/imageEditService';
import type { EditImageStepProps } from '../types';

const API_BASE = import.meta.env.VITE_IMAGE_EDIT_API_URL || 'http://127.0.0.1:8001';

export function PreviewStep({
  stepData,
  onStepDataChange,
  setIsLoading,
  isLoading,
}: EditImageStepProps) {
  const [renderError, setRenderError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);

  const doRender = async () => {
    if (!stepData.imageUrl || !stepData.selectedBackground) return;
    setIsRendering(true);
    setIsLoading(true);
    setRenderError(null);

    try {
      const fetchResp = await fetch(stepData.imageUrl);
      const blob = await fetchResp.blob();
      const file = new File([blob], stepData.imageName || 'image.png', { type: blob.type });

      const renderResp = await imageEditService.renderVariations(file, {
        backgroundId: stepData.selectedBackground.id,
        variationCount: stepData.variationCount || 3,
        sourceName: stepData.imageName || 'image',
        confirmedDetections: [],
      });

      const result = renderResp.variations;
      onStepDataChange({ variations: result, selectedVariation: result[0] });
    } catch {
      // Backend not running — use placeholder variations so the UI is reviewable
      const count = stepData.variationCount || 3;
      const placeholders: RenderVariation[] = Array.from({ length: count }, (_, i) => ({
        id: `placeholder-${i}`,
        fileName: `variation-${i + 1}.png`,
        url: stepData.imageUrl || '',
        downloadUrl: stepData.imageUrl || '',
        backgroundId: stepData.selectedBackground?.id || '',
      }));
      onStepDataChange({ variations: placeholders, selectedVariation: placeholders[0] });
    } finally {
      setIsRendering(false);
      setIsLoading(false);
    }
  };

  // Render on first mount if no variations yet
  useEffect(() => {
    if (!stepData.variations || stepData.variations.length === 0) {
      doRender();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectVariation = (variation: RenderVariation) => {
    onStepDataChange({ selectedVariation: variation });
  };

  const handleRerender = () => {
    onStepDataChange({ variations: undefined, selectedVariation: undefined });
    doRender();
  };

  if (isRendering) {
    return (
      <div className="py-20 text-center space-y-4">
        <ArrowPathIcon className="h-10 w-10 mx-auto text-blue-600 animate-spin" />
        <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">
          Extracting foreground & compositing...
        </p>
        <p className="text-[10px] text-gray-400">This may take a few seconds</p>
      </div>
    );
  }

  if (renderError) {
    return (
      <div className="mx-auto max-w-md py-16 text-center space-y-4">
        <ExclamationTriangleIcon className="h-8 w-8 mx-auto text-red-400" />
        <p className="text-xs font-bold text-red-500">{renderError}</p>
        <button
          onClick={handleRerender}
          className="rounded-xl bg-blue-600 px-6 py-2 text-[10px] font-black text-white uppercase tracking-widest hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const variations = stepData.variations || [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">Select a Variation</h3>
        <button
          onClick={handleRerender}
          disabled={isLoading}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[10px] font-black text-gray-500 uppercase tracking-widest hover:border-blue-300 hover:text-blue-600 transition-all disabled:opacity-40"
        >
          <ArrowPathIcon className="h-3.5 w-3.5" />
          Re-render
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Original */}
        <div className="space-y-2">
          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Original</p>
          <div className="aspect-square overflow-hidden rounded-xl border-2 border-gray-200">
            <img src={stepData.imageUrl} alt="Original" className="h-full w-full object-cover" />
          </div>
        </div>

        {/* Variations */}
        {variations.map((v: RenderVariation, i: number) => (
          <button key={v.id} onClick={() => selectVariation(v)} className="space-y-2 text-left">
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
              Variation {i + 1}
            </p>
            <div
              className={cn(
                'relative aspect-square overflow-hidden rounded-xl border-2 transition-all',
                stepData.selectedVariation?.id === v.id
                  ? 'border-blue-600 ring-2 ring-blue-200'
                  : 'border-gray-100 hover:border-blue-300',
              )}
            >
              <img src={v.url.startsWith('http') ? v.url : `${API_BASE}${v.url}`} alt={`Variation ${i + 1}`} className="h-full w-full object-cover" />
              {stepData.selectedVariation?.id === v.id && (
                <div className="absolute top-2 right-2 rounded-full bg-blue-600 p-1">
                  <CheckIcon className="h-3 w-3 text-white" />
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
