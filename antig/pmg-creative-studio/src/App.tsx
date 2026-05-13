import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { authService } from './services/auth';
import { alliService } from './services/alli';
import type { User } from 'firebase/auth';

import AppLayout from './components/AppLayout';
import DashboardPage from './pages/DashboardPage';
import UseCaseWizardPage from './pages/use-cases/UseCaseWizardPage';
import ClientSelectPage from './pages/ClientSelectPage';
import LoginPage from './pages/LoginPage';
import ClientAssetHousePage from './pages/ClientAssetHousePage';
import { ClientProvider } from './platform/client/ClientProvider';
import TemplateBuilderAppRoot from './apps/template-builder/AppRoot';
import { WizardShell } from './platform/wizard/WizardShell';
import batchVariantsManifest from './apps/batch-variants/manifest';
import videoCutdownManifest from './apps/video-cutdown/manifest';
import ResizeImageAppRoot from './apps/resize-image/AppRoot';
import AdResizingAppRoot from './apps/ad-resizing/AppRoot';

/**
 * Root redirect: send the user to the AdLabs dashboard for their saved client.
 * If no client is saved, fetch the client list and auto-select the
 * alphabetically lowest slug so the user lands on AdLabs, not a picker screen.
 * Falls back to /select-client only on fetch error.
 */
function RootRedirect() {
  const [target, setTarget] = useState<string | null>(() => {
    try {
      const raw = localStorage.getItem('selectedClient');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.slug === 'string') return `/adlabs/${parsed.slug}/`;
      }
    } catch {
      // fall through to fetch
    }
    return null;
  });

  useEffect(() => {
    if (target !== null) return;
    alliService.getClients().then((clients) => {
      const sorted = [...clients].sort((a, b) => a.slug.localeCompare(b.slug));
      if (sorted.length > 0) {
        localStorage.setItem('selectedClient', JSON.stringify(sorted[0]));
        setTarget(`/adlabs/${sorted[0].slug}/`);
      } else {
        setTarget('/select-client');
      }
    }).catch(() => setTarget('/select-client'));
  }, [target]);

  if (!target) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return <Navigate to={target} replace />;
}

/**
 * E2E auth bypass. Activates ONLY when both flags are true:
 *   - import.meta.env.DEV (Vite dev mode — never in prod builds)
 *   - import.meta.env.VITE_E2E_AUTH_BYPASS === 'true'
 *
 * The two-flag gate is intentional: VITE_E2E_AUTH_BYPASS alone is not enough
 * because Vite tree-shakes import.meta.env.DEV out of production bundles.
 * If someone accidentally ships VITE_E2E_AUTH_BYPASS=true to prod, the DEV
 * flag is statically false and the entire branch dead-codes away.
 */
const isE2EBypass =
  import.meta.env.DEV && import.meta.env.VITE_E2E_AUTH_BYPASS === 'true';

const E2E_FAKE_USER = {
  uid: 'e2e-test-user',
  email: 'e2e@pmg.com',
  displayName: 'E2E Test',
} as unknown as User;

export default function App() {
  const [user, setUser] = useState<User | null>(isE2EBypass ? E2E_FAKE_USER : null);
  const [loading, setLoading] = useState(!isE2EBypass);

  useEffect(() => {
    if (isE2EBypass) return;
    return authService.subscribe((user) => {
      setUser(user);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/" />} />

        <Route element={user ? <AppLayout /> : <Navigate to="/login" />}>
          {/* Root → AdLabs dashboard for the selected client (or /select-client). */}
          <Route path="/" element={<RootRedirect />} />
          <Route path="/create" element={<Navigate to="/" replace />} />
          {/* AdLabs route group. Dashboard at /adlabs/:clientSlug/ (Step 1)
              and per-app routes nest under it. Legacy /:clientSlug/template-builder/*
              stays mounted for backwards-compat. */}
          <Route path="/adlabs/:clientSlug" element={<DashboardPage />} />
          <Route path="/adlabs/:clientSlug/" element={<DashboardPage />} />
          <Route
            path="/adlabs/:clientSlug/template-builder/*"
            element={
              <ClientProvider>
                <TemplateBuilderAppRoot />
              </ClientProvider>
            }
          />
          <Route
            path="/adlabs/:clientSlug/batch-variants/*"
            element={
              <ClientProvider>
                <WizardShell manifest={batchVariantsManifest} />
              </ClientProvider>
            }
          />
          <Route
            path="/adlabs/:clientSlug/video-cutdown/*"
            element={
              <ClientProvider>
                <WizardShell manifest={videoCutdownManifest} />
              </ClientProvider>
            }
          />
          <Route
            path="/adlabs/:clientSlug/resize-image/*"
            element={
              <ClientProvider>
                <ResizeImageAppRoot />
              </ClientProvider>
            }
          />
          <Route
            path="/adlabs/:clientSlug/ad-resizing/*"
            element={
              <ClientProvider>
                <AdResizingAppRoot />
              </ClientProvider>
            }
          />
          {/* Legacy per-app routes — must come before the legacy /create/:useCaseId catch. */}
          <Route
            path="/:clientSlug/template-builder/*"
            element={
              <ClientProvider>
                <TemplateBuilderAppRoot />
              </ClientProvider>
            }
          />
          <Route path="/create/:useCaseId" element={<UseCaseWizardPage />} />
          <Route path="/select-client" element={<ClientSelectPage />} />
          <Route path="/client-asset-house" element={<ClientAssetHousePage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}

