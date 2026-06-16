import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DocumentDuplicateIcon, PlusIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import { Button } from '@agencypmg/alli-design-system';
import { templateLibraryService } from '../../services/templateLibrary';
import type { ClientSlug } from '../../platform/firebase/paths';

interface TemplateLibrarySectionProps {
  clientSlug: string;
}

export function TemplateLibrarySection({ clientSlug }: TemplateLibrarySectionProps) {
  const navigate = useNavigate();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!clientSlug) return;
    templateLibraryService
      .getPublishedTemplates(clientSlug as ClientSlug)
      .then((all) => setCount(all.length))
      .catch(() => setCount(null));
  }, [clientSlug]);

  return (
    <div className="mt-6 pt-6 border-t border-gray-100 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <DocumentDuplicateIcon className="h-5 w-5 text-gray-300 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-gray-800">Ad Templates</p>
          <p className="text-xs text-gray-400">
            {count === null ? 'Loading…' : count === 0 ? 'No templates yet' : `${count} published template${count === 1 ? '' : 's'}`}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {count !== null && count > 0 && (
          <Button
            variant="secondary"
            icon={<ArrowRightIcon className="h-3.5 w-3.5" />}
            iconRight
            onClick={() => navigate(`/adlabs/${clientSlug}/templates`)}
          >
            View Templates
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
    </div>
  );
}
