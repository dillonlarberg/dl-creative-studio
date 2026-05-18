# Firestore Client Isolation via Custom Claims — STUB

> **Status:** Stub. Decisions Q1–Q5 sketched. Not execution-ready. Promote to a full plan after [Unified Output Schema Migration](./2026-05-15-unified-output-schema-migration.md) merges, since that plan supplies the `clientSlug` denormalization this one enforces.

**Goal:** Replace today's all-PMG-can-read-all-clients model with per-user client-membership enforcement, using Firebase Auth custom claims + the already-defined `isClientMember(clientSlug)` helper in `firestore.rules:35`.

**Owner:** Diego.
**Depends on:** Unified Output Schema Migration (every output doc must carry `clientSlug` before rules can gate on it).
**Blocks:** Any external/non-PMG access to the app. "Your generations" view across non-PMG users. Onboarding clients to self-service.

---

## Why this is its own plan

The Unified Output Schema Migration intentionally adds the `clientSlug` field on every output but does **not** flip the rule that enforces it. Reason: schema migration is reversible and ships under feature flags; rule changes are global, atomic, and destructive on misconfiguration. They deserve a separate review cycle.

Today (verified 2026-05-15):

- `firestore.rules:21–29` — email allowlist of 8 PMG staff
- `firestore.rules:35` — `isClientMember(clientSlug)` defined but **never called**
- `firestore.rules:44–45` — `allow read, write: if isAlliStudioUser()` — every allowlisted user sees every client
- No `syncClientClaims` callable exists yet
- No client-membership data exists in any document or auth claim

---

## Decisions to lock (Q1–Q5 sketch)

### Q1 — Source of truth for membership

**Options:**
- **A.** Firestore doc `users/{uid}.clients: string[]` — readable from rules via `get(/users/$(uid))`. Mutable from admin SDK only. One read per request.
- **B.** Firebase Auth custom claim `clients: string[]` on the user's ID token. Zero read overhead. Token must refresh on change (≤1 hour stale).
- **C.** Both — claim is the hot path, Firestore doc is the audit log.

**Lean:** **B** for the rule, **C** if we need an audit trail.

### Q2 — Who writes membership?

**Options:**
- **A.** Admin-only manual via a one-off script.
- **B.** A new `syncClientClaims` callable that reads from an Alli/OIDC source (the `oidc.alli` provider already in use) and mirrors that user's accessible clients into a custom claim. Runs on login + on demand.
- **C.** A scheduled function that nightly syncs from Alli.

**Lean:** **B**. Login-time sync matches existing OIDC flow; on-demand admin trigger covers the "user just got added to client X, refresh now" case.

### Q3 — Rule shape

```
match /clients/{clientSlug}/{document=**} {
  allow read, write: if isAlliStudioUser() && isClientMember(clientSlug);
}
match /{path=**}/outputs/{outputId} {
  allow read: if isAlliStudioUser() && isClientMember(resource.data.clientSlug);
}
```

`isClientMember` reads from the claim (cheap) with optional fallback to the `users/{uid}` doc.

**Open question:** how do we handle the `clientAssetHouse/{slug}` legacy collection during the transition? Keep allowlist-only (current state) or fold into the new model?

### Q4 — PMG admin / superuser tier

Some users need cross-client visibility (Diego, ops). Options:
- **A.** Special claim `pmgAdmin: true` that bypasses `isClientMember`.
- **B.** Add every PMG staff to every client's membership list. Brittle.
- **C.** No admin tier — everyone scoped, use an admin-SDK back door for ops.

**Lean:** **A**.

### Q5 — Migration / rollout

- **Step 1:** Deploy `syncClientClaims` callable; have it write claims for all 8 PMG-allowlisted users, mapping each to every existing client slug (preserves current behavior).
- **Step 2:** Deploy rule change behind a wrapper helper `isClientMember()` that returns `true` if claim missing (fail-open during transition).
- **Step 3:** Verify no traffic dropped via Cloud Logging for 7 days.
- **Step 4:** Flip `isClientMember()` to fail-closed.
- **Step 5:** Tighten PMG users' claims to only the clients they actually need (kill blanket access).

Hard gate between every step. No silent flag-flipping.

---

## Open questions to resolve before promotion

- Where does the canonical "user X has access to clients Y, Z" data live in Alli? Does the OIDC token carry it? If not, where is `syncClientClaims` reading from?
- Are there other collections beyond `clients/{slug}/**` that need isolation? (`uploads/`? `clientAssetHouse/`? The unified-schema plan flags `uploads/` as a path that shouldn't exist post-migration — coordinate.)
- How do we handle the gap between a user being added to a new client and their token refreshing (up to 60 min)? Force re-auth, or accept the gap?
- Should reads on `clientAssetHouse/{slug}` be folded in or left as legacy allowlist?

---

## Out of scope (for now)

- Storage rules tightening (`storage.rules:42` is already permissive — separate audit)
- Field-level encryption
- Per-user-within-client permissions (everyone in client X sees everything in client X)
- Audit logging of cross-client access attempts

---

## What this plan unblocks once shipped

- Onboarding non-PMG users (agency clients, contractors) to specific clients only
- "Your generations" view across users without cross-client leakage
- Compliance / SOC2 story for client data isolation
