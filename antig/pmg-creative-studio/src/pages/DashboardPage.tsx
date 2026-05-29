import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import {
  AiPrompt,
  WaveAnimation,
  Button,
  Notification,
  PaddedFullWidthContainer,
} from '@agencypmg/alli-design-system';
import { useClientBootstrap } from '../hooks/useClientBootstrap';
import { getRegistry } from '../apps/_registry';
import type { AppManifest } from '../apps/types';

/**
 * AdLabs Dashboard.
 *
 * Mounted at /adlabs/:clientSlug/. The page header ("AdLabs") sits in its own
 * full-bleed white strip; everything below lives inside a single white content
 * card (PaddedFullWidthContainer) floating on the Alli blue-gray surface:
 * an Ask Alli prompt + wave, a Search Apps filter, and the app grid styled to
 * match the platform's template-library cards.
 */

export default function DashboardPage() {
  const { clientSlug } = useParams<{ clientSlug?: string }>();
  const navigate = useNavigate();
  const { client, isReady, loading, error } = useClientBootstrap({
    urlSlug: clientSlug ?? null,
  });

  const [query, setQuery] = useState('');
  // Bumped each time the brand-standards toast is triggered so the
  // Notification remounts and re-runs its auto-dismiss timer.
  const [toastKey, setToastKey] = useState(0);
  const [toastVisible, setToastVisible] = useState(false);

  if (!loading && !client) {
    navigate('/select-client', { replace: true });
    return null;
  }

  const registry: readonly AppManifest[] = getRegistry();

  const q = query.trim().toLowerCase();
  const visibleApps = registry.filter((m) => {
    if (!q) return true;
    return (
      m.title.toLowerCase().includes(q) ||
      (m.description ?? '').toLowerCase().includes(q)
    );
  });

  function handleOpen(manifest: AppManifest) {
    if (manifest.requiresBrandStandards && !isReady) {
      setToastKey((k) => k + 1);
      setToastVisible(true);
      return;
    }
    if (!client?.slug) return;
    navigate(`/adlabs/${client.slug}/${manifest.basePath}/`);
  }

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

      {error && (
        <div
          role="alert"
          data-testid="bootstrap-error"
          className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-red-600" />
          <div>
            <p className="font-medium">Couldn&apos;t load brand standards</p>
            <p className="mt-0.5">The dashboard is still functional — refresh to retry the load.</p>
          </div>
        </div>
      )}

      <PaddedFullWidthContainer>
        <div className="flex w-full flex-col" data-testid="adlabs-dashboard">
          {/* Ask Alli prompt */}
          <div className="flex justify-center pt-6 pb-2">
            <AiPrompt
              title="Ask Alli to Build a Creative"
              subTitle="Generate, resize, and remix creative all with a simple prompt"
              placeholder="Ask Alli something..."
              icon={<SparklesIcon />}
              // Presentational for now — wiring to the NL backend is a follow-up.
              onSubmit={() => {}}
            />
          </div>

          <WaveAnimation width="100%" />

          {/* Search Apps + grid */}
          <div className="mt-6">
            <div className="relative mb-4 flex h-11 items-center gap-2.5 rounded-[10px] border border-gray-200 px-3.5">
              <MagnifyingGlassIcon className="h-[18px] w-[18px] shrink-0 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search Apps"
                aria-label="Search Apps"
                data-testid="adlabs-search"
                className="flex-1 border-none bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-500"
              />
            </div>

            <ul
              className="grid grid-cols-1 gap-4 md:grid-cols-2"
              data-testid="adlabs-apps-grid"
            >
              {visibleApps.map((manifest) => (
                <li key={manifest.id}>
                  <AppCard manifest={manifest} onOpen={() => handleOpen(manifest)} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </PaddedFullWidthContainer>

      {toastVisible && (
        <div className="fixed bottom-6 right-6 z-[60]">
          <Notification
            key={toastKey}
            variant="warning"
            title="Brand standards required"
            message="Set up this client's brand standards to unlock this app."
            link={
              <Link
                to="/client-asset-house"
                className="text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                Set up in Client Asset House
              </Link>
            }
            duration={6000}
            onDismiss={() => setToastVisible(false)}
          />
        </div>
      )}
    </>
  );
}

interface AppCardProps {
  manifest: AppManifest;
  onOpen: () => void;
}

function AppCard({ manifest, onOpen }: AppCardProps) {
  const isPreview = (manifest.status ?? 'live') === 'preview';

  return (
    <div
      data-testid={`app-card-${manifest.id}`}
      data-status={manifest.status ?? 'live'}
      className="flex h-full flex-col rounded-lg border border-gray-50 bg-white p-4 shadow-sm transition-shadow hover:shadow-lg"
    >
      <h3 className="text-[15px] font-semibold text-gray-800">{manifest.title}</h3>
      <p
        className={`mt-1.5 text-sm font-medium ${
          isPreview ? 'text-amber-700' : 'text-blue-600'
        }`}
      >
        {isPreview ? 'Preview' : 'Live'}
      </p>
      {manifest.description && (
        <p className="mt-2.5 flex-1 text-sm leading-relaxed text-gray-600">
          {manifest.description}
        </p>
      )}
      <div className="mt-4 flex items-center justify-between">
        <Button
          variant="secondary"
          type="button"
          onClick={() => console.log('Button was pressed')}
        >
          More Info
        </Button>
        <Button variant="primary" type="button" onClick={onOpen}>
          {isPreview ? 'Preview' : 'Open'}
        </Button>
      </div>
    </div>
  );
}
