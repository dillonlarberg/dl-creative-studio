import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { cn } from '../../../utils/cn';
import type { GeneratedOutput } from '../types';
import { downloadImage } from '../utils/downloadImage';
import DownloadDropdown from './DownloadDropdown';

interface GeneratedTileProps {
  output: GeneratedOutput;
  onView: () => void;
  onRetry?: () => void;
  selected?: boolean;
  anySelected?: boolean;
  onToggleSelect?: () => void;
}

function aspectStyle(width: number, height: number): React.CSSProperties {
  return { aspectRatio: `${width} / ${height}` };
}

export default function GeneratedTile({ output, onView, onRetry, selected = false, anySelected = false, onToggleSelect }: GeneratedTileProps) {
  const { dimension, status, imageUrl } = output;
  const isPending = status === 'pending';
  const isComplete = status === 'complete';

  const filename = `${dimension.label.replace(':', 'x')}-${dimension.width}x${dimension.height}`;

  return (
    <div className={cn(
      'group relative flex flex-col rounded-lg border bg-white shadow-sm transition-all',
      selected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200',
    )}>
      {/* Thumbnail */}
      <div
        className="relative w-full overflow-hidden rounded-t-lg bg-gray-100"
        style={aspectStyle(dimension.width, dimension.height)}
      >
        {/* Select checkbox — top-left; visible on hover, always visible when selected or any tile is selected */}
        {isComplete && onToggleSelect && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
            aria-label={selected ? 'Deselect' : 'Select'}
            className={cn(
              'absolute left-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded border-2 transition-all duration-100',
              'opacity-0 group-hover:opacity-100',
              (selected || anySelected) && 'opacity-100',
              selected
                ? 'border-blue-600 bg-blue-600'
                : 'border-white bg-white/80 hover:border-blue-400',
            )}
          >
            {selected && (
              <svg viewBox="0 0 12 12" fill="none" className="h-full w-full p-0.5">
                <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        )}

        {isPending && (
          <>
            <div className="shimmer-tile absolute inset-0" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
            </div>
          </>
        )}
        {isComplete && imageUrl && (
          <>
            <img
              src={imageUrl}
              alt={`${dimension.label} output`}
              className="h-full w-full object-cover"
            />
            {/* Hover overlay — View only */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100">
              <button
                type="button"
                onClick={() => onView()}
                className="rounded-md bg-white px-4 py-1.5 text-[12px] font-semibold text-gray-900 shadow hover:bg-gray-50"
              >
                View
              </button>
            </div>
          </>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-red-50">
            <p className="text-[11px] font-medium text-red-500">Generation failed</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700"
              >
                <ArrowPathIcon className="h-3 w-3" />
                Retry
              </button>
            )}
          </div>
        )}
      </div>

      {/* Metadata — Download appears on hover, fading the Ready badge */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-[12px] font-medium text-gray-800" title={`${dimension.label} · ${dimension.width}×${dimension.height}`}>{dimension.label}</p>
          <p className="text-[11px] text-gray-400">{dimension.width}×{dimension.height}</p>
        </div>
        <div className="shrink-0">
          {isComplete && imageUrl ? (
            <>
              <span className="block text-[10px] font-medium text-green-600 transition-opacity group-hover:opacity-0">
                Ready
              </span>
              <div className="absolute bottom-2 right-3 opacity-0 transition-opacity group-hover:opacity-100">
                <DownloadDropdown
                  size="sm"
                  openUp
                  onDownload={fmt => downloadImage(imageUrl, filename, fmt)}
                />
              </div>
            </>
          ) : (
            <span className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-medium',
              isPending ? 'bg-gray-100 text-gray-500' : 'bg-red-50 text-red-500',
            )}>
              {isPending ? 'Generating…' : 'Failed'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
