import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';
import { ArrowLeftIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline';
import { templateLibraryService } from '../services/templateLibrary';
import type { TemplateLibraryRecord } from '../services/templateLibrary.types';
import type { ClientSlug } from '../platform/firebase/paths';
import { cn } from '../utils/cn';

const CHANNEL_COLORS: Record<string, string> = {
  social:       'bg-blue-50 text-blue-700',
  programmatic: 'bg-purple-50 text-purple-700',
  print:        'bg-green-50 text-green-700',
  signage:      'bg-amber-50 text-amber-700',
};

export default function TemplateLibraryPage() {
  usePageTitle('Template Library');
  const { clientSlug } = useParams<{ clientSlug: string }>();
  const [templates, setTemplates] = useState<TemplateLibraryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientSlug) return;
    setIsLoading(true);
    setError(null);
    templateLibraryService
      .getPublishedTemplates(clientSlug as ClientSlug)
      .then(setTemplates)
      .catch((err: unknown) => setError((err as Error).message ?? 'Failed to load templates'))
      .finally(() => setIsLoading(false));
  }, [clientSlug]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <Link
          to={`/adlabs/${clientSlug}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-blue-gray-500 hover:text-blue-600"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to workflows
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-gray-900">Template Library</h1>
        <p className="mt-1 text-sm text-blue-gray-600">
          Published templates ready for use across campaigns.
        </p>
      </div>

      {/* Content card */}
      <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-card">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse rounded-xl border border-gray-100 p-6 space-y-3">
                <div className="h-4 bg-gray-100 rounded w-3/4" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
                <div className="h-3 bg-gray-100 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-red-600 text-center py-8">{error}</p>
        ) : templates.length === 0 ? (
          <div className="text-center py-16">
            <DocumentDuplicateIcon className="h-10 w-10 text-gray-200 mx-auto mb-4" />
            <p className="text-xs font-black uppercase tracking-[0.3em] text-gray-300">
              No templates yet
            </p>
            <p className="mt-2 text-sm text-gray-400">
              Build your first template using the{' '}
              <Link
                to={`/adlabs/${clientSlug}/template-builder`}
                className="text-blue-600 hover:underline"
              >
                Template Builder
              </Link>
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <TemplateCard key={t.id} template={t} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TemplateCard({ template: t }: { template: TemplateLibraryRecord }) {
  const channelColor = CHANNEL_COLORS[t.channel] ?? 'bg-gray-100 text-gray-600';
  const sizes = t.adSizes
    .map((s) => (s.label ? s.label : `${s.width}×${s.height}`))
    .join(', ');
  const publishedDate = t.publishedAt
    ?.toDate()
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="rounded-xl border border-gray-100 p-5 space-y-3 hover:border-blue-200 hover:shadow-sm transition-all">
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

      <div className="space-y-1">
        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest truncate">
          {t.datasourceName || t.datasourceId}
        </p>
        {sizes && (
          <p className="text-[10px] text-gray-400">{sizes}</p>
        )}
        <p className="text-[10px] text-gray-400">
          {Object.keys(t.fieldMappings).length} field{Object.keys(t.fieldMappings).length !== 1 ? 's' : ''} mapped
        </p>
      </div>

      {publishedDate && (
        <p className="text-[9px] font-medium text-gray-300">Published {publishedDate}</p>
      )}
    </div>
  );
}
