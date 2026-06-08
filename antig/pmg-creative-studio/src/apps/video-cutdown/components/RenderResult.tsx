import { ArrowDownTrayIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import { Button } from '@agencypmg/alli-design-system';
import type { Angle } from '../types';

interface RenderResultProps {
  mp4Url: string;
  angle: Angle;
  onRestart: () => void;
}

const ANGLE_LABEL: Record<Angle, string> = {
  narrative: 'Narrative',
  highlights: 'Highlights',
  punchy: 'Punchy',
};

export default function RenderResult({ mp4Url, angle, onRestart }: RenderResultProps) {
  return (
    <div className="mx-auto max-w-[820px]">
      {/* Success banner */}
      <div className="mb-6 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5 text-[13px] font-medium text-green-800">
        <CheckCircleIcon className="h-4 w-4 shrink-0 text-green-500" />
        Your reel is ready — {ANGLE_LABEL[angle]} cut · 9:16
      </div>

      <div className="flex flex-col gap-6 md:flex-row">
        {/* LEFT — vertical player */}
        <div className="shrink-0">
          <video
            src={mp4Url}
            controls
            playsInline
            className="mx-auto aspect-[9/16] w-[260px] overflow-hidden rounded-xl border border-gray-200 bg-black shadow-md md:mx-0"
          />
        </div>

        {/* RIGHT — details + actions */}
        <div className="flex-1 rounded-xl border border-gray-200 p-5">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Output</p>
          <dl className="space-y-2 text-[12px]">
            <div className="flex items-start justify-between gap-4">
              <dt className="shrink-0 text-gray-500">Aspect</dt>
              <dd className="text-right font-medium text-gray-900">9:16 (1080×1920)</dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="shrink-0 text-gray-500">Angle</dt>
              <dd className="text-right font-medium text-gray-900">{ANGLE_LABEL[angle]}</dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="shrink-0 text-gray-500">Audio</dt>
              <dd className="text-right font-medium text-gray-900">Track baked in (tail fade)</dd>
            </div>
          </dl>

          <div className="my-4 border-t border-gray-200" />

          <div className="flex flex-wrap items-center gap-3">
            <a
              href={mp4Url}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-blue-700 active:bg-blue-800"
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
              Download MP4
            </a>
            <Button
              variant="secondary"
              icon={<ArrowPathIcon className="alli-h-4 alli-w-4" />}
              onClick={onRestart}
            >
              Start a new cutdown
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
