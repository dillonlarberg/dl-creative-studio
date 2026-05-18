/**
 * Client-SDK helpers for the canonical per-app outputs collection.
 *
 * Path: clients/{clientSlug}/apps/{appId}/outputs/{outputId}
 * Schema: src/types/outputs.ts (OutputDoc)
 *
 * The shape of this module is intentionally split into two writers:
 *
 *   - createOutput  → insert-only. Sets createdAt = serverTimestamp().
 *   - updateOutput  → merge-only. Never touches identity fields or createdAt.
 *
 * That split is the answer to the eng-review P0 "createdAt overwrite" risk:
 * if a single writeOutput() did both insert and merge, an unguarded merge of
 * `{ createdAt: serverTimestamp() }` on every call would silently reset the
 * doc's creation time on every status transition. Splitting the entry points
 * makes the bug impossible to write.
 *
 * Plan: docs/superpowers/plans/2026-05-15-unified-output-schema-migration.md §Task 4
 */

import {
  collection,
  collectionGroup,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Firestore,
} from 'firebase/firestore';
import { paths } from '../platform/firebase/paths';
import type { AppId, ClientSlug } from '../platform/firebase/paths';
import { OutputDocSchema, type OutputDoc } from '../types/outputs';

export interface CreateOutputInput {
  clientSlug: ClientSlug;
  appId: AppId;
  outputId: string;
  batchId: string;
  createdBy: string;
  status: OutputDoc['status'];
  kind: OutputDoc['kind'];
  format: OutputDoc['format'];
  // Optional generator metadata permitted on insert.
  model?: string;
  quality?: string;
  prompt?: string | null;
}

// Identity fields (clientSlug, appId, outputId, createdBy, kind) and createdAt
// are intentionally absent — updateOutput must never overwrite them.
export type UpdateOutputInput = Partial<
  Omit<
    OutputDoc,
    'outputId' | 'clientSlug' | 'appId' | 'createdAt' | 'createdBy' | 'kind'
  >
>;

/**
 * Insert a new output doc at the canonical path. Stamps `createdAt` with
 * serverTimestamp(); stamps `completedAt` too if the insert lands as
 * status='complete' (rare — apps usually insert pending and update to
 * complete). Validates against OutputDocSchema before writing.
 *
 * Do NOT use this to modify an existing doc. Use updateOutput.
 */
export async function createOutput(
  db: Firestore,
  input: CreateOutputInput
): Promise<void> {
  // Validate inputs. Use a placeholder for the createdAt slot so the schema's
  // z.any() is satisfied without leaking the placeholder into the actual write.
  OutputDocSchema.parse({ ...input, createdAt: { seconds: 0, nanoseconds: 0 } });

  const ref = doc(db, paths.output(input.clientSlug, input.appId, input.outputId));
  await setDoc(ref, {
    ...input,
    createdAt: serverTimestamp(),
    ...(input.status === 'complete' ? { completedAt: serverTimestamp() } : {}),
  });
}

/**
 * Merge-update an existing output doc. The patch type intentionally excludes
 * identity fields and createdAt — the type system forbids you from passing
 * them, and the merge can't accidentally overwrite them either. On
 * status='complete', stamps completedAt with serverTimestamp().
 */
export async function updateOutput(
  db: Firestore,
  clientSlug: ClientSlug,
  appId: AppId,
  outputId: string,
  patch: UpdateOutputInput
): Promise<void> {
  const ref = doc(db, paths.output(clientSlug, appId, outputId));
  await setDoc(
    ref,
    {
      ...patch,
      ...(patch.status === 'complete' ? { completedAt: serverTimestamp() } : {}),
    },
    { merge: true }
  );
}

/**
 * Read all outputs for a specific batch, ordered by createdAt ascending.
 * Replaces batchService.getBatchResults — readers cut over in Task 9.
 */
export async function getOutputsForBatch(
  db: Firestore,
  clientSlug: ClientSlug,
  appId: AppId,
  batchId: string
): Promise<OutputDoc[]> {
  const q = query(
    collection(db, paths.outputs(clientSlug, appId)),
    where('batchId', '==', batchId),
    orderBy('createdAt', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as OutputDoc);
}

/**
 * Cross-app collectionGroup query for the future "your generations" view.
 * Requires the composite indexes declared in Task 11 to run efficiently in
 * prod. Allowlist-gated by Firestore rules; per-client isolation arrives in
 * the separate firestore-client-isolation-claims plan.
 */
export async function getOutputsForClient(
  db: Firestore,
  clientSlug: ClientSlug,
  filters: { appId?: AppId; createdBy?: string; batchId?: string } = {}
): Promise<OutputDoc[]> {
  let q = query(
    collectionGroup(db, 'outputs'),
    where('clientSlug', '==', clientSlug),
    orderBy('createdAt', 'desc')
  );
  if (filters.appId) q = query(q, where('appId', '==', filters.appId));
  if (filters.createdBy) q = query(q, where('createdBy', '==', filters.createdBy));
  if (filters.batchId) q = query(q, where('batchId', '==', filters.batchId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as OutputDoc);
}
