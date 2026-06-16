import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  SparklesIcon,
  SwatchIcon,
} from '@heroicons/react/24/outline';
import {
  AiPrompt,
  WaveAnimation,
  Button,
  Dropdown,
  MenuHeader,
  MenuItem,
  Notification,
  PaddedFullWidthContainer,
} from '@agencypmg/alli-design-system';
import { useClientBootstrap } from '../hooks/useClientBootstrap';
import { getRegistry } from '../apps/_registry';
import { BrandKitDrawer } from '../components/brand/BrandKitDrawer';
import { TemplateLibrarySection } from '../components/templates/TemplateLibrarySection';
import type { AppManifest } from '../apps/types';

export default function DashboardPage() {
  usePageTitle();
  const { clientSlug } = useParams<{ clientSlug?: string }>();
  const navigate = useNavigate();
  const { client, assetHouse, isReady, loading, error } = useClientBootstrap({
    urlSlug: clientSlug ?? null,
  });

  const [query, setQuery] = useState('');
  const [toastKey, setToastKey] = useState(0);
  const [toastVisible, setToastVisible] = useState(false);
  const [brandKitOpen, setBrandKitOpen] = useState(false);

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
      {/* Page header strip */}
      <div
        className="-mx-6 -mt-8 mb-4 border-b border-gray-200 bg-white xl:-mx-10"
        data-testid="adlabs-page-header"
      >
        <div className="px-6 py-4 xl:px-10 flex items-center justify-between">
          <h1 className="text-2xl font-medium text-gray-900">AdLabs</h1>

          {/* Brand Kit chip — only shown once bootstrap resolves */}
          {!loading && client && (
            isReady && assetHouse ? (
              <Dropdown
                trigger="Brand Kit"
                triggerAsProps={{
                  variant: 'secondary',
                  icon: <SwatchIcon className="h-3.5 w-3.5" />,
                  iconRight: false,
                }}
                menuClassName="alli-w-72"
              >
                <MenuHeader>
                  <div className="space-y-2 pb-1">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ background: assetHouse.primaryColor }}
                      />
                      <span className="text-sm font-semibold text-gray-800">{client.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <div
                        className="w-4 h-4 rounded ring-1 ring-black/10 shrink-0"
                        style={{ background: assetHouse.primaryColor }}
                      />
                      <span className="font-mono">{assetHouse.primaryColor}</span>
                      {assetHouse.fontPrimary && (
                        <>
                          <span className="text-gray-300">·</span>
                          <span style={{ fontFamily: assetHouse.fontPrimary }}>
                            {assetHouse.fontPrimary}
                          </span>
                        </>
                      )}
                    </div>
                    {(assetHouse.logoPrimary || assetHouse.logoInverse) && (
                      <div className="flex gap-2 pt-1">
                        {assetHouse.logoPrimary && (
                          <div className="w-10 h-6 rounded border border-gray-100 bg-white flex items-center justify-center overflow-hidden">
                            <img src={assetHouse.logoPrimary} alt="Primary logo" className="max-w-full max-h-full object-contain" />
                          </div>
                        )}
                        {assetHouse.logoInverse && (
                          <div className="w-10 h-6 rounded border border-gray-800 bg-gray-900 flex items-center justify-center overflow-hidden">
                            <img src={assetHouse.logoInverse} alt="Inverse logo" className="max-w-full max-h-full object-contain" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </MenuHeader>
                <MenuItem
                  as="a"
                  href={`/adlabs/${clientSlug}/brand-standards`}
                >
                  Edit Brand Kit →
                </MenuItem>
              </Dropdown>
            ) : (
              <Button
                variant="secondary"
                as="a"
                href={`/adlabs/${clientSlug}/brand-standards`}
                icon={<ExclamationTriangleIcon className="h-3.5 w-3.5 text-amber-500" />}
                iconRight={false}
              >
                Set Up Brand Kit
              </Button>
            )
          )}
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

          {/* Ad Templates section — replaces the old "View Template Library" text link */}
          {client && clientSlug && (
            <TemplateLibrarySection clientSlug={clientSlug} />
          )}
        </div>
      </PaddedFullWidthContainer>

      {/* Brand Kit drawer — available from DesignStep via setBrandKitOpen (Step 7) */}
      {client && clientSlug && (
        <BrandKitDrawer
          open={brandKitOpen}
          onClose={() => setBrandKitOpen(false)}
          clientSlug={clientSlug}
          assetHouse={assetHouse ?? undefined}
        />
      )}

      {toastVisible && (
        <div className="fixed bottom-6 right-6 z-[60]">
          <Notification
            key={toastKey}
            variant="warning"
            title="Brand Kit required"
            message="Set up this client's Brand Kit to unlock this app."
            link={
              <Link
                to={`/adlabs/${clientSlug}/brand-standards`}
                className="text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                Set Up Brand Kit
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
