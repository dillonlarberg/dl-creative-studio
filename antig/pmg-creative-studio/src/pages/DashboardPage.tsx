import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ComponentType, SVGProps } from 'react';
import {
  ExclamationTriangleIcon,
  Squares2X2Icon,
  ArrowRightIcon,
  ArrowsPointingOutIcon,
  RectangleGroupIcon,
  CpuChipIcon,
  FilmIcon,
} from '@heroicons/react/24/outline';
import { useClientBootstrap } from '../hooks/useClientBootstrap';
import { getRegistry } from '../apps/_registry';
import type { AppManifest } from '../apps/types';

/**
 * AdLabs Dashboard v1 — Step 1 of plan.
 *
 * Mounted at /adlabs/:clientSlug/. Restyled to match Alli platform aesthetic:
 * module-card pattern (title + content inside one outer card), Inter weights,
 * platform color tokens. Data plumbing unchanged.
 */

export default function DashboardPage() {
  const { clientSlug } = useParams<{ clientSlug?: string }>();
  const navigate = useNavigate();
  const { client, isReady, loading, error } = useClientBootstrap({
    urlSlug: clientSlug ?? null,
  });
  if (!loading && !client) {
    navigate('/select-client', { replace: true });
    return null;
  }

  const registry: readonly AppManifest[] = getRegistry();

  return (
    <>
      <div
        className="relative left-1/2 -mt-8 mb-4 w-[calc(100vw-4rem)] -translate-x-1/2 border-b border-gray-200 bg-white"
        data-testid="adlabs-page-header"
      >
        <div className="mx-auto max-w-[1440px] px-9 py-6">
          <h1 className="text-2xl font-medium text-gray-900">AdLabs</h1>
        </div>
      </div>
      <div className="flex flex-col gap-6" data-testid="adlabs-dashboard">
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
      </div>
    </>
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
