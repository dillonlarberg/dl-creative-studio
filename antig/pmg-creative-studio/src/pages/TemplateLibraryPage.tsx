import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';
import { ArrowLeftIcon, DocumentDuplicateIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { templateLibraryService } from '../services/templateLibrary';
import type { TemplateLibraryRecord } from '../services/templateLibrary.types';
import type { ClientSlug } from '../platform/firebase/paths';
import { cn } from '../utils/cn';
import { TemplatePreview } from '../apps/template-builder/_internal/TemplatePreview';
import { SOCIAL_WIREFRAMES } from '../constants/useCases';

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
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState<string>('all');

  const filtered = templates.filter((t) => {
    const matchesSearch = t.name.toLowerCase().includes(search.toLowerCase());
    const matchesChannel = channelFilter === 'all' || t.channel === channelFilter;
    return matchesSearch && matchesChannel;
  });

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
        {/* Search + filter — only shown when templates are loaded */}
        {!isLoading && !error && templates.length > 0 && (
          <div className="flex flex-col gap-3 mb-6">
            {/* Search */}
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search templates…"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-50 outline-none transition-all text-sm text-gray-700 placeholder-gray-300"
              />
            </div>

            {/* Channel pills */}
            <div className="flex flex-wrap gap-2">
              {(['all', 'social', 'programmatic', 'print', 'signage'] as const).map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => { setChannelFilter(ch); setSearch(''); }}
                  className={cn(
                    'px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all',
                    channelFilter === ch
                      ? ch === 'all'
                        ? 'bg-gray-900 text-white'
                        : (CHANNEL_COLORS[ch] ?? 'bg-gray-100 text-gray-600') + ' ring-1 ring-inset ring-current'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  )}
                >
                  {ch === 'all' ? 'All' : ch}
                </button>
              ))}
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-gray-100 overflow-hidden animate-pulse">
                <div className="bg-gray-100" style={{ height: '190px' }} />
                <div className="p-5 space-y-3">
                  <div className="flex justify-between gap-2">
                    <div className="h-4 bg-gray-100 rounded w-3/4" />
                    <div className="h-5 bg-gray-100 rounded-full w-14" />
                  </div>
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                  <div className="h-3 bg-gray-100 rounded w-2/3" />
                  <div className="h-3 bg-gray-100 rounded w-1/3" />
                </div>
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
            {filtered.length === 0 ? (
              <div className="col-span-3 text-center py-12">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-300">
                  No templates match your search
                </p>
              </div>
            ) : (
              filtered.map((t) => (
                <TemplateCard key={t.id} template={t} clientSlug={clientSlug ?? ''} />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TemplateCard({
  template: t,
  clientSlug,
}: {
  template: TemplateLibraryRecord;
  clientSlug: string | undefined;
}) {
  const channelColor = CHANNEL_COLORS[t.channel] ?? 'bg-gray-100 text-gray-600';
  const sizes = t.adSizes
    .map((s) => (s.label ? s.label : `${s.width}×${s.height}`))
    .join(', ');
  const publishedDate = t.publishedAt
    ?.toDate()
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const fieldCount = Object.keys(t.fieldMappings).length;

  const wireframe = SOCIAL_WIREFRAMES.find((w) => w.id === t.scaffoldId);

  return (
    <div className="rounded-xl border border-gray-100 bg-white overflow-hidden hover:border-blue-200 hover:shadow-md transition-all flex flex-col">
      {/* Thumbnail */}
      <div className="bg-gray-50 border-b border-gray-100 flex items-center justify-center overflow-hidden" style={{ height: '190px' }}>
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
            {fieldCount} {fieldCount === 1 ? 'field' : 'fields'} mapped
          </p>
          {wireframe && (
            <p className="text-[10px] text-gray-300 truncate">{wireframe.name}</p>
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-gray-50">
          {publishedDate && (
            <p className="text-[9px] font-medium text-gray-300">Published {publishedDate}</p>
          )}
          {clientSlug && (
            <Link
              to={`/adlabs/${clientSlug}/template-builder?from=${t.id}`}
              className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-[9px] font-black uppercase tracking-widest hover:bg-gray-700 transition-colors"
            >
              Use Template
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
