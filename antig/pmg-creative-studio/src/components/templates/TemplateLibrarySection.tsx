import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DocumentDuplicateIcon, PlusIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import { Button, SectionHeader } from '@agencypmg/alli-design-system';
import { templateLibraryService } from '../../services/templateLibrary';
import type { TemplateLibraryRecord } from '../../services/templateLibrary.types';
import type { ClientSlug } from '../../platform/firebase/paths';
import type { ClientAssetHouse } from '../../services/clientAssetHouse';
import { TemplateCard } from './TemplateCard';
import { TemplateCardSkeleton } from './TemplateCardSkeleton';

interface TemplateLibrarySectionProps {
  clientSlug: string;
  assetHouse?: ClientAssetHouse | null;
}

const DASHBOARD_PREVIEW_COUNT = 3;

export function TemplateLibrarySection({ clientSlug, assetHouse }: TemplateLibrarySectionProps) {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<TemplateLibraryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientSlug) return;
    setIsLoading(true);
    setError(null);
    templateLibraryService
      .getPublishedTemplates(clientSlug as ClientSlug)
      .then((all) => setTemplates(all))
      .catch((err: unknown) => setError((err as Error).message ?? 'Failed to load templates'))
      .finally(() => setIsLoading(false));
  }, [clientSlug]);

  const preview = templates.slice(0, DASHBOARD_PREVIEW_COUNT);
  const totalCount = templates.length;

  const actions = (
    <div className="flex items-center gap-2">
      {!isLoading && totalCount > 0 && (
        <Button
          variant="text"
          icon={<ArrowRightIcon className="h-3.5 w-3.5" />}
          iconRight
          onClick={() => navigate(`/adlabs/${clientSlug}/templates`)}
        >
          View all {totalCount} templates
        </Button>
      )}
      <Button
        variant="primary"
        icon={<PlusIcon className="h-4 w-4" />}
        onClick={() => navigate(`/adlabs/${clientSlug}/template-builder`)}
      >
        New Template
      </Button>
    </div>
  );

  return (
    <div className="mt-6 pt-6 border-t border-gray-100">
      <SectionHeader title="Ad Templates" actions={actions} />

      <div className="mt-4">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => <TemplateCardSkeleton key={i} />)}
          </div>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <DocumentDuplicateIcon className="h-10 w-10 text-gray-200" />
            <p className="text-xs font-black uppercase tracking-[0.3em] text-gray-300">
              No templates yet
            </p>
            <p className="text-sm text-gray-400">
              Build your first ad template to start producing faster across campaigns.
            </p>
            <Button
              variant="primary"
              icon={<PlusIcon className="h-4 w-4" />}
              onClick={() => navigate(`/adlabs/${clientSlug}/template-builder`)}
            >
              Build Your First Template
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {preview.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                clientSlug={clientSlug}
                assetHouse={assetHouse}
                thumbnailHeight={120}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
