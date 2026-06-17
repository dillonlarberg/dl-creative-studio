/**
 * MusicPicker — stage 3: pick the soundtrack. The track's BPM drives the beat
 * grid the cuts snap to. Ported (slim) from video-cutdown's MusicPicker; tracks
 * come from the shared catalog via useStitchTracks.
 */
import { PlayIcon, CheckIcon } from '@heroicons/react/24/solid';
import { cn } from '../../../utils/cn';
import { useStitchTracks, type StitchTrack } from '../hooks/useStitchTracks';

interface Props {
  selectedTrackId: string | null;
  onPick: (trackId: string) => void;
  onBack: () => void;
  onStitch: () => void;
}

function subtitle(t: StitchTrack): string {
  return [t.mood ?? '', t.genre ?? ''].filter(Boolean).join(' · ');
}

export default function MusicPicker({ selectedTrackId, onPick, onBack, onStitch }: Props) {
  const { tracks, loading, error } = useStitchTracks();

  return (
    <section data-stage="music" className="mx-auto max-w-[820px]">
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3.5 py-2.5 text-[13px] font-medium text-blue-800">
        <PlayIcon className="h-4 w-4 shrink-0" />
        <span>The track's BPM drives the cut grid — cuts land on the beat, so the reel feels synced.</span>
      </div>

      <div className="rounded-xl border border-gray-200 p-3">
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
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-800">
            Couldn't load soundtracks: {error}
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
                  aria-pressed={selected}
                  className={cn(
                    'group relative flex w-full items-center gap-4 rounded-lg border bg-white p-3 text-left shadow-sm transition-all',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
                    selected ? 'border-blue-600 ring-2 ring-blue-600' : 'border-gray-200 hover:border-blue-300 hover:shadow-md',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                      selected ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-600 group-hover:bg-blue-50 group-hover:text-blue-600',
                    )}
                  >
                    <PlayIcon className="h-4 w-4 translate-x-px" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-gray-900">{track.title}</span>
                    <span className="mt-0.5 block text-[11px] text-gray-500">{subtitle(track)}</span>
                  </span>
                  <span className="rounded-md bg-gray-100 px-2 py-0.5 font-mono text-[11px] text-gray-600">
                    {track.bpm ?? '?'} BPM
                  </span>
                  <span
                    className={cn(
                      'ml-1 flex h-6 w-6 items-center justify-center rounded-full',
                      selected ? 'bg-blue-600 text-white' : 'border border-gray-300 text-transparent',
                    )}
                  >
                    <CheckIcon className="h-3 w-3" />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-500 hover:text-gray-800">
          Back to arrange
        </button>
        <button
          type="button"
          onClick={onStitch}
          disabled={!selectedTrackId}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-colors',
            selectedTrackId ? 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800' : 'cursor-not-allowed bg-gray-100 text-gray-400',
          )}
        >
          Stitch the reel
        </button>
      </div>
    </section>
  );
}
