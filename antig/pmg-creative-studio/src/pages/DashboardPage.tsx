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
  {
    id: 'resize-image',
    title: 'Resize Image',
    description:
      'Lift approved creative into Brand Asset House and AI-expand for new dimensions.',
  },
  {
    id: 'edit-tweak',
    title: 'Edit & Tweak',
    description:
      'Fast text and asset swaps on a live template — no HTML round-trips.',
  },
];

const MOCK_BATCHES = [
  {
    id: 'b-001',
    appId: 'template-builder',
    label: 'RL Spring 2026 — sweater carousel',
    status: 'running' as const,
    progress: 0.62,
  },
  {
    id: 'b-002',
    appId: 'video-cutdown',
    label: 'Polo Sport hero — 30s → 6/15s cutdowns',
    status: 'queued' as const,
    progress: 0,
  },
];

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

      {/* Active Batch Jobs — mocked + internal-only render gate */}
      {internal && (
        <section
          aria-labelledby="active-batches-heading"
          className="space-y-4"
          data-testid="active-batch-jobs"
        >
          <div className="flex items-center justify-between">
            <h2
              id="active-batches-heading"
              className="text-xs font-black uppercase tracking-[0.3em] text-blue-gray-500"
            >
              Active batch jobs
            </h2>
            <span
              data-testid="demo-data-indicator"
              className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-amber-700"
            >
              Demo data
            </span>
          </div>
          <ul className="space-y-3">
            {MOCK_BATCHES.map((b) => (
              <li
                key={b.id}
                data-testid={`mock-batch-${b.id}`}
                className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4"
              >
                <ClockIcon className="h-5 w-5 text-blue-gray-400" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">{b.label}</p>
                  <p className="text-xs text-blue-gray-500">
                    {b.appId} · {b.status}
                  </p>
                </div>
              </li>
            ))}
          </ul>
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
