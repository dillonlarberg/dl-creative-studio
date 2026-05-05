# Track 1 — Service Migration Context

Use this document to resume work in a new Claude/Codex session.
Working directory: `antig/pmg-creative-studio/`

---

## What Track 1 Is

A terminology and service-path migration. No new features. Scope:

1. **Naming normalization** — `'image-resize'` → `'resize-image'`, `'optimize-existing'` → `'edit-existing'` across type definitions and constants.
2. **Service migration** — all four data services now accept `(clientSlug, appId, ...)` so Firestore paths are fully tenant-isolated at `clients/{slug}/apps/{appId}/...`. Previously, services either took no slug or built paths inconsistently.
3. **URL param safety** — `UseCaseWizardPage` now validates the raw URL param against the known `AppId` union via `isAppId()` before using it in service calls. Replaced all `useCaseId as AppId` casts with a validated `appId!`.
4. **Firestore/Storage rules** — added `isClientMember(clientSlug)` function and documented the production-target rule. Prototype still uses allowlist-only until `syncClientClaims` callable is deployed.
5. **Test alignment** — `WizardShell.test.tsx` updated for new service signatures and `appId` field rename.

---

## Current State

All 16 files are modified and unstaged. `npm run build` passes. `npm run test:run` cannot run locally because `vitest` is not installed in `node_modules` (listed in `package.json`, not installed — pre-existing, not caused by Track 1).

**Remaining before merge:**
- [ ] Run `npm install` so tests can be verified
- [ ] Deploy updated `firestore.rules` and `storage.rules` via `firebase deploy --only firestore:rules,storage`
- [ ] Commit all changes and open PR against `main`
- [ ] Push requires Dillon to add `annienguyen-pmg` as repo collaborator

---

## Files Changed and What Changed

### `src/types/index.ts`
- `UseCaseId`: `'image-resize'` → `'resize-image'`
- `EntryPath`: `'optimize-existing'` → `'edit-existing'`

### `src/constants/useCases.ts`
- `id: 'image-resize'` → `id: 'resize-image'`
- All 4 `'optimize-existing'` → `'edit-existing'`

### `src/pages/CreatePage.tsx`
- Filter array: `'image-resize'` → `'resize-image'` (line ~112)

### `src/platform/firebase/paths.ts`
- `AppId` union: added `'static-creative'`
- Added `templates`, `template`, `batches`, `batch`, `batchResults` path helpers
- Added `isAppId(value: unknown): value is AppId` type guard + `VALID_APP_IDS` array

### `src/services/creative.ts` — full rewrite
New signatures:
```ts
createCreative(clientSlug: ClientSlug, appId: AppId): Promise<CreativeId>
getCreative(clientSlug: ClientSlug, appId: AppId, creativeId: CreativeId): Promise<CreativeRecord | null>
updateCreative(clientSlug: ClientSlug, appId: AppId, creativeId: CreativeId, updates: Partial<CreativeRecord>): Promise<void>
getClientCreatives(clientSlug: ClientSlug, appId: AppId): Promise<CreativeRecord[]>
simulateGeneration(clientSlug: ClientSlug, appId: AppId, creativeId: CreativeId): Promise<void>
```
`CreativeRecord.useCaseId` field renamed to `CreativeRecord.appId`.
Path via `paths.creatives(clientSlug, appId)` and `paths.creative(clientSlug, appId, id)`.

### `src/services/batches.ts` — full rewrite
New signatures:
```ts
createBatch(clientSlug: ClientSlug, appId: AppId, data: Omit<BatchRecord, 'id'|'clientSlug'|'appId'|'createdAt'|'updatedAt'>): Promise<string>
updateBatchStatus(clientSlug, appId, batchId, status, completedCount?): Promise<void>
addResult(clientSlug, appId, batchId, result): Promise<void>
getBatch(clientSlug, appId, batchId): Promise<BatchRecord | null>
getBatchResults(clientSlug, appId, batchId): Promise<BatchResult[]>
```
`BatchRecord` gained `appId: string` field. Path via `paths.batches(clientSlug, appId)`.

### `src/services/templates.ts` — full rewrite
`deleteTemplate` gained `clientSlug: ClientSlug` as first param. `getTemplates`/`saveTemplate` already had it.

### `src/services/clientAssetHouse.ts`
Internal path changed from `doc(db, 'clientAssetHouse', clientSlug)` → `doc(db, paths.client(clientSlug))`. No signature changes.

### `src/platform/wizard/usePersistedStepData.ts` — full rewrite
All `creativeService` calls now pass `(clientSlug, manifest.id, ...)`. `manifest.id` is typed as `AppId`. No localStorage key changes — key is `creative_${slug}_${manifestId}` and `manifestId` is still in scope.

### `src/pages/use-cases/UseCaseWizardPage.tsx`
- Added `import { isAppId }` from paths
- Line ~413: `const appId: AppId | undefined = isAppId(useCaseId) ? useCaseId : undefined;`
- Early return guard: `if (!useCase || !appId)` (was `!useCaseId`)
- All 19 `useCaseId as AppId` casts replaced with `appId!`
- All `creativeService` and `batchService` call sites updated to new signatures

### `src/apps/template-builder/_internal/handlers.ts`
`handleExecuteBatch` opts now require `clientSlug: ClientSlug` and `appId: AppId`. All internal `batchService` calls updated.

### `src/apps/template-builder/steps/ExportStep.tsx`
`handleExecuteBatch` call now passes `appId: 'template-builder'` (literal, correct since this step lives in that app).

### `src/platform/wizard/WizardShell.test.tsx`
- `FakeData` interface now extends `Record<string, unknown>` to satisfy `StepData` constraint
- Two mock `CreativeRecord` objects: `useCaseId:` → `appId:`
- Two `getCreative` call assertions updated to 3-arg form: `('acme', 'edit-image', id)`

### `firestore.rules` + `storage.rules`
Added `isClientMember(clientSlug)` function with custom claims pattern:
```
function isClientMember(clientSlug) {
  return request.auth.token.get('clients', {}).get(clientSlug, false) == true;
}
```
Production target rule is a comment one line above the active rule — one-line swap once `syncClientClaims` callable is deployed. Prototype still uses allowlist-only.

---

## Architecture Context

**Firestore schema (tenant-isolated):**
```
clients/{slug}
  /apps/{appId}/creatives/{id}     ← drafts
  /apps/{appId}/batches/{id}       ← batch runs
  /apps/template-builder/templates/{id}
```

**AppId values (all 9 are valid):**
`resize-image`, `edit-image`, `new-image`, `edit-video`, `new-video`, `video-cutdown`, `static-creative`, `template-builder`, `feed-processing`

**Auth bridge (not yet deployed):**
- Alli OIDC token in `sessionStorage` → callable Firebase function `syncClientClaims` → `getMeProxy` → `setCustomUserClaims({ clients: { ralph_lauren: true } })` → force-refresh ID token → rules enforce `request.auth.token.clients[clientSlug] == true`
- Blocked on deploying the callable. Rules are written ready for it.

**`UseCaseWizardPage.tsx` is the legacy monolith** (4,311 lines). It will be replaced by the new `WizardShell` + app registry pattern. The `appId!` non-null assertions are deliberate stopgaps — they disappear when the monolith is replaced.

**Two open Phase 2 items (not Track 1):**
1. Deploy `syncClientClaims` callable + flip the rules one-liner
2. JSON scene graph for batch engine (currently batch uses `injectIntoHtml.ts`, must migrate before multi-size support)

---

## Key People / Access
- Annie Nguyen (`annienguyen-pmg`) — author, needs collaborator access from Dillon to push
- Dillon — repo owner, can add collaborator access
- Codex review passed with two residual callouts (now addressed): URL param cast safety + per-client rules
