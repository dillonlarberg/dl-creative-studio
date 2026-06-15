import { CheckIcon } from '@heroicons/react/24/solid';
import { cn } from '../../../utils/cn';
import { fmtTime } from '../utils/fmtTime';
import { useStorageUrl } from '../hooks/useStorageUrl';
import type { Angle, VersionDoc } from '../types';

interface VersionCardProps {
  version: VersionDoc;
  selected: boolean;
  selectable: boolean;
  onSelect: () => void;
}

const ANGLE_META: Record<Angle, { label: string; tag: string }> = {
  narrative: { label: 'Narrative', tag: 'Story arc' },
  highlights: { label: 'Highlights', tag: 'Best beats' },
  punchy: { label: 'Punchy', tag: 'Fast & loud' },
};

/**
 * A single storyboard slot. Resolves its thumb Storage path to a URL via
 * useStorageUrl (hook must be called unconditionally per slot, hence the
 * dedicated component). Renders a shimmer placeholder until the thumb path
 * exists AND the URL resolves, so frames fill in progressively as the backend
 * grows `version.thumbs`.
 */
function ThumbSlot({ path, label }: { path: string | undefined; label: string }) {
  const url = useStorageUrl(path ?? null);
  return (
    <div className="min-w-0 flex-1">
      <div className="relative aspect-[9/16] overflow-hidden rounded-md border border-gray-200 bg-gray-100">
        {path && url ? (
          <img src={url} alt={label} className="h-full w-full object-cover" />
        ) : (
          <div className="shimmer-tile absolute inset-0 bg-gradient-to-b from-gray-100 to-gray-200" />
        )}
      </div>
      {label && <p className="mt-1 truncate text-center text-[8px] text-gray-400">{label}</p>}
    </div>
  );
}

export default function VersionCard({ version, selected, selectable, onSelect }: VersionCardProps) {
  const meta = ANGLE_META[version.angle];
  const isFailed = version.status === 'failed';
  const isThumbing = version.status === 'thumbing';
  const clickable = selectable && !isFailed;

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={() => clickable && onSelect()}
      className={cn(
        'group relative flex flex-col rounded-lg border bg-white p-4 text-left shadow-sm transition-all duration-150',
        isFailed
          ? 'cursor-not-allowed border-red-200 opacity-80'
          : selected
            ? 'border-blue-600 ring-2 ring-blue-600'
            : clickable
              ? 'border-gray-200 hover:border-blue-300 hover:shadow-md'
              : 'cursor-default border-gray-200',
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-semibold text-gray-900">{meta.label}</span>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-medium',
              selected ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500',
            )}
          >
            {meta.tag}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {clickable && (
            <span className={cn('text-[10px] font-medium', selected ? 'text-blue-600' : 'text-gray-400')}>
              {selected ? '● picked' : '○ pick'}
            </span>
          )}
          {selected ? (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 shadow">
              <CheckIcon className="h-3 w-3 text-white" />
            </span>
          ) : (
            !isFailed && <span className="h-5 w-5 rounded-full border-2 border-gray-300" />
          )}
        </div>
      </div>

      {/* Meta line */}
      <p className="mt-1 font-mono text-[11px] text-gray-500">
        {version.cuts.length} cut{version.cuts.length !== 1 ? 's' : ''}
        {isThumbing && (
          <span className="ml-2 inline-flex items-center gap-1 text-blue-500">
            <span className="h-2.5 w-2.5 animate-spin rounded-full border border-blue-300 border-t-blue-600" />
            generating…
          </span>
        )}
        {isFailed && <span className="ml-2 text-red-500">failed</span>}
      </p>

      {/* Storyboard strip — one slot per cut, thumbs fill in progressively */}
      {version.cuts.length > 0 && (
        <div className="mt-3 flex gap-1.5">
          {version.cuts.map((cut, i) => (
            <ThumbSlot key={i} path={version.thumbs[i]} label={cut.role ?? ''} />
          ))}
        </div>
      )}

      {/* AI pitch */}
      {version.description && (
        <blockquote className="mt-3 rounded-md border-l-2 border-blue-300 bg-blue-50/60 px-3 py-2 text-[12px] italic leading-relaxed text-gray-700">
          <span className="mb-1 block text-[9px] font-semibold not-italic uppercase tracking-wider text-blue-500">
            AI pitch
          </span>
          {version.description}
        </blockquote>
      )}

      {isFailed && (
        <div className="mt-3 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-[12px] text-red-600">
          This version failed to generate and can&apos;t be selected. Try another angle.
        </div>
      )}

      {/* Cut list */}
      {version.cuts.length > 0 && (
        <>
          <p className="mb-1.5 mt-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Cut list</p>
          <div className="space-y-2">
            {version.cuts.map((cut, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px]">
                <span className="shrink-0 font-mono text-gray-400">
                  {fmtTime(cut.srcIn)}–{fmtTime(cut.srcOut)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-700">{cut.summary ?? cut.role ?? ''}</span>
                    {cut.role && (
                      <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-gray-500">
                        {cut.role}
                      </span>
                    )}
                    <span className="ml-auto shrink-0 font-mono text-[10px] text-gray-400">
                      {(cut.score ?? 0).toFixed(2)}
                    </span>
                  </div>
                  {cut.why && <p className="mt-0.5 italic leading-snug text-gray-400">{cut.why}</p>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </button>
  );
}
