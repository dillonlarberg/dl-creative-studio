/**
 * ReelResult — stage 5: review the finished reel before export.
 *
 * Success: 9:16 <video controls> of the signed reelUrl + Download + Re-stitch.
 * Error (Decision 2 fail-fast): message + Retry → back to arrange (selection kept).
 * v1 never auto-publishes — a human reviews here.
 */
import { ArrowDownTrayIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { cn } from '../../../utils/cn';

interface Props {
  reelUrl: string | null;
  error: string | null;
  assetCount: number;
  onReorder: () => void; // back to arrange
  onRetry: () => void; // re-run stitch
}

export default function ReelResult({ reelUrl, error, assetCount, onReorder, onRetry }: Props) {
  if (error) {
    return (
      <section data-stage="reel" className="py-6">
        <div className="mx-auto max-w-[520px] rounded-2xl border border-amber-200 bg-amber-50 px-6 py-10 text-center">
          <p className="text-[15px] font-semibold text-gray-900">The stitch didn't finish</p>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-gray-600">{error}</p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-blue-700"
            >
              <ArrowPathIcon className="h-4 w-4" />
              Try again
            </button>
            <button
              type="button"
              onClick={onReorder}
              className="text-[13px] font-medium text-gray-600 hover:text-gray-900"
            >
              Back to arrange
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section data-stage="reel" className="py-2">
      <div className="flex flex-col gap-6 md:flex-row">
        <div className="mx-auto w-full max-w-[280px] shrink-0">
          <div className="relative aspect-[9/16] overflow-hidden rounded-2xl bg-blue-gray-900 shadow-elevated">
            {reelUrl && (
              <video src={reelUrl} controls playsInline className="absolute inset-0 h-full w-full" />
            )}
          </div>
        </div>

        <div className="flex-1">
          <p className="text-[15px] font-semibold text-gray-900">Your reel is ready to review</p>
          <p className="mb-4 text-[13px] text-gray-500">
            A human curated and ordered this. Review it before it goes anywhere — v1 never
            auto-publishes.
          </p>

          <div className="mb-4 flex flex-wrap gap-2">
            {['9:16 vertical', 'cuts on the beat', 'motion on statics', `${assetCount} source assets`].map((t) => (
              <span key={t} className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-600">
                {t}
              </span>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <a
              href={reelUrl ?? '#'}
              download
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-blue-700"
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
              Download
            </a>
            <button
              type="button"
              onClick={onReorder}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-gray-700 hover:bg-gray-50"
            >
              <ArrowPathIcon className="h-4 w-4" />
              Re-order / make changes
            </button>
          </div>

          <p className="mt-5 rounded-lg bg-gray-50 px-3 py-2 text-[11px] leading-5 text-gray-400">
            Polished fill (blurred background / outpaint) for off-aspect clips is coming soon. Deferred
            to later milestones: AI asset selection &amp; auto-ordering, "remix our best performers."
          </p>
        </div>
      </div>
    </section>
  );
}
