import { createHash } from 'node:crypto';

interface ImportOptions {
  dryRun: boolean;
}

interface ImportResult {
  imported: string[];
  skipped: string[]; // already up to date (idempotent skip)
  excluded: string[]; // explicitly excluded slugs (e.g. pmg)
  planned: string[]; // dry-run only
}

/**
 * Structural interface for the Firestore APIs we use. This works for both the
 * firebase-admin Firestore (CLI / production import) and the client-side
 * Firestore exposed by @firebase/rules-unit-testing (the test path).
 */
interface FirestoreLike {
  collection(path: string): {
    get(): Promise<{ docs: Array<{ id: string; data(): Record<string, unknown> }> }>;
  };
  doc(path: string): {
    get(): Promise<{ exists: boolean | (() => boolean); data(): Record<string, unknown> | undefined }>;
    set(data: Record<string, unknown>): Promise<unknown>;
  };
}

const EXCLUDED_SLUGS = new Set(['pmg']);

function contentHash(data: unknown): string {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

function docExists(snapshot: { exists: boolean | (() => boolean) }): boolean {
  // Admin SDK exposes `.exists` as a boolean property; client SDK as a getter.
  // Both return a boolean when accessed.
  const value = (snapshot as { exists: unknown }).exists;
  if (typeof value === 'function') return (value as () => boolean)();
  return Boolean(value);
}

export async function importBrandProfiles(
  db: FirestoreLike,
  opts: ImportOptions
): Promise<ImportResult> {
  const result: ImportResult = { imported: [], skipped: [], excluded: [], planned: [] };

  const sourceSnapshot = await db.collection('clientAssetHouse').get();

  for (const doc of sourceSnapshot.docs) {
    const slug = doc.id;
    if (EXCLUDED_SLUGS.has(slug)) {
      result.excluded.push(slug);
      continue;
    }

    const sourceData = doc.data();
    const sourceHash = contentHash(sourceData);

    const targetRef = db.doc(`clients/${slug}/profile/data`);
    const targetDoc = await targetRef.get();

    if (docExists(targetDoc)) {
      const existing = (targetDoc.data() ?? {}) as Record<string, unknown> & { _importHash?: string };
      const recordedHash = existing._importHash;
      const targetWithoutHash = { ...existing };
      delete targetWithoutHash._importHash;
      const targetHash = contentHash(targetWithoutHash);
      if (recordedHash === sourceHash || targetHash === sourceHash) {
        result.skipped.push(slug);
        continue;
      }
    }

    if (opts.dryRun) {
      result.planned.push(slug);
      continue;
    }

    await targetRef.set({ ...sourceData, _importHash: sourceHash });
    result.imported.push(slug);
  }

  return result;
}

// CLI entry — reads --dry-run from argv, initializes admin SDK, runs.
async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const { initializeApp, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');

  initializeApp({ credential: applicationDefault() });
  const db = getFirestore() as unknown as FirestoreLike;

  const result = await importBrandProfiles(db, { dryRun });

  // eslint-disable-next-line no-console
  console.log('Brand-profile import result:');
  // eslint-disable-next-line no-console
  console.log(`  Imported: ${result.imported.length} (${result.imported.join(', ')})`);
  // eslint-disable-next-line no-console
  console.log(`  Skipped (already up to date): ${result.skipped.length} (${result.skipped.join(', ')})`);
  // eslint-disable-next-line no-console
  console.log(`  Excluded: ${result.excluded.length} (${result.excluded.join(', ')})`);
  if (dryRun) {
    // eslint-disable-next-line no-console
    console.log(`  Planned (dry-run): ${result.planned.length} (${result.planned.join(', ')})`);
  }
}

if (process.argv[1]?.endsWith('import-brand-profiles.ts') || process.argv[1]?.endsWith('import-brand-profiles.js')) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Import failed:', err);
    process.exit(1);
  });
}
