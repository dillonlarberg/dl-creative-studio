import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { authService } from './services/auth';
import type { User } from 'firebase/auth';

import AppLayout from './components/AppLayout';
import CreatePage from './pages/CreatePage';
import UseCaseWizardPage from './pages/use-cases/UseCaseWizardPage';
import ClientSelectPage from './pages/ClientSelectPage';
import LoginPage from './pages/LoginPage';
import ClientAssetHousePage from './pages/ClientAssetHousePage';
import { ClientProvider } from './platform/client/ClientProvider';
import TemplateBuilderAppRoot from './apps/template-builder/AppRoot';

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
          <Route path="/" element={<CreatePage />} />
          <Route path="/create" element={<Navigate to="/" replace />} />
          {/* AdLabs route group (Step 0 of v1 plan). The dashboard mounts at
              /adlabs/:clientSlug/ and per-app routes nest under it. The legacy
              /:clientSlug/template-builder/* mount stays for backwards-compat
              until Step 1 ships and the legacy route is redirected. */}
          <Route
            path="/adlabs/:clientSlug/template-builder/*"
            element={
              <ClientProvider>
                <TemplateBuilderAppRoot />
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

