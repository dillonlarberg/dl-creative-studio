// functions/src/datasources/registry.ts
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { DatasourceRecord } from './scan';

/** Doc ids in `existing` no longer present in `current`. Pure + testable. */
export function diffRemovedIds(existing: string[], current: string[]): string[] {
  const keep = new Set(current);
  return existing.filter((id) => !keep.has(id));
}

/**
 * Reconcile the registry: upsert one doc per record, delete docs for models
 * that vanished, and stamp the scan marker on the client doc. Admin SDK, so it
 * bypasses Firestore rules (the only writer of this collection).
 *
 * Uses BulkWriter (not a single WriteBatch) so the write scales past the
 * 500-op-per-batch limit — it chunks + throttles internally. The reconcile is
 * not transactionally atomic, which is fine: each scan fully overwrites, so a
 * partial failure self-heals on the next scan.
 */
export async function writeRegistry(
  clientSlug: string,
  records: DatasourceRecord[],
  scanVersion: number,
): Promise<void> {
  const db = getFirestore();
  const col = db.collection(`clients/${clientSlug}/datasources`);

  const existingSnap = await col.get();
  const existingIds = existingSnap.docs.map((d) => d.id);
  const currentIds = records.map((r) => r.modelName);
  const removed = diffRemovedIds(existingIds, currentIds);

  const writer = db.bulkWriter();
  for (const rec of records) {
    void writer.set(col.doc(rec.modelName), rec); // full overwrite — authoritative
  }
  for (const id of removed) {
    void writer.delete(col.doc(id));
  }
  void writer.set(
    db.doc(`clients/${clientSlug}`),
    {
      datasourcesScannedAt: FieldValue.serverTimestamp(),
      datasourcesScanVersion: scanVersion,
      datasourcesFeedCount: records.length,
    },
    { merge: true },
  );
  await writer.close();
}
