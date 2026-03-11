import { useState, useEffect } from 'react';
import { ArrowPathIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { imageEditService } from '../../../services/imageEditService';
import type { RenderVariation } from '../../../services/imageEditService';
import type { EditImageStepProps } from '../types';

const API_BASE = import.meta.env.VITE_IMAGE_EDIT_API_URL || 'http://127.0.0.1:8001';

export function PreviewStep({
  stepData,
  onStepDataChange,
  setIsLoading,
}: EditImageStepProps) {
  const [renderError, setRenderError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);

  const doRender = async () => {
    if (!stepData.extractedImageUrl || !stepData.selectedBackground) return;
    setIsRendering(true);
    setIsLoading(true);
    setRenderError(null);

    try {
      const fetchResp = await fetch(stepData.extractedImageUrl);
      const blob = await fetchResp.blob();
      const file = new File([blob], stepData.imageName || 'image.png', { type: blob.type });

      const backgroundId = stepData.selectedBackground.type === 'color'
        ? stepData.selectedBackground.value
        : 'custom-image';

      const renderResp = await imageEditService.renderVariations(file, {
        backgroundId,
        variationCount: 1,
        sourceName: stepData.imageName || 'image',
        confirmedDetections: [],
      });

      const result = renderResp.variations[0];
      onStepDataChange({ selectedVariation: result });
    } catch {
      // Backend not running — use placeholder
      const placeholder: RenderVariation = {
        id: 'placeholder-0',
        fileName: 'edited-image.png',
        url: stepData.imageUrl || '',
        downloadUrl: stepData.imageUrl || '',
        backgroundId: 'placeholder',
      };
      onStepDataChange({ selectedVariation: placeholder });
    } finally {
      setIsRendering(false);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!stepData.selectedVariation) {
      doRender();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (isRendering) {
    return (
      <div className="py-20 text-center space-y-4">
        <ArrowPathIcon className="h-10 w-10 mx-auto text-blue-600 animate-spin" />
        <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">
          Compositing image...
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
          onClick={doRender}
          className="rounded-xl bg-blue-600 px-6 py-2 text-[10px] font-black text-white uppercase tracking-widest hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const variation = stepData.selectedVariation;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em] text-center">
        Preview
      </h3>

      <div className="grid grid-cols-2 gap-6">
        {/* Original */}
        <div className="space-y-2">
          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest text-center">Original</p>
          <div className="overflow-hidden rounded-2xl border-2 border-gray-200">
            <img src={stepData.imageUrl} alt="Original" className="w-full object-contain" />
          </div>
        </div>

        {/* Edited */}
        <div className="space-y-2">
          <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest text-center">Edited</p>
          <div className="overflow-hidden rounded-2xl border-2 border-blue-200 ring-2 ring-blue-100">
            {variation && (
              <img
                src={variation.url.startsWith('http') ? variation.url : `${API_BASE}${variation.url}`}
                alt="Edited"
                className="w-full object-contain"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
