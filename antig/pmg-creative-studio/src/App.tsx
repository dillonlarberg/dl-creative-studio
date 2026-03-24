import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense, useEffect, useState } from 'react';
import { authService } from './services/auth';
import type { User } from 'firebase/auth';

const AppLayout = lazy(() => import('./components/AppLayout'));
const CreatePage = lazy(() => import('./pages/CreatePage'));
const UseCaseWizardPage = lazy(() => import('./pages/use-cases/UseCaseWizardPage'));
const ClientSelectPage = lazy(() => import('./pages/ClientSelectPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const ClientAssetHousePage = lazy(() => import('./pages/ClientAssetHousePage'));

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
    </div>
  );
}

function LazyRoute({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return authService.subscribe((user) => {
      setUser(user);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <RouteFallback />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={!user ? <LazyRoute><LoginPage /></LazyRoute> : <Navigate to="/" />}
        />

        <Route element={user ? <LazyRoute><AppLayout /></LazyRoute> : <Navigate to="/login" />}>
          <Route path="/" element={<LazyRoute><CreatePage /></LazyRoute>} />
          <Route path="/create" element={<Navigate to="/" replace />} />
          <Route path="/create/:useCaseId" element={<LazyRoute><UseCaseWizardPage /></LazyRoute>} />
          <Route path="/select-client" element={<LazyRoute><ClientSelectPage /></LazyRoute>} />
          <Route path="/client-asset-house" element={<LazyRoute><ClientAssetHousePage /></LazyRoute>} />
        </Route>

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
