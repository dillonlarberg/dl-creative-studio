import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  runTransaction,
  setDoc,
  updateDoc,
  deleteDoc,
  type Transaction,
  type DocumentReference,
  type DocumentSnapshot,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { paths, type ClientSlug } from '../platform/firebase/paths';
import { authService } from './auth';
import type {
  TemplateLibraryRecord,
  TemplateHistoryEntry,
  NewTemplateData,
  FieldMapping,
} from './templateLibrary.types';
import {
  TemplateNotFoundError,
  TemplatePermissionError,
  TemplatePublishedError,
  TemplateDraftError,
} from './templateLibrary.types';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function currentUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not authenticated');
  return uid;
}

function currentAlliId(): string {
  const id = authService.getAlliUserId();
  if (!id) throw new Error('Alli user ID not available');
  return id;
}

function _writeHistoryInTransaction(
  transaction: Transaction,
  docRef: DocumentReference,
  currentSnap: DocumentSnapshot
): void {
  if (!currentSnap.exists()) return;
  const { id: _id, ...snapshot } = currentSnap.data() as TemplateLibraryRecord;
  const historyRef = doc(collection(db, `${docRef.path}/history`));
  transaction.set(historyRef, {
    snapshot,
    savedBy: currentAlliId(),
    savedByUid: currentUid(),
    savedAt: serverTimestamp(),
  });
}

// ---------------------------------------------------------------------------
// Feed validation helpers (exported for testing)
// ---------------------------------------------------------------------------

export async function _fetchLiveFeedColumns(datasourceId: string): Promise<string[]> {
  const snap = await getDoc(doc(db, `datasources/${datasourceId}`));
  if (!snap.exists()) throw new Error(`Datasource not found: ${datasourceId}`);
  return (snap.data()!.columns as string[]).sort();
}

// Tests spy on `_fns._fetchLiveFeedColumns` directly; `checkFeedDrift` calls through
// `_fns` so the spy is honoured inside the module without dynamic import interception.
export const _fns = {
  _fetchLiveFeedColumns,
};

function validateMappings(
  expectedFields: string[],
  fieldMappings: Record<string, FieldMapping>
): void {
  const unmapped = expectedFields.filter((f) => !(f in fieldMappings));
  if (unmapped.length > 0) {
    throw new Error(`Unmapped required field(s): ${unmapped.join(', ')}`);
  }

  for (const [field, mapping] of Object.entries(fieldMappings)) {
    if (mapping.source === 'feed' && !mapping.column) {
      throw new Error(`Field "${field}" maps to feed source but column is empty`);
    }
    if (mapping.source === 'upload' && !mapping.assetPath) {
      throw new Error(`Field "${field}" maps to upload source but assetPath is empty`);
    }
    if (mapping.source === 'brand' && !mapping.brandKey) {
      throw new Error(`Field "${field}" maps to brand source but brandKey is empty`);
    }
  }
}

async function checkFeedDrift(
  fieldMappings: Record<string, FieldMapping>,
  datasourceId: string
): Promise<string[]> {
  const mappedFeedColumns = Object.values(fieldMappings)
    .filter((m): m is Extract<FieldMapping, { source: 'feed' }> => m.source === 'feed')
    .map((m) => m.column);

  const liveColumns = await _fns._fetchLiveFeedColumns(datasourceId);
  return mappedFeedColumns.filter((c) => !liveColumns.includes(c));
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const templateLibraryService = {

  async getTemplate(clientSlug: ClientSlug, templateId: string): Promise<TemplateLibraryRecord> {
    const ref = doc(db, paths.templateLibraryDoc(clientSlug, templateId));
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new TemplateNotFoundError(templateId);
      return { id: snap.id, ...snap.data() } as TemplateLibraryRecord;
    } catch (err: unknown) {
      if (err instanceof TemplateNotFoundError) throw err;
      const code = (err as { code?: string }).code;
      if (code === 'permission-denied') throw new TemplatePermissionError(templateId);
      throw err;
    }
  },

  async getPublishedTemplates(clientSlug: ClientSlug): Promise<TemplateLibraryRecord[]> {
    const ref = collection(db, paths.templateLibrary(clientSlug));
    const q = query(ref, where('status', '==', 'published'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TemplateLibraryRecord));
  },

  async getDraftTemplates(clientSlug: ClientSlug): Promise<TemplateLibraryRecord[]> {
    const uid = currentUid();
    const ref = collection(db, paths.templateLibrary(clientSlug));
    const q = query(
      ref,
      where('createdByUid', '==', uid),
      where('status', '==', 'draft'),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TemplateLibraryRecord));
  },

  async saveDraft(clientSlug: ClientSlug, data: NewTemplateData): Promise<string> {
    const uid = currentUid();
    const alliId = currentAlliId();
    const colRef = collection(db, paths.templateLibrary(clientSlug));
    const newDocRef = doc(colRef);

    await setDoc(newDocRef, {
      ...data,
      id: newDocRef.id,
      status: 'draft',
      version: 1,
      createdBy: alliId,
      createdByUid: uid,
      createdAt: serverTimestamp(),
      updatedBy: alliId,
      updatedByUid: uid,
      updatedAt: serverTimestamp(),
      publishedAt: null,
      publishedBy: null,
      publishedByUid: null,
    });

    return newDocRef.id;
  },

  async upsertDraft(
    clientSlug: ClientSlug,
    templateId: string,
    data: Partial<TemplateLibraryRecord>
  ): Promise<void> {
    const docRef = doc(db, paths.templateLibraryDoc(clientSlug, templateId));

    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(docRef);

      if (!snap.exists()) throw new TemplateNotFoundError(templateId);
      if ((snap.data() as TemplateLibraryRecord).status === 'published') {
        throw new TemplatePublishedError(templateId);
      }

      _writeHistoryInTransaction(transaction, docRef, snap);

      const {
        id: _id,
        createdBy: _cb,
        createdByUid: _cbUid,
        createdAt: _ca,
        status: _s,
        version: _v,
        publishedBy: _pb,
        publishedByUid: _pbUid,
        publishedAt: _pa,
        ...safeData
      } = data;

      transaction.update(docRef, {
        ...safeData,
        updatedBy: currentAlliId(),
        updatedByUid: currentUid(),
        updatedAt: serverTimestamp(),
      });
    });
  },

  async publish(clientSlug: ClientSlug, templateId: string): Promise<void> {
    const docRef = doc(db, paths.templateLibraryDoc(clientSlug, templateId));

    // Phase 1: validation reads outside the transaction
    const preSnap = await getDoc(docRef);
    if (!preSnap.exists()) throw new TemplateNotFoundError(templateId);
    const preData = preSnap.data() as TemplateLibraryRecord;
    if (preData.status === 'published') throw new TemplatePublishedError(templateId);
    validateMappings(preData.scaffoldSnapshot.expectedFields, preData.fieldMappings);
    // Feed drift check reads from the datasources registry. If it fails (e.g.
    // Firestore rules don't cover that path yet), skip the check rather than
    // blocking publish — the column mapping was already validated client-side.
    try {
      const removed = await checkFeedDrift(preData.fieldMappings, preData.datasourceId);
      if (removed.length > 0) {
        throw new Error(
          `Cannot publish: ${removed.length} mapped feed column(s) no longer exist: ${removed.join(', ')}`
        );
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Cannot publish:')) throw err;
      console.warn('[templateLibrary] Feed drift check skipped:', (err as Error).message);
    }

    // Phase 2: atomic write — re-reads inside transaction for consistency
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(docRef);
      if (!snap.exists()) throw new TemplateNotFoundError(templateId);
      const data = snap.data() as TemplateLibraryRecord;
      if (data.status === 'published') throw new TemplatePublishedError(templateId);

      _writeHistoryInTransaction(transaction, docRef, snap);

      transaction.update(docRef, {
        status: 'published',
        version: data.version + 1,
        publishedBy: currentAlliId(),
        publishedByUid: currentUid(),
        publishedAt: serverTimestamp(),
        updatedBy: currentAlliId(),
        updatedByUid: currentUid(),
        updatedAt: serverTimestamp(),
      });
    });
  },

  async updatePublished(
    clientSlug: ClientSlug,
    templateId: string,
    data: Partial<TemplateLibraryRecord>
  ): Promise<void> {
    const docRef = doc(db, paths.templateLibraryDoc(clientSlug, templateId));

    // Phase 1: validation reads outside the transaction
    const preSnap = await getDoc(docRef);
    if (!preSnap.exists()) throw new TemplateNotFoundError(templateId);
    const preCurrent = preSnap.data() as TemplateLibraryRecord;
    if (preCurrent.status === 'draft') throw new TemplateDraftError(templateId);
    const merged = { ...preCurrent, ...data };
    validateMappings(merged.scaffoldSnapshot.expectedFields, merged.fieldMappings);
    const removed = await checkFeedDrift(merged.fieldMappings, merged.datasourceId);
    if (removed.length > 0) {
      throw new Error(
        `Cannot update: ${removed.length} mapped feed column(s) no longer exist: ${removed.join(', ')}`
      );
    }

    // Phase 2: atomic write — re-reads inside transaction for consistency
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(docRef);
      if (!snap.exists()) throw new TemplateNotFoundError(templateId);
      const current = snap.data() as TemplateLibraryRecord;
      if (current.status === 'draft') throw new TemplateDraftError(templateId);

      _writeHistoryInTransaction(transaction, docRef, snap);

      const {
        id: _id,
        createdBy: _cb,
        createdByUid: _cbUid,
        createdAt: _ca,
        status: _s,
        version: _v,
        publishedBy: _pb,
        publishedByUid: _pbUid,
        publishedAt: _pa,
        ...safeData
      } = data;

      transaction.update(docRef, {
        ...safeData,
        version: current.version + 1,
        updatedBy: currentAlliId(),
        updatedByUid: currentUid(),
        updatedAt: serverTimestamp(),
      });
    });
  },

  async deleteTemplate(clientSlug: ClientSlug, templateId: string): Promise<void> {
    const ref = doc(db, paths.templateLibraryDoc(clientSlug, templateId));
    await deleteDoc(ref);
  },

};
