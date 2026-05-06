import type { User } from 'firebase/auth';

/**
 * Centralized predicate for "is this account a PMG-internal user".
 * Used by the AdLabs dashboard to gate mocked sections (Active Batch Jobs in
 * v1) so client logins never see placeholder data. Reusable for any future
 * internal-only UI affordance.
 *
 * The check is intentionally conservative: only `@pmg.com` emails count. Other
 * org domains (sub-tenants, contractors) are treated as external.
 */
export function isInternalUser(
  user: { email?: string | null } | User | null | undefined
): boolean {
  const email = user?.email ?? null;
  if (typeof email !== 'string') return false;
  return email.toLowerCase().endsWith('@pmg.com');
}
