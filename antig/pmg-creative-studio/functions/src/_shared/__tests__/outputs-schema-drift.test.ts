/**
 * Schema-drift guard — pins behavioral parity between the admin-side and
 * client-side OutputDoc schemas.
 *
 * Why behavioral parity instead of shape-internals comparison: the two
 * workspaces are on different Zod versions (functions/ on v3, src/ on v4)
 * and their internal AST shapes differ. Comparing observable behavior
 * (what each schema accepts and rejects) is robust across versions.
 *
 * If this test ever fails, copy the diverged field from one schema to the
 * other in the same commit. The plan's §self-review P0 line 1689 mandates
 * this guard exists for the duration of the migration.
 *
 * Pattern modeled on functions/src/_shared/__tests__/allowlist-drift.test.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  OutputDocSchema as AdminSchema,
  OUTPUT_KINDS as ADMIN_KINDS,
  OUTPUT_STATUSES as ADMIN_STATUSES,
} from '../outputs';
// Workspace-relative require so vitest resolves it through node's module walk
// regardless of tsconfig boundaries. Confirmed working at session-time.
import {
  OutputDocSchema as ClientSchema,
  OUTPUT_KINDS as CLIENT_KINDS,
  OUTPUT_STATUSES as CLIENT_STATUSES,
} from '../../../../src/types/outputs';

const validImage = {
  outputId: 'o1',
  batchId: 'b1',
  clientSlug: 'apple_services',
  appId: 'ad-resizing',
  createdBy: 'alli-sub-xyz',
  createdAt: { seconds: 1, nanoseconds: 0 },
  status: 'complete' as const,
  kind: 'image' as const,
  format: { width: 1280, height: 720, label: 'digital-1280x720' },
  storageRef: 'foo',
  previewUrl: 'https://x/y.png',
};

describe('OutputDocSchema drift (admin ↔ client)', () => {
  it('OUTPUT_KINDS enum is identical in both workspaces', () => {
    expect([...ADMIN_KINDS].sort()).toEqual([...CLIENT_KINDS].sort());
  });

  it('OUTPUT_STATUSES enum is identical in both workspaces', () => {
    expect([...ADMIN_STATUSES].sort()).toEqual([...CLIENT_STATUSES].sort());
  });

  it('both schemas accept the canonical valid image doc', () => {
    expect(() => AdminSchema.parse(validImage)).not.toThrow();
    expect(() => ClientSchema.parse(validImage)).not.toThrow();
  });

  it.each([
    'outputId',
    'batchId',
    'clientSlug',
    'appId',
    'createdBy',
    'status',
    'kind',
    'format',
  ])('both schemas reject docs missing required field: %s', (field) => {
    const { [field]: _omit, ...bad } = validImage as Record<string, unknown>;
    expect(() => AdminSchema.parse(bad)).toThrow();
    expect(() => ClientSchema.parse(bad)).toThrow();
  });

  it('both schemas accept a valid video-format doc', () => {
    const video = {
      ...validImage,
      kind: 'video' as const,
      format: { durationMs: 30000, aspectRatio: '16:9' },
    };
    expect(() => AdminSchema.parse(video)).not.toThrow();
    expect(() => ClientSchema.parse(video)).not.toThrow();
  });

  // Note: neither schema enforces kind/format consistency (z.union, not
  // z.discriminatedUnion). An image-kind doc with a video-shaped format
  // currently passes validation. Treated as a known limitation; kind/format
  // consistency is enforced by writer call sites for now. Switching both
  // schemas to discriminatedUnion in lockstep is a follow-up cleanup.
});
