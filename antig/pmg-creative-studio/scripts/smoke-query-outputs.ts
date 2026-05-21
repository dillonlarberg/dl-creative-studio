#!/usr/bin/env tsx
/**
 * One-shot smoke test for the unified `outputs` collectionGroup query.
 *
 * Exercises the production query shape end-to-end against dev Firestore:
 *
 *   collectionGroup('outputs')
 *     .where('clientSlug', '==', <slug>)
 *     .orderBy('createdAt', 'desc')
 *     .limit(<n>)
 *
 * This is the query that the future "your generations" view will hit. Running
 * this script confirms:
 *
 *   - The composite index from #thegreatmigration no. 12 is built (no
 *     "requires an index" error).
 *   - The collectionGroup rule from no. 13 doesn't block legitimate reads
 *     (admin SDK bypasses rules — for a true rules check, hit the live
 *     Firestore via a client SDK as an allowlisted user).
 *   - Every returned doc carries the canonical OutputDoc parity fields
 *     (appId, createdBy, kind) from no. 06–09.
 *
 * Usage:
 *
 *   # ONE TIME: authenticate ADC (already done if you ran the backfill).
 *   gcloud auth application-default login
 *
 *   # Default — query nike_na, 10 results.
 *   npx tsx scripts/smoke-query-outputs.ts
 *
 *   # Scope to a different client.
 *   npx tsx scripts/smoke-query-outputs.ts --client=apple_services
 *
 *   # Change result count.
 *   npx tsx scripts/smoke-query-outputs.ts --limit=25
 *
 *   # Target a different project.
 *   FIREBASE_PROJECT_ID=other-project npx tsx scripts/smoke-query-outputs.ts
 */

import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

async function main() {
  const clientArg = process.argv.find((a) => a.startsWith('--client='));
  const clientSlug = clientArg ? clientArg.slice('--client='.length) : 'nike_na';
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Math.max(1, parseInt(limitArg.slice('--limit='.length), 10)) : 10;

  if (getApps().length === 0) {
    const projectId = process.env.FIREBASE_PROJECT_ID || 'automated-creative-e10d7';
    initializeApp({ credential: applicationDefault(), projectId });
  }
  const db = getFirestore();

  // eslint-disable-next-line no-console
  console.log(
    `Smoke-query outputs collectionGroup — clientSlug=${clientSlug} limit=${limit}`,
  );

  const snap = await db
    .collectionGroup('outputs')
    .where('clientSlug', '==', clientSlug)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  // eslint-disable-next-line no-console
  console.log(`Got ${snap.size} outputs.`);

  let missingFields = 0;
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    const appId = data.appId ?? '<missing>';
    const createdBy = data.createdBy ?? '<missing>';
    const kind = data.kind ?? '<missing>';
    const status = data.status ?? '<missing>';
    if (appId === '<missing>' || createdBy === '<missing>' || kind === '<missing>') {
      missingFields += 1;
    }
    // eslint-disable-next-line no-console
    console.log(
      `  ${d.ref.path}\n    appId=${appId}  createdBy=${createdBy}  kind=${kind}  status=${status}`,
    );
  }

  if (missingFields > 0) {
    // eslint-disable-next-line no-console
    console.error(
      `\n${missingFields} doc(s) are missing canonical parity fields — investigate.`,
    );
    process.exit(2);
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
