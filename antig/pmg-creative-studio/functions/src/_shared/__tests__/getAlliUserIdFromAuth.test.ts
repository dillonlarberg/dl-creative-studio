import { describe, it, expect } from 'vitest';
import type { AuthData } from 'firebase-functions/v2/tasks';
import { getAlliUserIdFromAuth } from '../getAlliUserIdFromAuth';

function mkAuth(token: unknown, uid = 'firebase-uid'): AuthData {
  return { uid, token: token as never } as unknown as AuthData;
}

describe('getAlliUserIdFromAuth', () => {
  it('extracts sub from token.firebase.identities["oidc.alli"]', () => {
    const auth = mkAuth({
      firebase: {
        identities: { 'oidc.alli': ['alli-sub-xyz'] },
        sign_in_provider: 'oidc.alli',
      },
    });
    expect(getAlliUserIdFromAuth(auth)).toBe('alli-sub-xyz');
  });

  it('throws unauthenticated when no auth context is present', () => {
    expect(() => getAlliUserIdFromAuth(null)).toThrow(/unauthenticated/i);
    expect(() => getAlliUserIdFromAuth(undefined)).toThrow(/unauthenticated/i);
  });

  it('throws permission-denied when sign_in_provider is not oidc.alli', () => {
    const auth = mkAuth({
      firebase: { identities: {}, sign_in_provider: 'google.com' },
    });
    expect(() => getAlliUserIdFromAuth(auth)).toThrow(/oidc\.alli/);
  });

  it('throws when oidc.alli identity list is empty', () => {
    const auth = mkAuth({
      firebase: {
        identities: { 'oidc.alli': [] },
        sign_in_provider: 'oidc.alli',
      },
    });
    expect(() => getAlliUserIdFromAuth(auth)).toThrow(/sub/i);
  });

  it('throws when token shape is missing entirely', () => {
    const auth = mkAuth({});
    expect(() => getAlliUserIdFromAuth(auth)).toThrow();
  });
});
