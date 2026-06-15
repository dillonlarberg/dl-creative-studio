import { useEffect, useState } from 'react';
import { doc, collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../../firebase';
import type { BatchDoc, VersionDoc } from '../types';

/**
 * Live-progress subscription for a generating batch. Watches the batch doc and
 * its `versions` subcollection via onSnapshot, so the UI updates as the backend
 * writes plans, growing `thumbs` arrays, and status transitions. Mirrors
 * ad-resizing's useBatchOutputs.
 */
export function useCutdownBatch(clientSlug: string, batchId: string | null) {
  const [batch, setBatch] = useState<BatchDoc | null>(null);
  const [versions, setVersions] = useState<VersionDoc[]>([]);

  useEffect(() => {
    if (!batchId) return;
    const base = `clients/${clientSlug}/apps/video-cutdown/batches/${batchId}`;
    const u1 = onSnapshot(doc(db, base), (s) => setBatch((s.data() as BatchDoc) ?? null));
    const u2 = onSnapshot(collection(db, `${base}/versions`), (snap) =>
      setVersions(snap.docs.map((d) => d.data() as VersionDoc)),
    );
    return () => {
      u1();
      u2();
    };
  }, [clientSlug, batchId]);

  return { batch, versions };
}
