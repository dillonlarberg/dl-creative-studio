# Template Library — Firestore Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the `templateLibrary` Firestore collection, security rules, service layer, and indexes so the Template Builder (Approach 2) can save drafts, publish templates, and support future Batch Runner consumption.

**Architecture:** A client-level `clients/{slug}/templateLibrary/{id}` collection (not app-scoped) holds draft and published templates. The existing `clients/{slug}/**` catch-all rule must be replaced with explicit per-collection rules before the narrower templateLibrary rules can take effect. A `templateLibraryService` wraps all Firestore operations, enforcing ownership, history writes, and publish validation in `runTransaction` calls.

**Tech Stack:** Firebase SDK v12.9.0, Firestore, Firebase Storage, Vitest, `@firebase/rules-unit-testing` v5.0.0, TypeScript.

**Spec:** `docs/superpowers/specs/2026-06-08-firestore-schema-template-library-design.md`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/services/templateLibrary.types.ts` | All TS types/interfaces for this feature |
| Create | `src/services/templateLibrary.ts` | Service layer — all Firestore operations |
| Create | `src/services/__tests__/templateLibrary.test.ts` | Unit tests for service methods |
| Create | `tests/rules/templateLibrary.rules.test.ts` | Firestore rules integration tests |
| Modify | `src/platform/firebase/paths.ts` | Add `templateLibrary` path helpers |
| Modify | `firestore.rules` | Replace catch-all; add templateLibrary rules |
| Modify | `storage.rules` | Add templateLibrary storage rules |
| Modify | `firestore.indexes.json` | Add 3 composite indexes |

---

## Task 1: TypeScript types

**Files:**
- Create: `src/services/templateLibrary.types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/services/templateLibrary.types.ts
import type { Timestamp } from 'firebase/firestore';

export type FieldMappingSource = 'feed' | 'upload' | 'brand' | 'static';

export interface FieldMapping {
  source: FieldMappingSource;
  column?: string;       // required when source === 'feed'
  assetPath?: string;    // required when source === 'upload' — GCS path, not signed URL
  brandKey?: string;     // required when source === 'brand' — key of brandOverrides
  value?: string;        // required when source === 'static'
}

export interface AdSize {
  width: number;
  height: number;
  label?: string;
}

export interface TemplateLibraryRecord {
  id: string;
  name: string;
  status: 'draft' | 'published';
  version: number;

  channel: 'social' | 'programmatic' | 'print' | 'signage';
  adSizes: AdSize[];

  scaffoldId: string;
  scaffoldSnapshot: {
    expectedFields: string[];
    contentHash: string;
    capturedAt: Timestamp;
  };
  thumbnailUrl?: string;

  datasourceId: string;
  datasourceName: string;
  feedSnapshot: {
    columns: string[];
    capturedAt: Timestamp;
  };

  fieldMappings: Record<string, FieldMapping>;

  brandOverrides: {
    primaryColor?: string;
    accentColor?: string;
    logoUrl?: string;
    showPrice?: boolean;
    showCTA?: boolean;
    ctaText?: string;
  };

  brief?: string;
  aiRequirements?: {
    intent: string;
    keyMessages: string[];
    tone?: string;
    targetAudience?: string;
  };

  createdBy: string;
  createdByUid: string;
  createdAt: Timestamp;
  updatedBy: string;
  updatedByUid: string;
  updatedAt: Timestamp;
  publishedBy?: string;
  publishedByUid?: string;
  publishedAt?: Timestamp;
}

export interface TemplateHistoryEntry {
  snapshot: Omit<TemplateLibraryRecord, 'id'>;
  savedBy: string;
  savedByUid: string;
  savedAt: Timestamp;
}

export type NewTemplateData = Pick<
  TemplateLibraryRecord,
  | 'name'
  | 'channel'
  | 'adSizes'
  | 'scaffoldId'
  | 'scaffoldSnapshot'
  | 'datasourceId'
  | 'datasourceName'
  | 'feedSnapshot'
  | 'fieldMappings'
  | 'brandOverrides'
> & { brief?: string; aiRequirements?: TemplateLibraryRecord['aiRequirements'] };

export class TemplateNotFoundError extends Error {
  constructor(templateId: string) {
    super(`Template not found: ${templateId}`);
    this.name = 'TemplateNotFoundError';
  }
}

export class TemplatePermissionError extends Error {
  constructor(templateId: string) {
    super(`Permission denied for template: ${templateId}`);
    this.name = 'TemplatePermissionError';
  }
}

export class TemplatePublishedError extends Error {
  constructor(templateId: string) {
    super(`Template ${templateId} is already published. Use updatePublished() to edit it.`);
    this.name = 'TemplatePublishedError';
  }
}

export class TemplateDraftError extends Error {
  constructor(templateId: string) {
    super(`Template ${templateId} is a draft. Use publish() first.`);
    this.name = 'TemplateDraftError';
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/templateLibrary.types.ts
git commit -m "feat: add TemplateLibraryRecord types and error classes"
```

---

## Task 2: Path helpers

**Files:**
- Modify: `src/platform/firebase/paths.ts`

- [ ] **Step 1: Write the failing test**

Create `src/platform/firebase/__tests__/paths.test.ts` if it doesn't exist, or add to existing:

```typescript
// Add to existing paths tests, or create:
// src/platform/firebase/__tests__/paths.test.ts
import { describe, it, expect } from 'vitest';
import { paths } from '../paths';

describe('paths.templateLibrary', () => {
  it('returns the client-level templateLibrary collection path', () => {
    expect(paths.templateLibrary('ralph_lauren')).toBe(
      'clients/ralph_lauren/templateLibrary'
    );
  });

  it('returns a specific templateLibrary document path', () => {
    expect(paths.templateLibraryDoc('ralph_lauren', 'tmpl_abc123')).toBe(
      'clients/ralph_lauren/templateLibrary/tmpl_abc123'
    );
  });

  it('returns the history subcollection path for a template', () => {
    expect(paths.templateLibraryHistory('ralph_lauren', 'tmpl_abc123')).toBe(
      'clients/ralph_lauren/templateLibrary/tmpl_abc123/history'
    );
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm run test:run -- src/platform/firebase/__tests__/paths.test.ts
```

Expected: FAIL — `paths.templateLibrary is not a function`

- [ ] **Step 3: Add path helpers to `paths.ts`**

Open `src/platform/firebase/paths.ts`. In the `paths` object (alongside existing methods like `paths.templates()` and `paths.template()`), add:

```typescript
// Template Library — client-level asset, not app-scoped
templateLibrary: (slug: ClientSlug): string =>
  `${root(slug)}/templateLibrary`,

templateLibraryDoc: (slug: ClientSlug, templateId: string): string =>
  `${root(slug)}/templateLibrary/${templateId}`,

templateLibraryHistory: (slug: ClientSlug, templateId: string): string =>
  `${root(slug)}/templateLibrary/${templateId}/history`,
```

- [ ] **Step 4: Run test to confirm pass**

```bash
npm run test:run -- src/platform/firebase/__tests__/paths.test.ts
```

Expected: PASS — all 3 path tests green.

- [ ] **Step 5: Commit**

```bash
git add src/platform/firebase/paths.ts src/platform/firebase/__tests__/paths.test.ts
git commit -m "feat: add templateLibrary path helpers to paths.ts"
```

---

## Task 3: Composite indexes

**Files:**
- Modify: `firestore.indexes.json`

- [ ] **Step 1: Add three indexes to `firestore.indexes.json`**

Open `firestore.indexes.json`. Inside the `"indexes"` array, add after the existing `outputs` entries:

```json
{
  "collectionGroup": "templateLibrary",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "templateLibrary",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "createdByUid", "order": "ASCENDING" },
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "templateLibrary",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "channel", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```

- [ ] **Step 2: Validate JSON syntax**

```bash
node -e "require('./firestore.indexes.json'); console.log('valid')"
```

Expected: `valid`

- [ ] **Step 3: Commit**

```bash
git add firestore.indexes.json
git commit -m "feat: add templateLibrary composite indexes"
```

---

## Task 4: Replace Firestore catch-all and add templateLibrary rules

**Files:**
- Modify: `firestore.rules`

> **Why this task exists:** The existing `match /clients/{clientSlug}/{document=**}` catch-all ORs with all narrower rules, making them ineffective. It must be replaced with explicit per-collection rules before the templateLibrary-specific rules can enforce draft privacy, ownership on create, and immutable-field protection.

- [ ] **Step 1: Write failing rules tests**

Create `tests/rules/templateLibrary.rules.test.ts`:

```typescript
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { describe, beforeAll, afterAll, beforeEach, it } from 'vitest';
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  addDoc,
} from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

const RULES = readFileSync('firestore.rules', 'utf8');

const SLUG = 'test_client';
const ALLI_USER_EMAIL = 'annie.nguyen@pmg.com';

// Minimal valid draft payload
function draftPayload(uid: string) {
  return {
    id: 'tmpl_001',
    name: 'Test Template',
    status: 'draft',
    version: 1,
    channel: 'social',
    adSizes: [{ width: 1080, height: 1080 }],
    scaffoldId: 'social:grid_2x2',
    scaffoldSnapshot: { expectedFields: ['headline'], contentHash: 'abc', capturedAt: new Date() },
    datasourceId: 'feed_01',
    datasourceName: 'Test Feed',
    feedSnapshot: { columns: ['title', 'price'], capturedAt: new Date() },
    fieldMappings: { headline: { source: 'feed', column: 'title' } },
    brandOverrides: {},
    createdBy: 'alli_user_1',
    createdByUid: uid,
    createdAt: new Date(),
    updatedBy: 'alli_user_1',
    updatedByUid: uid,
    updatedAt: new Date(),
    publishedAt: null,
    publishedBy: null,
    publishedByUid: null,
  };
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'test-project',
    firestore: { rules: RULES, host: 'localhost', port: 8080 },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe('templateLibrary — create', () => {
  it('allows an allowlisted user to create a draft with their own uid', async () => {
    const ctx = testEnv.authenticatedContext('uid_annie', {
      email: ALLI_USER_EMAIL,
      email_verified: true,
    });
    const ref = doc(ctx.firestore(), `clients/${SLUG}/templateLibrary/tmpl_001`);
    await assertSucceeds(setDoc(ref, draftPayload('uid_annie')));
  });

  it('denies create when createdByUid does not match auth.uid', async () => {
    const ctx = testEnv.authenticatedContext('uid_annie', {
      email: ALLI_USER_EMAIL,
      email_verified: true,
    });
    const ref = doc(ctx.firestore(), `clients/${SLUG}/templateLibrary/tmpl_001`);
    await assertFails(setDoc(ref, draftPayload('uid_someone_else')));
  });

  it('denies create with status published', async () => {
    const ctx = testEnv.authenticatedContext('uid_annie', {
      email: ALLI_USER_EMAIL,
      email_verified: true,
    });
    const ref = doc(ctx.firestore(), `clients/${SLUG}/templateLibrary/tmpl_001`);
    await assertFails(setDoc(ref, { ...draftPayload('uid_annie'), status: 'published' }));
  });

  it('denies create with version != 1', async () => {
    const ctx = testEnv.authenticatedContext('uid_annie', {
      email: ALLI_USER_EMAIL,
      email_verified: true,
    });
    const ref = doc(ctx.firestore(), `clients/${SLUG}/templateLibrary/tmpl_001`);
    await assertFails(setDoc(ref, { ...draftPayload('uid_annie'), version: 0 }));
  });

  it('denies create for unauthenticated user', async () => {
    const ctx = testEnv.unauthenticatedContext();
    const ref = doc(ctx.firestore(), `clients/${SLUG}/templateLibrary/tmpl_001`);
    await assertFails(setDoc(ref, draftPayload('uid_annie')));
  });
});

describe('templateLibrary — read', () => {
  beforeEach(async () => {
    // Seed a draft (owner: uid_annie) and a published template (owner: uid_chris)
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `clients/${SLUG}/templateLibrary/draft_001`),
        draftPayload('uid_annie')
      );
      await setDoc(
        doc(ctx.firestore(), `clients/${SLUG}/templateLibrary/pub_001`),
        { ...draftPayload('uid_chris'), id: 'pub_001', status: 'published', version: 2 }
      );
    });
  });

  it('allows creator to read their own draft', async () => {
    const ctx = testEnv.authenticatedContext('uid_annie', {
      email: ALLI_USER_EMAIL,
      email_verified: true,
    });
    const ref = doc(ctx.firestore(), `clients/${SLUG}/templateLibrary/draft_001`);
    await assertSucceeds(getDoc(ref));
  });

  it('denies non-creator from reading a draft', async () => {
    const ctx = testEnv.authenticatedContext('uid_chris', {
      email: 'chris@pmg.com',
      email_verified: true,
    });
    const ref = doc(ctx.firestore(), `clients/${SLUG}/templateLibrary/draft_001`);
    await assertFails(getDoc(ref));
  });

  it('allows any allowlisted user to read a published template', async () => {
    const ctx = testEnv.authenticatedContext('uid_annie', {
      email: ALLI_USER_EMAIL,
      email_verified: true,
    });
    const ref = doc(ctx.firestore(), `clients/${SLUG}/templateLibrary/pub_001`);
    await assertSucceeds(getDoc(ref));
  });
});

describe('templateLibrary — update draft', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `clients/${SLUG}/templateLibrary/draft_001`),
        draftPayload('uid_annie')
      );
    });
  });

  it('allows creator to update their draft', async () => {
    const ctx = testEnv.authenticatedContext('uid_annie', {
      email: ALLI_USER_EMAIL,
      email_verified: true,
    });
    const ref = doc(ctx.firestore(), `clients/${SLUG}/templateLibrary/draft_001`);
    await assertSucceeds(updateDoc(ref, { name: 'Updated Name' }));
  });

  it('denies non-creator from updating a draft', async () => {
    const ctx = testEnv.authenticatedContext('uid_chris', {
      email: 'chris@pmg.com',
      email_verified: true,
    });
    const ref = doc(ctx.firestore(), `clients/${SLUG}/templateLibrary/draft_001`);
    await assertFails(updateDoc(ref, { name: 'Hacked' }));
  });

  it('denies update that changes createdByUid', async () => {
    const ctx = testEnv.authenticatedContext('uid_annie', {
      email: ALLI_USER_EMAIL,
      email_verified: true,
    });
    const ref = doc(ctx.firestore(), `clients/${SLUG}/templateLibrary/draft_001`);
    await assertFails(updateDoc(ref, { createdByUid: 'uid_hacker' }));
  });

  it('denies update that changes status to published directly', async () => {
    const ctx = testEnv.authenticatedContext('uid_annie', {
      email: ALLI_USER_EMAIL,
      email_verified: true,
    });
    const ref = doc(ctx.firestore(), `clients/${SLUG}/templateLibrary/draft_001`);
    await assertFails(updateDoc(ref, { status: 'published' }));
  });
});

describe('templateLibrary — delete', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `clients/${SLUG}/templateLibrary/draft_001`),
        draftPayload('uid_annie')
      );
    });
  });

  it('allows creator to delete their template', async () => {
    const ctx = testEnv.authenticatedContext('uid_annie', {
      email: ALLI_USER_EMAIL,
      email_verified: true,
    });
    const ref = doc(ctx.firestore(), `clients/${SLUG}/templateLibrary/draft_001`);
    await assertSucceeds(deleteDoc(ref));
  });

  it('denies non-creator from deleting', async () => {
    const ctx = testEnv.authenticatedContext('uid_chris', {
      email: 'chris@pmg.com',
      email_verified: true,
    });
    const ref = doc(ctx.firestore(), `clients/${SLUG}/templateLibrary/draft_001`);
    await assertFails(deleteDoc(ref));
  });
});
```

- [ ] **Step 2: Start the Firestore emulator and run tests — confirm they all fail**

```bash
npm run emulators:start &
sleep 5
npm run test:rules -- tests/rules/templateLibrary.rules.test.ts
```

Expected: All tests FAIL (rules don't exist yet).

- [ ] **Step 3: Update `firestore.rules` — replace catch-all and add templateLibrary rules**

In `firestore.rules`, replace the existing catch-all block:

```
// REMOVE THIS:
match /clients/{clientSlug}/{document=**} {
  allow read, write: if isAlliStudioUser();
}
```

Replace with explicit per-collection rules + the new templateLibrary rules:

```
// Explicit rules replacing the catch-all.
// TODO(roles): Add isClientMember(clientSlug) check when syncClientClaims callable ships.

// Client brand assets
match /clients/{clientSlug}/assets/{assetId} {
  allow read, write: if isAlliStudioUser();
}

// App: saved template configs (template-builder internal, not the library)
match /clients/{clientSlug}/apps/{appId}/templates/{templateId} {
  allow read, write: if isAlliStudioUser();
}

// App: batch run records
match /clients/{clientSlug}/apps/{appId}/batches/{batchId} {
  allow read, write: if isAlliStudioUser();
}

// App: creative session records
match /clients/{clientSlug}/apps/{appId}/creatives/{creativeId} {
  allow read, write: if isAlliStudioUser();
}

// Template Library — client-level reusable templates
match /clients/{clientSlug}/templateLibrary/{templateId} {

  allow read: if isAlliStudioUser() && (
    resource.data.status == 'published' ||
    resource.data.createdByUid == request.auth.uid
  );

  // Create: ownership enforced, must start as draft at version 1
  allow create: if isAlliStudioUser() &&
    request.resource.data.createdByUid   == request.auth.uid  &&
    request.resource.data.id             == templateId        &&
    request.resource.data.status         == 'draft'           &&
    request.resource.data.version        == 1                 &&
    request.resource.data.publishedAt    == null              &&
    request.resource.data.publishedBy    == null              &&
    request.resource.data.publishedByUid == null;

  // Draft update: creator only, immutable fields protected, status stays draft
  allow update: if isAlliStudioUser() &&
    resource.data.status == 'draft' &&
    resource.data.createdByUid == request.auth.uid &&
    request.resource.data.id           == resource.data.id           &&
    request.resource.data.createdByUid == resource.data.createdByUid &&
    request.resource.data.createdBy    == resource.data.createdBy    &&
    request.resource.data.createdAt    == resource.data.createdAt    &&
    request.resource.data.status       == 'draft';

  // Publish transition: creator only (draft → published)
  allow update: if isAlliStudioUser() &&
    resource.data.status == 'draft' &&
    resource.data.createdByUid == request.auth.uid &&
    request.resource.data.id           == resource.data.id           &&
    request.resource.data.createdByUid == resource.data.createdByUid &&
    request.resource.data.createdBy    == resource.data.createdBy    &&
    request.resource.data.createdAt    == resource.data.createdAt    &&
    request.resource.data.status       == 'published';

  // Published template edit: any allowlisted user, immutable fields protected
  // TODO(roles): narrow to isClientMember(clientSlug) && memberRole in ['admin', 'editor']
  allow update: if isAlliStudioUser() &&
    resource.data.status == 'published' &&
    request.resource.data.id           == resource.data.id           &&
    request.resource.data.createdByUid == resource.data.createdByUid &&
    request.resource.data.createdBy    == resource.data.createdBy    &&
    request.resource.data.createdAt    == resource.data.createdAt    &&
    request.resource.data.status       == 'published';

  // Delete: creator only
  allow delete: if isAlliStudioUser() &&
    resource.data.createdByUid == request.auth.uid;

  // History subcollection: mirrors parent visibility; immutable after write
  match /history/{historyId} {
    allow read: if isAlliStudioUser() && (
      get(/databases/$(database)/documents/clients/$(clientSlug)/templateLibrary/$(templateId)).data.status == 'published' ||
      get(/databases/$(database)/documents/clients/$(clientSlug)/templateLibrary/$(templateId)).data.createdByUid == request.auth.uid
    );
    allow create: if isAlliStudioUser() && (
      get(/databases/$(database)/documents/clients/$(clientSlug)/templateLibrary/$(templateId)).data.status == 'published' ||
      get(/databases/$(database)/documents/clients/$(clientSlug)/templateLibrary/$(templateId)).data.createdByUid == request.auth.uid
    );
    allow update, delete: if false;
  }
}
```

- [ ] **Step 4: Run rules tests — confirm they pass**

```bash
npm run test:rules -- tests/rules/templateLibrary.rules.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Run the full rules test suite to confirm no regressions**

```bash
npm run test:rules
```

Expected: All existing rules tests still pass.

- [ ] **Step 6: Commit**

```bash
git add firestore.rules tests/rules/templateLibrary.rules.test.ts
git commit -m "feat: add templateLibrary Firestore rules, replace catch-all with explicit per-collection rules"
```

---

## Task 5: Storage rules for templateLibrary

**Files:**
- Modify: `storage.rules`

- [ ] **Step 1: Add the templateLibrary storage rule**

In `storage.rules`, inside the `match /b/{bucket}/o` block (or wherever client storage rules are defined — follow the existing pattern), add:

```
// Template Library assets: thumbnails, uploaded images, static assets
// Read mirrors parent Firestore visibility (draft: creator only; published: all allowlisted)
// Write: owner only — non-owners cannot upload new files for a template they don't own
match /clients/{clientSlug}/templateLibrary/{templateId}/{allPaths=**} {
  allow read: if isAlliStudioUser() && (
    firestore.get(/databases/(default)/documents/clients/$(clientSlug)/templateLibrary/$(templateId)).data.status == 'published' ||
    firestore.get(/databases/(default)/documents/clients/$(clientSlug)/templateLibrary/$(templateId)).data.createdByUid == request.auth.uid
  );
  allow write: if isAlliStudioUser() &&
    firestore.get(/databases/(default)/documents/clients/$(clientSlug)/templateLibrary/$(templateId)).data.createdByUid == request.auth.uid;
}
```

- [ ] **Step 2: Run the storage rules test suite to confirm no regressions**

```bash
npm run test:rules
```

Expected: All pass (no existing storage rules tests should break).

- [ ] **Step 3: Commit**

```bash
git add storage.rules
git commit -m "feat: add templateLibrary storage rules — draft privacy and owner-only writes"
```

---

## Task 6: Service skeleton and read methods

**Files:**
- Create: `src/services/templateLibrary.ts`
- Create: `src/services/__tests__/templateLibrary.test.ts`

- [ ] **Step 1: Write failing tests for read methods**

Create `src/services/__tests__/templateLibrary.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User } from 'firebase/auth';

// --- Mocks (must be declared before imports that use them) ---

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_, path) => ({ path })),
  doc: vi.fn((_, path) => ({ path })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  runTransaction: vi.fn(),
  query: vi.fn((...args) => args),
  where: vi.fn((field, op, value) => ({ field, op, value })),
  orderBy: vi.fn((field, dir) => ({ field, dir })),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
  Timestamp: { now: vi.fn(() => ({ seconds: 0, nanoseconds: 0 })) },
}));

vi.mock('../../firebase', () => ({ db: {} }));

vi.mock('../../services/auth', () => ({
  authService: {
    getAlliUserId: vi.fn(() => 'alli_user_123'),
  },
}));

vi.mock('../../platform/firebase/paths', () => ({
  paths: {
    templateLibrary: vi.fn((slug) => `clients/${slug}/templateLibrary`),
    templateLibraryDoc: vi.fn((slug, id) => `clients/${slug}/templateLibrary/${id}`),
    templateLibraryHistory: vi.fn((slug, id) => `clients/${slug}/templateLibrary/${id}/history`),
  },
}));

// Mock firebase/auth for auth.currentUser
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({
    currentUser: { uid: 'firebase_uid_123' } as User,
  })),
}));

import {
  getDoc,
  getDocs,
  addDoc,
  deleteDoc,
  collection,
  doc,
} from 'firebase/firestore';
import { templateLibraryService } from '../templateLibrary';
import {
  TemplateNotFoundError,
  TemplatePermissionError,
} from '../templateLibrary.types';

// --- Helpers ---

function makeSnap(data: object | null, id = 'tmpl_001') {
  return {
    id,
    exists: () => data !== null,
    data: () => data,
  };
}

function makeQuerySnap(docs: ReturnType<typeof makeSnap>[]) {
  return { docs };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// --- Read method tests ---

describe('templateLibraryService.getTemplate', () => {
  it('returns the record when the document exists', async () => {
    const record = { id: 'tmpl_001', name: 'My Template', status: 'draft' };
    vi.mocked(getDoc).mockResolvedValue(makeSnap(record) as any);

    const result = await templateLibraryService.getTemplate('acme', 'tmpl_001');

    expect(result).toEqual(record);
    expect(vi.mocked(doc)).toHaveBeenCalledWith(
      expect.anything(),
      'clients/acme/templateLibrary/tmpl_001'
    );
  });

  it('throws TemplateNotFoundError when the document does not exist', async () => {
    vi.mocked(getDoc).mockResolvedValue(makeSnap(null) as any);

    await expect(
      templateLibraryService.getTemplate('acme', 'tmpl_missing')
    ).rejects.toThrow(TemplateNotFoundError);
  });

  it('throws TemplatePermissionError on Firestore permission-denied', async () => {
    const permissionError = Object.assign(new Error('permission-denied'), {
      code: 'permission-denied',
    });
    vi.mocked(getDoc).mockRejectedValue(permissionError);

    await expect(
      templateLibraryService.getTemplate('acme', 'tmpl_001')
    ).rejects.toThrow(TemplatePermissionError);
  });
});

describe('templateLibraryService.getPublishedTemplates', () => {
  it('queries with status == published ordered by createdAt desc', async () => {
    vi.mocked(getDocs).mockResolvedValue(makeQuerySnap([]) as any);

    await templateLibraryService.getPublishedTemplates('acme');

    expect(vi.mocked(collection)).toHaveBeenCalledWith(
      expect.anything(),
      'clients/acme/templateLibrary'
    );
  });
});

describe('templateLibraryService.getDraftTemplates', () => {
  it('queries drafts filtered by auth.currentUser.uid', async () => {
    vi.mocked(getDocs).mockResolvedValue(makeQuerySnap([]) as any);

    await templateLibraryService.getDraftTemplates('acme');

    // Should query by createdByUid == firebase_uid_123 (from mocked auth)
    expect(vi.mocked(getDocs)).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm run test:run -- src/services/__tests__/templateLibrary.test.ts
```

Expected: FAIL — `Cannot find module '../templateLibrary'`

- [ ] **Step 3: Create the service file with read methods**

Create `src/services/templateLibrary.ts`:

```typescript
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
  addDoc,
  deleteDoc,
  type Transaction,
  type DocumentReference,
  type DocumentSnapshot,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db } from '../firebase';
import { paths } from '../platform/firebase/paths';
import { authService } from './auth';
import type { ClientSlug } from '../platform/firebase/paths';
import type {
  TemplateLibraryRecord,
  TemplateHistoryEntry,
  NewTemplateData,
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
  const uid = getAuth().currentUser?.uid;
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
  const { id, ...snapshot } = currentSnap.data() as TemplateLibraryRecord;
  const historyRef = doc(collection(db, `${docRef.path}/history`));
  transaction.set(historyRef, {
    snapshot,
    savedBy: currentAlliId(),
    savedByUid: currentUid(),
    savedAt: serverTimestamp(),
  } satisfies Omit<TemplateHistoryEntry, 'savedAt'> & { savedAt: ReturnType<typeof serverTimestamp> });
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

};
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npm run test:run -- src/services/__tests__/templateLibrary.test.ts
```

Expected: All read method tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/templateLibrary.ts src/services/__tests__/templateLibrary.test.ts
git commit -m "feat: add templateLibraryService read methods — getTemplate, getPublishedTemplates, getDraftTemplates"
```

---

## Task 7: `saveDraft`

**Files:**
- Modify: `src/services/templateLibrary.ts`
- Modify: `src/services/__tests__/templateLibrary.test.ts`

- [ ] **Step 1: Write failing test**

Add to `templateLibrary.test.ts`:

```typescript
describe('templateLibraryService.saveDraft', () => {
  it('writes to the correct tenant-isolated templateLibrary path', async () => {
    vi.mocked(addDoc).mockResolvedValue({ id: 'tmpl_new' } as any);

    await templateLibraryService.saveDraft('acme', {
      name: 'New Template',
      channel: 'social',
      adSizes: [{ width: 1080, height: 1080 }],
      scaffoldId: 'social:grid_2x2',
      scaffoldSnapshot: {
        expectedFields: ['headline'],
        contentHash: 'abc123',
        capturedAt: {} as any,
      },
      datasourceId: 'feed_01',
      datasourceName: 'Test Feed',
      feedSnapshot: { columns: ['title', 'price'], capturedAt: {} as any },
      fieldMappings: { headline: { source: 'feed', column: 'title' } },
      brandOverrides: {},
    });

    expect(vi.mocked(collection)).toHaveBeenCalledWith(
      expect.anything(),
      'clients/acme/templateLibrary'
    );
  });

  it('initializes status as draft and version as 1', async () => {
    let writtenData: Record<string, unknown> = {};
    vi.mocked(addDoc).mockImplementation(async (_, data) => {
      writtenData = data as Record<string, unknown>;
      return { id: 'tmpl_new' } as any;
    });

    await templateLibraryService.saveDraft('acme', {
      name: 'New Template',
      channel: 'social',
      adSizes: [],
      scaffoldId: 'social:grid_2x2',
      scaffoldSnapshot: { expectedFields: [], contentHash: 'abc', capturedAt: {} as any },
      datasourceId: 'feed_01',
      datasourceName: 'Feed',
      feedSnapshot: { columns: [], capturedAt: {} as any },
      fieldMappings: {},
      brandOverrides: {},
    });

    expect(writtenData.status).toBe('draft');
    expect(writtenData.version).toBe(1);
    expect(writtenData.publishedAt).toBeNull();
    expect(writtenData.publishedBy).toBeNull();
    expect(writtenData.publishedByUid).toBeNull();
  });

  it('sets createdByUid from auth context, not from caller', async () => {
    let writtenData: Record<string, unknown> = {};
    vi.mocked(addDoc).mockImplementation(async (_, data) => {
      writtenData = data as Record<string, unknown>;
      return { id: 'tmpl_new' } as any;
    });

    await templateLibraryService.saveDraft('acme', {
      name: 'New Template',
      channel: 'social',
      adSizes: [],
      scaffoldId: 'social:grid_2x2',
      scaffoldSnapshot: { expectedFields: [], contentHash: 'abc', capturedAt: {} as any },
      datasourceId: 'feed_01',
      datasourceName: 'Feed',
      feedSnapshot: { columns: [], capturedAt: {} as any },
      fieldMappings: {},
      brandOverrides: {},
    });

    expect(writtenData.createdByUid).toBe('firebase_uid_123'); // from mocked auth
    expect(writtenData.createdBy).toBe('alli_user_123');        // from mocked authService
  });

  it('returns the new templateId', async () => {
    vi.mocked(addDoc).mockResolvedValue({ id: 'tmpl_new_456' } as any);

    const id = await templateLibraryService.saveDraft('acme', {
      name: 'New',
      channel: 'social',
      adSizes: [],
      scaffoldId: 'social:grid_2x2',
      scaffoldSnapshot: { expectedFields: [], contentHash: 'abc', capturedAt: {} as any },
      datasourceId: 'feed_01',
      datasourceName: 'Feed',
      feedSnapshot: { columns: [], capturedAt: {} as any },
      fieldMappings: {},
      brandOverrides: {},
    });

    expect(id).toBe('tmpl_new_456');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm run test:run -- src/services/__tests__/templateLibrary.test.ts
```

Expected: FAIL — `templateLibraryService.saveDraft is not a function`

- [ ] **Step 3: Implement `saveDraft` in `templateLibrary.ts`**

Add to the `templateLibraryService` object:

```typescript
async saveDraft(clientSlug: ClientSlug, data: NewTemplateData): Promise<string> {
  const uid = currentUid();
  const alliId = currentAlliId();
  const now = serverTimestamp();
  const ref = collection(db, paths.templateLibrary(clientSlug));

  const doc_ = await addDoc(ref, {
    ...data,
    status: 'draft',
    version: 1,
    createdBy: alliId,
    createdByUid: uid,
    createdAt: now,
    updatedBy: alliId,
    updatedByUid: uid,
    updatedAt: now,
    publishedAt: null,
    publishedBy: null,
    publishedByUid: null,
  });

  // Set id field to match the Firestore doc ID
  // (done as a separate update since addDoc doesn't know the ID until after write)
  await import('firebase/firestore').then(({ updateDoc }) =>
    updateDoc(doc_, { id: doc_.id })
  );

  return doc_.id;
},
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npm run test:run -- src/services/__tests__/templateLibrary.test.ts
```

Expected: All `saveDraft` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/templateLibrary.ts src/services/__tests__/templateLibrary.test.ts
git commit -m "feat: implement templateLibraryService.saveDraft"
```

---

## Task 8: `upsertDraft`

**Files:**
- Modify: `src/services/templateLibrary.ts`
- Modify: `src/services/__tests__/templateLibrary.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `templateLibrary.test.ts`:

```typescript
describe('templateLibraryService.upsertDraft', () => {
  function mockTransaction(snapData: object | null) {
    vi.mocked(runTransaction).mockImplementation(async (_, fn) => {
      const snap = makeSnap(snapData);
      const transaction = {
        get: vi.fn().mockResolvedValue(snap),
        update: vi.fn(),
        set: vi.fn(),
      };
      await fn(transaction as any);
      return transaction;
    });
  }

  it('throws TemplateNotFoundError if doc does not exist', async () => {
    mockTransaction(null);

    await expect(
      templateLibraryService.upsertDraft('acme', 'tmpl_001', { name: 'Updated' })
    ).rejects.toThrow(TemplateNotFoundError);
  });

  it('throws TemplatePublishedError if doc is published', async () => {
    mockTransaction({ status: 'published', createdByUid: 'firebase_uid_123' });

    await expect(
      templateLibraryService.upsertDraft('acme', 'tmpl_001', { name: 'Updated' })
    ).rejects.toThrow(TemplatePublishedError);
  });

  it('strips immutable fields from the update payload', async () => {
    let updatePayload: Record<string, unknown> = {};
    vi.mocked(runTransaction).mockImplementation(async (_, fn) => {
      const snap = makeSnap({ status: 'draft', createdByUid: 'firebase_uid_123' });
      const transaction = {
        get: vi.fn().mockResolvedValue(snap),
        update: vi.fn((_, data) => { updatePayload = data; }),
        set: vi.fn(),
      };
      await fn(transaction as any);
      return transaction;
    });

    await templateLibraryService.upsertDraft('acme', 'tmpl_001', {
      name: 'Updated',
      createdBy: 'hacker',
      createdByUid: 'hacked_uid',
      createdAt: {} as any,
      id: 'wrong_id',
    });

    expect(updatePayload.createdBy).toBeUndefined();
    expect(updatePayload.createdByUid).toBeUndefined();
    expect(updatePayload.createdAt).toBeUndefined();
    expect(updatePayload.id).toBeUndefined();
    expect(updatePayload.name).toBe('Updated');
  });

  it('sets updatedBy/updatedByUid from auth context, ignoring caller values', async () => {
    let updatePayload: Record<string, unknown> = {};
    vi.mocked(runTransaction).mockImplementation(async (_, fn) => {
      const snap = makeSnap({ status: 'draft', createdByUid: 'firebase_uid_123' });
      const transaction = {
        get: vi.fn().mockResolvedValue(snap),
        update: vi.fn((_, data) => { updatePayload = data; }),
        set: vi.fn(),
      };
      await fn(transaction as any);
      return transaction;
    });

    await templateLibraryService.upsertDraft('acme', 'tmpl_001', {
      updatedBy: 'spoofed_user',
      updatedByUid: 'spoofed_uid',
    });

    expect(updatePayload.updatedBy).toBe('alli_user_123');    // from mocked authService
    expect(updatePayload.updatedByUid).toBe('firebase_uid_123'); // from mocked auth
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm run test:run -- src/services/__tests__/templateLibrary.test.ts
```

Expected: FAIL — `templateLibraryService.upsertDraft is not a function`

- [ ] **Step 3: Implement `upsertDraft`**

Add to `templateLibraryService`:

```typescript
async upsertDraft(
  clientSlug: ClientSlug,
  templateId: string,
  data: Partial<TemplateLibraryRecord>
): Promise<void> {
  const docRef = doc(db, paths.templateLibraryDoc(clientSlug, templateId));

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(docRef);

    if (!snap.exists()) throw new TemplateNotFoundError(templateId);
    if (snap.data().status === 'published') throw new TemplatePublishedError(templateId);

    await _writeHistoryInTransaction(transaction, docRef, snap);

    // Strip immutable fields
    const { id: _id, createdBy: _cb, createdByUid: _cbUid, createdAt: _ca, ...safeData } = data;

    transaction.update(docRef, {
      ...safeData,
      updatedBy: currentAlliId(),
      updatedByUid: currentUid(),
      updatedAt: serverTimestamp(),
    });
  });
},
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npm run test:run -- src/services/__tests__/templateLibrary.test.ts
```

Expected: All `upsertDraft` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/templateLibrary.ts src/services/__tests__/templateLibrary.test.ts
git commit -m "feat: implement templateLibraryService.upsertDraft with transaction and history"
```

---

## Task 9: `publish()`

**Files:**
- Modify: `src/services/templateLibrary.ts`
- Modify: `src/services/__tests__/templateLibrary.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `templateLibrary.test.ts`:

```typescript
describe('templateLibraryService.publish', () => {
  // Helper: a valid draft with all required fields
  function validDraft() {
    return {
      status: 'draft',
      version: 1,
      scaffoldId: 'social:grid_2x2',
      scaffoldSnapshot: {
        expectedFields: ['headline', 'image'],
        contentHash: 'abc',
        capturedAt: {},
      },
      datasourceId: 'feed_01',
      feedSnapshot: { columns: ['title', 'price', 'image_url'], capturedAt: {} },
      fieldMappings: {
        headline: { source: 'feed', column: 'title' },
        image: { source: 'feed', column: 'image_url' },
      },
      brandOverrides: {},
      createdByUid: 'firebase_uid_123',
      createdBy: 'alli_user_123',
      createdAt: {},
    };
  }

  function mockPublishTransaction(draftData: object) {
    vi.mocked(runTransaction).mockImplementation(async (_, fn) => {
      const snap = makeSnap(draftData);
      const transaction = {
        get: vi.fn().mockResolvedValue(snap),
        update: vi.fn(),
        set: vi.fn(),
      };
      await fn(transaction as any);
      return transaction;
    });
  }

  it('throws TemplateDraftError if template is already published', async () => {
    mockPublishTransaction({ ...validDraft(), status: 'published' });

    await expect(
      templateLibraryService.publish('acme', 'tmpl_001')
    ).rejects.toThrow(TemplateDraftError);
  });

  it('increments version and sets status to published', async () => {
    let updatePayload: Record<string, unknown> = {};
    vi.mocked(runTransaction).mockImplementation(async (_, fn) => {
      const snap = makeSnap(validDraft());
      const transaction = {
        get: vi.fn().mockResolvedValue(snap),
        update: vi.fn((_, data) => { updatePayload = data; }),
        set: vi.fn(),
      };
      await fn(transaction as any);
      return transaction;
    });

    await templateLibraryService.publish('acme', 'tmpl_001');

    expect(updatePayload.status).toBe('published');
    expect(updatePayload.version).toBe(2); // draft was version 1
    expect(updatePayload.publishedByUid).toBe('firebase_uid_123');
    expect(updatePayload.publishedBy).toBe('alli_user_123');
  });

  it('throws if a required field has no mapping', async () => {
    const draftMissingMapping = {
      ...validDraft(),
      fieldMappings: {
        headline: { source: 'feed', column: 'title' },
        // 'image' is in expectedFields but not in fieldMappings
      },
    };
    mockPublishTransaction(draftMissingMapping);

    await expect(
      templateLibraryService.publish('acme', 'tmpl_001')
    ).rejects.toThrow(/unmapped required field/i);
  });

  it('throws if a mapped feed column no longer exists in the live feed', async () => {
    // Simulate a draft that maps to 'old_column' which is gone from the live feed
    const draftWithStaleMapping = {
      ...validDraft(),
      fieldMappings: {
        headline: { source: 'feed', column: 'old_column' },
        image: { source: 'feed', column: 'image_url' },
      },
      feedSnapshot: { columns: ['old_column', 'image_url'], capturedAt: {} },
    };
    mockPublishTransaction(draftWithStaleMapping);

    // Mock fetchFeedColumns to return a live feed WITHOUT 'old_column'
    // (This tests the drift check — the implementation will call a datasource service)
    // For this unit test, we mock the internal fetch
    vi.spyOn(
      await import('../templateLibrary'),
      '_fetchLiveFeedColumns' as any
    ).mockResolvedValue(['image_url', 'title', 'price']);

    await expect(
      templateLibraryService.publish('acme', 'tmpl_001')
    ).rejects.toThrow(/no longer exist/i);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm run test:run -- src/services/__tests__/templateLibrary.test.ts
```

Expected: FAIL — `templateLibraryService.publish is not a function`

- [ ] **Step 3: Implement `publish()` and its feed-fetch helper**

Add to `templateLibrary.ts` before the service object:

```typescript
// Exported for testing; in production calls the datasource service.
export async function _fetchLiveFeedColumns(datasourceId: string): Promise<string[]> {
  // TODO: replace with real datasource service call when available
  // e.g. return datasourceService.getColumns(datasourceId);
  // For now, fetch from the datasource document directly.
  const snap = await getDoc(doc(db, `datasources/${datasourceId}`));
  if (!snap.exists()) throw new Error(`Datasource not found: ${datasourceId}`);
  return (snap.data().columns as string[]).sort();
}

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
      throw new Error(`Field "${field}" has source 'feed' but no column specified`);
    }
    if (mapping.source === 'upload' && !mapping.assetPath) {
      throw new Error(`Field "${field}" has source 'upload' but no assetPath specified`);
    }
    if (mapping.source === 'brand' && !mapping.brandKey) {
      throw new Error(`Field "${field}" has source 'brand' but no brandKey specified`);
    }
  }
}

async function checkFeedDrift(
  fieldMappings: Record<string, FieldMapping>,
  datasourceId: string
): Promise<string[]> {
  const mappedFeedColumns = Object.values(fieldMappings)
    .filter((m) => m.source === 'feed' && m.column)
    .map((m) => m.column!);

  const liveColumns = await _fetchLiveFeedColumns(datasourceId);
  const removed = mappedFeedColumns.filter((c) => !liveColumns.includes(c));
  return removed;
}
```

Add to `templateLibraryService`:

```typescript
async publish(clientSlug: ClientSlug, templateId: string): Promise<void> {
  const docRef = doc(db, paths.templateLibraryDoc(clientSlug, templateId));

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(docRef);

    if (!snap.exists()) throw new TemplateNotFoundError(templateId);
    const data = snap.data() as TemplateLibraryRecord;
    if (data.status === 'published') throw new TemplateDraftError(templateId);

    // Validate mappings completeness
    validateMappings(data.scaffoldSnapshot.expectedFields, data.fieldMappings);

    // Check feed drift (mapped columns only)
    const removed = await checkFeedDrift(data.fieldMappings, data.datasourceId);
    if (removed.length > 0) {
      throw new Error(
        `Cannot publish: ${removed.length} mapped feed column(s) no longer exist: ${removed.join(', ')}`
      );
    }

    await _writeHistoryInTransaction(transaction, docRef, snap);

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
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npm run test:run -- src/services/__tests__/templateLibrary.test.ts
```

Expected: All `publish` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/templateLibrary.ts src/services/__tests__/templateLibrary.test.ts
git commit -m "feat: implement templateLibraryService.publish with validation and feed drift check"
```

---

## Task 10: `updatePublished()` and `deleteTemplate()`

**Files:**
- Modify: `src/services/templateLibrary.ts`
- Modify: `src/services/__tests__/templateLibrary.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `templateLibrary.test.ts`:

```typescript
describe('templateLibraryService.updatePublished', () => {
  function mockUpdateTransaction(snapData: object) {
    vi.mocked(runTransaction).mockImplementation(async (_, fn) => {
      const snap = makeSnap(snapData);
      const transaction = {
        get: vi.fn().mockResolvedValue(snap),
        update: vi.fn(),
        set: vi.fn(),
      };
      await fn(transaction as any);
      return transaction;
    });
  }

  it('throws TemplateDraftError if template is still a draft', async () => {
    mockUpdateTransaction({ status: 'draft', version: 1, createdByUid: 'firebase_uid_123' });

    await expect(
      templateLibraryService.updatePublished('acme', 'tmpl_001', { name: 'Updated' })
    ).rejects.toThrow(TemplateDraftError);
  });

  it('increments version on published edit', async () => {
    let updatePayload: Record<string, unknown> = {};
    vi.mocked(runTransaction).mockImplementation(async (_, fn) => {
      const snap = makeSnap({
        status: 'published',
        version: 3,
        scaffoldSnapshot: { expectedFields: ['headline'], contentHash: 'abc', capturedAt: {} },
        fieldMappings: { headline: { source: 'feed', column: 'title' } },
        datasourceId: 'feed_01',
        feedSnapshot: { columns: ['title'], capturedAt: {} },
        brandOverrides: {},
        createdByUid: 'firebase_uid_123',
        createdBy: 'alli_user_123',
        createdAt: {},
      });
      const transaction = {
        get: vi.fn().mockResolvedValue(snap),
        update: vi.fn((_, data) => { updatePayload = data; }),
        set: vi.fn(),
      };
      await fn(transaction as any);
      return transaction;
    });

    vi.spyOn(
      await import('../templateLibrary'),
      '_fetchLiveFeedColumns' as any
    ).mockResolvedValue(['title']);

    await templateLibraryService.updatePublished('acme', 'tmpl_001', { name: 'Updated' });

    expect(updatePayload.version).toBe(4); // was 3
    expect(updatePayload.updatedByUid).toBe('firebase_uid_123');
  });
});

describe('templateLibraryService.deleteTemplate', () => {
  it('calls deleteDoc with the correct path', async () => {
    vi.mocked(deleteDoc).mockResolvedValue(undefined);

    await templateLibraryService.deleteTemplate('acme', 'tmpl_001');

    expect(vi.mocked(doc)).toHaveBeenCalledWith(
      expect.anything(),
      'clients/acme/templateLibrary/tmpl_001'
    );
    expect(vi.mocked(deleteDoc)).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm run test:run -- src/services/__tests__/templateLibrary.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement `updatePublished` and `deleteTemplate`**

Add to `templateLibraryService`:

```typescript
async updatePublished(
  clientSlug: ClientSlug,
  templateId: string,
  data: Partial<TemplateLibraryRecord>
): Promise<void> {
  const docRef = doc(db, paths.templateLibraryDoc(clientSlug, templateId));

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(docRef);

    if (!snap.exists()) throw new TemplateNotFoundError(templateId);
    const current = snap.data() as TemplateLibraryRecord;
    if (current.status === 'draft') throw new TemplateDraftError(templateId);

    // Merge incoming data with current to validate the combined result
    const merged = { ...current, ...data };
    validateMappings(merged.scaffoldSnapshot.expectedFields, merged.fieldMappings);

    const removed = await checkFeedDrift(merged.fieldMappings, merged.datasourceId);
    if (removed.length > 0) {
      throw new Error(
        `Cannot update: ${removed.length} mapped feed column(s) no longer exist: ${removed.join(', ')}`
      );
    }

    await _writeHistoryInTransaction(transaction, docRef, snap);

    // Strip immutable fields
    const { id: _id, createdBy: _cb, createdByUid: _cbUid, createdAt: _ca, ...safeData } = data;

    // NOTE: Non-owner editors cannot upload new asset files — Storage rules are owner-only.
    // The UI must hide the upload control for non-owners (see spec trust model section).

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
```

- [ ] **Step 4: Run all service tests**

```bash
npm run test:run -- src/services/__tests__/templateLibrary.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Run the full test suite**

```bash
npm run test:run
```

Expected: All existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/services/templateLibrary.ts src/services/__tests__/templateLibrary.test.ts
git commit -m "feat: implement templateLibraryService.updatePublished and deleteTemplate"
```

---

## Self-Review Checklist

After completing all tasks, verify:

- [ ] Rules tests cover: create (valid + 4 deny cases), read (draft privacy + published access), update (draft creator-only + immutable fields + published any-user), delete (creator-only)
- [ ] `saveDraft` initializes `version: 1`, `status: 'draft'`, null published fields
- [ ] `upsertDraft` throws `TemplatePublishedError` and `TemplateNotFoundError`; strips immutable fields; sets `updatedBy`/`updatedByUid` from auth context
- [ ] `publish` validates all expected fields are mapped; validates each `FieldMapping` is internally complete; checks feed drift (mapped columns only); throws on missing columns
- [ ] `updatePublished` throws `TemplateDraftError` on drafts; increments `version`
- [ ] `_writeHistoryInTransaction` is called inside `runTransaction` by `upsertDraft`, `publish`, and `updatePublished` — NOT by `saveDraft`
- [ ] The catch-all `clients/{slug}/**` rule is removed and replaced with explicit per-collection rules before the templateLibrary rules are added
- [ ] All three composite indexes are present in `firestore.indexes.json`
- [ ] `npm run test:run` and `npm run test:rules` both exit clean
