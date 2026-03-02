import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { authService } from './services/auth';
import type { User } from 'firebase/auth';

import AppLayout from './components/AppLayout';
import DashboardPage from './pages/DashboardPage';
import CreatePage from './pages/CreatePage';
import UseCaseWizardPage from './pages/use-cases/UseCaseWizardPage';
import ClientSelectPage from './pages/ClientSelectPage';
import LoginPage from './pages/LoginPage';
import ClientAssetHousePage from './pages/ClientAssetHousePage';

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
          <Route path="/" element={<DashboardPage />} />
          <Route path="/create" element={<CreatePage />} />
          <Route path="/create/:useCaseId" element={<UseCaseWizardPage />} />
          <Route path="/select-client" element={<ClientSelectPage />} />
          <Route path="/client-asset-house" element={<ClientAssetHousePage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}

