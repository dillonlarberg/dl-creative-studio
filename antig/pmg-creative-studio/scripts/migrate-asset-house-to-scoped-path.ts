/**
 * Issue #10: migrate brand-standards data from the legacy top-level
 * `clientAssetHouse/{slug}` collection to the path-scoped `clients/{slug}`
 * document.
 *
 * Each source doc is merged into `clients/{slug}` (merge:true) so that
 * subcollections (`assets/`, `apps/`) and other fields written by the
 * path-scoped tree are preserved.
 *
 * The script is idempotent — re-running on already-migrated data is a no-op.
 * Idempotency is detected by stamping a `_assetHouseImportHash` on the
 * destination doc; matching hash on re-run = skip.
 *
 * Usage:
 *   npm run migrate:asset-house:dry   # report counts only
 *   npm run migrate:asset-house       # wet run; merges into clients/{slug}
 *
 * Environment:
 *   GOOGLE_APPLICATION_CREDENTIALS must point at a service-account JSON, or
 *   run via `firebase emulators:exec`. Do NOT run against prod without first
 *   dry-running on a staging copy of the project.
 */

import { createHash } from 'node:crypto';

interface MigrateOptions {
  dryRun: boolean;
}

export interface MigrateResult {
  migrated: string[]; // slugs whose target doc was written
  skipped: string[]; // already up to date
  planned: string[]; // dry-run only
}

/**
 * Structural Firestore interface that works against both the firebase-admin
 * SDK (production / CLI) and the client SDK exposed by
 * `@firebase/rules-unit-testing` (the test path).
 */
interface FirestoreLike {
  collection(path: string): {
    get(): Promise<{ docs: Array<{ id: string; data(): Record<string, unknown> }> }>;
  };
  doc(path: string): {
    get(): Promise<{
      exists: boolean | (() => boolean);
      data(): Record<string, unknown> | undefined;
    }>;
    set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<unknown>;
  };
}

const SOURCE_COLLECTION = 'clientAssetHouse';
const IMPORT_HASH_FIELD = '_assetHouseImportHash';

function contentHash(data: unknown): string {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

function docExists(snapshot: { exists: boolean | (() => boolean) }): boolean {
  const value = (snapshot as { exists: unknown }).exists;
  if (typeof value === 'function') return (value as () => boolean)();
  return Boolean(value);
}

export async function migrateAssetHouse(
  db: FirestoreLike,
  opts: MigrateOptions
): Promise<MigrateResult> {
  const result: MigrateResult = { migrated: [], skipped: [], planned: [] };
  const sourceSnapshot = await db.collection(SOURCE_COLLECTION).get();

  for (const sourceDoc of sourceSnapshot.docs) {
    const slug = sourceDoc.id;
    const sourceData = sourceDoc.data();
    const sourceHash = contentHash(sourceData);

    const targetRef = db.doc(`clients/${slug}`);
    const targetSnap = await targetRef.get();

    if (docExists(targetSnap)) {
      const existing = (targetSnap.data() ?? {}) as Record<string, unknown>;
      if (existing[IMPORT_HASH_FIELD] === sourceHash) {
        result.skipped.push(slug);
        continue;
      }
    }

    if (opts.dryRun) {
      result.planned.push(slug);
      continue;
    }

    await targetRef.set(
      { ...sourceData, [IMPORT_HASH_FIELD]: sourceHash },
      { merge: true }
    );
    result.migrated.push(slug);
  }

  return result;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const { initializeApp, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');

  initializeApp({ credential: applicationDefault() });
  const db = getFirestore() as unknown as FirestoreLike;

  const result = await migrateAssetHouse(db, { dryRun });

  // eslint-disable-next-line no-console
  console.log(`${dryRun ? '[dry-run] ' : ''}Asset-house migration result:`);
  // eslint-disable-next-line no-console
  console.log(`  Migrated: ${result.migrated.length} (${result.migrated.join(', ')})`);
  // eslint-disable-next-line no-console
  console.log(`  Skipped (already up to date): ${result.skipped.length} (${result.skipped.join(', ')})`);
  if (dryRun) {
    // eslint-disable-next-line no-console
    console.log(`  Planned (dry-run): ${result.planned.length} (${result.planned.join(', ')})`);
  }
}

if (
  process.argv[1]?.endsWith('migrate-asset-house-to-scoped-path.ts') ||
  process.argv[1]?.endsWith('migrate-asset-house-to-scoped-path.js')
) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Migration failed:', err);
    process.exit(1);
  });
}
