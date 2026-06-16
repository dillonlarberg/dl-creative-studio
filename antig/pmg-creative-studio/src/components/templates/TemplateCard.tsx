import { Link } from 'react-router-dom';
import { TemplatePreview } from '../../apps/template-builder/_internal/TemplatePreview';
import { SOCIAL_WIREFRAMES } from '../../constants/useCases';
import { CHANNEL_COLORS } from '../../constants/templateColors';
import { formatRelativeDate } from '../../utils/formatRelativeDate';
import type { TemplateLibraryRecord } from '../../services/templateLibrary.types';
import type { ClientAssetHouse } from '../../services/clientAssetHouse';
import { cn } from '../../utils/cn';

export interface TemplateCardProps {
  template: TemplateLibraryRecord;
  clientSlug: string;
  assetHouse?: ClientAssetHouse | null;
  thumbnailHeight?: number;
}

export function TemplateCard({
  template: t,
  clientSlug,
  assetHouse,
  thumbnailHeight = 190,
}: TemplateCardProps) {
  const channelColor = CHANNEL_COLORS[t.channel] ?? 'bg-gray-100 text-gray-600';
  const sizes = t.adSizes
    .map((s) => (s.label ? s.label : `${s.width}×${s.height}`))
    .join(', ');
  const publishedDate = formatRelativeDate(t.publishedAt);
  const fieldCount = Object.keys(t.fieldMappings).length;
  const wireframe = SOCIAL_WIREFRAMES.find((w) => w.id === t.scaffoldId);
  const accentColor = assetHouse?.primaryColor ?? 'transparent';

  return (
    <div
      className="rounded-xl border border-gray-100 bg-white overflow-hidden hover:border-blue-200 hover:shadow-md transition-all flex flex-col border-t-4"
      style={{ borderTopColor: accentColor }}
    >
      {/* Thumbnail */}
      <div
        className="bg-gray-50 border-b border-gray-100 flex items-center justify-center overflow-hidden"
        style={{ height: `${thumbnailHeight}px` }}
      >
        {wireframe ? (
          <TemplatePreview
            templateFile={wireframe.file}
            name={wireframe.name}
            scale={0.18}
            adSize={wireframe.adSize || 1024}
          />
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="h-16 w-16 rounded-xl bg-gray-200" />
            <p className="text-[9px] font-bold text-gray-300 uppercase tracking-widest">No preview</p>
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="p-5 flex flex-col flex-1 gap-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">
            {t.name}
          </p>
          <span
            className={cn(
              'shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest',
              channelColor
            )}
          >
            {t.channel}
          </span>
        </div>

        <div className="space-y-1 flex-1">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest truncate">
            {t.datasourceName || t.datasourceId}
          </p>
          {sizes && <p className="text-[10px] text-gray-400">{sizes}</p>}
          <p className="text-[10px] text-gray-400">
            {fieldCount} {fieldCount === 1 ? 'editable field' : 'editable fields'}
          </p>
          {wireframe && (
            <p className="text-[10px] text-gray-300 truncate">{wireframe.name}</p>
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-gray-50 gap-2">
          {publishedDate && (
            <p className="text-[9px] font-medium text-gray-300 shrink-0">Published {publishedDate}</p>
          )}
          {clientSlug && (
            <div className="ml-auto flex items-center gap-1.5">
              <Link
                to={`/adlabs/${clientSlug}/template-builder?from=${t.id}&copy=1`}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 text-[9px] font-black uppercase tracking-widest hover:border-gray-400 hover:text-gray-700 transition-colors"
              >
                Duplicate
              </Link>
              <Link
                to={`/adlabs/${clientSlug}/template-builder?from=${t.id}`}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-[9px] font-black uppercase tracking-widest hover:bg-gray-700 transition-colors"
              >
                Use Template
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
