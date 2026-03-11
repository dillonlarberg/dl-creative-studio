import { useEffect } from 'react';
import type { EditImageStepProps } from '../types';

export function PreviewStep({
  stepData,
  onStepDataChange,
}: EditImageStepProps) {
  // Mark preview as ready on mount so Continue is enabled
  useEffect(() => {
    if (!stepData.previewReady) {
      onStepDataChange({ previewReady: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const bg = stepData.selectedBackground;
  const bgStyle: React.CSSProperties = bg?.type === 'color'
    ? { backgroundColor: bg.value }
    : bg?.type === 'image'
      ? { backgroundImage: `url(${bg.url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : { backgroundColor: '#f1f5f9' };

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

        {/* Edited — CSS layering */}
        <div className="space-y-2">
          <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest text-center">Edited</p>
          <div
            className="relative overflow-hidden rounded-2xl border-2 border-blue-200 ring-2 ring-blue-100"
            style={bgStyle}
          >
            {stepData.extractedImageUrl && (
              <img
                src={stepData.extractedImageUrl}
                alt="Edited"
                className="relative w-full object-contain"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
