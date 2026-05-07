import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { cn } from '../../../utils/cn';
import type { GeneratedOutput } from '../types';
import { downloadImage } from '../utils/downloadImage';

interface GeneratedTileProps {
  output: GeneratedOutput;
  onView: () => void;
}

function aspectStyle(width: number, height: number): React.CSSProperties {
  return { aspectRatio: `${width} / ${height}` };
}

const FORMATS = [
  { value: 'png' as const, label: 'PNG' },
  { value: 'jpg' as const, label: 'JPG' },
  { value: 'webp' as const, label: 'WebP' },
];

export default function GeneratedTile({ output, onView }: GeneratedTileProps) {
  const { dimension, status, imageUrl } = output;
  const isPending = status === 'pending';
  const isComplete = status === 'complete';

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      {/* Thumbnail area */}
      <div
        className="relative w-full overflow-hidden bg-gray-100"
        style={aspectStyle(dimension.width, dimension.height)}
      >
        {isPending && (
          <div className="shimmer-tile absolute inset-0" />
        )}
        {isComplete && imageUrl && (
          <>
            <img
              src={imageUrl}
              alt={`${dimension.label} output`}
              className="h-full w-full object-cover"
            />
            {/* Hover overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/0 opacity-0 transition-all group-hover:bg-black/35 group-hover:opacity-100">
              <button
                type="button"
                onClick={() => onView()}
                className="rounded-md bg-white px-3 py-1.5 text-[12px] font-medium text-gray-900 shadow hover:bg-gray-50"
              >
                View
              </button>
              <div className="flex items-center gap-1">
                {FORMATS.map(fmt => (
                  <button
                    key={fmt.value}
                    type="button"
                    onClick={() => {
                      const filename = `${dimension.label.replace(':', 'x')}-${dimension.width}x${dimension.height}`;
                      downloadImage(imageUrl, filename, fmt.value);
                    }}
                    className="flex items-center gap-1 rounded bg-white/90 px-2 py-1 text-[11px] font-semibold text-gray-700 shadow-sm hover:bg-white"
                  >
                    <ArrowDownTrayIcon className="h-3 w-3" />
                    {fmt.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-50">
            <p className="text-[11px] font-medium text-red-500">Generation failed</p>
            <button type="button" className="mt-1 text-[11px] text-blue-600 underline">
              Retry
            </button>
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-[12px] font-medium text-gray-800">{dimension.label}</p>
          <p className="text-[11px] text-gray-400">{dimension.width}×{dimension.height}</p>
        </div>
        <span className={cn(
          'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
          isPending ? 'bg-gray-100 text-gray-400' : '',
          isComplete ? 'bg-green-50 text-green-600' : '',
          status === 'error' ? 'bg-red-50 text-red-500' : '',
        )}>
          {isPending ? 'Generating…' : isComplete ? 'Ready' : 'Failed'}
        </span>
      </div>
    </div>
  );
}
