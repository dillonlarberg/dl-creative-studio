/**
 * SourceTile — one creative in the picker masonry.
 *
 * D1: loads a media element (<img> for images, muted <video preload="metadata">
 * first-frame for videos) — onLoad/onLoadedMetadata reports real dimensions up so
 * the parent can badge off-aspect (Decision 5). On load failure → gradient + play
 * icon fallback. D2: `unusable` assets render dimmed + not selectable.
 */
import { useState } from 'react';
import { cn } from '../../../utils/cn';
import type { PickedAsset } from '../types';

interface Props {
  asset: PickedAsset;
  order: number | null; // 1-based position when selected
  unusable: boolean; // failed pre-validation (HLS / non-direct)
  offAspect: boolean; // will letterbox
  onToggle: () => void;
  onDims: (w: number, h: number) => void;
}

export default function SourceTile({ asset, order, unusable, offAspect, onToggle, onDims }: Props) {
  const [failed, setFailed] = useState(false);
  const selected = order !== null;
  const isVideo = asset.kind === 'video';

  return (
    <button
      type="button"
      onClick={unusable ? undefined : onToggle}
      disabled={unusable}
      aria-pressed={selected}
      aria-label={`${asset.name}${unusable ? ' (unsupported format)' : ''}`}
      title={unusable ? 'Unsupported format — pick a direct video file (.mp4/.mov/.webm)' : asset.name}
      className={cn(
        'group relative mb-3 block w-full break-inside-avoid overflow-hidden rounded-lg border bg-white text-left shadow-sm transition-all',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
        selected
          ? 'border-blue-600 ring-2 ring-blue-600'
          : 'border-gray-200 hover:border-blue-300 hover:shadow-md',
        unusable && 'cursor-not-allowed opacity-40',
      )}
    >
      <div className="relative w-full">
        {failed ? (
          <div className="flex aspect-[9/16] items-center justify-center bg-gradient-to-br from-blue-gray-700 to-blue-gray-900">
            {isVideo && <PlayIcon className="h-8 w-8 text-white/85" />}
          </div>
        ) : isVideo ? (
          <video
            src={asset.srcUrl}
            muted
            playsInline
            preload="metadata"
            onLoadedMetadata={(e) => onDims(e.currentTarget.videoWidth, e.currentTarget.videoHeight)}
            onError={() => setFailed(true)}
            className="block w-full bg-blue-gray-100"
          />
        ) : (
          <img
            src={asset.srcUrl}
            alt=""
            loading="lazy"
            onLoad={(e) => onDims(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
            onError={() => setFailed(true)}
            className="block w-full bg-blue-gray-100"
          />
        )}

        {isVideo && !failed && !unusable && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/85 text-gray-800 shadow">
              <PlayIcon className="h-4 w-4 translate-x-px" />
            </span>
          </span>
        )}

        {offAspect && !unusable && (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
            letterboxed
          </span>
        )}

        {unusable && (
          <span className="absolute inset-x-1.5 bottom-1.5 rounded bg-amber-500/90 px-1.5 py-0.5 text-center text-[9px] font-semibold uppercase tracking-wide text-white">
            Unsupported
          </span>
        )}

        {selected && (
          <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white shadow">
            {order}
          </span>
        )}
      </div>

      <div className="px-2.5 py-2">
        <p className="truncate text-[12px] font-medium text-gray-900">{asset.name}</p>
        <p className="mt-0.5 text-[10px] capitalize text-gray-400">
          {asset.channel ? `${asset.channel} · ` : ''}
          {asset.kind}
        </p>
      </div>
    </button>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
