# AdLabs Dashboard v1 — Implementation Plan

**Date:** 2026-05-05 (revised after CEO + Eng review rounds + CreatePage dependency scan)
**Owner:** Diego Escobar
**Branch strategy:** Cut a long-lived feature branch from `dev` (e.g. `feature/adlabs-v1`). All steps below ship as PRs into that branch. Final merge into `dev` happens after Step 4 verifies in staging. Do **not** PR individual steps into `dev`. **Rebase `feature/adlabs-v1` onto `dev` after each SOC2 rebuild PR (PR4/5) lands** — Steps 0, 0.5, 0.75 modify the exact files (`src/apps/types.ts`, `_registry.ts`, `WizardShell.tsx`, `AppLayout.tsx`) that SOC2 work also touches. Conflicts are guaranteed; rebase early and often.

## Context

Creative Studio is being rebranded as **AdLabs** — a tab inside the Alli platform. AdLabs's product thesis is _fast edits on dynamic templates for dynamic ad feeds_, replacing two specific frictions:
1. The current static-image → HTML → JS-injection flow for new dynamic templates.
2. Manual HTML edits and long approval rounds for variant iteration.

The modular SOC2 rebuild (apps registry, WizardShell, path-scoped Firestore) is the technical groundwork that makes this absorption clean. v1 ships a new dashboard surface with **one live app, one preview-stub app, and one flag-gated lifted app** so the codebase is in shape to keep building apps in isolation.

## Locked decisions (post-review)

1. **Archive (don't delete) `CreatePage`** in the same PR as the route swap. Delete in a follow-up cleanup after a soak period.
2. **Cut Stats / Top Performer / Recent Generated from v1** entirely. Keep only Active Batch Jobs (mocked in Step 1, wired real in Step 4). Top Performer is data-pipeline blocked and shipping it mocked is a credibility risk.
3. **No platform banner in v1.** Chrome rework lands later.
4. **Sidebar shape stays as `AppLayout.tsx` has it today** — `Alli Studio` + `Client Asset House` nav items, header, footer, three client-switch entry points preserved. DEV ribbon stays gated on `import.meta.env.DEV`.
5. **Three apps render in v1**:
   - **Template Builder** — already live (`src/apps/template-builder/`).
   - **Video Cutdown** — lifted out of `UseCaseWizardPage` in Step 2, **flag-gated** in Step 1's release until the lift ships.
   - **Batch Variants** — preview-status manifest stub (clickable, lands on a "Coming soon" view inside WizardShell). Demonstrates the multi-app shell without a full lift.
6. **Coming-soon shelf** below the apps grid for: Resize Image, Edit & Tweak. No styling treatment that implies they're clickable.
7. **Visual reference**: `html_prototypes/dashboard (1).html` on `dev` is the source of truth for layout, copy, and styling — **minus the cut sections** (Stats, Top Performer, Recent Generated).
8. **Mocked sections are internal-only.** Active Batch Jobs (mocked in Step 1) renders only when the user role/email is PMG-internal. Client logins see an empty state until Step 4 lands real data.
9. **One-line thesis banner** ("Dynamic templates for dynamic feeds.") in the DashboardPage header.
10. **Long-term URL shape**: `/adlabs/:clientSlug/...`. Step 0 reconciles from current root mount.

## Out of scope for v1

- Brand Asset House v2 schema. Future work.
- Deterministic AI re-targeting pipeline. Future work.
- Alli platform icon rail (Dashboards / Data / Strategy & Planning / Actions / Audiences / Creative / **AdLabs** / Products + Settings). Future chrome rework.
- Persistent Alli platform banner. Future chrome rework.
- Lifting Resize Image / Edit & Tweak out of the monolith. Future per-app PRs.
- Canvas-editor as a destination — `html_prototypes/canvas-editor.html` has zero TS implementation; v1 hero status would be 3–4 weeks greenfield. Re-evaluate when AI re-targeting work begins.
- `execution-plan.html`, `template-picker.html` prototypes — ignore.
- Wiring Stats / Top Performer / Recent Generated. These sections are **deleted from v1**, not deferred.

## CreatePage dependency inventory (load-bearing behavior to preserve)

From the scanner pass on `src/pages/CreatePage.tsx`:

- **localStorage `selectedClient`** read at `CreatePage.tsx:37` (component-level) and `:148` (per-tile in `UseCaseCard`). `DashboardPage` must use a **single stable client binding** to avoid mid-render divergence after client switches.
- **`fetchStatus()` on mount** (`CreatePage.tsx:39-54`) does two things:
  - `clientAssetHouseService.getAssetHouse(client.slug)` — drives the `isReady` brand-standards gate.
  - `alliService.getCreativeAssets(client.slug)` — **fire-and-forget cache warm** for the `AlliService` singleton. Cold cache adds latency to the first wizard load. Invisible dependency, must be ported.
- **Brand-standards gate** (`isReady`): `clientAssetHouseService.checkBrandStandards()` (lines 39-47 of that service) returns true only when `primaryColor`, `fontPrimary`, `logoPrimary`, `logoInverse` are all set. Gates `new-image`, `new-video`, `template-builder` tiles via `requiresBrandStandards` on `UseCase` (`src/constants/useCases.ts`). Gate UX = amber warning banner + grayed-out tile + "Standards required" CTA, no redirect.
- **`clientAssetHouse` collection is NOT path-scoped.** Lives at top-level `clientAssetHouse/{slug}`. `DashboardPage` must read from the legacy path; reading from `clients/{slug}/apps/...` will silently show every client as brand-not-ready.
- **`AppLayout.tsx:82-92` redirect guard** fires on every route change for missing `selectedClient`. Two resolution mechanisms now coexist: `localStorage` (AppLayout) vs `useParams` (`ClientProvider.tsx`). Step 0 must reconcile.
- **Registry vs `USE_CASES`**: `requiresBrandStandards` lives on `UseCase`, not `AppManifest`. Either extend `AppManifest` or have `DashboardPage` cross-reference `USE_CASES` by ID.
- **No httpsCallable, no Storage, no role-based gating** in CreatePage itself. Auth identity is at the `<Route>` level via `authService.subscribe` in `App.tsx:20-23`.

## Step list

Each step is one PR into the `feature/adlabs-v1` branch. Order: 0 → 0.5 → 0.75 → 1 → 2 → 2.5 → 3 → 4 → 5.

**Tracer-test discipline:** Each step has a **Tracer test (completeness gate)** — a single, runnable check (or a tiny set) that proves the step delivered the goal. A step is not "done" until its tracer passes. Tracers are binary pass/fail, automated where possible, and target user-visible or system-level behavior — not implementation detail. If you can't write the tracer test, the step is under-specified.

### Step 0 — Route shape + async-next contract

**Files:**
- Modified: `src/App.tsx` — add `/adlabs/:clientSlug/...` route group; legacy `/` → redirect to `/adlabs/:clientSlug/` (resolves clientSlug from localStorage); legacy `/create` redirect updated.
- Modified: `src/apps/types.ts` — extend `WizardStep` with optional `submit?: (ctx) => Promise<{ nextStepId?: string }>` to handle async navigation. Existing synchronous `next` stays for the simple case.
- Modified: `src/apps/WizardShell.tsx` (or wherever the step driver lives) — call `submit` when present, await, then route.
- Modified: `src/components/AppLayout.tsx:82-92` — guard reconciles `localStorage.selectedClient` against `useParams().clientSlug` from the new route shape. Spec: URL param wins; if mismatched, write the URL value to localStorage; if both missing, redirect to `/select-client`.

**`submit` rejection contract:** if `submit` throws/rejects, user stays on current step, error is surfaced via step-local state (no global toast, no navigation, no partial Firestore writes committed). Step components are responsible for not mutating shared state until `submit` resolves successfully.

**Verification:**
- `npm run typecheck` passes.
- New unit test: `WizardShell` calls `submit` when defined, falls back to `next` otherwise.
- Regression test: a step with synchronous `next` (e.g. existing `template-builder`) still navigates correctly — guards against the contract change breaking the live app.
- Test: `submit` rejection leaves the wizard on the current step with no state mutation.
- Manual: existing `template-builder` flow unaffected. Hard refresh on `/adlabs/ralph_lauren/template-builder/...` doesn't bounce to `/select-client`.

**Tracer test (completeness gate):**
1. **E2E**: With `selectedClient='ralph_lauren'` in localStorage, navigate to `/adlabs/ralph_lauren/template-builder/`. Hard reload. Assert URL is unchanged and the template-builder root component mounts (not `/select-client`).
2. **Unit**: Define a test step with `submit: async () => { await delay(50); return { nextStepId: 'step-b' } }`. Render in WizardShell, click Continue, assert: shell shows pending state during the 50ms, then navigates to `step-b`. Define a second step with synchronous `next: () => 'step-c'`, click Continue, assert immediate navigation. Both pass = contract holds.
3. **Unit**: A step whose `submit` rejects with `new Error('boom')` keeps the user on the current step, surfaces the error in step-local state, and writes nothing to Firestore (assert via mock spy).

### Step 0.5 — Port CreatePage load-bearing behavior

**Files:**
- New: `src/hooks/useClientBootstrap.ts` — single hook that (a) resolves the active client from URL → localStorage, (b) fetches the asset house, (c) fires the Alli cache warm, (d) returns `{ client, isReady, loading, error }`.
- New: `src/hooks/__tests__/useClientBootstrap.test.ts` — covers each side effect + missing-client case + asset-house failure case.

**Behavior:**
- One stable client binding (fixes the double-read divergence at `CreatePage.tsx:37` vs `:148`).
- `clientAssetHouseService.getAssetHouse` reads from legacy `clientAssetHouse/{slug}` (NOT path-scoped — confirmed in scan).
- `alliService.getCreativeAssets` fired fire-and-forget on mount, error swallowed with logger.warn.
- `isReady` exposed for tile gating.
- **Asset-house failure UX:** read failure does not crash the dashboard. Hook returns `error` set, `isReady=false`, `client` still resolved. `DashboardPage` renders the same amber warning banner CreatePage uses today, plus a "Couldn't load brand standards — retry" affordance.

**Tracer test (completeness gate):**
1. **Integration**: Mock `clientAssetHouseService.getAssetHouse` and `alliService.getCreativeAssets`. Render `useClientBootstrap()` in a test harness with `selectedClient='ralph_lauren'` in localStorage. Assert exactly: (a) one call to `getAssetHouse('ralph_lauren')` against legacy path `clientAssetHouse/ralph_lauren` (assert path with a Firestore mock spy), (b) one call to `getCreativeAssets('ralph_lauren')`, (c) hook returns `{client: {slug: 'ralph_lauren', ...}, isReady: <bool from fixture>, loading: false, error: null}`.
2. **Integration**: Make `getAssetHouse` reject. Assert hook returns `{client, isReady: false, loading: false, error: <Error>}` and does NOT throw. The `getCreativeAssets` call still fires (independent failure modes).
3. **Integration**: With localStorage empty, hook returns `{client: null, ...}` and triggers no Firestore/Alli reads.

### Step 0.75 — Manifest preview status + WizardShell stub view

**Files:**
- Modified: `src/apps/types.ts` — add `status?: 'live' | 'preview'` and `requiresBrandStandards?: boolean` to `AppManifest`. Manifest is the **single source of truth** for the brand-standards gate going forward.
- Modified: `src/apps/template-builder/manifest.ts` — set `requiresBrandStandards: true`.
- Modified: `src/apps/WizardShell.tsx` — when `manifest.status === 'preview'`, render a stub view (title, "Coming soon" panel, back link) instead of wizard chrome (no Continue button, no checklist).
- New: `src/apps/__tests__/WizardShell.preview.test.tsx`.

**Note:** `USE_CASES.requiresBrandStandards` (`src/constants/useCases.ts`) stays as the constant for legacy `/create/*` fallback routes only. Once all referenced apps are lifted into the registry (post-v1), the constant's `requiresBrandStandards` field can be removed.

**Tracer test (completeness gate):**
1. **Component**: Render WizardShell with a manifest where `status: 'preview'`. Assert: "Coming soon" copy is in the DOM, no element matching `[data-testid="continue-button"]` exists, no element matching `[data-testid="step-checklist"]` exists, a back link to `/adlabs/:clientSlug/` is present and clickable.
2. **Component**: Render WizardShell with `status: 'live'` (existing template-builder manifest). Assert Continue button + checklist render normally — proves preview mode is purely additive.
3. **Type-level**: `AppManifest['requiresBrandStandards']` exists and is `boolean | undefined` — TS compile error if missing.

### Step 1 — `DashboardPage` (replaces `CreatePage`)

**Files:**
- New: `src/pages/DashboardPage.tsx`
- New: `src/pages/__tests__/DashboardPage.test.tsx`
- Modified: `src/App.tsx` — `/adlabs/:clientSlug/` mounts `DashboardPage`.
- Archived: `src/pages/CreatePage.tsx` → `src/pages/_archive/CreatePage.tsx` (kept for one PR cycle, deleted in Step 5).

**Behavior:**
- Uses `useClientBootstrap()` from Step 0.5. Single binding, no per-tile re-reads.
- Reads `getRegistry()` from `src/apps/_registry.ts`. Renders one `<AppCard>` per registered manifest.
- v1 expects three manifests: `template-builder` (live), `video-cutdown` (live, but **hidden by registry-level flag-gate `import.meta.env.VITE_FEATURE_VIDEO_CUTDOWN_LIFT`** until Step 2 ships), `batch-variants` (preview).
- **Flag-gating mechanism**: gate is applied inside `_registry.ts` (manifest is registered conditionally on the env flag), so `DashboardPage` does not need to know about the flag and never imports a manifest that doesn't exist. Step 1 registers the `batch-variants` preview manifest only; the `video-cutdown` manifest is registered (gated) in Step 2.
- Tile gating: reads `manifest.requiresBrandStandards` (set in Step 0.75). No `USE_CASES` cross-ref.
- **Internal-only render gate** for mocked Active Batch Jobs: centralized helper `isInternalUser(user)` returning `user.email?.endsWith('@pmg.com') === true`. Lives in `src/auth/isInternalUser.ts`. Used here and reusable for future internal-only UI.
- Coming-soon shelf with hardcoded entries for Resize Image, Edit & Tweak. Visual-only stubs.
- Page header: greeting, **one-line thesis banner ("Dynamic templates for dynamic feeds.")**, date-range pill (mocked, non-functional in v1).
- **Active Batch Jobs section only**, mocked. Internal-only render gate (PMG email check).
- Brand-standards warning banner + amber dot on Client Asset House nav preserved from CreatePage UX.

**Verification:**
- `npm run typecheck`, `npm run test -- DashboardPage` pass.
- Tests cover: registry-driven card rendering, missing-client redirect, brand-standards gating, internal-only mocked-section gate, video-cutdown flag off → card hidden, flag on → card visible.
- Manual: visit `/adlabs/ralph_lauren/`, see dashboard, click Template Builder, click Batch Variants → preview view, Video Cutdown card hidden by default.

**Tracer test (completeness gate):**
1. **E2E (Playwright or equivalent)**: As a brand-ready PMG-internal user, navigate to `/adlabs/ralph_lauren/`. Assert in order:
   - Thesis banner text "Dynamic templates for dynamic feeds." is visible.
   - Exactly 2 app cards render (Template Builder + Batch Variants); no Video Cutdown card.
   - Click Template Builder → navigates to `/adlabs/ralph_lauren/template-builder/`.
   - Click Batch Variants → navigates to `/adlabs/ralph_lauren/batch-variants/` and shows the preview stub view.
   - Active Batch Jobs section is visible (mocked data).
   - Coming-soon shelf shows Resize Image + Edit & Tweak as non-clickable.
2. **E2E**: Same path with `VITE_FEATURE_VIDEO_CUTDOWN_LIFT=true`. Assert 3 cards render, Video Cutdown card is now present.
3. **E2E**: As a non-PMG email user, navigate to `/adlabs/ralph_lauren/`. Assert Active Batch Jobs section is NOT in the DOM (or shows empty state, no mock numbers).
4. **E2E**: As a brand-NOT-ready client, assert template-builder card has `data-disabled="true"` and "Standards required" CTA, and amber warning banner is visible.
5. **E2E**: Navigate directly to `/adlabs/` (no slug) with no `selectedClient` in localStorage → redirects to `/select-client`.

### Step 2 — Lift Video Cutdown into `src/apps/video-cutdown/`

**Files:**
- New: `src/apps/video-cutdown/manifest.ts` (id `video-cutdown`, basePath `video-cutdown`, status `live`).
- New: `src/apps/video-cutdown/VideoCutdownApp.tsx` and per-step components.
- New: `src/apps/video-cutdown/__tests__/manifest.test.ts` + integration tests (see below).
- Modified: `src/apps/_registry.ts` — register `videoCutdownManifest`.
- Modified: `src/pages/use-cases/UseCaseWizardPage.tsx` — remove video-cutdown branches at lines 373, 1027, 1105-1106, 1147, 1286-1287, 1385, 1641, 4201.

**Lift contract resolution (uses Step 0's async `submit`):**
- Gemini analysis trigger → `submit` of `ai-reccos` step.
- FFmpeg stitching → `submit` of `process` step (was inline in `next()` at line ~1335).
- "No cuts selected" guard → `submit` returns `{ nextStepId: <current> }` to stay in place; surface error via step state.
- `setIsLoading` mid-flight → handled by WizardShell's pending state during awaited `submit`.
- Path-scoped Firestore writes go under `clients/{slug}/apps/video-cutdown/...`.
- `selected_${len}` localStorage key (`UseCaseWizardPage.tsx:1111`) ported into the lifted app.

**Required regression tests (none exist today):**
- Selection harvest from `selected_${len}`.
- "No cuts selected" guard.
- Mid-flight rollback path.
- End-to-end: upload → configure → ai-reccos → process → download.

**Verification:**
- Registry collision guard (`src/apps/_registry.test.ts`) passes.
- Manual: dashboard → Video Cutdown card → end-to-end flow runs on the lifted app, no monolith fallback for `useCaseId === 'video-cutdown'`.
- Flip `VITE_FEATURE_VIDEO_CUTDOWN_LIFT` on as part of this PR's release notes.

**Tracer test (completeness gate):**
1. **Static**: `grep -rn "useCaseId === 'video-cutdown'" src/pages/use-cases/UseCaseWizardPage.tsx` returns ZERO matches. Same for `'video-cutdown'` string literals in that file (allowed only in import/comment lines — manual confirm).
2. **E2E**: With flag on, click Video Cutdown card on dashboard. Upload a fixture video (`tests/fixtures/sample.mp4`), advance through configure step, on ai-reccos step assert Gemini service was called once (mock spy), select 2 cuts, advance to process, assert FFmpeg service was called with the 2 selections, on download step assert a downloadable URL is rendered. Total flow runs end-to-end without touching `UseCaseWizardPage`.
3. **E2E (negative path)**: On ai-reccos step, click Continue with zero cuts selected. Assert: stays on ai-reccos step, error message "Select at least one cut" is surfaced, no Firestore writes occurred (assert via Firestore mock spy).
4. **Integration**: Inspect Firestore writes during the happy path — assert all batch/asset writes target `clients/ralph_lauren/apps/video-cutdown/...`, never top-level paths.
5. **Integration**: Selection harvest — pre-populate `localStorage` with `selected_30=[0,2]`, mount the lifted app, assert step state reflects those selections on mount.

### Step 2.5 — Batches storage path migration

**Files:**
- Modified: `src/services/batches.ts:28` — write to `clients/{slug}/apps/{appId}/batches/{batchId}` instead of top-level `batches`.
- New: `scripts/migrate-batches-to-scoped-paths.ts` — one-shot migration of existing top-level `batches` docs into the scoped tree, idempotent.
- Modified: relevant Firestore security rules.

**Why this exists:** Step 4 reads from the path-scoped tree. The current writer mismatch would leave the dashboard empty for all clients post-migration. Must run before Step 4.

**Dual-write fence:** Step 2.5 PR is the single source of truth — after it merges, NO readers or writers may target top-level `batches`. Confirm before merging by `grep -rn "collection(db, 'batches')" src/` and verifying only the migrated `services/batches.ts` matches. Step 2's video-cutdown lift, if it lands first, must already be writing to the scoped path (Step 2 spec includes this); the migration only handles historical docs.

**Verification:**
- Migration script dry-run reports counts.
- Wet-run on staging copy. Verify both new writes (post-PR) and historical (post-migration) appear under the scoped tree.

**Tracer test (completeness gate):**
1. **Static**: `grep -rn "collection(db, 'batches')" src/` returns exactly ONE match — the migrated writer in `services/batches.ts` (or zero matches if writes use a path-builder helper). Any other match = fail.
2. **Integration (staging copy)**: Snapshot top-level `batches/` doc count before and after migration. After: top-level count = 0, sum of all `clients/{slug}/apps/{appId}/batches/{*}` doc counts equals the pre-migration top-level count.
3. **Integration**: Trigger a new batch via the app (e.g. template-builder render). Assert the resulting doc lands at `clients/ralph_lauren/apps/template-builder/batches/{batchId}`, NOT at top-level.
4. **Integration (idempotence)**: Re-run the migration script. Assert zero new writes (script is a no-op on already-migrated data).
5. **Security rules**: Firestore emulator test — unauthenticated client cannot read `clients/{slug}/apps/{appId}/batches/{*}`; authenticated client with mismatched `slug` in claims cannot read another client's batches.

### Step 3 — Sidebar polish in `AppLayout.tsx`

**Files:** Modified: `src/components/AppLayout.tsx`.

**Concrete diffs against `html_prototypes/dashboard (1).html`** (eng review flagged this step was a no-op as previously written — fill in the actual deltas during PR drafting; if there are none, **drop this step**).

**Tracer test (completeness gate):**
1. **PR-time gate**: PR description includes a bullet list of every concrete CSS/JSX delta against the prototype (e.g. "footer avatar 32px → 36px", "active row uses `bg-blue-50`"). If the list is empty, the step is dropped — do not merge a no-op PR.
2. **Visual**: Side-by-side screenshot in PR description: live `AppLayout` left, `dashboard (1).html` rendered sidebar right. No visible diff.

### Step 4 — Wire Active Batch Jobs to real data

**Files:**
- Modified: `src/pages/DashboardPage.tsx`
- Possibly modified: `src/services/batches.ts` (read helpers).

**Behavior:**
- Read in-flight batches from `clients/{slug}/apps/{appId}/batches` (post-Step-2.5 migration).
- Replace mock `batches[]` with real query.
- Empty state: "No active batches" with CTA to apps grid.
- Loading + error states tested.

**Required Firestore composite index:** `clients/{slug}/apps/{appId}/batches` on `(status ASC, createdAt DESC)` (or whichever ordering the dashboard uses). Add to `firestore.indexes.json` in this PR; deploy index before flipping the read.

**Tracer test (completeness gate):**
1. **E2E**: Pre-seed Firestore (emulator or staging) with 3 batches under `clients/ralph_lauren/apps/template-builder/batches/`: one `running`, one `queued`, one `completed`. Load `/adlabs/ralph_lauren/`. Assert Active Batch Jobs section renders 2 entries (running + queued — completed excluded by query) with the expected status pills and createdAt timestamps in DESC order.
2. **E2E (empty state)**: With zero batches under that path, assert "No active batches" copy + CTA back to apps grid render.
3. **E2E (error state)**: Force the Firestore query to reject. Assert the section shows an error state, not a blank section, and the rest of the dashboard still renders.
4. **Static**: `grep -n "demo data" src/pages/DashboardPage.tsx` returns zero matches (mock indicator was removed).
5. **Deployment**: `firestore.indexes.json` includes the composite index; `firebase deploy --only firestore:indexes` was run before the PR's read-flip merge.

### Step 5 — Date-range pill becomes functional + cleanup

- Wires the date-range pill, filters Active Batch Jobs query.
- Deletes `src/pages/_archive/CreatePage.tsx` (was archived in Step 1).

**Tracer test (completeness gate):**
1. **E2E**: Seed 3 batches with `createdAt` spread across last 30 days (e.g. -1d, -7d, -25d). Load dashboard with default range "Last 7 days" → assert 2 batches visible. Change range to "Last 30 days" → assert all 3 visible. Change to "Last 24 hours" → assert 1 visible.
2. **Static**: `git ls-files | grep -i CreatePage` returns zero matches.
3. **Static**: `grep -rn "from.*CreatePage" src/` returns zero matches (no dangling imports).

## Risks

- **Step 2 lift complexity.** 8 branch points in `UseCaseWizardPage.tsx`, async-next contract gap (resolved by Step 0), no existing regression tests for selection-harvest / rollback / no-cuts-guard. Mitigation: Step 0's contract change + the regression tests called out in Step 2 must land in the same PR as the lift.
- **Cache-warm regression.** If `useClientBootstrap` doesn't fire `getCreativeAssets`, first wizard load gets a cold cache. Test for it explicitly.
- **`clientAssetHouse` path drift.** Reading from path-scoped tree silently fails. Test asserts read happens against legacy top-level path.
- **Flag-gated dead-link.** Video Cutdown card hidden until Step 2 ships. Acceptable internally; flag must default off for client logins.
- **Mock data drift.** Mocked Active Batch Jobs in Step 1 marked with a "demo data" indicator + internal-only render gate. Removed in Step 4.
- **`CreatePage` archive timing.** Deleted only in Step 5 after soak.

## Cutover relationship

This work targets a feature branch off `dev`, independent of the SOC2 rebuild's coordinated cutover. Final merge into `dev` happens after Step 4 verifies in staging; the branch can land before, during, or after the SOC2 cutover — apps registry path and `WizardShell` contract are already on `dev`.

## What this plan does NOT decide

- Whether the chrome rework (Alli platform rail + persistent banner) is one PR or several. Defer.
- BAH v2 scope, schema, migration. Tracked separately when AI re-targeting work begins.
- Whether `WizardShell` needs a sibling `WorkspaceShell` for batch-editor / canvas-editor surfaces. Re-evaluate when those apps get lifted.
