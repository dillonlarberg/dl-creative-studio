import { ArrowRightIcon } from '@heroicons/react/24/outline';
import { SparklesIcon } from '@heroicons/react/24/solid';
import { Button } from '@agencypmg/alli-design-system';
import VersionCard from './VersionCard';
import type { Angle, BatchDoc, VersionDoc } from '../types';

interface VersionsBoardProps {
  batch: BatchDoc | null;
  versions: VersionDoc[];
  selectedAngle: Angle | null;
  onSelect: (a: Angle) => void;
  onRender: () => void;
  rendering: boolean;
}

/** Render order for the three angles, regardless of arrival order. */
const ANGLE_ORDER: Angle[] = ['narrative', 'highlights', 'punchy'];

function statusHeadline(batch: BatchDoc | null, versions: VersionDoc[]): string {
  if (versions.length === 0) return 'Analyzing your video…';
  if (versions.some((v) => v.status === 'thumbing')) return 'Generating your versions…';
  if (batch?.status === 'failed') return 'Generation failed';
  return 'Pick a version';
}

export default function VersionsBoard({
  batch,
  versions,
  selectedAngle,
  onSelect,
  onRender,
  rendering,
}: VersionsBoardProps) {
  const headline = statusHeadline(batch, versions);
  const anyPending = versions.length === 0 || versions.some((v) => v.status === 'thumbing');

  // Order versions narrative → highlights → punchy; only those that have arrived.
  const ordered = ANGLE_ORDER.map((angle) => versions.find((v) => v.angle === angle)).filter(
    (v): v is VersionDoc => Boolean(v),
  );

  const selectedVersion = versions.find((v) => v.angle === selectedAngle);
  const canRender = !rendering && !!selectedVersion && selectedVersion.status === 'ready';

  return (
    <div className="mx-auto max-w-[1100px]">
      {/* Status header */}
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          {anyPending && (
            <div className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-500" />
          )}
          <div>
            <h2 className="text-[15px] font-semibold text-gray-900">{headline}</h2>
            <p className="mt-0.5 text-[12px] text-gray-500">
              Three complete cuts, same footage, different angle. Compare and pick one.
            </p>
          </div>
        </div>
      </div>

      {/* Context strip */}
      {batch && (
        <div className="mb-4 rounded-xl border border-gray-200 p-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-gray-500">
            <span>
              <span className="font-medium text-gray-700">Source</span> {batch.sourceName}
            </span>
            <span className="text-gray-300">·</span>
            <span>
              <span className="font-medium text-gray-700">Track</span> {batch.trackTitle}
              {batch.bpm != null && ` · ${batch.bpm} BPM`}
            </span>
            <span className="text-gray-300">·</span>
            <span>
              <span className="font-medium text-gray-700">Target</span> {batch.targetSec}s · 9:16
            </span>
          </div>
        </div>
      )}

      {/* Version cards */}
      {ordered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-indigo-100 bg-gradient-to-b from-indigo-50/60 to-white py-16 text-center">
          {/* Ask Alli — orbiting sparkles (mirrors the regenerate animation) */}
          <div className="relative flex h-12 w-12 items-center justify-center">
            <div className="alli-breathe">
              <SparklesIcon className="h-7 w-7 text-indigo-600" />
            </div>
            <div className="absolute alli-orbit-a">
              <SparklesIcon className="h-3 w-3 text-violet-500" />
            </div>
            <div className="absolute alli-orbit-b">
              <SparklesIcon className="h-2.5 w-2.5 text-indigo-400" />
            </div>
            <div className="absolute alli-orbit-c">
              <SparklesIcon className="h-2 w-2 text-violet-300" />
            </div>
          </div>
          <p className="mt-5 text-[14px] font-medium text-gray-800">Alli is cutting three ways</p>
          <p className="mt-1 max-w-xs text-[13px] text-indigo-500">
            Versions appear here as Alli finishes each angle.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {ordered.map((version) => (
            <VersionCard
              key={version.angle}
              version={version}
              selected={selectedAngle === version.angle}
              selectable={version.status === 'ready'}
              onSelect={() => onSelect(version.angle)}
            />
          ))}
        </div>
      )}

      {/* Footer action */}
      <div className="mt-6 flex items-center justify-end border-t border-gray-200 pt-4">
        <Button
          variant="primary"
          disabled={!canRender}
          loading={rendering}
          onClick={onRender}
          icon={rendering ? undefined : <ArrowRightIcon className="alli-h-4 alli-w-4" />}
        >
          {rendering ? 'Rendering…' : 'Render this version'}
        </Button>
      </div>
    </div>
  );
}
