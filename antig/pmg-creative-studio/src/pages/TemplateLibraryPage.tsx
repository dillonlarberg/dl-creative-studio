import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';
import { ArrowLeftIcon, DocumentDuplicateIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { templateLibraryService } from '../services/templateLibrary';
import type { TemplateLibraryRecord } from '../services/templateLibrary.types';
import type { ClientSlug } from '../platform/firebase/paths';
import { cn } from '../utils/cn';
import { CHANNEL_COLORS } from '../constants/templateColors';
import { TemplateCard } from '../components/templates/TemplateCard';
import { TemplateCardSkeleton } from '../components/templates/TemplateCardSkeleton';

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
            {[1, 2, 3].map((i) => <TemplateCardSkeleton key={i} />)}
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
