import { HttpsError } from 'firebase-functions/v2/https';

/**
 * Verifies that a resource path (Firestore doc path, Storage path, or any
 * client-scoped path string) belongs to the asserted client. Throws a
 * permission-denied HttpsError if the path falls under a different client
 * or is not client-scoped at all.
 *
 * Used by callable Cloud Functions that accept URL or path arguments to
 * prevent cross-client IDOR — a member of one client passing a foreign
 * URL into a function that processes it.
 *
 * Path traversal sequences (`..`) and prefix attacks are rejected.
 */
export function assertResourceClient(clientSlug: string, resourcePath: string): void {
  if (!resourcePath || typeof resourcePath !== 'string') {
    throw new HttpsError('permission-denied', 'Invalid resource path');
  }

  if (resourcePath.includes('..')) {
    throw new HttpsError('permission-denied', 'Resource path contains traversal');
  }

  // Match exact prefix `clients/{slug}/` or exact equality with `clients/{slug}`.
  // This prevents prefix attacks where 'ralph_lauren' would otherwise match
  // 'ralph_lauren_evil/...'.
  const expectedRoot = `clients/${clientSlug}`;
  const expectedPrefix = `${expectedRoot}/`;

  if (resourcePath !== expectedRoot && !resourcePath.startsWith(expectedPrefix)) {
    throw new HttpsError(
      'permission-denied',
      `Resource path does not belong to client '${clientSlug}'`
    );
  }
}
