import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ComponentType, SVGProps } from 'react';
import {
  ExclamationTriangleIcon,
  Squares2X2Icon,
  ClockIcon,
  ArrowRightIcon,
  ArrowsPointingOutIcon,
  RectangleGroupIcon,
  CpuChipIcon,
  FilmIcon,
} from '@heroicons/react/24/outline';
import { useClientBootstrap } from '../hooks/useClientBootstrap';
import { useCurrentUser } from '../auth/useCurrentUser';
import { isInternalUser } from '../auth/isInternalUser';
import { getRegistry } from '../apps/_registry';
import type { AppManifest } from '../apps/types';
import { batchService, type BatchRecord } from '../services/batches';
import type { AppId } from '../platform/firebase/paths';

/**
 * AdLabs Dashboard v1 — Step 1 of plan.
 *
 * Mounted at /adlabs/:clientSlug/. Restyled to match Alli platform aesthetic:
 * module-card pattern (title + content inside one outer card), Inter weights,
 * platform color tokens. Data plumbing unchanged.
 */

const ACTIVE_STATUSES: BatchRecord['status'][] = ['pending', 'processing'];

function useActiveBatches(
  clientSlug: string | null,
  appIds: AppId[]
): { batches: BatchRecord[]; loading: boolean; error: Error | null } {
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const appIdsKey = appIds.join(',');

  useEffect(() => {
    let cancelled = false;
    if (!clientSlug || appIds.length === 0) {
      setBatches([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    Promise.all(
      appIds.map((id) =>
        batchService
          .listActiveBatchesForClient(clientSlug, id)
          .catch(() => [] as BatchRecord[])
      )
    )
      .then((results) => {
        if (cancelled) return;
        const flat = results.flat().filter((b) => ACTIVE_STATUSES.includes(b.status));
        flat.sort((a, b) => {
          const at = a.createdAt?.toMillis?.() ?? 0;
          const bt = b.createdAt?.toMillis?.() ?? 0;
          return bt - at;
        });
        setBatches(flat);
        setLoading(false);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setBatches([]);
        setLoading(false);
        setError(err instanceof Error ? err : new Error(String(err)));
      });
    return () => {
      cancelled = true;
    };
  }, [clientSlug, appIdsKey]);

  return { batches, loading, error };
}

export default function DashboardPage() {
  const { clientSlug } = useParams<{ clientSlug?: string }>();
  const navigate = useNavigate();
  const { client, isReady, loading, error } = useClientBootstrap({
    urlSlug: clientSlug ?? null,
  });
  const user = useCurrentUser();
  const internal = isInternalUser(user);

  if (!loading && !client) {
    navigate('/select-client', { replace: true });
    return null;
  }

  const registry: readonly AppManifest[] = getRegistry();

  const liveAppIds = registry
    .filter((m) => (m.status ?? 'live') === 'live')
    .map((m) => m.id);
  const {
    batches: activeBatches,
    loading: batchesLoading,
    error: batchesError,
  } = useActiveBatches(client?.slug ?? null, liveAppIds);

  return (
    <div className="flex flex-col gap-4" data-testid="adlabs-dashboard">
      {error && (
        <div
          role="alert"
          data-testid="bootstrap-error"
          className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-red-600" />
          <div>
            <p className="font-medium">Couldn&apos;t load brand standards</p>
            <p className="mt-0.5">The dashboard is still functional — refresh to retry the load.</p>
          </div>
        </div>
      )}

      {/* Apps module */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-card" aria-labelledby="apps-heading">
        <div className="flex flex-col gap-0.5">
          <h2 id="apps-heading" className="text-base font-medium text-gray-900">Apps</h2>
          <p className="text-[13px] text-gray-500">Workflows live in this Studio. More land as the modular foundation lets us build them in isolation.</p>
        </div>
        <ul
          className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2"
          data-testid="adlabs-apps-grid"
        >
          {registry.map((manifest) => {
            const disabled = !!manifest.requiresBrandStandards && !isReady;
            const href = client?.slug
              ? `/adlabs/${client.slug}/${manifest.basePath}/`
              : '#';
            return (
              <li key={manifest.id}>
                <AppCard
                  manifest={manifest}
                  href={href}
                  disabled={disabled}
                />
              </li>
            );
          })}
        </ul>
      </section>


      {/* Active Batch Jobs module — internal-only */}
      {internal && (
        <section
          aria-labelledby="active-batches-heading"
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-card"
          data-testid="active-batch-jobs"
        >
          <div className="flex flex-col gap-0.5">
            <h2 id="active-batches-heading" className="text-base font-medium text-gray-900">Active batch jobs</h2>
            <p className="text-[13px] text-gray-500">In-flight renders for {client?.name ?? client?.slug ?? 'this client'}.</p>
          </div>

          <div className="mt-4">
            {batchesLoading && (
              <p
                data-testid="active-batches-loading"
                className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-[13px] text-gray-500"
              >
                Loading active batches…
              </p>
            )}

            {!batchesLoading && batchesError && (
              <p
                data-testid="active-batches-error"
                role="alert"
                className="rounded-lg border border-red-100 bg-red-50 p-4 text-[13px] text-red-700"
              >
                Couldn&apos;t load batches. Refresh to retry.
              </p>
            )}

            {!batchesLoading && !batchesError && activeBatches.length === 0 && (
              <p
                data-testid="active-batches-empty"
                className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-[13px] text-gray-500"
              >
                No active batches.
              </p>
            )}

            {!batchesLoading && !batchesError && activeBatches.length > 0 && (
              <ul className="flex flex-col gap-2" data-testid="active-batches-list">
                {activeBatches.map((b) => (
                  <li
                    key={b.id}
                    data-testid={`active-batch-${b.id}`}
                    className="relative flex items-center gap-3 overflow-hidden rounded-lg border border-gray-200 bg-white px-5 py-3"
                  >
                    <span className="absolute inset-y-3 left-0 w-[3px] rounded-r-sm bg-blue-600" aria-hidden="true" />
                    <ClockIcon className="h-4 w-4 text-gray-400" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-[13px] font-medium text-gray-900">
                        {b.feedName ?? b.templateId}
                      </p>
                      <p className="truncate text-xs text-gray-500">
                        {b.appId} · {b.status} · {b.completedVariations}/{b.totalVariations}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

const APP_META: Record<string, { icon: ComponentType<SVGProps<SVGSVGElement>>; formats: string[] }> = {
  'ad-resizing': { icon: ArrowsPointingOutIcon, formats: ['JPEG', 'PNG'] },
  'template-builder': { icon: RectangleGroupIcon, formats: ['HTML', 'JPEG'] },
  'batch-variants': { icon: CpuChipIcon, formats: ['JPEG'] },
  'video-cutdown': { icon: FilmIcon, formats: ['MP4'] },
};

interface AppCardProps {
  manifest: AppManifest;
  href: string;
  disabled: boolean;
}

function AppCard({ manifest, href, disabled }: AppCardProps) {
  const meta = APP_META[manifest.id];
  const Icon = meta?.icon ?? Squares2X2Icon;
  const formats = meta?.formats ?? [];

  const dataAttrs = {
    'data-testid': `app-card-${manifest.id}`,
    'data-disabled': disabled ? 'true' : 'false',
    'data-status': manifest.status ?? 'live',
  };

  const baseClass =
    'group relative flex h-full flex-col rounded-lg border border-gray-200 bg-white p-4 transition-colors';

  const iconEl = (
    <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${disabled ? 'bg-gray-100' : 'bg-blue-50 group-hover:bg-blue-100'} transition-colors`}>
      <Icon className={`h-5 w-5 ${disabled ? 'text-gray-400' : 'text-blue-600'}`} />
    </div>
  );

  if (disabled) {
    return (
      <div
        {...dataAttrs}
        className={`${baseClass} cursor-not-allowed bg-gray-50`}
      >
        {iconEl}
        <p className="text-[14px] font-semibold text-gray-700">{manifest.title}</p>
        {manifest.description && (
          <p className="mt-1 text-[12px] leading-relaxed text-gray-400">{manifest.description}</p>
        )}
        {formats.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {formats.map(f => (
              <span key={f} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-400">{f}</span>
            ))}
          </div>
        )}
        <div className="mt-auto flex items-start gap-1.5 pt-3">
          <ExclamationTriangleIcon className="mt-px h-3.5 w-3.5 shrink-0 text-amber-500" />
          <p className="text-[11px] leading-snug text-amber-700">
            Brand standards required.{' '}
            <Link
              to="/client-asset-house"
              className="font-medium underline underline-offset-2 hover:text-amber-900"
              onClick={e => e.stopPropagation()}
            >
              Set up in Client Asset House
            </Link>{' '}
            to unlock.
          </p>
        </div>
      </div>
    );
  }

  return (
    <Link
      to={href}
      {...dataAttrs}
      className={`${baseClass} hover:border-blue-200 hover:bg-blue-50/20`}
    >
      {iconEl}
      <p className="text-[14px] font-semibold text-gray-900">{manifest.title}</p>
      {manifest.description && (
        <p className="mt-1 text-[12px] leading-relaxed text-gray-500">{manifest.description}</p>
      )}
      {formats.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {formats.map(f => (
            <span key={f} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">{f}</span>
          ))}
        </div>
      )}
      <span className="mt-auto inline-flex items-center gap-1 pt-3 text-[12px] font-semibold text-blue-600 group-hover:text-blue-700">
        {manifest.status === 'preview' ? 'Preview' : 'Open'}
        <ArrowRightIcon className="h-3 w-3" />
      </span>
    </Link>
  );
}
