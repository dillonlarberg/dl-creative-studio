import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { isAlliStudioUserEmail } from './allowlist';

/**
 * Caller-identity guard for callable Cloud Functions.
 *
 * Throws permission-denied unless the caller's auth token has:
 *   - email_verified === true
 *   - email === one of the entries in ALLI_STUDIO_USERS
 *
 * Always throws permission-denied (never unauthenticated) so a probe cannot
 * distinguish "no auth" from "auth but not allowlisted".
 *
 * Pair with assertResourceClient when the function takes a URL or path
 * argument: this guard checks WHO is calling; that one checks WHAT they
 * are operating on.
 */
export function assertAlliStudioUser(req: CallableRequest<unknown>): void {
  const token = req.auth?.token as { email?: string; email_verified?: boolean } | undefined;
  const email = token?.email;
  const verified = token?.email_verified === true;

  if (!verified || !isAlliStudioUserEmail(email)) {
    throw new HttpsError('permission-denied', 'Not an Alli Studio user');
  }
}
