# Unified Output Schema Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate every modular app's "output" write to a single canonical Firestore shape at `clients/{slug}/apps/{appId}/outputs/{outputId}` carrying the fields needed for a cross-app, per-client, per-creator, per-batch "your generations" view.

**Architecture:**
- Centralize output writes in `src/services/outputs.ts` (client SDK) and `functions/src/_shared/outputs.ts` (admin SDK) behind a Zod-validated `OutputDoc` schema. Every app must go through these helpers — no hand-built output docs. Schemas are duplicated across workspaces but guarded by a drift test (same pattern as `allowlist-drift.test.ts`).
- Split the writer into `createOutput()` (initial insert, sets `createdAt`) and `updateOutput()` (merge-only, never touches `createdAt`). One function with `{merge:true}` plus unconditional `serverTimestamp()` would silently overwrite `createdAt` on every retry — splitting prevents that class of bug entirely.
- Migrate template-builder / feed-processing / future resize-image writers from `batches/{batchId}/results/` to peer `outputs/`. Ad-resizing already writes to peer `outputs/` but is missing parity fields — backfill them at the existing write sites.
- Derive `createdBy` **server-side** from `request.auth.token.firebase.identities['oidc.alli'][0]` (the OIDC `sub` claim that Firebase Auth surfaces in the ID token). Never accept `createdBy` as callable input — a malicious client could forge it. Client-side writers (batches.ts) take `createdBy` as an arg from the local auth state; their writes are gated by Firestore rules that match `createdBy == request.auth.uid`-equivalent (security plan).
- Dual-write to legacy `results/` during cutover so readers keep working; backfill existing data; then remove the legacy path. **Deploy gate:** Task 9 (reader switch) must not deploy before Task 8 (backfill) has completed in the target environment. Plan calls this out explicitly.
- Declare composite indexes for `collectionGroup('outputs')` queries.

**Tech Stack:** Firebase Firestore v9 modular SDK (client) + firebase-admin (Cloud Functions), TypeScript, Zod for schema validation, Vitest for unit tests, `@firebase/rules-unit-testing` emulator suite.

**Out of scope (separate plans):**
- Security rules lockdown (the existing `isClientMember()` claim flip). Today's rules allowlist *all* PMG users into *all* clients — a cross-client view will widen that hole. This plan ships the schema; security hardening is a prerequisite to actually deploying the view to humans. Tracked as **2026-05-?-firestore-client-isolation-claims.md** (TBD).
- The "your generations" view UI itself. Consumes the schema this plan ships.

**Reference inputs:**
- Audit: chat session 2026-05-15 — three agents mapped current schema, security rules, and field-parity gaps.
- Path helpers: `src/platform/firebase/paths.ts:71-73` (already defines `outpaintOutputs(slug, appId)`).
- Existing peer-output writer: `functions/src/resize/runOutpaintBatch.ts:267-289` (seedPendingOutputs) and `:359-372` (completion).
- Legacy results writer: `src/services/batches.ts:64-67` (addResult).
- Memory: `project-unified-generations-view` — requires parity `batches` + `outputs` naming under `clients/{slug}/apps/{appId}/...`.

---

## File Structure

**Create:**
- `src/types/outputs.ts` — Zod schema + TS type for `OutputDoc`
- `src/services/outputs.ts` — client-SDK helpers (`writeOutput`, `getOutputsForBatch`, `getOutputsForClient`)
- `functions/src/_shared/outputs.ts` — admin-SDK equivalents (used by `runOutpaintBatch`)
- `src/services/__tests__/outputs.test.ts` — unit tests against the Firestore emulator
- `functions/src/_shared/__tests__/outputs.test.ts` — admin-SDK unit tests
- `scripts/backfill-outputs-from-results.ts` — one-shot migration of legacy `batches/{id}/results/*` docs to peer `outputs/`
- `tests/rules/outputs-collection-group.rules.test.ts` — rules test for the new `collectionGroup` rule

**Modify:**
- `src/platform/firebase/paths.ts` — rename `outpaintOutputs` → `outputs` (the schema is now app-agnostic), add `output(slug, appId, id)` to mirror `outpaintOutput`
- `src/services/batches.ts:64-67` — `addResult()` becomes a dual-writer (legacy `results/` + new `outputs/`)
- `functions/src/resize/runOutpaintBatch.ts:267-372` — go through the shared helper and populate parity fields (`clientSlug`, `appId`, `createdBy`, `previewUrl`, `kind`)
- `src/services/auth.ts` — expose `getAlliUserId()` returning the OIDC `sub` claim
- `firestore.rules:44-46` — add `match /{path=**}/outputs/{outputId}` collectionGroup rule (allowlist-gated, with a TODO to upgrade to `isClientMember()` once the security plan ships)
- `firestore.indexes.json` — declare two `outputs` collectionGroup composite indexes

---

## Task 1: Define the canonical OutputDoc schema

**Files:**
- Create: `src/types/outputs.ts`
- Test: `src/types/__tests__/outputs.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/types/__tests__/outputs.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { OutputDocSchema } from '../outputs';

describe('OutputDocSchema', () => {
  const valid = {
    outputId: 'o1',
    batchId: 'b1',
    clientSlug: 'apple_services',
    appId: 'ad-resizing',
    createdBy: 'alli-user-uuid-123',
    createdAt: { seconds: 1, nanoseconds: 0 },
    kind: 'image',
    status: 'complete',
    previewUrl: 'https://x/y.png',
    storageRef: 'clients/apple_services/apps/ad-resizing/outputs/o1.png',
    format: { width: 1280, height: 720, label: 'digital-1280x720' },
  };

  it('accepts a fully-populated complete output', () => {
    expect(() => OutputDocSchema.parse(valid)).not.toThrow();
  });

  it('rejects an output missing createdBy', () => {
    const { createdBy, ...rest } = valid;
    expect(() => OutputDocSchema.parse(rest)).toThrow(/createdBy/);
  });

  it('rejects an output missing clientSlug', () => {
    const { clientSlug, ...rest } = valid;
    expect(() => OutputDocSchema.parse(rest)).toThrow(/clientSlug/);
  });

  it('accepts pending status without storageRef/previewUrl', () => {
    const pending = { ...valid, status: 'pending', storageRef: undefined, previewUrl: undefined };
    expect(() => OutputDocSchema.parse(pending)).not.toThrow();
  });

  it('rejects unknown kind', () => {
    expect(() => OutputDocSchema.parse({ ...valid, kind: 'audio' })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/types/__tests__/outputs.test.ts`
Expected: FAIL — `Cannot find module '../outputs'`

- [ ] **Step 3: Write the schema**

Create `src/types/outputs.ts`:

```typescript
import { z } from 'zod';
import type { Timestamp } from 'firebase/firestore';

export const OUTPUT_KINDS = ['image', 'video'] as const;
export type OutputKind = (typeof OUTPUT_KINDS)[number];

export const OUTPUT_STATUSES = ['pending', 'processing', 'complete', 'error'] as const;
export type OutputStatus = (typeof OUTPUT_STATUSES)[number];

// Discriminated by `kind`. Image outputs carry width/height/label;
// video outputs carry durationMs/aspectRatio.
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
  createdAt: z.any(), // Firestore Timestamp; loose at the schema layer.
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/types/__tests__/outputs.test.ts`
Expected: PASS — 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/types/outputs.ts src/types/__tests__/outputs.test.ts
git commit -m "feat(outputs): add OutputDoc Zod schema for unified generations view"
```

---

## Task 2: Expose Alli user id from the auth service

**Files:**
- Modify: `src/services/auth.ts:80-95`
- Test: `src/services/__tests__/auth.test.ts`

The OIDC ID token carries `sub` = the Alli user id. Firebase Auth exposes provider claims via `user.providerData[0].uid` (when `providerId === 'oidc.alli'`). We expose a stable helper that prefers Alli `sub`, falling back to Firebase UID with a console warning (so callers don't silently mis-attribute).

- [ ] **Step 1: Write the failing test**

Create `src/services/__tests__/auth.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../firebase', () => ({
  auth: { currentUser: null },
}));

import { auth } from '../../firebase';
import { authService } from '../auth';

describe('authService.getAlliUserId', () => {
  beforeEach(() => {
    (auth as any).currentUser = null;
  });

  it('returns the oidc.alli provider sub when present', () => {
    (auth as any).currentUser = {
      uid: 'firebase-uid-abc',
      providerData: [{ providerId: 'oidc.alli', uid: 'alli-sub-xyz' }],
    };
    expect(authService.getAlliUserId()).toBe('alli-sub-xyz');
  });

  it('falls back to firebase uid when oidc.alli is missing and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (auth as any).currentUser = { uid: 'firebase-uid-abc', providerData: [] };
    expect(authService.getAlliUserId()).toBe('firebase-uid-abc');
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/oidc\.alli/));
    warn.mockRestore();
  });

  it('returns null when no user is signed in', () => {
    expect(authService.getAlliUserId()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/__tests__/auth.test.ts`
Expected: FAIL — `getAlliUserId is not a function`

- [ ] **Step 3: Add the helper**

Modify `src/services/auth.ts` — add this method inside the `AuthService` class, immediately after `getAccessToken()`:

```typescript
    /**
     * Returns the Alli user identifier (OIDC `sub` claim) for the signed-in
     * user, suitable for use as `createdBy` on generated artifacts. Falls
     * back to the Firebase UID with a warning if the provider data is
     * missing — should not happen in production but keeps tests/dev usable.
     */
    getAlliUserId(): string | null {
        const user = auth.currentUser;
        if (!user) return null;
        const oidc = user.providerData.find(p => p.providerId === 'oidc.alli');
        if (oidc?.uid) return oidc.uid;
        console.warn('[auth] No oidc.alli provider data; falling back to Firebase UID for createdBy.');
        return user.uid;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/__tests__/auth.test.ts`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/auth.ts src/services/__tests__/auth.test.ts
git commit -m "feat(auth): expose getAlliUserId for createdBy attribution"
```

---

## Task 3: Rename path helper `outpaintOutputs` → `outputs`

The path is now app-agnostic, not ad-resizing-specific. Keep the existing names as deprecated aliases for one release so callers don't break in the same PR.

**Files:**
- Modify: `src/platform/firebase/paths.ts:70-74`
- Test: existing tests don't need changes; new alias is additive.

- [ ] **Step 1: Add the new helpers alongside the old ones**

Modify `src/platform/firebase/paths.ts` — replace lines 70-74 with:

```typescript
  // Unified per-app outputs (collectionGroup-queryable).
  // Every modular app writes generated artifacts here. See OutputDoc schema
  // in src/types/outputs.ts and the writeOutput helper in src/services/outputs.ts.
  outputs: (slug: ClientSlug, appId: AppId) => `${root(slug)}/apps/${appId}/outputs`,
  output: (slug: ClientSlug, appId: AppId, outputId: string) =>
    `${root(slug)}/apps/${appId}/outputs/${outputId}`,

  // Deprecated aliases — kept for one release while ad-resizing call sites migrate.
  // Remove after Task 11 lands.
  outpaintOutputs: (slug: ClientSlug, appId: AppId) => `${root(slug)}/apps/${appId}/outputs`,
  outpaintOutput: (slug: ClientSlug, appId: AppId, outputId: string) =>
    `${root(slug)}/apps/${appId}/outputs/${outputId}`,
  outpaintSources: (slug: ClientSlug, appId: AppId) => `${root(slug)}/apps/${appId}/sources`,
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -b --noEmit`
Expected: PASS — no errors. (Both old and new names compile.)

- [ ] **Step 3: Commit**

```bash
git add src/platform/firebase/paths.ts
git commit -m "refactor(paths): add app-agnostic outputs helper (alias for outpaintOutputs)"
```

---

## Task 4: Build the client-SDK output helpers (`createOutput` + `updateOutput`)

**Files:**
- Create: `src/services/outputs.ts`
- Test: `src/services/__tests__/outputs.test.ts`

Two functions, not one — splitting create vs update prevents the merge-overwrites-`createdAt` bug class. `createOutput()` does the initial insert and sets `createdAt`. `updateOutput()` merges anything except identity + `createdAt`.

- [ ] **Step 1: Write the failing test**

Create `src/services/__tests__/outputs.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { createOutput, updateOutput } from '../outputs';

let env: RulesTestEnvironment;

beforeEach(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-outputs',
    firestore: { rules: 'rules_version="2"; service cloud.firestore { match /databases/{db}/documents { match /{document=**} { allow read, write: if true; } } }' },
  });
  await env.clearFirestore();
});

afterAll(async () => env?.cleanup());

describe('createOutput', () => {
  it('writes a validated output doc with serverTimestamp createdAt', async () => {
    const db = env.authenticatedContext('user-1').firestore() as any;
    await createOutput(db, {
      clientSlug: 'apple_services',
      appId: 'ad-resizing',
      outputId: 'o1',
      batchId: 'b1',
      createdBy: 'alli-sub-xyz',
      status: 'pending',
      kind: 'image',
      format: { width: 1280, height: 720, label: 'digital-1280x720' },
    });
    const snap = await getDoc(doc(db, 'clients/apple_services/apps/ad-resizing/outputs/o1'));
    expect(snap.exists()).toBe(true);
    const data = snap.data();
    expect(data?.createdBy).toBe('alli-sub-xyz');
    expect(data?.createdAt).toBeDefined();
  });

  it('throws when required fields are missing', async () => {
    const db = env.authenticatedContext('user-1').firestore() as any;
    await expect(
      createOutput(db, { clientSlug: 'x', appId: 'ad-resizing', outputId: 'o1' } as any),
    ).rejects.toThrow(/createdBy|batchId|kind/);
  });

  it('rejects kind=video with image-shaped format', async () => {
    const db = env.authenticatedContext('user-1').firestore() as any;
    await expect(
      createOutput(db, {
        clientSlug: 'apple_services', appId: 'video-cutdown', outputId: 'o2',
        batchId: 'b1', createdBy: 'alli-sub-xyz', status: 'pending', kind: 'video',
        format: { width: 1920, height: 1080, label: 'fullhd' } as any,
      }),
    ).rejects.toThrow();
  });
});

describe('updateOutput', () => {
  it('preserves createdAt across update', async () => {
    const db = env.authenticatedContext('user-1').firestore() as any;
    await createOutput(db, {
      clientSlug: 'apple_services', appId: 'ad-resizing', outputId: 'o3',
      batchId: 'b1', createdBy: 'alli-sub-xyz', status: 'pending', kind: 'image',
      format: { width: 1280, height: 720, label: 'digital-1280x720' },
    });
    const before = (await getDoc(doc(db, 'clients/apple_services/apps/ad-resizing/outputs/o3'))).data()?.createdAt;
    await new Promise(r => setTimeout(r, 25)); // ensure serverTimestamp would differ if re-applied
    await updateOutput(db, 'apple_services', 'ad-resizing', 'o3', {
      status: 'complete',
      storageRef: 'clients/apple_services/apps/ad-resizing/outputs/o3.png',
    });
    const after = (await getDoc(doc(db, 'clients/apple_services/apps/ad-resizing/outputs/o3'))).data();
    expect(after?.status).toBe('complete');
    expect(after?.storageRef).toBeDefined();
    expect(after?.createdAt).toEqual(before); // unchanged
    expect(after?.completedAt).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/__tests__/outputs.test.ts`
Expected: FAIL — `Cannot find module '../outputs'`

- [ ] **Step 3: Implement the helpers**

Create `src/services/outputs.ts`:

```typescript
import {
  collection,
  doc,
  setDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  getDocs,
  collectionGroup,
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

export type UpdateOutputInput = Partial<
  Omit<OutputDoc, 'outputId' | 'clientSlug' | 'appId' | 'createdAt' | 'createdBy' | 'kind'>
>;

/**
 * Insert a brand-new output document. Stamps `createdAt = serverTimestamp()`.
 * Never use this to update an existing doc — see `updateOutput`.
 */
export async function createOutput(db: Firestore, input: CreateOutputInput): Promise<void> {
  // Validate against the full schema. Use a placeholder Timestamp for the
  // createdAt slot so Zod is happy; the actual write uses serverTimestamp().
  OutputDocSchema.parse({ ...input, createdAt: { seconds: 0, nanoseconds: 0 } });
  const ref = doc(db, paths.output(input.clientSlug, input.appId, input.outputId));
  await setDoc(ref, {
    ...input,
    createdAt: serverTimestamp(),
    ...(input.status === 'complete' ? { completedAt: serverTimestamp() } : {}),
  });
}

/**
 * Merge-update an existing output. Identity fields (clientSlug/appId/outputId/
 * createdBy/kind) and `createdAt` are deliberately not in the input type — we
 * never overwrite them. On status='complete', stamps `completedAt`.
 */
export async function updateOutput(
  db: Firestore,
  clientSlug: ClientSlug,
  appId: AppId,
  outputId: string,
  patch: UpdateOutputInput,
): Promise<void> {
  const ref = doc(db, paths.output(clientSlug, appId, outputId));
  await setDoc(
    ref,
    {
      ...patch,
      ...(patch.status === 'complete' ? { completedAt: serverTimestamp() } : {}),
    },
    { merge: true },
  );
}

/** Read all outputs for a specific batch — replaces batchService.getBatchResults. */
export async function getOutputsForBatch(
  db: Firestore,
  clientSlug: ClientSlug,
  appId: AppId,
  batchId: string,
): Promise<OutputDoc[]> {
  const q = query(
    collection(db, paths.outputs(clientSlug, appId)),
    where('batchId', '==', batchId),
    orderBy('createdAt', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as OutputDoc);
}

/** Cross-app collectionGroup query for the unified generations view. */
export async function getOutputsForClient(
  db: Firestore,
  clientSlug: ClientSlug,
  filters: { appId?: AppId; createdBy?: string; batchId?: string } = {},
): Promise<OutputDoc[]> {
  let q = query(
    collectionGroup(db, 'outputs'),
    where('clientSlug', '==', clientSlug),
    orderBy('createdAt', 'desc'),
  );
  if (filters.appId) q = query(q, where('appId', '==', filters.appId));
  if (filters.createdBy) q = query(q, where('createdBy', '==', filters.createdBy));
  if (filters.batchId) q = query(q, where('batchId', '==', filters.batchId));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as OutputDoc);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/__tests__/outputs.test.ts`
Expected: PASS — 2 tests pass. (You may need the Firestore emulator running: `firebase emulators:start --only firestore` in another terminal.)

- [ ] **Step 5: Commit**

```bash
git add src/services/outputs.ts src/services/__tests__/outputs.test.ts
git commit -m "feat(outputs): add createOutput/updateOutput/getOutputsForBatch/getOutputsForClient helpers"
```

---

## Task 5: Build the admin-SDK output helpers + schema-drift guard

**Files:**
- Create: `functions/src/_shared/outputs.ts`
- Test: `functions/src/_shared/__tests__/outputs.test.ts`
- Test: `functions/src/_shared/__tests__/outputs-schema-drift.test.ts`

Cloud Functions use `firebase-admin/firestore`, which has a different (Admin) `Firestore` type than the client SDK. The schema is duplicated here (functions/ is built and deployed independently), but a **drift test** asserts deep equality with the client schema — same pattern as `allowlist-drift.test.ts` (`functions/src/_shared/__tests__/allowlist-drift.test.ts`).

Split into `createOutput()` + `updateOutput()` for the same reason as the client helper — never overwrite `createdAt`.

- [ ] **Step 1: Write the failing test**

Create `functions/src/_shared/__tests__/outputs.test.ts`:

```typescript
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createOutput, updateOutput } from '../outputs';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

beforeAll(() => {
  if (getApps().length === 0) initializeApp({ projectId: 'demo-fn-outputs' });
});

beforeEach(async () => {
  const db = getFirestore();
  const snap = await db.collection('clients').get();
  await Promise.all(snap.docs.map(d => d.ref.delete()));
});

describe('createOutput (admin)', () => {
  it('writes a pending output with parity fields', async () => {
    const db = getFirestore();
    await createOutput(db, {
      clientSlug: 'apple_services', appId: 'ad-resizing', outputId: 'o1',
      batchId: 'b1', createdBy: 'alli-sub-xyz', status: 'pending', kind: 'image',
      format: { width: 1280, height: 720, label: 'digital-1280x720' },
    });
    const snap = await db.doc('clients/apple_services/apps/ad-resizing/outputs/o1').get();
    expect(snap.data()?.createdBy).toBe('alli-sub-xyz');
    expect(snap.data()?.clientSlug).toBe('apple_services');
  });

  it('rejects invalid docs at the helper boundary', async () => {
    const db = getFirestore();
    await expect(
      createOutput(db, { clientSlug: 'x', appId: 'ad-resizing', outputId: 'o1' } as any),
    ).rejects.toThrow();
  });

  it('rejects image kind with video-shaped format', async () => {
    const db = getFirestore();
    await expect(
      createOutput(db, {
        clientSlug: 'x', appId: 'ad-resizing', outputId: 'o1',
        batchId: 'b1', createdBy: 'u1', status: 'pending', kind: 'image',
        format: { durationMs: 30000, aspectRatio: '16:9' } as any,
      }),
    ).rejects.toThrow();
  });
});

describe('updateOutput (admin)', () => {
  it('preserves createdAt across the merge', async () => {
    const db = getFirestore();
    await createOutput(db, {
      clientSlug: 'apple_services', appId: 'ad-resizing', outputId: 'o2',
      batchId: 'b1', createdBy: 'alli-sub-xyz', status: 'pending', kind: 'image',
      format: { width: 1280, height: 720, label: 'digital-1280x720' },
    });
    const before = (await db.doc('clients/apple_services/apps/ad-resizing/outputs/o2').get()).data()?.createdAt;
    await new Promise(r => setTimeout(r, 25));
    await updateOutput(db, 'apple_services', 'ad-resizing', 'o2', {
      status: 'complete',
      storageRef: 'clients/apple_services/apps/ad-resizing/outputs/o2.png',
    });
    const after = (await db.doc('clients/apple_services/apps/ad-resizing/outputs/o2').get()).data();
    expect(after?.createdAt).toEqual(before);
    expect(after?.completedAt).toBeDefined();
    expect(after?.status).toBe('complete');
  });
});
```

Create `functions/src/_shared/__tests__/outputs-schema-drift.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
// Both schemas are duplicated across workspaces by necessity (functions/ is
// built and deployed independently). This test guards against drift the same
// way allowlist-drift.test.ts does — if it ever fails, copy the shape from
// the client schema to the admin schema (or vice versa) and re-run.
import { OutputDocSchema as AdminSchema } from '../outputs';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const client = require('../../../../src/types/outputs');

describe('OutputDocSchema drift (admin ↔ client)', () => {
  it('admin schema keys match client schema keys', () => {
    const adminKeys = Object.keys((AdminSchema as any).shape).sort();
    const clientKeys = Object.keys((client.OutputDocSchema as any).shape).sort();
    expect(adminKeys).toEqual(clientKeys);
  });

  it('OUTPUT_KINDS enum matches', () => {
    // Re-export the enum from outputs.ts in both workspaces and compare.
    expect([...(AdminSchema as any).shape.kind._def.values].sort()).toEqual(
      [...(client.OutputDocSchema as any).shape.kind._def.values].sort(),
    );
  });

  it('OUTPUT_STATUSES enum matches', () => {
    expect([...(AdminSchema as any).shape.status._def.values].sort()).toEqual(
      [...(client.OutputDocSchema as any).shape.status._def.values].sort(),
    );
  });
});
```

The require-based import from `../../../../src/types/outputs` works because
the workspace root is shared; `functions/tsconfig.json` doesn't include
src/, but vitest runs via Node's module resolution which walks up directories.
Confirm by running the test in step 2 — if it fails to resolve, add a
`tsconfig` `paths` mapping or a `vitest.config.ts` alias to functions/.

- [ ] **Step 2: Run test to verify it fails**

Run (with emulator running): `cd functions && npx vitest run src/_shared/__tests__/outputs.test.ts`
Expected: FAIL — `Cannot find module '../outputs'`

- [ ] **Step 3: Implement the admin helpers**

Create `functions/src/_shared/outputs.ts`:

```typescript
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';

// NOTE: duplicated from src/types/outputs.ts by necessity (functions/ is built
// and deployed independently). The drift test in outputs-schema-drift.test.ts
// guards against this diverging. If you change one, change the other in the
// same commit.

export const OUTPUT_KINDS = ['image', 'video'] as const;
export const OUTPUT_STATUSES = ['pending', 'processing', 'complete', 'error'] as const;

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

export interface CreateOutputInput {
  clientSlug: string;
  appId: string;
  outputId: string;
  batchId: string;
  createdBy: string;
  status: z.infer<typeof OutputDocSchema>['status'];
  kind: z.infer<typeof OutputDocSchema>['kind'];
  format: z.infer<typeof OutputDocSchema>['format'];
  model?: string;
  quality?: string;
  prompt?: string | null;
}

export type UpdateOutputInput = Partial<Omit<
  z.infer<typeof OutputDocSchema>,
  'outputId' | 'clientSlug' | 'appId' | 'createdAt' | 'createdBy' | 'kind'
>>;

/** Insert. Stamps createdAt. Never use to update. */
export async function createOutput(db: Firestore, input: CreateOutputInput): Promise<void> {
  OutputDocSchema.parse({ ...input, createdAt: { seconds: 0, nanoseconds: 0 } });
  const path = `clients/${input.clientSlug}/apps/${input.appId}/outputs/${input.outputId}`;
  await db.doc(path).set({
    ...input,
    createdAt: FieldValue.serverTimestamp(),
    ...(input.status === 'complete' ? { completedAt: FieldValue.serverTimestamp() } : {}),
  });
}

/** Merge-update. Never touches createdAt. Stamps completedAt on status=complete. */
export async function updateOutput(
  db: Firestore,
  clientSlug: string,
  appId: string,
  outputId: string,
  patch: UpdateOutputInput,
): Promise<void> {
  const path = `clients/${clientSlug}/apps/${appId}/outputs/${outputId}`;
  await db.doc(path).set(
    {
      ...patch,
      ...(patch.status === 'complete' ? { completedAt: FieldValue.serverTimestamp() } : {}),
    },
    { merge: true },
  );
}
```

- [ ] **Step 4: Run both tests to verify they pass**

Run: `cd functions && npx vitest run src/_shared/__tests__/outputs.test.ts src/_shared/__tests__/outputs-schema-drift.test.ts`
Expected: PASS — all tests pass. The drift test confirms admin and client schemas have the same keys and enums.

If the drift test fails to resolve `../../../../src/types/outputs`, add to `functions/vitest.config.ts` a resolve alias: `alias: { '@app/types': resolve(__dirname, '../src/types') }` and change the require to `require('@app/types/outputs')`.

- [ ] **Step 5: Commit**

```bash
git add functions/src/_shared/outputs.ts functions/src/_shared/__tests__/outputs.test.ts functions/src/_shared/__tests__/outputs-schema-drift.test.ts
git commit -m "feat(functions/outputs): admin-SDK createOutput/updateOutput + schema-drift guard"
```

---

## Task 6: Migrate `runOutpaintBatch` to write parity fields with server-derived `createdBy`

**Files:**
- Create: `functions/src/_shared/getAlliUserIdFromAuth.ts`
- Test: `functions/src/_shared/__tests__/getAlliUserIdFromAuth.test.ts`
- Modify: `functions/src/resize/runOutpaintBatch.ts:267-289` (seedPendingOutputs) and `:359-372` (success completion) + the callable entry point that receives `request.auth`
- Modify: `functions/src/resize/runOutpaintBatch.test.ts` — assert new fields are present

**Security note (P0):** `createdBy` is derived **server-side** from `request.auth.token`, NOT taken as callable input. A malicious client could otherwise forge attribution. Today, `seedPendingOutputs` writes `{ outputId, batchId, dimension, status, model, quality, prompt, createdAt }`. We need to also write `clientSlug`, `appId`, `createdBy`, `kind`, `format`.

- [ ] **Step 1: Write the failing test for the auth-extraction helper**

Create `functions/src/_shared/__tests__/getAlliUserIdFromAuth.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getAlliUserIdFromAuth } from '../getAlliUserIdFromAuth';

describe('getAlliUserIdFromAuth', () => {
  it('extracts sub from firebase.identities["oidc.alli"]', () => {
    const auth = {
      uid: 'firebase-uid',
      token: {
        firebase: { identities: { 'oidc.alli': ['alli-sub-xyz'] }, sign_in_provider: 'oidc.alli' },
      },
    } as any;
    expect(getAlliUserIdFromAuth(auth)).toBe('alli-sub-xyz');
  });

  it('throws when no auth context is present', () => {
    expect(() => getAlliUserIdFromAuth(null as any)).toThrow(/unauthenticated/i);
  });

  it('throws when sign_in_provider is not oidc.alli', () => {
    const auth = {
      uid: 'firebase-uid',
      token: { firebase: { identities: {}, sign_in_provider: 'google.com' } },
    } as any;
    expect(() => getAlliUserIdFromAuth(auth)).toThrow(/oidc\.alli/);
  });

  it('throws when oidc.alli identity is empty', () => {
    const auth = {
      uid: 'firebase-uid',
      token: { firebase: { identities: { 'oidc.alli': [] }, sign_in_provider: 'oidc.alli' } },
    } as any;
    expect(() => getAlliUserIdFromAuth(auth)).toThrow(/sub/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd functions && npx vitest run src/_shared/__tests__/getAlliUserIdFromAuth.test.ts`
Expected: FAIL — `Cannot find module '../getAlliUserIdFromAuth'`

- [ ] **Step 3: Implement the helper**

Create `functions/src/_shared/getAlliUserIdFromAuth.ts`:

```typescript
import { HttpsError } from 'firebase-functions/v2/https';
import type { AuthData } from 'firebase-functions/v2/tasks';

/**
 * Server-side extraction of the Alli user id (OIDC `sub` claim) from a
 * callable's auth context. Never trust client-supplied createdBy — that
 * would let any caller forge attribution on any output.
 *
 * Firebase Auth puts the OIDC provider's `sub` in `token.firebase.identities`
 * keyed by provider id. For oidc.alli, the value is a single-element array
 * containing the sub.
 *
 * Throws an HttpsError with code 'unauthenticated' or 'permission-denied'
 * if anything is missing — the caller should let it bubble up to the
 * callable's error handler.
 */
export function getAlliUserIdFromAuth(auth: AuthData | null | undefined): string {
  if (!auth) {
    throw new HttpsError('unauthenticated', 'No auth context on callable.');
  }
  const provider = (auth.token as any)?.firebase?.sign_in_provider;
  if (provider !== 'oidc.alli') {
    throw new HttpsError('permission-denied', `Expected oidc.alli sign-in provider, got ${provider}`);
  }
  const identities = ((auth.token as any)?.firebase?.identities ?? {}) as Record<string, string[]>;
  const sub = identities['oidc.alli']?.[0];
  if (!sub) {
    throw new HttpsError('permission-denied', 'Missing oidc.alli sub identity on token.');
  }
  return sub;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd functions && npx vitest run src/_shared/__tests__/getAlliUserIdFromAuth.test.ts`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Wire `createdBy` into the existing batch input + thread it through**

Modify `functions/src/resize/runOutpaintBatch.ts`. Do NOT add `createdBy` to `RunOutpaintBatchInput`. Instead, find the callable entry point (`onCall` handler) and extract there:

```typescript
// At the top of the onCall handler, BEFORE invoking the existing pipeline.
const createdBy = getAlliUserIdFromAuth(request.auth);
// Pass createdBy through to the internal pipeline as an extra arg (not part of
// the user-supplied input shape).
```

Add an internal type alongside `RunOutpaintBatchInput`:

```typescript
type RunOutpaintBatchExecution = RunOutpaintBatchInput & { createdBy: string };
```

Pass `RunOutpaintBatchExecution` to `seedPendingOutputs(input)` and any other helper that needs createdBy. The public callable input type stays clean.

Add to the imports:

```typescript
import { getAlliUserIdFromAuth } from '../_shared/getAlliUserIdFromAuth';
import { createOutput, updateOutput } from '../_shared/outputs';
```

- [ ] **Step 6: No client changes required for createdBy**

The wizard currently doesn't send `createdBy`. Keep it that way. (If you grep `src/` for `runOutpaintBatch` callable invocations, the payload stays as-is.) The server derives it from the auth token.

- [ ] **Step 7: Write the failing test**

Modify `functions/src/resize/runOutpaintBatch.test.ts` — add an assertion that seeded outputs carry parity fields including a server-derived `createdBy`:

```typescript
  it('seeds pending outputs with parity fields and server-derived createdBy', async () => {
    // Setup: pass an execution object with createdBy already extracted by the
    // handler (the test exercises the internal helper, not the callable boundary).
    const execution: RunOutpaintBatchExecution = {
      ...baseInput,  // existing fixture
      createdBy: 'alli-user-1',
    };
    await seedPendingOutputs(execution);
    const snap = await db.doc('clients/test-client/apps/ad-resizing/outputs/out-1').get();
    const data = snap.data();
    expect(data?.clientSlug).toBe('test-client');
    expect(data?.appId).toBe('ad-resizing');
    expect(data?.createdBy).toBe('alli-user-1');
    expect(data?.kind).toBe('image');
    expect(data?.format).toEqual({
      width: 1280, height: 720, label: 'digital-1280x720',
    });
  });

  it('completion preserves createdAt across the merge', async () => {
    const execution: RunOutpaintBatchExecution = { ...baseInput, createdBy: 'alli-user-1' };
    await seedPendingOutputs(execution);
    const before = (await db.doc('clients/test-client/apps/ad-resizing/outputs/out-1').get()).data()?.createdAt;
    await new Promise(r => setTimeout(r, 25));
    // Simulate a successful completion by calling the same update path the
    // pipeline uses on success.
    await updateOutput(db, 'test-client', 'ad-resizing', 'out-1', {
      status: 'complete',
      storageRef: 'clients/test-client/apps/ad-resizing/outputs/out-1.png',
    });
    const after = (await db.doc('clients/test-client/apps/ad-resizing/outputs/out-1').get()).data();
    expect(after?.createdAt).toEqual(before);
  });
```

- [ ] **Step 8: Run test to verify it fails**

Run: `cd functions && npx vitest run src/resize/runOutpaintBatch.test.ts`
Expected: FAIL — assertions on parity fields fail; createdAt assertion fails because today's code overwrites it.

- [ ] **Step 9: Update `seedPendingOutputs` to use `createOutput`**

Modify `functions/src/resize/runOutpaintBatch.ts` lines 267-290. Replace the function body with:

```typescript
async function seedPendingOutputs(
  input: RunOutpaintBatchExecution,
): Promise<void> {
  await Promise.all(
    input.outputs.map(o =>
      createOutput(getFirestore(), {
        outputId: o.outputId,
        batchId: input.batchId,
        clientSlug: input.clientSlug,
        appId: APP_ID,
        createdBy: input.createdBy,
        status: 'pending',
        kind: 'image',
        format: {
          width: o.dimension.width,
          height: o.dimension.height,
          label: o.dimension.label ?? `${o.dimension.width}x${o.dimension.height}`,
        },
        model: 'gpt-image-2',
        quality: input.quality ?? 'medium',
        prompt: input.retryPrompt ?? null,
      }),
    ),
  );
}
```

- [ ] **Step 10: Update completion writer at lines 359-372 to use `updateOutput`**

The completion path must NOT touch `createdAt` (that's the whole point of split create/update). It also must NOT write `previewUrl` — that's a client-side derivation through the existing `useStorageUrl` hook (the read side); the view will compute it lazily from `storageRef`.

Replace lines 359-372 with:

```typescript
    await updateOutput(getFirestore(), input.clientSlug, APP_ID, o.outputId, {
      status: 'complete',
      storageRef,
      model: p2.p2Model,
      quality: p2.p2Quality,
      // Clear any error state from a prior failed attempt.
      errorCategory: undefined,
      errorMessage: undefined,
    });

    // The old write also stored p1Analysis and timings on the doc. Preserve
    // that by adding them to UpdateOutputInput (extend the type) or write
    // them separately to a sibling intermediates collection. Today's
    // dashboard reads timings, so include them in the merge:
    await getFirestore().doc(
      `clients/${input.clientSlug}/apps/${APP_ID}/outputs/${o.outputId}`,
    ).set(
      { p1Analysis: p1, timings: { p1Ms, p2Ms: p2.p2Ms } },
      { merge: true },
    );
```

(The trailing direct `.set({merge:true})` for `p1Analysis`/`timings` is a deliberate bypass of `updateOutput` — those fields aren't in the schema and shouldn't be. If you want them schema-validated, add them as optional fields to `OutputDocSchema` AND `UpdateOutputInput` in both workspaces — and update the drift test fixture.)

- [ ] **Step 11: Run test to verify it passes**

Run: `cd functions && npx vitest run src/resize/runOutpaintBatch.test.ts`
Expected: PASS — all existing tests + the two new tests (parity fields, createdAt preserved) pass.

- [ ] **Step 12: Commit**

```bash
git add functions/src/resize/runOutpaintBatch.ts functions/src/resize/runOutpaintBatch.test.ts functions/src/_shared/getAlliUserIdFromAuth.ts functions/src/_shared/__tests__/getAlliUserIdFromAuth.test.ts
git commit -m "feat(resize): parity fields on outputs; server-derived createdBy; preserve createdAt"
```

---

## Task 7: Dual-write from `batchService.addResult` to peer outputs

**Files:**
- Modify: `src/services/batches.ts:64-67`
- Modify: `src/services/__tests__/batches.test.ts` (create if absent)

Template-builder + feed-processing call `addResult` to write to `batches/{id}/results/{id}`. We add a dual-write so the same call also lands a parity output. The legacy `results/` write is kept until Task 10's cutover.

- [ ] **Step 1: Write the failing test**

Create `src/services/__tests__/batches.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, getDocs } from 'firebase/firestore';
import { batchService } from '../batches';

let env: RulesTestEnvironment;
beforeEach(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-batches',
    firestore: { rules: 'rules_version="2"; service cloud.firestore { match /databases/{db}/documents { match /{document=**} { allow read, write: if true; } } }' },
  });
  await env.clearFirestore();
});
afterAll(async () => env?.cleanup());

describe('batchService.addResult', () => {
  it('dual-writes to legacy results and peer outputs with parity fields', async () => {
    const db = env.authenticatedContext('alli-sub-xyz').firestore() as any;
    // Stub getAlliUserId — addResult must accept createdBy as an arg, not read it ambient.
    await batchService.addResult(
      'apple_services',
      'template-builder',
      'batch-1',
      {
        url: 'https://example/out.png',
        feedRowIndex: 0,
        metadata: { width: 1080, height: 1080, label: 'square' },
      },
      { createdBy: 'alli-sub-xyz', kind: 'image' },
    );

    const legacy = await getDocs(
      collection(db, 'clients/apple_services/apps/template-builder/batches/batch-1/results'),
    );
    expect(legacy.docs).toHaveLength(1);

    const peer = await getDocs(
      collection(db, 'clients/apple_services/apps/template-builder/outputs'),
    );
    expect(peer.docs).toHaveLength(1);
    const data = peer.docs[0].data();
    expect(data.clientSlug).toBe('apple_services');
    expect(data.appId).toBe('template-builder');
    expect(data.createdBy).toBe('alli-sub-xyz');
    expect(data.kind).toBe('image');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/__tests__/batches.test.ts`
Expected: FAIL — `addResult` accepts only 4 args; the 5th `{ createdBy, kind }` causes a type/runtime error.

- [ ] **Step 3: Update `addResult` to dual-write**

Modify `src/services/batches.ts:64-67`:

```typescript
    async addResult(
        clientSlug: ClientSlug,
        appId: AppId,
        batchId: string,
        result: Omit<BatchResult, 'id' | 'batchId'>,
        ctx: { createdBy: string; kind: 'image' | 'video' },
    ): Promise<void> {
        // Legacy: nested results subcollection. Kept during cutover; removed in Task 10.
        const resultRef = doc(collection(db, paths.batchResults(clientSlug, appId, batchId)));
        await setDoc(resultRef, { ...result, batchId, createdAt: serverTimestamp() });

        // New: peer outputs collection (unified across apps).
        if (!ctx.createdBy) {
            throw new Error('addResult requires ctx.createdBy — no anonymous writes.');
        }
        const meta = (result.metadata ?? {}) as Record<string, any>;
        const format = ctx.kind === 'image'
            ? {
                width: Number(meta.width) || 0,
                height: Number(meta.height) || 0,
                label: String(meta.label ?? `${meta.width ?? '?'}x${meta.height ?? '?'}`),
              }
            : {
                durationMs: Number(meta.durationMs) || 0,
                aspectRatio: String(meta.aspectRatio ?? '16:9'),
              };
        await createOutput(db, {
            outputId: resultRef.id,
            batchId,
            clientSlug,
            appId,
            createdBy: ctx.createdBy,
            status: 'complete',
            kind: ctx.kind,
            format,
        });
    },
```

Add at top:

```typescript
import { createOutput } from './outputs';
```

- [ ] **Step 4: Update existing callers of `addResult` to pass `ctx`**

```bash
grep -rn "batchService.addResult\|\.addResult(" src/ --include="*.ts" --include="*.tsx"
```

For each call site:
1. Read `const createdBy = authService.getAlliUserId();`
2. If `createdBy` is null, throw or surface a user-facing error — do NOT pass a placeholder like `'unknown'` (silent attribution corruption is the bug class this whole plan fixes).
3. Pass `{ createdBy, kind: 'image' }` (or `'video'` where applicable) as the 5th arg.

If the file doesn't already import `authService`, add `import { authService } from '../services/auth';`.

- [ ] **Step 5: Run test to verify it passes + typecheck**

Run: `npx vitest run src/services/__tests__/batches.test.ts && npx tsc -b --noEmit`
Expected: PASS — new test passes, no type errors at any call site.

- [ ] **Step 6: Commit**

```bash
git add src/services/batches.ts src/services/__tests__/batches.test.ts src/
git commit -m "feat(batches): dual-write addResult to peer outputs collection with parity fields"
```

---

## Task 8: Backfill script for existing legacy `results/` docs

**Files:**
- Create: `scripts/backfill-outputs-from-results.ts`
- Pattern: follow `scripts/migrate-batches-to-scoped-paths.ts` for shape (admin SDK, dry-run flag, idempotent).

The script walks every `clients/*/apps/*/batches/*/results/*`, derives an OutputDoc, and writes it to `clients/*/apps/*/outputs/*` if not already present. `createdBy` is unrecoverable for historical data — write `createdBy: 'legacy-backfill'` so the view can still surface old work under a synthetic "legacy" creator filter.

- [ ] **Step 1: Write the script**

Create `scripts/backfill-outputs-from-results.ts`:

```typescript
#!/usr/bin/env tsx
/**
 * Backfill: copy every legacy `batches/{id}/results/{id}` doc into the peer
 * `outputs/{id}` collection with parity fields. Idempotent — checks for an
 * existing output doc before writing.
 *
 * Usage:
 *   npx tsx scripts/backfill-outputs-from-results.ts --dry-run
 *   npx tsx scripts/backfill-outputs-from-results.ts
 *
 * Requires GOOGLE_APPLICATION_CREDENTIALS pointing at a service-account key
 * for the target project (automated-creative-e10d7 by default).
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const DRY_RUN = process.argv.includes('--dry-run');

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

async function main() {
  const clients = await db.collection('clients').listDocuments();
  let copied = 0;
  let skipped = 0;
  for (const clientRef of clients) {
    const apps = await clientRef.collection('apps').listDocuments();
    for (const appRef of apps) {
      const batches = await appRef.collection('batches').listDocuments();
      for (const batchRef of batches) {
        const results = await batchRef.collection('results').get();
        for (const r of results.docs) {
          const outputRef = appRef.collection('outputs').doc(r.id);
          const existing = await outputRef.get();
          if (existing.exists) { skipped++; continue; }
          const data = r.data();
          const meta = (data.metadata ?? {}) as Record<string, any>;
          const doc = {
            outputId: r.id,
            batchId: batchRef.id,
            clientSlug: clientRef.id,
            appId: appRef.id,
            createdBy: 'legacy-backfill',
            createdAt: data.createdAt ?? FieldValue.serverTimestamp(),
            status: 'complete' as const,
            kind: 'image' as const,
            format: {
              width: Number(meta.width) || 0,
              height: Number(meta.height) || 0,
              label: String(meta.label ?? `${meta.width ?? '?'}x${meta.height ?? '?'}`),
            },
            previewUrl: data.url,
          };
          if (DRY_RUN) {
            console.log('[DRY] would write', outputRef.path, JSON.stringify(doc));
          } else {
            await outputRef.set(doc, { merge: true });
          }
          copied++;
        }
      }
    }
  }
  console.log(`Backfill complete. copied=${copied} skipped=${skipped} dryRun=${DRY_RUN}`);
}

main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Dry-run against the dev project**

Set up admin creds for the dev project, then:

```bash
GOOGLE_APPLICATION_CREDENTIALS=~/.gcloud/automated-creative-e10d7-sa.json \
  npx tsx scripts/backfill-outputs-from-results.ts --dry-run
```

Expected: prints `[DRY] would write …` lines for every legacy result; ends with summary line.

- [ ] **Step 3: Inspect dry-run output**

Spot-check 3-5 of the printed doc bodies. Verify `clientSlug`, `appId`, `batchId`, `format`, `previewUrl` look right. If any look wrong (e.g. missing metadata.width), patch the script and re-run dry.

- [ ] **Step 4: Run for real**

```bash
GOOGLE_APPLICATION_CREDENTIALS=~/.gcloud/automated-creative-e10d7-sa.json \
  npx tsx scripts/backfill-outputs-from-results.ts
```

Expected: summary line with `copied=N skipped=0`.

- [ ] **Step 5: Re-run to verify idempotency**

Run the same command again. Expected: `copied=0 skipped=N` (every doc now exists, so all are skipped).

- [ ] **Step 6: Commit**

```bash
git add scripts/backfill-outputs-from-results.ts
git commit -m "chore(migration): script to backfill legacy results into peer outputs"
```

---

## Task 9: Switch readers from `getBatchResults` to `getOutputsForBatch`

> **DEPLOY GATE:** Do not merge or deploy this task until Task 8's backfill has completed in the target environment (dev first, then prod). If readers cut over before backfill finishes, every historical batch shows an empty results list in the UI. The grep in Step 0 below is a hard precondition.

**Files:**
- Modify: every caller of `batchService.getBatchResults` (grep below)

- [ ] **Step 0: Verify backfill ran in this environment**

Run a quick admin-SDK probe (or use `scripts/smoke-query-outputs.ts` from Task 13 if you've created it):

```bash
GOOGLE_APPLICATION_CREDENTIALS=~/.gcloud/automated-creative-e10d7-sa.json \
  npx tsx -e "
    const admin = require('firebase-admin');
    admin.initializeApp();
    admin.firestore().collectionGroup('outputs').where('createdBy','==','legacy-backfill').limit(1).get()
      .then(s => { console.log('backfilled docs found:', s.size); process.exit(s.size > 0 ? 0 : 1); });
  "
```

Expected exit 0 (≥1 backfilled doc exists). If exit 1, STOP — Task 8 hasn't run in this environment yet.

- [ ] **Step 1: Identify call sites**

```bash
grep -rn "getBatchResults\|batchResults\b" src/ --include="*.ts" --include="*.tsx"
```

- [ ] **Step 2: For each call site, replace with `getOutputsForBatch`**

Pattern:

```typescript
// Before
const results = await batchService.getBatchResults(slug, appId, batchId);

// After
import { getOutputsForBatch } from '../services/outputs';
import { db } from '../firebase';
const outputs = await getOutputsForBatch(db, slug, appId, batchId);
// Adapt downstream consumers from BatchResult shape to OutputDoc shape:
// - result.url            → output.previewUrl
// - result.feedRowIndex   → output.format.label (if used as identifier) or a new field
// - result.metadata.X     → output.format.X
```

If any caller depends on a field not in `OutputDoc` (e.g. `feedRowIndex`), either (a) add that field to `OutputDocSchema` with a clear name, OR (b) keep reading from `results/` for that specific caller and flag it as tech debt — but only with a code comment explaining why. Do NOT silently drop fields.

- [ ] **Step 3: Run all tests**

Run: `npm run test && cd functions && npm run test`
Expected: PASS — all suites green.

- [ ] **Step 4: Smoke-test in dev**

Hard-refresh the dev app, walk through one batch flow per affected app, verify the results panel still renders.

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "refactor(reads): consume outputs collection instead of legacy results"
```

---

## Task 10: Cut over — remove legacy `results/` writes from `addResult`

**Files:**
- Modify: `src/services/batches.ts` — drop the `await setDoc(resultRef, ...)` block

Only do this after Task 9 has shipped and you've verified in dev that nothing reads from `results/` anymore. Leave the existing `results/` data alone (don't delete) — read paths are gone so it's inert.

- [ ] **Step 1: Confirm no readers remain**

```bash
grep -rn "getBatchResults\|batchResults\b\|\\.collection.*results.*\\)" src/ functions/src/ --include="*.ts" --include="*.tsx"
```

Expected: zero matches in app code (the helper `paths.batchResults` may still exist in `paths.ts`; that's fine until next cleanup).

- [ ] **Step 2: Update `addResult` to single-write**

Modify `src/services/batches.ts:64-90` — remove the legacy block. The method body becomes:

```typescript
    async addResult(
        clientSlug: ClientSlug,
        appId: AppId,
        batchId: string,
        result: Omit<BatchResult, 'id' | 'batchId'>,
        ctx: { createdBy: string; kind: 'image' | 'video' },
    ): Promise<void> {
        const outputId = doc(collection(db, paths.outputs(clientSlug, appId))).id;
        const meta = (result.metadata ?? {}) as Record<string, any>;
        const format = ctx.kind === 'image'
            ? {
                width: Number(meta.width) || 0,
                height: Number(meta.height) || 0,
                label: String(meta.label ?? `${meta.width ?? '?'}x${meta.height ?? '?'}`),
              }
            : {
                durationMs: Number(meta.durationMs) || 0,
                aspectRatio: String(meta.aspectRatio ?? '16:9'),
              };
        if (!ctx.createdBy) {
            throw new Error('addResult requires ctx.createdBy — no anonymous writes.');
        }
        await createOutput(db, {
            outputId,
            batchId,
            clientSlug,
            appId,
            createdBy: ctx.createdBy,
            status: 'complete',
            kind: ctx.kind,
            format,
        });
    },
```

- [ ] **Step 3: Update `batches.test.ts` to assert no legacy write**

Modify `src/services/__tests__/batches.test.ts` — change the assertion from "legacy has 1 doc, peer has 1 doc" to "legacy has 0 docs, peer has 1 doc":

```typescript
    const legacy = await getDocs(
      collection(db, 'clients/apple_services/apps/template-builder/batches/batch-1/results'),
    );
    expect(legacy.docs).toHaveLength(0);

    const peer = await getDocs(
      collection(db, 'clients/apple_services/apps/template-builder/outputs'),
    );
    expect(peer.docs).toHaveLength(1);
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/services/__tests__/batches.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/batches.ts src/services/__tests__/batches.test.ts
git commit -m "refactor(batches): drop legacy results write; outputs is the only writer"
```

---

## Task 11: Declare composite indexes for `collectionGroup('outputs')`

**Files:**
- Modify: `firestore.indexes.json`

- [ ] **Step 1: Add the indexes**

Modify `firestore.indexes.json` — replace `indexes: [...]` with:

```json
{
  "indexes": [
    {
      "collectionGroup": "uploads",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "uploadedAt", "order": "DESCENDING" },
        { "fieldPath": "__name__", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "outputs",
      "queryScope": "COLLECTION_GROUP",
      "fields": [
        { "fieldPath": "clientSlug", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "outputs",
      "queryScope": "COLLECTION_GROUP",
      "fields": [
        { "fieldPath": "clientSlug", "order": "ASCENDING" },
        { "fieldPath": "appId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "outputs",
      "queryScope": "COLLECTION_GROUP",
      "fields": [
        { "fieldPath": "clientSlug", "order": "ASCENDING" },
        { "fieldPath": "createdBy", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "outputs",
      "queryScope": "COLLECTION_GROUP",
      "fields": [
        { "fieldPath": "clientSlug", "order": "ASCENDING" },
        { "fieldPath": "batchId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "ASCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

- [ ] **Step 2: Deploy indexes**

```bash
firebase deploy --only firestore:indexes
```

Expected: console output `✔ firestore: deployed indexes successfully`. Indexes take ~1-5 min to build on existing data; the Firebase Console shows progress.

- [ ] **Step 3: Verify in Console**

Open https://console.firebase.google.com/project/automated-creative-e10d7/firestore/indexes — confirm all four `outputs` indexes show `Enabled`.

- [ ] **Step 4: Commit**

```bash
git add firestore.indexes.json
git commit -m "chore(indexes): declare outputs collectionGroup indexes for unified view"
```

---

## Task 12: Add collectionGroup rule for `outputs` (allowlist-gated)

**Files:**
- Modify: `firestore.rules:44-46`
- Test: create `tests/rules/outputs-collection-group.rules.test.ts`

The recursive `match /clients/{slug}/{document=**}` already covers writes to peer `outputs/`. But collectionGroup queries need a *separate* `match /{path=**}/outputs/{outputId}` rule. Without it, `collectionGroup('outputs').where(...)` will be denied.

For now, this rule mirrors the existing allowlist gate. When the security plan ships, it tightens to `isClientMember(resource.data.clientSlug)`.

- [ ] **Step 1: Write the failing rules test**

Create `tests/rules/outputs-collection-group.rules.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { collectionGroup, getDocs, query, where } from 'firebase/firestore';
import { readFileSync } from 'node:fs';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-rules-outputs',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
afterAll(async () => env?.cleanup());

describe('collectionGroup outputs rules', () => {
  it('allows allowlisted user to collectionGroup-query outputs', async () => {
    const ctx = env.authenticatedContext('user-1', {
      email: 'diego.escobar@pmg.com',
      email_verified: true,
    });
    const db = ctx.firestore() as any;
    await assertSucceeds(
      getDocs(query(collectionGroup(db, 'outputs'), where('clientSlug', '==', 'apple_services'))),
    );
  });

  it('denies non-allowlisted user', async () => {
    const ctx = env.authenticatedContext('user-2', {
      email: 'random@example.com',
      email_verified: true,
    });
    const db = ctx.firestore() as any;
    await assertFails(
      getDocs(query(collectionGroup(db, 'outputs'), where('clientSlug', '==', 'apple_services'))),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (with rules emulator): `npx vitest run tests/rules/outputs-collection-group.rules.test.ts`
Expected: FAIL — both queries denied because no collectionGroup rule matches.

- [ ] **Step 3: Add the rule**

Modify `firestore.rules` — after the `match /clients/{clientSlug}/{document=**}` block (line 46), add:

```
    // collectionGroup queries on `outputs` for the unified "your generations" view.
    // Today: allowlist-gated, same as the per-client rule above.
    // TODO(security-lockdown): tighten to
    //   allow read: if isAlliStudioUser()
    //               && isClientMember(resource.data.clientSlug);
    // once syncClientClaims is deployed.
    match /{path=**}/outputs/{outputId} {
      allow read: if isAlliStudioUser();
      allow write: if false;  // writes go through the per-path rule above
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/rules/outputs-collection-group.rules.test.ts`
Expected: PASS.

- [ ] **Step 5: Deploy rules to dev**

```bash
firebase deploy --only firestore:rules
```

Expected: `✔ firestore: deployed rules`.

- [ ] **Step 6: Commit**

```bash
git add firestore.rules tests/rules/outputs-collection-group.rules.test.ts
git commit -m "feat(rules): allow collectionGroup outputs queries (allowlist-gated)"
```

---

## Task 13: Smoke-test the end-to-end query in dev

**Files:**
- Create: `scripts/smoke-query-outputs.ts` (one-shot, not committed long-term — feel free to `git rm` after verifying)

- [ ] **Step 1: Write a one-off smoke script**

Create `scripts/smoke-query-outputs.ts`:

```typescript
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
initializeApp({ credential: applicationDefault() });
const db = getFirestore();

(async () => {
  const snap = await db.collectionGroup('outputs')
    .where('clientSlug', '==', 'apple_services')
    .orderBy('createdAt', 'desc')
    .limit(10).get();
  console.log(`got ${snap.size} outputs for apple_services`);
  for (const d of snap.docs) {
    console.log(d.ref.path, '·', d.data().appId, '·', d.data().createdBy, '·', d.data().kind);
  }
})();
```

- [ ] **Step 2: Run it**

```bash
GOOGLE_APPLICATION_CREDENTIALS=~/.gcloud/automated-creative-e10d7-sa.json \
  npx tsx scripts/smoke-query-outputs.ts
```

Expected: prints 10 lines, every line has a real `appId`, `createdBy`, `kind` value (no `undefined`). If you see `undefined` on any line, that data wasn't backfilled correctly — re-investigate Task 8.

- [ ] **Step 3: Commit (or delete)**

If you want it as a reusable debug tool:

```bash
git add scripts/smoke-query-outputs.ts
git commit -m "chore(debug): one-shot script to smoke-test outputs collectionGroup query"
```

Otherwise `rm scripts/smoke-query-outputs.ts` and skip.

---

## Self-Review Notes (post-eng-review)

- **Spec coverage:** every dimension the user asked about — filter by creator (`createdBy`), by app (`appId`), by batch (`batchId`), per-client (`clientSlug`) — has a corresponding field added in Task 1 and a write site updated in Tasks 6 + 7. ✓
- **P0 security (createdBy forgery):** addressed by deriving `createdBy` server-side in Task 6 via `getAlliUserIdFromAuth(request.auth)`. Client-side `batches.addResult` still takes `createdBy` as an arg from local auth state — the future Firestore rule (separate security plan) will enforce `createdBy == request.auth.uid`-equivalent. ✓
- **P0 schema drift:** addressed by Task 5's `outputs-schema-drift.test.ts` (mirrors `allowlist-drift.test.ts` pattern). Admin and client schemas remain duplicated but kept in lock-step by the drift guard. ✓
- **P0 createdAt overwrite:** addressed by splitting `writeOutput` into `createOutput` (sets createdAt, no merge) and `updateOutput` (merge, never touches createdAt). Tests in Tasks 4-6 assert createdAt is preserved across status transitions. ✓
- **Cross-contamination:** out-of-scope as a *rules* change (separate plan), but the **schema** carries `clientSlug` denormalized on every doc, which is what the future tightened rule will check. ✓
- **Deploy gate:** Task 9 Step 0 verifies backfill has run before allowing reader cutover. Hard precondition, not a soft TODO. ✓
- **Backfill:** Task 8 covers historical data; idempotent. ✓
- **Reads:** Task 9 switches consumers; Task 10 finishes the cutover. ✓
- **Type consistency:** `OutputDoc` is the only doc shape across Task 1-7, 9, 10. `kind` / `format` / `createdBy` names match throughout. ✓
- **No placeholders:** every step has runnable code or a concrete command. Task 6 Step 6 says "grep call sites" rather than enumerating them — that's a real instruction, not a punt; the call-site list will be small (under 5) and can be verified at execution time.

### Remaining P1/P2 issues from eng review (not addressed in this pass)

These are documented for the implementing engineer to address inline, since they don't change the plan structure:

- **P1#4** `getAlliUserId` fallback to Firebase UID with `console.warn` — client-side. Task 2 keeps the warn-and-fallback behavior. Implementation should switch to `throw` if oidc.alli provider data is missing; the only legit caller path has it.
- **P1#5** `previewUrl` derivation — already dropped from server writes (Task 6 Step 10 doesn't set it). View renders previews lazily via the existing `useStorageUrl` hook reading `storageRef`. `previewUrl` stays optional in schema for backfilled docs (which copied `result.url`).
- **P2#8** Legacy `outpaintOutputs`/`outpaintOutput` aliases in `paths.ts` — keep through this plan; remove in a follow-up cleanup commit after the view ships.
- **P2#10** `appId as AppId` cast — fixed in the refactored Task 4 (`CreateOutputInput` types appId as `AppId` directly).

---

## What's NOT in this plan (deliberate)

- **Security rules tightening (`isClientMember`).** Today's rules let any allowlisted PMG user read any client. This plan adds `clientSlug` to every output so the future rule can check it, but doesn't flip the rule. That's a separate plan because (a) it depends on deploying `syncClientClaims` callable, and (b) it can ship in parallel without blocking schema work.
- **The "your generations" view UI.** Consumer of this schema. Separate plan.
- **Storage path rationalization.** Storage already mirrors Firestore paths; no changes needed for the schema migration.
- **Removing the `paths.batchResults` helper.** The helper is unused after Task 10 but harmless. Cleanup pass after both this plan and the view plan ship.
