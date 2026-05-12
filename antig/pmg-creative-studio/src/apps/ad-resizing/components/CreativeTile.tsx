import { useEffect, useRef } from 'react';
import { CheckIcon } from '@heroicons/react/24/solid';
import { cn } from '../../../utils/cn';
import type { Creative } from '../types';

interface CreativeTileProps {
  creative: Creative;
  selected: boolean;
  onSelect: (creative: Creative) => void;
  /** Patches the in-memory creative once the real natural dims are known. */
  onDimensionsResolved?: (creativeId: string, width: number, height: number) => void;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function CreativeTile({ creative, selected, onSelect, onDimensionsResolved }: CreativeTileProps) {
  const reportedRef = useRef<string | null>(null);

  // Probe natural dims via the loaded <img>. The feed seed uses 1080×1080 as a
  // placeholder; we patch the real values back so `runOutpaintBatch` carries
  // the correct sourceSpec into Phase-1 and so dim-out-of-bounds checks fire
  // on legitimately tiny sources.
  function handleImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    if (!onDimensionsResolved) return;
    if (reportedRef.current === creative.id) return;
    const img = e.currentTarget;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      reportedRef.current = creative.id;
      onDimensionsResolved(creative.id, img.naturalWidth, img.naturalHeight);
    }
  }

  useEffect(() => {
    reportedRef.current = null;
  }, [creative.thumbnailUrl]);

  return (
    <button
      type="button"
      onClick={() => onSelect(creative)}
      className={cn(
        'group relative w-full rounded-lg border bg-white text-left shadow-sm transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2',
        selected
          ? 'border-blue-600 ring-2 ring-blue-600'
          : 'border-gray-200 hover:border-blue-300 hover:shadow-md'
      )}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-t-lg bg-gray-100">
        <img
          src={creative.thumbnailUrl}
          alt={creative.name}
          className="h-full w-full object-cover"
          loading="lazy"
          onLoad={handleImgLoad}
        />
        {selected && (
          <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 shadow">
            <CheckIcon className="h-3.5 w-3.5 text-white" />
          </div>
        )}
        {!selected && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/10">
            <div className="hidden h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-white/20 group-hover:flex">
              <div className="h-3 w-3 rounded-full border-2 border-white" />
            </div>
          </div>
        )}
      </div>

      <div className="px-3 py-2.5">
        <p className="truncate text-[13px] font-medium text-gray-900" title={creative.name}>{creative.name}</p>
        <div className="mt-0.5 flex items-center justify-between">
          <span className="text-[11px] text-gray-400">
            {creative.width}×{creative.height}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
              {creative.fileType}
            </span>
            <span className="text-[11px] text-gray-400">{formatDate(creative.uploadedAt)}</span>
          </div>
        </div>
      </div>
    </button>
  );
}
