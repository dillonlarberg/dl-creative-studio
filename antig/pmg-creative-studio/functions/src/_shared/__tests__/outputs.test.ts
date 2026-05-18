/**
 * Admin-SDK outputs helpers — unit tests with mocked firebase-admin/firestore.
 *
 * Mirrors the pattern in functions/src/resize/runOutpaintBatch.test.ts: an
 * in-memory map stands in for Firestore so the test runs in standard preflight
 * (no emulator required). Path correctness, identity preservation, and timestamp
 * stamping are verifiable without round-tripping through a real Firestore.
 *
 * The emulator-based round-trip is appropriate for Task 13's end-to-end smoke
 * test, not for unit-level assertions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const firestoreDocs = new Map<string, Record<string, unknown>>();

function mockDocRef(path: string) {
  return {
    path,
    get: vi.fn(async () => {
      const data = firestoreDocs.get(path);
      return { exists: !!data, data: () => data };
    }),
    set: vi.fn(async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
      const prev = firestoreDocs.get(path) ?? {};
      if (opts?.merge) {
        firestoreDocs.set(path, { ...prev, ...data });
      } else {
        firestoreDocs.set(path, data);
      }
    }),
  };
}

const fakeServerTimestamp = { __sentinel__: 'serverTimestamp' };

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => fakeServerTimestamp },
}));

import type { Firestore } from 'firebase-admin/firestore';
import { createOutput, updateOutput } from '../outputs';

function fakeDb(): Firestore {
  return {
    doc: (path: string) => mockDocRef(path),
  } as unknown as Firestore;
}

beforeEach(() => {
  firestoreDocs.clear();
  vi.clearAllMocks();
});

const validInput = {
  clientSlug: 'apple_services',
  appId: 'ad-resizing',
  outputId: 'o1',
  batchId: 'b1',
  createdBy: 'alli-sub-xyz',
  status: 'pending' as const,
  kind: 'image' as const,
  format: { width: 1280, height: 720, label: 'digital-1280x720' },
};

describe('createOutput (admin)', () => {
  it('writes to the canonical outputs path', async () => {
    await createOutput(fakeDb(), validInput);
    const data = firestoreDocs.get(
      'clients/apple_services/apps/ad-resizing/outputs/o1'
    );
    expect(data).toBeDefined();
    expect(data?.createdBy).toBe('alli-sub-xyz');
    expect(data?.clientSlug).toBe('apple_services');
    expect(data?.appId).toBe('ad-resizing');
  });

  it('stamps createdAt with FieldValue.serverTimestamp', async () => {
    await createOutput(fakeDb(), validInput);
    const data = firestoreDocs.get(
      'clients/apple_services/apps/ad-resizing/outputs/o1'
    );
    expect(data?.createdAt).toBe(fakeServerTimestamp);
  });

  it('rejects an input missing createdBy', async () => {
    const { createdBy: _omit, ...bad } = validInput;
    await expect(
      createOutput(fakeDb(), bad as never)
    ).rejects.toThrow(/createdBy/);
  });

  // Note: the schema uses z.union([ImageFormat, VideoFormat]) without a
  // discriminator on `kind`, so an image-kind doc with a video-shaped
  // format will PASS validation today. That's a known limitation — kind
  // and format consistency is enforced by writer call sites, not the
  // schema. Switching to z.discriminatedUnion is a follow-up cleanup
  // (would need to land in client + admin schemas in one commit).

  it('rejects unknown status enum value', async () => {
    await expect(
      createOutput(fakeDb(), { ...validInput, status: 'frobnicating' as never })
    ).rejects.toThrow();
  });
});

describe('updateOutput (admin)', () => {
  it('writes the patch to the canonical doc path with merge:true', async () => {
    await createOutput(fakeDb(), validInput);
    await updateOutput(fakeDb(), 'apple_services', 'ad-resizing', 'o1', {
      status: 'complete',
      storageRef: 'clients/apple_services/apps/ad-resizing/outputs/o1.png',
    });
    const data = firestoreDocs.get(
      'clients/apple_services/apps/ad-resizing/outputs/o1'
    );
    expect(data?.status).toBe('complete');
    expect(data?.storageRef).toBeDefined();
  });

  it('preserves createdAt across the merge', async () => {
    await createOutput(fakeDb(), validInput);
    const before = firestoreDocs.get(
      'clients/apple_services/apps/ad-resizing/outputs/o1'
    )?.createdAt;
    await updateOutput(fakeDb(), 'apple_services', 'ad-resizing', 'o1', {
      status: 'complete',
      storageRef: 'foo',
    });
    const after = firestoreDocs.get(
      'clients/apple_services/apps/ad-resizing/outputs/o1'
    );
    expect(after?.createdAt).toBe(before);
  });

  it('stamps completedAt when status transitions to complete', async () => {
    await createOutput(fakeDb(), validInput);
    await updateOutput(fakeDb(), 'apple_services', 'ad-resizing', 'o1', {
      status: 'complete',
    });
    const after = firestoreDocs.get(
      'clients/apple_services/apps/ad-resizing/outputs/o1'
    );
    expect(after?.completedAt).toBe(fakeServerTimestamp);
  });

  it('does NOT stamp completedAt for non-complete updates', async () => {
    await createOutput(fakeDb(), validInput);
    await updateOutput(fakeDb(), 'apple_services', 'ad-resizing', 'o1', {
      status: 'processing',
    });
    const after = firestoreDocs.get(
      'clients/apple_services/apps/ad-resizing/outputs/o1'
    );
    expect(after?.completedAt).toBeUndefined();
  });
});
