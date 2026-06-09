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

async function _writeHistoryInTransaction(
  transaction: Transaction,
  docRef: DocumentReference,
  currentSnap: DocumentSnapshot
): Promise<void> {
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

function validateMappings(
  expectedFields: string[],
  fieldMappings: Record<string, FieldMapping>
): void {
  const unmapped = expectedFields.filter((f) => !(f in fieldMappings));
  if (unmapped.length > 0) {
    throw new Error(`Unmapped required field(s): ${unmapped.join(', ')}`);
  }
}

async function checkFeedDrift(
  fieldMappings: Record<string, FieldMapping>,
  datasourceId: string
): Promise<string[]> {
  const mappedFeedColumns = Object.values(fieldMappings)
    .filter((m): m is Extract<FieldMapping, { source: 'feed' }> => m.source === 'feed')
    .map((m) => m.column);

  const liveColumns = await _fetchLiveFeedColumns(datasourceId);
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

};
