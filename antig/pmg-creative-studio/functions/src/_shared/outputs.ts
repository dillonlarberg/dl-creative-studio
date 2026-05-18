/**
 * Admin-SDK helpers for the canonical per-app outputs collection.
 *
 * Mirror of src/services/outputs.ts (client side). Duplicated by necessity:
 * functions/ is built and deployed independently with its own dependency
 * tree (firebase-admin vs firebase client SDK; zod v3 here vs v4 there).
 *
 * The schema in this file is duplicated from src/types/outputs.ts. The
 * outputs-schema-drift.test.ts guard asserts behavioral parity (both schemas
 * accept and reject the same inputs) so they can't silently diverge. If
 * you change one, change the other in the same commit.
 *
 * Plan: docs/superpowers/plans/2026-05-15-unified-output-schema-migration.md §Task 5
 */

import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';

export const OUTPUT_KINDS = ['image', 'video'] as const;
export type OutputKind = (typeof OUTPUT_KINDS)[number];

export const OUTPUT_STATUSES = ['pending', 'processing', 'complete', 'error'] as const;
export type OutputStatus = (typeof OUTPUT_STATUSES)[number];

const ImageFormat = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  label: z.string().min(1),
});

const VideoFormat = z.object({
  durationMs: z.number().int().positive(),
  aspectRatio: z.string().min(1),
});

export const OutputDocSchema = z.object({
  outputId: z.string().min(1),
  batchId: z.string().min(1),
  clientSlug: z.string().min(1),
  appId: z.string().min(1),
  createdBy: z.string().min(1),
  createdAt: z.any(),
  completedAt: z.any().optional(),
  status: z.enum(OUTPUT_STATUSES),
  kind: z.enum(OUTPUT_KINDS),
  format: z.union([ImageFormat, VideoFormat]),
  previewUrl: z.string().url().optional(),
  storageRef: z.string().min(1).optional(),
  model: z.string().optional(),
  quality: z.string().optional(),
  prompt: z.string().nullable().optional(),
  errorCategory: z.enum(['transient', 'permanent']).optional(),
  errorMessage: z.string().optional(),
});

export type OutputDoc = z.infer<typeof OutputDocSchema>;

export interface CreateOutputInput {
  clientSlug: string;
  appId: string;
  outputId: string;
  batchId: string;
  createdBy: string;
  status: OutputStatus;
  kind: OutputKind;
  format: OutputDoc['format'];
  model?: string;
  quality?: string;
  prompt?: string | null;
}

// Identity fields and createdAt are intentionally absent.
export type UpdateOutputInput = Partial<
  Omit<OutputDoc, 'outputId' | 'clientSlug' | 'appId' | 'createdAt' | 'createdBy' | 'kind'>
>;

function outputPath(clientSlug: string, appId: string, outputId: string): string {
  return `clients/${clientSlug}/apps/${appId}/outputs/${outputId}`;
}

/**
 * Insert a new output doc. Stamps createdAt with serverTimestamp; stamps
 * completedAt too if the insert lands as status='complete' (rare). Validates
 * the input against OutputDocSchema before writing.
 *
 * Never use this to modify an existing doc — use updateOutput.
 */
export async function createOutput(db: Firestore, input: CreateOutputInput): Promise<void> {
  // Validate. The placeholder createdAt satisfies the schema's z.any() slot
  // without leaking into the write payload.
  OutputDocSchema.parse({ ...input, createdAt: { seconds: 0, nanoseconds: 0 } });

  await db.doc(outputPath(input.clientSlug, input.appId, input.outputId)).set({
    ...input,
    createdAt: FieldValue.serverTimestamp(),
    ...(input.status === 'complete' ? { completedAt: FieldValue.serverTimestamp() } : {}),
  });
}

/**
 * Merge-update an existing output. The patch type excludes identity fields
 * and createdAt — neither can be passed (type guard) nor written (impl
 * guard). Stamps completedAt on status='complete' transitions.
 */
export async function updateOutput(
  db: Firestore,
  clientSlug: string,
  appId: string,
  outputId: string,
  patch: UpdateOutputInput
): Promise<void> {
  await db.doc(outputPath(clientSlug, appId, outputId)).set(
    {
      ...patch,
      ...(patch.status === 'complete' ? { completedAt: FieldValue.serverTimestamp() } : {}),
    },
    { merge: true }
  );
}
