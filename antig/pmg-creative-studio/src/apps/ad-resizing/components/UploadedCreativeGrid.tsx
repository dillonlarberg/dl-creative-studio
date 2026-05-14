import { CheckIcon } from '@heroicons/react/24/solid';
import { cn } from '../../../utils/cn';
import type { Creative } from '../types';

interface UploadedCreativeGridProps {
  creatives: Creative[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onThumbnailLoaded?: (creativeId: string) => void;
}

const FILE_TYPE_COLOURS: Record<string, string> = {
  PNG: 'bg-blue-50 text-blue-600',
  JPG: 'bg-amber-50 text-amber-600',
  WEBP: 'bg-emerald-50 text-emerald-600',
};

export default function UploadedCreativeGrid({
  creatives,
  selectedIds,
  onToggle,
  onThumbnailLoaded,
}: UploadedCreativeGridProps) {
  if (creatives.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
      {creatives.map(creative => {
        const selected = selectedIds.has(creative.id);
        return (
          <button
            key={creative.id}
            type="button"
            onClick={() => onToggle(creative.id)}
            className={cn(
              'group relative w-full rounded-lg border bg-white text-left shadow-sm transition-all duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2',
              selected
                ? 'border-blue-600 ring-2 ring-blue-600'
                : 'border-gray-200 hover:border-blue-300 hover:shadow-md',
            )}
          >
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-t-lg bg-gray-100">
              <img
                src={creative.thumbnailUrl}
                alt={creative.name}
                className="h-full w-full object-cover"
                loading="lazy"
                onLoad={() => onThumbnailLoaded?.(creative.id)}
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
              <p className="truncate text-[13px] font-medium text-gray-900" title={creative.name}>
                {creative.name}
              </p>
              <div className="mt-0.5 flex items-center justify-between">
                <span className="text-[11px] text-gray-400">
                  {creative.width}×{creative.height}
                </span>
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[10px] font-medium',
                    FILE_TYPE_COLOURS[creative.fileType] ?? 'bg-gray-100 text-gray-500',
                  )}
                >
                  {creative.fileType}
                </span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
