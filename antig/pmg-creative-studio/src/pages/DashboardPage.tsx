import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ExclamationTriangleIcon,
  Squares2X2Icon,
  ClockIcon,
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
 * Replaces the legacy CreatePage. Renders:
 *   - Greeting + thesis banner
 *   - Apps grid (registry-driven, brand-standards gated per manifest)
 *   - Coming-soon shelf for apps not yet registered
 *   - Active Batch Jobs section (mocked, internal-only in v1)
 *   - Brand-standards warning banner when the asset house gate fails
 *
 * Mounted at /adlabs/:clientSlug/. The :clientSlug param is the source of
 * truth — useClientBootstrap resolves it through to the client + asset house
 * + Alli cache warm. localStorage write-back lives in AppLayout's reconcile
 * useEffect (Step 0).
 */

interface ComingSoonEntry {
  id: string;
  title: string;
  description: string;
}

const COMING_SOON_SHELF: ComingSoonEntry[] = [
  // Resize Image was promoted to a registered app skeleton (Annie).
  {
    id: 'edit-tweak',
    title: 'Edit & Tweak',
    description:
      'Fast text and asset swaps on a live template — no HTML round-trips.',
  },
];

// Step 4: Active Batch Jobs reads from path-scoped Firestore. The app aggregates
// across every registered live app's batches collection. Active = status in
// {pending, processing}.
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
          // createdAt is a Firestore Timestamp; fallback to 0 if missing.
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

function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'Good Morning';
  if (h < 18) return 'Good Afternoon';
  return 'Good Evening';
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
    // No URL slug + no localStorage. AppLayout's redirect guard normally
    // catches this, but the dashboard double-checks so a direct hit on
    // /adlabs/ never renders an empty shell.
    navigate('/select-client', { replace: true });
    return null;
  }

  const registry: readonly AppManifest[] = getRegistry();
  const userName = user?.displayName ?? user?.email?.split('@')[0] ?? 'there';

  // Step 4: only query live apps (preview manifests have no batches).
  const liveAppIds = registry
    .filter((m) => (m.status ?? 'live') === 'live')
    .map((m) => m.id);
  const {
    batches: activeBatches,
    loading: batchesLoading,
    error: batchesError,
  } = useActiveBatches(client?.slug ?? null, liveAppIds);

  return (
    <div className="space-y-8" data-testid="adlabs-dashboard">
      {/* Header */}
      <header className="space-y-2">
        <p
          className="text-xs font-black uppercase tracking-[0.3em] text-blue-600"
          data-testid="adlabs-thesis-banner"
        >
          Dynamic templates for dynamic feeds.
        </p>
        <h1 className="text-2xl font-semibold text-gray-900">
          {greeting()}, {userName}!
        </h1>
        <p className="text-sm text-blue-gray-500">
          {client?.name ?? client?.slug ?? '...'}
        </p>
      </header>

      {/* Brand-standards warning banner — preserves CreatePage UX */}
      {!loading && !isReady && !error && (
        <div
          role="alert"
          data-testid="brand-standards-warning"
          className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold">Brand standards required</p>
            <p className="mt-0.5">
              Set up brand standards in{' '}
              <Link to="/client-asset-house" className="font-semibold underline">
                Client Asset House
              </Link>{' '}
              to unlock the gated apps below.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div
          role="alert"
          data-testid="bootstrap-error"
          className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-red-600" />
          <div>
            <p className="font-semibold">
              Couldn&apos;t load brand standards
            </p>
            <p className="mt-0.5">
              The dashboard is still functional — refresh to retry the load.
            </p>
          </div>
        </div>
      )}

      {/* Apps grid */}
      <section aria-labelledby="apps-heading" className="space-y-4">
        <h2
          id="apps-heading"
          className="text-xs font-black uppercase tracking-[0.3em] text-blue-gray-500"
        >
          Apps
        </h2>
        <ul
          className="grid grid-cols-1 gap-4 md:grid-cols-2"
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

      {/* Coming-soon shelf */}
      <section aria-labelledby="coming-soon-heading" className="space-y-4">
        <h2
          id="coming-soon-heading"
          className="text-xs font-black uppercase tracking-[0.3em] text-blue-gray-500"
        >
          Coming soon
        </h2>
        <ul
          className="grid grid-cols-1 gap-3 md:grid-cols-2"
          data-testid="adlabs-coming-soon-shelf"
        >
          {COMING_SOON_SHELF.map((entry) => (
            <li
              key={entry.id}
              data-testid={`coming-soon-${entry.id}`}
              data-disabled="true"
              className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 opacity-70"
            >
              <Squares2X2Icon className="h-5 w-5 shrink-0 text-blue-gray-400" />
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {entry.title}
                </p>
                <p className="mt-0.5 text-xs text-blue-gray-500">
                  {entry.description}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Active Batch Jobs — real Firestore-backed (Step 4), internal-only gate */}
      {internal && (
        <section
          aria-labelledby="active-batches-heading"
          className="space-y-4"
          data-testid="active-batch-jobs"
        >
          <h2
            id="active-batches-heading"
            className="text-xs font-black uppercase tracking-[0.3em] text-blue-gray-500"
          >
            Active batch jobs
          </h2>

          {batchesLoading && (
            <p
              data-testid="active-batches-loading"
              className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-blue-gray-500"
            >
              Loading active batches…
            </p>
          )}

          {!batchesLoading && batchesError && (
            <p
              data-testid="active-batches-error"
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            >
              Couldn&apos;t load batches. Refresh to retry.
            </p>
          )}

          {!batchesLoading && !batchesError && activeBatches.length === 0 && (
            <p
              data-testid="active-batches-empty"
              className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-blue-gray-500"
            >
              No active batches.
            </p>
          )}

          {!batchesLoading && !batchesError && activeBatches.length > 0 && (
            <ul className="space-y-3" data-testid="active-batches-list">
              {activeBatches.map((b) => (
                <li
                  key={b.id}
                  data-testid={`active-batch-${b.id}`}
                  className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4"
                >
                  <ClockIcon className="h-5 w-5 text-blue-gray-400" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">
                      {b.feedName ?? b.templateId}
                    </p>
                    <p className="text-xs text-blue-gray-500">
                      {b.appId} · {b.status} · {b.completedVariations}/{b.totalVariations}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

interface AppCardProps {
  manifest: AppManifest;
  href: string;
  disabled: boolean;
}

function AppCard({ manifest, href, disabled }: AppCardProps) {
  const dataAttrs = {
    'data-testid': `app-card-${manifest.id}`,
    'data-disabled': disabled ? 'true' : 'false',
    'data-status': manifest.status ?? 'live',
  };

  if (disabled) {
    return (
      <div
        {...dataAttrs}
        className="flex h-full flex-col gap-2 rounded-xl border border-gray-200 bg-white p-5 opacity-60 grayscale cursor-not-allowed"
      >
        <p className="text-base font-bold text-gray-900">{manifest.title}</p>
        {manifest.description && (
          <p className="text-sm text-blue-gray-500">{manifest.description}</p>
        )}
        <p className="mt-auto text-[10px] font-black uppercase tracking-[0.2em] text-amber-700">
          Standards required
        </p>
      </div>
    );
  }

  return (
    <Link
      to={href}
      {...dataAttrs}
      className="flex h-full flex-col gap-2 rounded-xl border border-gray-200 bg-white p-5 transition-all hover:border-blue-300 hover:shadow-card"
    >
      <p className="text-base font-bold text-gray-900">{manifest.title}</p>
      {manifest.description && (
        <p className="text-sm text-blue-gray-500">{manifest.description}</p>
      )}
      <p className="mt-auto text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">
        {manifest.status === 'preview' ? 'Preview →' : 'Open →'}
      </p>
    </Link>
  );
}
