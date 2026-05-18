/**
 * Server-side extraction of the Alli user id (OIDC `sub` claim) from a v2
 * callable's auth context. Never trust client-supplied `createdBy` — a
 * malicious caller could otherwise forge attribution on any output. This
 * helper is the only server-side path through which `createdBy` should be
 * obtained, ever.
 *
 * Firebase Auth puts each OIDC provider's `sub` into
 * `token.firebase.identities[providerId]` as a single-element array. For
 * Alli, the provider id is `oidc.alli`.
 *
 * Throws an HttpsError so callable error handlers can surface the
 * appropriate gRPC code to the client. Callers should NOT catch this;
 * let it bubble.
 */
import { HttpsError } from 'firebase-functions/v2/https';
import type { AuthData } from 'firebase-functions/v2/tasks';

interface FirebaseTokenIdentities {
  identities?: Record<string, string[] | undefined>;
  sign_in_provider?: string;
}

interface FirebaseAuthToken {
  firebase?: FirebaseTokenIdentities;
}

export function getAlliUserIdFromAuth(auth: AuthData | null | undefined): string {
  if (!auth) {
    throw new HttpsError(
      'unauthenticated',
      'unauthenticated: callable was invoked without an auth context.'
    );
  }
  const token = auth.token as unknown as FirebaseAuthToken;
  const provider = token?.firebase?.sign_in_provider;
  if (provider !== 'oidc.alli') {
    throw new HttpsError(
      'permission-denied',
      `Expected oidc.alli sign-in provider, got ${provider ?? '<none>'}`
    );
  }
  const identities = token?.firebase?.identities ?? {};
  const sub = identities['oidc.alli']?.[0];
  if (!sub) {
    throw new HttpsError(
      'permission-denied',
      'Missing oidc.alli sub identity on token; cannot attribute createdBy.'
    );
  }
  return sub;
}
