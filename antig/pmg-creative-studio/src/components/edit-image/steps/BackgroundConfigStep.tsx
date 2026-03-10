import { useState, useEffect } from 'react';
import { ArrowPathIcon, CheckIcon } from '@heroicons/react/24/outline';
import { cn } from '../../../utils/cn';
import { imageEditService } from '../../../services/imageEditService';
import type { BackgroundCatalogItem } from '../../../services/imageEditService';
import type { EditImageStepProps } from '../types';

const API_BASE = import.meta.env.VITE_IMAGE_EDIT_API_URL || 'http://127.0.0.1:8001';

// Fallback catalog when the local API is not running
const FALLBACK_CATALOG: BackgroundCatalogItem[] = [
  { id: 'studio-white', name: 'Studio White', type: 'solid', value: '#ffffff' },
  { id: 'slate', name: 'Slate', type: 'solid', value: '#475569' },
  { id: 'sand', name: 'Sand', type: 'solid', value: '#d4a574' },
  { id: 'mint', name: 'Mint', type: 'solid', value: '#a7f3d0' },
  { id: 'sunrise', name: 'Sunrise', type: 'solid', value: '#fbbf24' },
  { id: 'sky', name: 'Sky', type: 'solid', value: '#38bdf8' },
];

export function BackgroundConfigStep({
  stepData,
  onStepDataChange,
}: EditImageStepProps) {
  const [catalog, setCatalog] = useState<BackgroundCatalogItem[]>([]);
  const [isFetching, setIsFetching] = useState(false);

  useEffect(() => {
    setIsFetching(true);
    imageEditService
      .getBackgroundCatalog()
      .then(setCatalog)
      .catch(() => setCatalog(FALLBACK_CATALOG))
      .finally(() => setIsFetching(false));
  }, []);

  const solids = catalog.filter((b) => b.type === 'solid');
  const images = catalog.filter((b) => b.type === 'image');
  const selected = stepData.selectedBackground;

  const selectBackground = (bg: BackgroundCatalogItem) => {
    onStepDataChange({ selectedBackground: bg, variationCount: stepData.variationCount || 3 });
  };

  if (isFetching) {
    return (
      <div className="py-20 text-center space-y-4">
        <ArrowPathIcon className="h-8 w-8 mx-auto text-blue-600 animate-spin" />
        <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Loading backgrounds...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* Selected image preview (small) */}
      {stepData.imageUrl && (
        <div className="flex items-center gap-4 rounded-xl bg-gray-50 p-3 border border-gray-100">
          <img src={stepData.imageUrl} alt={stepData.imageName || ''} className="h-16 w-16 rounded-lg object-cover" />
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Editing</p>
            <p className="text-xs font-bold text-gray-900 truncate max-w-xs">{stepData.imageName}</p>
          </div>
        </div>
      )}

      {/* Solid Backgrounds */}
      {solids.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">Solid Colors</h3>
          <div className="flex flex-wrap gap-3">
            {solids.map((bg) => (
              <button
                key={bg.id}
                onClick={() => selectBackground(bg)}
                className={cn(
                  'relative h-14 w-14 rounded-xl border-2 transition-all shadow-sm',
                  selected?.id === bg.id
                    ? 'border-blue-600 ring-2 ring-blue-200 scale-110'
                    : 'border-gray-200 hover:border-blue-300 hover:scale-105',
                )}
                style={{ backgroundColor: bg.value }}
                title={bg.name}
              >
                {selected?.id === bg.id && (
                  <CheckIcon className="absolute inset-0 m-auto h-5 w-5 text-blue-600 drop-shadow" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Image Backgrounds */}
      {images.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">Image Backgrounds</h3>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
            {images.map((bg) => (
              <button
                key={bg.id}
                onClick={() => selectBackground(bg)}
                className={cn(
                  'relative aspect-square overflow-hidden rounded-xl border-2 transition-all',
                  selected?.id === bg.id
                    ? 'border-blue-600 ring-2 ring-blue-200 scale-105'
                    : 'border-gray-100 hover:border-blue-300',
                )}
              >
                <img
                  src={bg.previewUrl || `${API_BASE}/background-files/${bg.value}`}
                  alt={bg.name}
                  className="h-full w-full object-cover"
                />
                {selected?.id === bg.id && (
                  <div className="absolute inset-0 flex items-center justify-center bg-blue-600/20">
                    <CheckIcon className="h-6 w-6 text-white drop-shadow-lg" />
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent p-1.5">
                  <p className="text-[7px] font-bold text-white truncate">{bg.name}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Variation Count */}
      <div className="flex items-center gap-4">
        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Variations:</label>
        <div className="flex gap-2">
          {[3, 4].map((count) => (
            <button
              key={count}
              onClick={() => onStepDataChange({ variationCount: count })}
              className={cn(
                'px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all',
                (stepData.variationCount || 3) === count
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300',
              )}
            >
              {count}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
