import { PlayIcon } from '@heroicons/react/24/solid';
import { CheckIcon } from '@heroicons/react/24/solid';
import { cn } from '../../../utils/cn';
import { fmtTime } from '../utils/fmtTime';
import { useTracks } from '../hooks/useTracks';
import type { TrackView } from '../types';

interface MusicPickerProps {
  selectedTrackId: string | null;
  onPick: (trackId: string) => void;
}

function subtitle(track: TrackView): string {
  return [track.mood ?? '', track.genre ?? ''].filter(Boolean).join(' · ');
}

export default function MusicPicker({ selectedTrackId, onPick }: MusicPickerProps) {
  const { tracks, loading, error } = useTracks();

  return (
    <div className="mx-auto max-w-[820px]">
      {/* Info banner: BPM drives the cut grid */}
      <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3.5 py-2.5 text-[13px] font-medium text-blue-800">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-4 w-4 shrink-0">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
        <span>
          The track&apos;s BPM drives the cut grid — cuts land on the beat, so the reel feels synced. Pick the vibe first.
        </span>
      </div>

      <div className="mt-4 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <p className="mb-2 px-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          Sample soundtracks
        </p>

        {loading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-4 rounded-lg border border-gray-100 bg-white p-3">
                <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-gray-100" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-1/3 animate-pulse rounded bg-gray-100" />
                  <div className="h-2.5 w-1/4 animate-pulse rounded bg-gray-100" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700">
            Couldn&apos;t load soundtracks: {error}
          </div>
        ) : tracks.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-[13px] font-medium text-gray-600">No soundtracks available</p>
            <p className="mt-1 text-[12px] text-gray-400">The sample music library is empty.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {tracks.map((track) => {
              const selected = track.trackId === selectedTrackId;
              return (
                <button
                  key={track.trackId}
                  type="button"
                  onClick={() => onPick(track.trackId)}
                  className={cn(
                    'group relative flex w-full items-center gap-4 rounded-lg border bg-white p-3 text-left shadow-sm transition-all duration-150',
                    selected
                      ? 'border-blue-600 ring-2 ring-blue-600'
                      : 'border-gray-200 hover:border-blue-300 hover:shadow-md',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                      selected
                        ? 'bg-blue-50 text-blue-600'
                        : 'bg-gray-100 text-gray-600 group-hover:bg-blue-50 group-hover:text-blue-600',
                    )}
                  >
                    <PlayIcon className="h-4 w-4 translate-x-px" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-gray-900">{track.title}</span>
                    <span className="mt-0.5 block text-[11px] text-gray-500">{subtitle(track)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="rounded-md bg-gray-100 px-2 py-0.5 font-mono text-[11px] text-gray-600">
                      {track.bpm ?? '?'} BPM
                    </span>
                    <span className="font-mono text-[11px] text-gray-400">{fmtTime(track.durationSec)}</span>
                    {selected && (
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 shadow">
                        <CheckIcon className="h-3 w-3 text-white" />
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
