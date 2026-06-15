# Firestore Schema — Template Library

**Date:** 2026-06-08
**Author:** Annie Nguyen
**Status:** Approved (Path 2 — allowlist phase only). Path 1 role model is documented in Future Work but not yet approved for implementation.

---

## Context

The Template Builder revamp (Approach 2 — 3-step redesign) publishes reusable templates to a
shared Template Library. This spec defines the Firestore schema for that library: collection
path, document shape, history subcollection, and security rules.

The Template Library is a **client-level asset** — not owned by the template-builder app.
Future consumers include a Batch Runner app (reads templates to instantiate ad generation runs)
and potentially a Media Planner app (attaches templates to campaigns). Nesting under
`apps/template-builder/` would block those consumers without crossing app path boundaries.

---

## Collection path

```
clients/{slug}/templateLibrary/{templateId}
  history/{historyId}
```

Drafts and published templates live in the **same collection**, differentiated by `status`.
This keeps gallery queries simple (`where('status', '==', 'published')`) with no separate
collection to sync.

---

## Document shape

```typescript
// clients/{slug}/templateLibrary/{templateId}
interface TemplateLibraryRecord {

  // Identity
  id: string;           // mirrors Firestore doc ID — set by service on create, never updated
  name: string;
  status: 'draft' | 'published';
  version: number;      // incremented on every publish or updatePublished() call
                        // Batch Runner job records store this to identify which version ran

  // Format
  channel: 'social' | 'programmatic' | 'print' | 'signage';
  adSizes: AdSize[];

  // Layout
  // scaffoldId must be globally unique across all channels — prefix with channel
  // e.g. 'social:grid_2x2', 'programmatic:banner_728x90'
  scaffoldId: string;
  scaffoldSnapshot: {
    expectedFields: string[];   // template field names the scaffold requires at publish time
    contentHash: string;        // SHA-256 of the scaffold HTML; pre-computed and stored in the
                                // SOCIAL_WIREFRAMES (or channel equivalent) registry constant.
                                // The Batch Runner compares this to the registry hash at job time
                                // to detect scaffold drift. Client reads it from the registry —
                                // no extra network round-trip needed.
    capturedAt: Timestamp;
  };
  thumbnailUrl?: string;        // GCS path: gs://bucket/clients/{slug}/templateLibrary/{id}/thumb.jpg
                                // NOT a raw GCS signed URL — those require service account
                                // credentials unavailable client-side and expire. At display
                                // time, call Firebase Storage SDK getDownloadURL() — access to
                                // generating the URL is governed by storage rules; the resulting
                                // URL should be treated as shareable (bearer-token, not auth-gated).

  // Feed
  // datasourceId is the Firestore document ID under clients/{slug}/datasources/
  // Do not store a DocumentReference here — the type is string.
  datasourceId: string;
  datasourceName: string;       // denormalized for gallery display without extra fetch
  feedSnapshot: {
    columns: string[];          // sorted column names at feed-selection time, re-captured on publish
    capturedAt: Timestamp;
    // Note: only column names are snapshotted, not types. Type drift (numeric → string etc.)
    // is a known blind spot and will not trigger a warning. See Known Limitations.
  };

  // Field mappings: templateFieldName → FieldMapping
  // Every field in scaffoldSnapshot.expectedFields must have an entry here at publish time.
  fieldMappings: Record<string, FieldMapping>;

  // Brand overrides applied in Step 2 Design panel
  brandOverrides: {
    primaryColor?: string;
    accentColor?: string;
    logoUrl?: string;         // GCS path, not signed URL
    showPrice?: boolean;
    showCTA?: boolean;
    ctaText?: string;
  };

  // AI context — preserved for re-generation and Batch Runner explainability
  brief?: string;               // creative brief from Step 1; optional (empty for non-AI paths)
  aiRequirements?: {
    intent: string;
    keyMessages: string[];
    tone?: string;
    targetAudience?: string;
  };

  // Attribution — all pairs must be written together and are immutable after create
  // *By fields: Alli user ID via getAlliUserId() — for display, consistent with OutputDoc
  // *ByUid fields: Firebase UID (request.auth.uid) — for Firestore rule ownership checks
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

interface AdSize {
  width: number;
  height: number;
  label?: string;   // e.g. 'Square', 'Landscape', 'Story'
}

type FieldMappingSource = 'feed' | 'upload' | 'brand' | 'static';

interface FieldMapping {
  source: FieldMappingSource;
  column?: string;      // required when source === 'feed': feed column name
  assetPath?: string;   // required when source === 'upload': GCS path (not signed URL)
                        // e.g. gs://bucket/clients/{slug}/templateLibrary/{id}/uploads/{file}
  brandKey?: string;    // required when source === 'brand': key from brandOverrides
                        // e.g. 'primaryColor', 'logoUrl', 'ctaText'
  value?: string;       // required when source === 'static': literal string value
}
```

---

## History subcollection

```typescript
// clients/{slug}/templateLibrary/{templateId}/history/{historyId}
interface TemplateHistoryEntry {
  snapshot: Omit<TemplateLibraryRecord, 'id'>; // full doc state BEFORE the change
  savedBy: string;      // Alli user ID
  savedByUid: string;   // Firebase UID
  savedAt: Timestamp;
}
```

### Behavior

- **`saveDraft` (new document only) skips history.** There is no "before" state on first create.
  History begins from the first `upsertDraft` or `updatePublished` call.
- Every subsequent save (draft auto-save, published template edit, and publish status transition)
  must write history + update the parent in a single **`runTransaction()`**. This prevents orphaned
  history entries and silent audit gaps.
- History entries are **immutable** — Firestore rules enforce `allow update, delete: if false`.
- **Client-writable history is not a cryptographically trustworthy audit trail.** A caller could
  in theory write a fabricated history entry. For MVP with 7 internal users this is acceptable.
  If audit integrity becomes a compliance requirement, route history writes through a Cloud
  Function using the Admin SDK. See Known Limitations.
- **Retention:** History entries are unbounded. No retention policy is in scope now. At scale,
  consider TTL-based archiving for entries older than 6 months.

---

## Published template edit lifecycle

Published templates can be edited in-place via the explicit `updatePublished()` service method.
`upsertDraft` throws if called on a `status: 'published'` document — this prevents auto-save
from silently mutating a live template mid-session.

`updatePublished()` runs the same pre-publish validation as `publish()` and increments `version`
before writing. Batch Runner job records store `{ templateId, version }` so there is always a
record of which version of a template generated a given batch.

**There is no unpublish.** Once a template is published it cannot be reverted to draft. If a
published template needs significant rework, delete it and create a new draft. Add `unpublish()`
to Future Work if user research shows this is needed.

---

## Access control

### Implementation prerequisite — remove the catch-all rule

`firestore.rules` currently contains:

```
// PROTOTYPE: allowlist-only until syncClientClaims callable is deployed
match /clients/{clientSlug}/{document=**} {
  allow read, write: if isAlliStudioUser();
}
```

Firestore ORs all matching rules. As long as this catch-all exists, the narrower
`templateLibrary` rules below are inert. **Before deploying the templateLibrary rules, the
catch-all must be replaced with explicit per-collection rules** for every existing collection
(`assets`, `apps/{appId}/templates`, `apps/{appId}/batches`, `apps/{appId}/outputs`,
`datasources`). The same applies to `storage.rules`.

This is a prerequisite task for the templateLibrary implementation, not optional.

### Current model: Path 2 (allowlist, no roles)

| Operation | Who can |
|-----------|---------|
| Read published template | Any Alli Studio user |
| Read draft template | Creator only |
| Create | Any Alli Studio user (`createdByUid` must match caller) |
| Update draft | Creator only; immutable fields protected; cannot self-publish via update |
| Update published | Any Alli Studio user; immutable fields protected; cannot demote to draft via update |
| Delete | Creator only |
| Publish (status transition) | Creator only; goes through service validation |

### Firestore rules

```
match /clients/{clientSlug}/templateLibrary/{templateId} {

  allow read: if isAlliStudioUser() && (
    resource.data.status == 'published' ||
    resource.data.createdByUid == request.auth.uid
  );

  // Enforce ownership on create — caller cannot forge createdByUid or skip the draft state
  allow create: if isAlliStudioUser() &&
    request.resource.data.createdByUid   == request.auth.uid  &&
    request.resource.data.id             == templateId         &&
    request.resource.data.status         == 'draft'           &&
    request.resource.data.version        == 1                 &&
    request.resource.data.publishedAt    == null              &&
    request.resource.data.publishedBy    == null              &&
    request.resource.data.publishedByUid == null;

  // Draft update: creator only; immutable fields protected; status must stay 'draft'
  allow update: if isAlliStudioUser() &&
    resource.data.status == 'draft' &&
    resource.data.createdByUid == request.auth.uid &&
    request.resource.data.id           == resource.data.id           &&
    request.resource.data.createdByUid == resource.data.createdByUid &&
    request.resource.data.createdBy    == resource.data.createdBy    &&
    request.resource.data.createdAt    == resource.data.createdAt    &&
    request.resource.data.status       == 'draft';
    // Status transitions (draft → published) go through the publish() service method,
    // which uses a separate rule condition below.

  // Publish transition: creator only; immutable fields protected
  allow update: if isAlliStudioUser() &&
    resource.data.status == 'draft' &&
    resource.data.createdByUid == request.auth.uid &&
    request.resource.data.id           == resource.data.id           &&
    request.resource.data.createdByUid == resource.data.createdByUid &&
    request.resource.data.createdBy    == resource.data.createdBy    &&
    request.resource.data.createdAt    == resource.data.createdAt    &&
    request.resource.data.status       == 'published';

  // Published template edit: any allowlisted user; immutable fields protected; status stays published
  // TODO(roles): narrow to isClientMember(clientSlug) && memberRole in ['admin', 'editor']
  allow update: if isAlliStudioUser() &&
    resource.data.status == 'published' &&
    request.resource.data.id           == resource.data.id           &&
    request.resource.data.createdByUid == resource.data.createdByUid &&
    request.resource.data.createdBy    == resource.data.createdBy    &&
    request.resource.data.createdAt    == resource.data.createdAt    &&
    request.resource.data.status       == 'published';

  // Only the creator can delete
  allow delete: if isAlliStudioUser() &&
    resource.data.createdByUid == request.auth.uid;

  match /history/{historyId} {
    // History read mirrors parent visibility
    allow read: if isAlliStudioUser() && (
      get(/databases/$(database)/documents/clients/$(clientSlug)/templateLibrary/$(templateId)).data.status == 'published' ||
      get(/databases/$(database)/documents/clients/$(clientSlug)/templateLibrary/$(templateId)).data.createdByUid == request.auth.uid
    );
    // History create mirrors parent update permission:
    // draft history → creator only; published history → any allowlisted user (non-owner edits)
    // saveDraft skips history (no parent exists yet — get() would return null)
    allow create: if isAlliStudioUser() && (
      get(/databases/$(database)/documents/clients/$(clientSlug)/templateLibrary/$(templateId)).data.status == 'published' ||
      get(/databases/$(database)/documents/clients/$(clientSlug)/templateLibrary/$(templateId)).data.createdByUid == request.auth.uid
    );
    allow update, delete: if false;
  }
}
```

### Storage rules

Store all template assets (thumbnails, uploads) under
`clients/{slug}/templateLibrary/{templateId}/`. Read mirrors parent Firestore visibility.
Write is owner-only:

```
match /clients/{clientSlug}/templateLibrary/{templateId}/{allPaths=**} {
  // Read mirrors parent draft/published visibility
  allow read: if isAlliStudioUser() && (
    firestore.get(/databases/(default)/documents/clients/$(clientSlug)/templateLibrary/$(templateId)).data.status == 'published' ||
    firestore.get(/databases/(default)/documents/clients/$(clientSlug)/templateLibrary/$(templateId)).data.createdByUid == request.auth.uid
  );
  // Write: owner only (consistent with draft privacy; non-owners can edit published template
  // content but cannot upload new assets on behalf of the owner)
  allow write: if isAlliStudioUser() &&
    firestore.get(/databases/(default)/documents/clients/$(clientSlug)/templateLibrary/$(templateId)).data.createdByUid == request.auth.uid;
}
```

---

## publish() and updatePublished() contract

Both methods must validate completeness before writing:

1. `scaffoldId` is set and resolves to a valid scaffold in the channel's wireframe registry
2. All fields in `scaffoldSnapshot.expectedFields` have a corresponding entry in `fieldMappings`
3. Each `FieldMapping` is internally complete for its source:
   - `source: 'feed'` → `column` is present and non-empty
   - `source: 'upload'` → `assetPath` is present and non-empty
   - `source: 'brand'` → `brandKey` is present, non-empty, is a known key of the `brandOverrides`
     interface (type-level), AND `brandOverrides[brandKey]` is non-undefined (value-level check).
     Exception: boolean fields (`showPrice`, `showCTA`) may be `false` intentionally — validate
     presence (`brandKey in brandOverrides`), not truthiness.
     **Batch Runner fallback:** if `brandOverrides[brandKey]` is undefined at render time, fall
     back to the scaffold's own default for that field. Do not error — some scaffold fields have
     sensible defaults and the override is optional.
   - `source: 'static'` → `value` is present (empty string is allowed — it may be intentional)
4. `datasourceId` is set
5. `feedSnapshot.columns` is non-empty

On publish / updatePublished, the service must also:
1. Re-capture `feedSnapshot` from the live feed (sorted columns + new `capturedAt`)
2. Run the drift check against mapped feed columns only (see Feed Snapshot section)
3. Re-capture `scaffoldSnapshot` from the registry (expectedFields + contentHash + new `capturedAt`)
4. Set or update `publishedBy`, `publishedByUid`, `publishedAt`
5. Increment `version`
6. Write history + parent in a single `runTransaction()`

---

## Service layer

Create `src/services/templateLibrary.ts`:

```typescript
// Errors
export class TemplateNotFoundError extends Error {}
export class TemplatePermissionError extends Error {}

// Read
getPublishedTemplates(clientSlug: string): Promise<TemplateLibraryRecord[]>
getDraftTemplates(clientSlug: string): Promise<TemplateLibraryRecord[]>
  // Filters by auth.currentUser?.uid internally — never accepts a userId parameter

getTemplate(clientSlug: string, templateId: string): Promise<TemplateLibraryRecord>
  // Throws TemplateNotFoundError if the Firestore snapshot is missing (getDoc() returns empty)
  // Throws TemplatePermissionError if the caller cannot read the template (permission-denied)
  // Note: Web SDK getDoc() does not natively throw not-found; the service wraps the missing
  // snapshot into TemplateNotFoundError explicitly.
  // Never returns null — always throws so callers can distinguish the failure modes.

// Write
saveDraft(clientSlug: string, data: NewTemplateData): Promise<string>
  // Creates a new draft document. Returns the new templateId.
  // Initializes version: 1 in the document payload. Version increments on publish() and
  // updatePublished(), so the first published template will have version: 2. Batch Runner
  // can rely on: drafts always have version === 1, published templates always have version >= 2.
  // Does NOT write a history entry (no "before" state exists on first create).
  // Only called when no templateId exists in TemplateBuilderContext.

upsertDraft(clientSlug: string, templateId: string, data: Partial<TemplateLibraryRecord>): Promise<void>
  // Updates an existing draft.
  // Uses runTransaction(): reads current doc via transaction.get(), throws TemplateNotFoundError
  // if doc is missing, throws if status !== 'draft' (use updatePublished() for published templates).
  // Strips immutable fields (id, createdBy, createdByUid, createdAt) from payload before writing.
  // Sets updatedBy/updatedByUid from getAlliUserId() and auth.currentUser.uid — caller-provided
  // values for these fields are ignored to prevent attribution spoofing.
  // Then calls transaction.update() (not setDoc merge, which could silently recreate a deleted doc).

publish(clientSlug: string, templateId: string): Promise<void>
  // Runs pre-publish validation, re-captures snapshots, transitions status draft → published.
  // Wraps _writeHistoryInTransaction + parent update in runTransaction().

updatePublished(clientSlug: string, templateId: string, data: Partial<TemplateLibraryRecord>): Promise<void>
  // Edits a published template in-place. Throws if template status !== 'published'.
  // Runs same validation as publish(). Increments version.
  // Strips immutable fields from payload.
  // Sets updatedBy/updatedByUid from auth context — caller-provided values ignored.
  // Wraps _writeHistoryInTransaction + parent update in runTransaction().
  // IMPORTANT: Non-owner editors cannot upload new asset files — Storage rules restrict writes
  // to createdByUid only. If a non-owner updates a field with source: 'upload', they must
  // reference an existing GCS path; attempting to upload a new file will throw a Storage
  // permission-denied error. The UI should conditionally hide the upload control for non-owners.

// Delete
deleteTemplate(clientSlug: string, templateId: string): Promise<void>

// Internal — not exported from the module
async _writeHistoryInTransaction(
  transaction: Transaction,
  docRef: DocumentReference,
): Promise<void>
  // Reads current doc state via transaction.get(docRef), writes snapshot to history subcollection.
  // Must be called inside runTransaction() before the parent update.
  // Called by upsertDraft, publish, and updatePublished — NOT by saveDraft.
```

**`saveDraft` vs `upsertDraft` decision in step components:**
- Step 1 `onLeave` (first save): call `saveDraft`, store returned `templateId` in `TemplateBuilderContext`
- Step 2 auto-save: call `upsertDraft` with the stored `templateId`
- If `templateId` is missing from context unexpectedly (page refresh, state reset): call `saveDraft`
  again. Duplicates may appear in the draft list but do not corrupt published templates.
- Step 2 on a published template (edit flow): call `updatePublished` — never `upsertDraft`

---

## Feed snapshot and drift detection

| Event | Action |
|-------|--------|
| User selects feed in Step 1 | Capture `feedSnapshot.columns` (sorted) + `capturedAt` in `TemplateBuilderContext` |
| Draft saved (Step 1 or 2) | Write snapshot from context |
| publish() / updatePublished() | Re-capture from live feed. Run drift check. Block on breaking drift only. |

**Drift check — filter to mapped columns only:**

```typescript
// Only check columns that the template actually uses
const mappedFeedColumns = Object.values(fieldMappings)
  .filter(m => m.source === 'feed' && m.column)
  .map(m => m.column!);

const draftColumns = feedSnapshot.columns;                    // previously persisted snapshot
const liveColumns  = await fetchFeedColumns(datasourceId);    // sorted, fetched at publish time
const removed = mappedFeedColumns.filter(c => !liveColumns.includes(c));
const added   = liveColumns.filter(c => !draftColumns.includes(c));   // informational only

if (removed.length > 0) {
  throw new Error(
    `Cannot publish: ${removed.length} mapped feed column(s) no longer exist: ${removed.join(', ')}`
  );
}
// added.length > 0 → log only, do not block publish
```

---

## Composite indexes required

Add to `firestore.indexes.json`:

```json
[
  {
    "collectionGroup": "templateLibrary",
    "queryScope": "COLLECTION",
    "fields": [
      { "fieldPath": "status",       "order": "ASCENDING" },
      { "fieldPath": "createdAt",    "order": "DESCENDING" }
    ]
  },
  {
    "collectionGroup": "templateLibrary",
    "queryScope": "COLLECTION",
    "fields": [
      { "fieldPath": "createdByUid", "order": "ASCENDING" },
      { "fieldPath": "status",       "order": "ASCENDING" },
      { "fieldPath": "createdAt",    "order": "DESCENDING" }
    ]
  },
  {
    "collectionGroup": "templateLibrary",
    "queryScope": "COLLECTION",
    "fields": [
      { "fieldPath": "status",       "order": "ASCENDING" },
      { "fieldPath": "channel",      "order": "ASCENDING" },
      { "fieldPath": "createdAt",    "order": "DESCENDING" }
    ]
  }
]
```

---

## Consumers

| App | Relationship |
|-----|-------------|
| Template Builder (this app) | Creates, edits, and publishes templates |
| Batch Runner *(planned)* | Reads published templates; validates `scaffoldSnapshot.contentHash` against registry hash and `feedSnapshot.columns` against live feed before instantiating a run |
| Ad Resizing | Indirect — resizes outputs generated from templates; does not read templateLibrary directly |
| Media Planner *(planned)* | May attach `{ templateId, version }` to a campaign for recurring generation |

**Open question for Batch Runner spec:** Will the Batch Runner render ads by resolving `scaffoldId`
against the live `SOCIAL_WIREFRAMES` registry at job time, or from an immutable stored scaffold
artifact? The answer determines whether `scaffoldSnapshot.contentHash` is a drift-detection guard
(live registry) or the primary render input (stored artifact). This must be decided before the
Batch Runner spec is written.

---

## Intended role model (Path 1 — future work)

When the app grows beyond the internal allowlist, implement the Admin / Editor / Viewer model
(consistent with Creatify's workspace roles):

| Role | Read published | Read own drafts | Create | Edit published | Delete own |
|------|---------------|-----------------|--------|----------------|------------|
| Admin | ✓ | ✓ | ✓ | ✓ | ✓ |
| Editor | ✓ | ✓ | ✓ | ✓ | ✓ |
| Viewer | ✓ | ✓ | ✗ | ✗ | ✗ |

**Note — Admin delete-own-only is intentional for MVP simplicity.** Admins and Editors have
the same delete scope in this model (own templates only). If Admins need to delete other users'
templates (e.g. to clean up stale shared assets), add a "Delete any" column for Admin when
Path 1 is implemented and update the rules predicate accordingly. This was an explicit design
decision, not an omission.

**Full implementation checklist:**
1. Replace `clients/{clientSlug}/**` catch-all in `firestore.rules` and `storage.rules` with
   explicit per-collection rules *(shared prerequisite with templateLibrary rules — do once)*
2. Create `clients/{slug}/members/{uid}` with `{ role: 'admin' | 'editor' | 'viewer', email, addedAt, addedBy }`
3. Build `syncClientClaims` Firebase callable:
   - **Trigger:** called client-side immediately after successful Alli OIDC login, before the user
     reaches any rules-guarded page
   - **Action:** reads `members/{uid}`, writes custom claims `{ clients: { [slug]: role } }`
   - Client calls `auth.currentUser.getIdToken(true)` in the callable's success handler to force
     token refresh before the first Firestore read
   - **Offline handling:** if callable fails (network error), show an error and retry — do not
     proceed with stale/missing claims
4. Update `isClientMember(clientSlug)` and add `memberRole(clientSlug)` predicate in rules
5. Replace `TODO(roles)` comments with role-based predicates
6. Seed `members/{uid}` for the 7 existing allowlisted users via migration script
7. Keep `isAlliStudioUser()` as a fallback `||` condition during migration; remove only after
   seed + deploy is verified in production (lockout prevention)
8. Backfill `createdByUid` on any templateLibrary records created before this field existed
9. Add Firestore emulator rule tests covering all role/visibility combinations

**Estimated lift:** 1.5–2 weeks. Build as a standalone ticket when the app opens beyond the internal team.

---

## Trust model and known service-bypass risk

**Path 2 publish/update validation is service-enforced only.** The Firestore rules permit the
draft → published status transition and published template edits as long as immutable fields are
preserved and the caller is allowlisted. They do not validate that `fieldMappings` is complete,
that `scaffoldId` resolves, or that `version` was incremented correctly. A direct Firestore
write that bypasses `publish()` or `updatePublished()` can create a malformed published template.

This is **explicitly accepted** for Path 2. The allowlist has 7 internal PMG engineers who are
expected to interact with the template library through the service layer only — not via direct
Firestore writes. There is no external attack surface at this access level.

If the app opens to untrusted users (Path 1 or beyond), move `publish()` and `updatePublished()`
to Firebase Callables backed by Admin SDK writes. The callable validates the payload server-side
before committing; the Firestore rules can then require that these fields are only written by
the callable's service account identity.

---

## Known limitations

- **Type drift is not detected.** `feedSnapshot` stores column names only. If a feed column's
  data type changes (e.g. numeric → string), no warning is raised. The Batch Runner may render
  garbage or fail silently. Acceptable tradeoff for MVP.
- **Scaffold drift detection is passive.** `scaffoldSnapshot.contentHash` lets the Batch Runner
  detect drift at job time but does not prevent the template from being used with a changed
  scaffold. Mitigation: treat scaffolds as immutable once referenced by a published template.
  Assign new IDs to updated scaffold versions rather than modifying existing files.
- **History is not cryptographically trustworthy.** A client-side caller could write fabricated
  history entries. Acceptable for 7 internal users. If audit integrity becomes a compliance
  requirement, route history writes through a Cloud Function using the Admin SDK.
- **History entries are unbounded.** No retention policy exists. At scale, consider TTL-based
  archiving.
- **No unpublish.** Intentional for MVP — publishing is a one-way gate. Users edit in-place or
  delete and recreate.

---

## What this spec does NOT cover

- Thumbnail generation (covered by the Approach 2 implementation spec)
- Template Library browser UI (gallery view, search, filter by channel)
- Batch Runner app architecture and scaffold render contract
- Member management UI for Path 1 roles
