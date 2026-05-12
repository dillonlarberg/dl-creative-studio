import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { isAlliStudioUserEmail } from './allowlist';

/**
 * Caller-identity guard for callable Cloud Functions.
 *
 * Throws permission-denied unless the caller's auth token has:
 *   - email === one of the entries in ALLI_STUDIO_USERS, AND
 *   - either email_verified === true (e.g. direct Google sign-in)
 *     OR firebase.sign_in_provider === 'oidc.alli' (Alli SSO — the OIDC
 *     IdP verifies the email upstream but doesn't propagate the
 *     `email_verified` claim through the Firebase token).
 *
 * Always throws permission-denied (never unauthenticated) so a probe cannot
 * distinguish "no auth" from "auth but not allowlisted". Server-side log
 * records the specific reason so we can debug rejections from Cloud Logging
 * without leaking diagnostic info to the client.
 */
export function assertAlliStudioUser(req: CallableRequest<unknown>): void {
  const token = req.auth?.token as
    | {
        email?: string;
        email_verified?: boolean;
        firebase?: { sign_in_provider?: string };
      }
    | undefined;

  const email = token?.email;
  const provider = token?.firebase?.sign_in_provider;
  const emailVerified = token?.email_verified === true;
  // Trust the Alli OIDC IdP — it verifies email upstream during SSO before
  // issuing tokens. Add other trusted SSO providers here as they come online.
  const oidcVerified = provider === 'oidc.alli';
  const verified = emailVerified || oidcVerified;
  const allowlisted = isAlliStudioUserEmail(email);

  if (verified && allowlisted) return;

  logger.warn('assertAlliStudioUser: rejected', {
    hasAuth: !!req.auth,
    hasEmail: !!email,
    emailDomain: email ? email.split('@')[1] : null,
    emailVerified,
    provider,
    allowlisted,
  });
  throw new HttpsError('permission-denied', 'Not an Alli Studio user');
}
