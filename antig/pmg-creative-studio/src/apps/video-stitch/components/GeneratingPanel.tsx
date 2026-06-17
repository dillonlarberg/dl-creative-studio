/**
 * GeneratingPanel — stage 4: indeterminate "stitching" state.
 *
 * Decision 2: no live checklist (we dropped the Firestore subscription); the promise
 * is the source of truth. Show a calm indeterminate animation + the honest framing
 * ("mechanical work, no creative decisions") until generate() resolves or rejects.
 */
import { SparklesIcon } from '@heroicons/react/24/solid';

export default function GeneratingPanel() {
  return (
    <section data-stage="run" className="py-6">
      <div className="mx-auto max-w-[520px] rounded-2xl border border-indigo-100 bg-gradient-to-b from-indigo-50/60 to-white px-6 py-10 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center">
          <span className="absolute h-14 w-14 animate-ping rounded-full bg-indigo-200/60" />
          <SparklesIcon className="relative h-7 w-7 animate-pulse text-indigo-600" />
        </div>
        <p className="text-[15px] font-semibold text-gray-900">Stitching your reel…</p>
        <p className="mt-1 text-[12px] text-gray-500">
          This is mechanical work — no creative decisions. ~20–40s.
        </p>
        <div className="mx-auto mt-5 h-1 w-40 overflow-hidden rounded-full bg-indigo-100">
          <div className="h-full w-1/3 animate-[shimmer_1.4s_ease-in-out_infinite] rounded-full bg-indigo-500" />
        </div>
      </div>
    </section>
  );
}
