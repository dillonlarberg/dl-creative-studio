#!/usr/bin/env tsx
/**
 * Backfill historical legacy results into the canonical outputs collection.
 *
 *   FROM: clients/{slug}/apps/{appId}/batches/{batchId}/results/{resultId}
 *   TO:   clients/{slug}/apps/{appId}/outputs/{resultId}    (same id, peer collection)
 *
 * Idempotent — checks for an existing output doc before writing. Re-runs are
 * safe and report `copied=0 skipped=N` on a stable dataset.
 *
 * Required before #thegreatmigration no. 10 (reader cutover, plan Task 9).
 * The cutover is HARD-gated on this script having finished a wet run in the
 * target environment without errors.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=~/.gcloud/automated-creative-e10d7-sa.json \
 *     npx tsx scripts/backfill-outputs-from-results.ts --dry-run
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=~/.gcloud/automated-creative-e10d7-sa.json \
 *     npx tsx scripts/backfill-outputs-from-results.ts
 *
 * Add `--client=<slug>` to scope to a single client; otherwise walks all.
 *
 * The pure transformation logic lives in
 * `scripts/_internal/legacyResultToOutputDoc.ts` and is unit-tested in
 * `scripts/__tests__/legacyResultToOutputDoc.test.ts`. This file is the
 * Firestore-walking wrapper around it.
 */

import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { legacyResultToOutputDoc } from './_internal/legacyResultToOutputDoc';

interface Counters {
  copied: number;
  skipped: number;
  errored: number;
}

async function run(options: {
  dryRun: boolean;
  clientFilter: string | null;
}): Promise<Counters> {
  if (getApps().length === 0) {
    // Project ID must be explicit when running under ADC outside a GCP-
    // managed environment (i.e. local dev). `gcloud auth
    // application-default login` saves creds but does NOT auto-detect a
    // project. Override via FIREBASE_PROJECT_ID env var if you ever need
    // to point this at a different env.
    const projectId = process.env.FIREBASE_PROJECT_ID || 'automated-creative-e10d7';
    initializeApp({ credential: applicationDefault(), projectId });
  }
  const db = getFirestore();
  const counters: Counters = { copied: 0, skipped: 0, errored: 0 };

  const clients = await db.collection('clients').listDocuments();
  for (const clientRef of clients) {
    if (options.clientFilter && clientRef.id !== options.clientFilter) continue;

    const apps = await clientRef.collection('apps').listDocuments();
    for (const appRef of apps) {
      const batches = await appRef.collection('batches').listDocuments();
      for (const batchRef of batches) {
        const results = await batchRef.collection('results').get();
        for (const r of results.docs) {
          const outputRef = appRef.collection('outputs').doc(r.id);

          try {
            const existing = await outputRef.get();
            if (existing.exists) {
              counters.skipped += 1;
              continue;
            }

            const doc = legacyResultToOutputDoc({
              resultId: r.id,
              batchId: batchRef.id,
              clientSlug: clientRef.id,
              appId: appRef.id,
              legacy: r.data() as Record<string, unknown>,
              fallbackCreatedAt: FieldValue.serverTimestamp(),
            });

            if (options.dryRun) {
              // eslint-disable-next-line no-console
              console.log(`[DRY] would write ${outputRef.path}: ${JSON.stringify(doc)}`);
            } else {
              await outputRef.set(doc, { merge: true });
            }
            counters.copied += 1;
          } catch (err) {
            counters.errored += 1;
            // eslint-disable-next-line no-console
            console.error(
              `Error backfilling ${outputRef.path}:`,
              (err as Error).message,
            );
          }
        }
      }
    }
  }

  return counters;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const clientArg = process.argv.find((a) => a.startsWith('--client='));
  const clientFilter = clientArg ? clientArg.slice('--client='.length) : null;

  // eslint-disable-next-line no-console
  console.log(
    `Backfill outputs from results — dryRun=${dryRun} clientFilter=${clientFilter ?? '<all>'}`,
  );

  const c = await run({ dryRun, clientFilter });

  // eslint-disable-next-line no-console
  console.log(
    `Done. copied=${c.copied} skipped=${c.skipped} errored=${c.errored} dryRun=${dryRun}`,
  );

  if (c.errored > 0) {
    // eslint-disable-next-line no-console
    console.error('One or more docs failed to backfill — re-run after investigating.');
    process.exit(2);
  }
}

// The script is only ever invoked as a CLI (`npx tsx scripts/...`); nothing
// imports it. Run main() unconditionally — the ESM `require.main === module`
// idiom isn't available with "type": "module" in package.json.
main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
