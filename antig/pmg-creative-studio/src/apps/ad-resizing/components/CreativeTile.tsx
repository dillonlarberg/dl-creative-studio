import { CheckIcon } from '@heroicons/react/24/solid';
import { cn } from '../../../utils/cn';
import type { MockCreative } from '../types';

interface CreativeTileProps {
  creative: MockCreative;
  selected: boolean;
  onSelect: (creative: MockCreative) => void;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function CreativeTile({ creative, selected, onSelect }: CreativeTileProps) {
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
      {/* Thumbnail — fixed 4:3 for visual consistency across all source formats */}
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-t-lg bg-gray-100">
        <img
          src={creative.thumbnailUrl}
          alt={creative.name}
          className="h-full w-full object-cover"
          loading="lazy"
        />
        {/* Selected checkmark */}
        {selected && (
          <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 shadow">
            <CheckIcon className="h-3.5 w-3.5 text-white" />
          </div>
        )}
        {/* Hover overlay — only when not selected */}
        {!selected && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/10">
            <div className="hidden h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-white/20 group-hover:flex">
              <div className="h-3 w-3 rounded-full border-2 border-white" />
            </div>
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="px-3 py-2.5">
        <p className="truncate text-[13px] font-medium text-gray-900">{creative.name}</p>
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
