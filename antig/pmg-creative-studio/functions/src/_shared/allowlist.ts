/**
 * Hardcoded email allowlist for Alli Studio access control.
 *
 * The same list MUST appear in firestore.rules and storage.rules. The
 * allowlist-drift test (Task 10) asserts the two stay in sync at build time.
 *
 * Adding a PMG user is a two-line change:
 *   1. Add their email here.
 *   2. Add their email to the isAlliStudioUser() function in firestore.rules
 *      and storage.rules (the function literal is identical in both files).
 *
 * Future migration to per-client claims: replace this allowlist with a
 * `syncClientClaims` Cloud Function that calls Alli /clients on login and
 * writes per-client membership to Firebase custom claims. The rules predicate
 * swaps from "email in [list]" to "slug in token.clients". The TS-side
 * change is contained to this module plus the assertAlliStudioUser guard.
 */

export const ALLI_STUDIO_USERS: ReadonlySet<string> = new Set([
  'annie.nguyen@pmg.com',
  'chris@pmg.com',
  'chris.alvares@pmg.com',
  'coralie.james@pmg.com',
  'diego.escobar@pmg.com',
  'dillon@pmg.com',
  'maxwell.thomason@pmg.com',
]);

export function isAlliStudioUserEmail(email: string | undefined): boolean {
  if (!email) return false;
  return ALLI_STUDIO_USERS.has(email);
}
