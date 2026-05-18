import { z } from 'zod';
import type { Timestamp } from 'firebase/firestore';

/**
 * Canonical OutputDoc — the single shape every modular app's generation
 * lands as in Firestore at `clients/{slug}/apps/{appId}/outputs/{outputId}`.
 *
 * Why each field exists:
 *   - clientSlug + appId are denormalized because Firestore collectionGroup
 *     queries cannot infer them from path. We need them as fields to filter
 *     `collectionGroup('outputs').where('clientSlug', '==', X)`.
 *   - createdBy is the Alli user id (OIDC sub claim), NOT the Firebase UID.
 *     Server-derived only — never client-supplied.
 *   - format is discriminated by `kind` so image and video outputs share a
 *     collection without crowding the type system.
 *
 * Loose `z.any()` on Timestamp fields keeps the Zod schema portable between
 * client and admin SDKs (where Timestamp is a different class). The exported
 * `OutputDoc` type narrows it back via intersection so consumers see the
 * real Timestamp.
 *
 * Plan: docs/superpowers/plans/2026-05-15-unified-output-schema-migration.md
 */

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
  // Identity
  outputId: z.string().min(1),
  batchId: z.string().min(1),

  // Denormalized for collectionGroup filtering (cannot infer from path).
  clientSlug: z.string().min(1),
  appId: z.string().min(1),

  // Creator attribution — Alli user id, NOT Firebase UID.
  createdBy: z.string().min(1),

  // Lifecycle
  createdAt: z.any(),
  completedAt: z.any().optional(),
  status: z.enum(OUTPUT_STATUSES),

  // Type axis
  kind: z.enum(OUTPUT_KINDS),
  format: z.union([ImageFormat, VideoFormat]),

  // Asset pointers (populated on completion)
  previewUrl: z.string().url().optional(),
  storageRef: z.string().min(1).optional(),

  // Generator metadata (free-form per app; not filtered on)
  model: z.string().optional(),
  quality: z.string().optional(),
  prompt: z.string().nullable().optional(),

  // Failure metadata
  errorCategory: z.enum(['transient', 'permanent']).optional(),
  errorMessage: z.string().optional(),
});

export type OutputDoc = z.infer<typeof OutputDocSchema> & {
  createdAt: Timestamp;
  completedAt?: Timestamp;
};
