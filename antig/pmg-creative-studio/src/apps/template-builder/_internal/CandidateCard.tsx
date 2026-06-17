import { cn } from '../../../utils/cn';
import type { Candidate } from '../TemplateBuilderContext';
import { TemplatePreview } from './TemplatePreview';
import { SOCIAL_WIREFRAMES } from '../../../constants/useCases';

export function CandidateCard({
  candidate,
  selected,
  onClick,
}: {
  candidate: Candidate;
  selected: boolean;
  onClick: () => void;
}) {
  const variantColors: Record<string, string> = {
    grid: 'bg-blue-50 text-blue-700',
    stacked: 'bg-purple-50 text-purple-700',
    wide: 'bg-amber-50 text-amber-700',
    minimal: 'bg-gray-100 text-gray-600',
  };

  const wireframe = candidate.wireframeId
    ? SOCIAL_WIREFRAMES.find((w) => w.id === candidate.wireframeId)
    : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-2xl border-2 p-4 transition-all space-y-3',
        selected
          ? 'border-blue-600 bg-blue-50/50 shadow-md shadow-blue-100'
          : 'border-gray-100 hover:border-blue-200 bg-white'
      )}
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <span
          className={cn(
            'text-[11px] font-black uppercase tracking-tight',
            selected ? 'text-blue-900' : 'text-gray-900'
          )}
        >
          {candidate.name}
        </span>
        <span
          className={cn(
            'px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest',
            variantColors[candidate.variant] ?? 'bg-gray-100 text-gray-600'
          )}
        >
          {wireframe ? wireframe.name : candidate.variant}
        </span>
      </div>

      {/* Thumbnail — only render iframe when selected to avoid multiple simultaneous iframes */}
      {selected && wireframe && (
        <div className="rounded-xl overflow-hidden border border-gray-100 bg-gray-50 flex items-center justify-center" style={{ height: `${Math.round((wireframe.adSize || 1024) * 0.2) + 10}px` }}>
          <TemplatePreview
            templateFile={wireframe.file}
            name={wireframe.name}
            scale={0.2}
            adSize={wireframe.adSize || 1024}
          />
        </div>
      )}
      {!selected && wireframe && (
        <div className="rounded-lg bg-gray-50 border border-gray-100 px-2 py-1">
          <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest truncate">
            {wireframe.name}
          </p>
        </div>
      )}

      {/* Description */}
      <p className="text-[9px] text-gray-500 font-medium leading-relaxed line-clamp-2">
        {candidate.description}
      </p>
    </button>
  );
}
