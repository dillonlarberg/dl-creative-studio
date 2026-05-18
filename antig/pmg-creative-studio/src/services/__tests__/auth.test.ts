import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../firebase', () => ({
  auth: { currentUser: null },
}));

// IMPORTANT: import after vi.mock so the module under test sees the mocked auth.
import { auth } from '../../firebase';
import { authService } from '../auth';

type MutableAuth = { currentUser: unknown };

describe('authService.getAlliUserId', () => {
  beforeEach(() => {
    (auth as unknown as MutableAuth).currentUser = null;
  });

  it('returns the oidc.alli provider sub when present', () => {
    (auth as unknown as MutableAuth).currentUser = {
      uid: 'firebase-uid-abc',
      providerData: [{ providerId: 'oidc.alli', uid: 'alli-sub-xyz' }],
    };
    expect(authService.getAlliUserId()).toBe('alli-sub-xyz');
  });

  it('throws when oidc.alli provider data is missing (P1#4 — never silently mis-attribute)', () => {
    (auth as unknown as MutableAuth).currentUser = {
      uid: 'firebase-uid-abc',
      providerData: [],
    };
    expect(() => authService.getAlliUserId()).toThrow(/oidc\.alli/);
  });

  it('throws when the oidc.alli provider entry exists but has no uid', () => {
    (auth as unknown as MutableAuth).currentUser = {
      uid: 'firebase-uid-abc',
      providerData: [{ providerId: 'oidc.alli', uid: '' }],
    };
    expect(() => authService.getAlliUserId()).toThrow(/oidc\.alli/);
  });

  it('returns null when no user is signed in', () => {
    expect(authService.getAlliUserId()).toBeNull();
  });
});
