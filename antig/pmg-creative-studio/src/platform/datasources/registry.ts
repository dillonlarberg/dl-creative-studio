// src/platform/datasources/registry.ts
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { paths } from '../firebase/paths';
import type { DatasourceRecord, ScanMarker } from './types';

/** Read the persisted registry, optionally filtered by media. */
export async function getDatasources(
  clientSlug: string,
  opts?: { media?: 'image' | 'video' },
): Promise<DatasourceRecord[]> {
  const col = collection(db, paths.datasources(clientSlug));
  const q =
    opts?.media === 'image'
      ? query(col, where('hasImage', '==', true))
      : opts?.media === 'video'
        ? query(col, where('hasVideo', '==', true))
        : query(col);
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => d.data() as DatasourceRecord)
    .sort((a, b) => a.modelName.localeCompare(b.modelName));
}

/** Read the scan marker fields off the client doc. Null if never scanned. */
export async function getScanMarker(clientSlug: string): Promise<ScanMarker | null> {
  const snap = await getDoc(doc(db, paths.client(clientSlug)));
  if (!snap.exists()) return null;
  const d = snap.data() as Record<string, unknown>;
  if (d.datasourcesScanVersion == null) return null;
  const ts = d.datasourcesScannedAt as { toMillis?: () => number } | null | undefined;
  return {
    datasourcesScanVersion: Number(d.datasourcesScanVersion),
    datasourcesFeedCount: Number(d.datasourcesFeedCount ?? 0),
    datasourcesScannedAt: ts?.toMillis ? ts.toMillis() : null,
  };
}
