/**
 * Step 2.5 of AdLabs v1 plan: migrate top-level `/batches/{batchId}` docs
 * (and their `results/{resultId}` sub-collection) to the path-scoped tree:
 *
 *   clients/{slug}/apps/{appId}/batches/{batchId}
 *   clients/{slug}/apps/{appId}/batches/{batchId}/results/{resultId}
 *
 * The script is idempotent — re-running on already-migrated data is a no-op.
 *
 * Usage:
 *   npm run migrate-batches:dry   # report counts only
 *   npm run migrate-batches       # wet run; writes to scoped tree
 *
 * Environment:
 *   GOOGLE_APPLICATION_CREDENTIALS must point at a service-account JSON.
 *   Or run with `firebase emulators:exec`. Do NOT run against prod without
 *   first dry-running on a staging copy of the project.
 */

import * as admin from 'firebase-admin';

const isDryRun = process.argv.includes('--dry-run');
const DEFAULT_APP_ID = 'template-builder';

interface LegacyBatch {
  appId?: string;
  clientSlug?: string;
  [k: string]: unknown;
}

async function migrate(): Promise<{ migrated: number; skipped: number }> {
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  }
  const db = admin.firestore();

  const legacy = await db.collection('batches').get();
  let migrated = 0;
  let skipped = 0;

  for (const docSnap of legacy.docs) {
    const data = docSnap.data() as LegacyBatch;
    const slug = (typeof data.clientSlug === 'string' && data.clientSlug) || null;
    if (!slug) {
      console.warn(`Skipping ${docSnap.id} — missing clientSlug`);
      skipped += 1;
      continue;
    }
    // Heuristic: legacy template-builder batches are the only writer today,
    // so default to that. The override exists for future migrations that
    // tagged appId on the legacy doc.
    const appId =
      typeof data.appId === 'string' && data.appId.length > 0
        ? data.appId
        : DEFAULT_APP_ID;

    const targetRef = db
      .collection('clients')
      .doc(slug)
      .collection('apps')
      .doc(appId)
      .collection('batches')
      .doc(docSnap.id);

    const existing = await targetRef.get();
    if (existing.exists) {
      skipped += 1;
      continue;
    }

    if (isDryRun) {
      console.log(
        `[dry-run] would migrate batches/${docSnap.id} → ${targetRef.path}`
      );
    } else {
      await targetRef.set({ ...data, appId });

      // Also migrate the results sub-collection.
      const results = await docSnap.ref.collection('results').get();
      const batch = db.batch();
      for (const r of results.docs) {
        batch.set(targetRef.collection('results').doc(r.id), r.data());
      }
      if (!results.empty) await batch.commit();

      // Delete the legacy doc + its results AFTER the new doc is durable.
      const cleanup = db.batch();
      for (const r of results.docs) cleanup.delete(r.ref);
      cleanup.delete(docSnap.ref);
      await cleanup.commit();
    }

    migrated += 1;
  }

  return { migrated, skipped };
}

migrate()
  .then(({ migrated, skipped }) => {
    console.log(
      `${isDryRun ? '[dry-run] ' : ''}Done. Migrated ${migrated}, skipped ${skipped}.`
    );
    process.exit(0);
  })
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
