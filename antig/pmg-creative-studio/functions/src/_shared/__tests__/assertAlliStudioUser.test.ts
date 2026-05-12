import { describe, expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { assertAlliStudioUser } from '../assertAlliStudioUser';
import { ALLI_STUDIO_USERS } from '../allowlist';

const allowedEmail = ALLI_STUDIO_USERS.values().next().value!;

function fakeRequest(authToken: Record<string, unknown> | null): CallableRequest {
  return {
    auth: authToken ? ({ uid: 'test-uid', token: authToken } as any) : undefined,
  } as CallableRequest;
}

describe('assertAlliStudioUser', () => {
  it('does not throw for an allowlisted user with verified email', () => {
    const req = fakeRequest({ email: allowedEmail, email_verified: true });
    expect(() => assertAlliStudioUser(req)).not.toThrow();
  });

  it('throws for an allowlisted user with UNVERIFIED email when signed in via password', () => {
    const req = fakeRequest({ email: allowedEmail, email_verified: false, firebase: { sign_in_provider: 'password' } });
    expect(() => assertAlliStudioUser(req)).toThrow(HttpsError);
  });

  it('accepts an allowlisted user signed in via oidc.alli even without email_verified', () => {
    // Alli SSO verifies the email upstream during OIDC handshake but does not
    // propagate email_verified through the Firebase token claim; we trust the
    // sign_in_provider as a proxy.
    const req = fakeRequest({
      email: allowedEmail,
      email_verified: false,
      firebase: { sign_in_provider: 'oidc.alli' },
    });
    expect(() => assertAlliStudioUser(req)).not.toThrow();
  });

  it('still rejects a non-allowlisted oidc.alli user', () => {
    const req = fakeRequest({
      email: 'random@example.com',
      email_verified: false,
      firebase: { sign_in_provider: 'oidc.alli' },
    });
    expect(() => assertAlliStudioUser(req)).toThrow(HttpsError);
  });

  it('still rejects an unknown OIDC provider even if the email is allowlisted', () => {
    const req = fakeRequest({
      email: allowedEmail,
      email_verified: false,
      firebase: { sign_in_provider: 'oidc.evil' },
    });
    expect(() => assertAlliStudioUser(req)).toThrow(HttpsError);
  });

  it('throws for a non-allowlisted user with verified email', () => {
    const req = fakeRequest({ email: 'random@example.com', email_verified: true });
    expect(() => assertAlliStudioUser(req)).toThrow(HttpsError);
  });

  it('throws when there is no auth context at all', () => {
    expect(() => assertAlliStudioUser(fakeRequest(null))).toThrow(HttpsError);
  });

  it('throws when the email field is missing from the token', () => {
    const req = fakeRequest({ email_verified: true });
    expect(() => assertAlliStudioUser(req)).toThrow(HttpsError);
  });

  it('throws permission-denied (not unauthenticated) so the caller cannot distinguish causes', () => {
    try {
      assertAlliStudioUser(fakeRequest(null));
    } catch (err) {
      expect((err as HttpsError).code).toBe('permission-denied');
    }
  });
});
