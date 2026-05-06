import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { authService } from '../services/auth';

/**
 * Mirror of App.tsx's auth state in any component that needs it. Honors the
 * E2E auth bypass (gated on import.meta.env.DEV) so Playwright tests see a
 * stable fake user without going through Firebase login.
 */

const isE2EBypass =
  import.meta.env.DEV && import.meta.env.VITE_E2E_AUTH_BYPASS === 'true';

const E2E_FAKE_USER = {
  uid: 'e2e-test-user',
  email: 'e2e@pmg.com',
  displayName: 'E2E Test',
} as unknown as User;

export function useCurrentUser(): User | null {
  const [user, setUser] = useState<User | null>(isE2EBypass ? E2E_FAKE_USER : null);

  useEffect(() => {
    if (isE2EBypass) return;
    return authService.subscribe(setUser);
  }, []);

  return user;
}
