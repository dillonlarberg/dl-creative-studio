# PR 3 — App Registry + WizardShell + edit-image Extraction

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the per-app modular framework that replaces the 4,311-line `UseCaseWizardPage.tsx` monolith. Three pieces ship together: the `_registry` of app manifests with boot-time validation, the generic `WizardShell` implementing the 7-method contract, and the first concrete app — `edit-image` — extracted out of the monolith. After PR 3 lands on `dev`, PRs 4–9 are independent and can run in parallel worktrees because they all follow the same template `edit-image` validates here.

**Architecture:** Each app exports a `manifest.ts` (id, basePath, steps, lifecycle hooks), an `AppRoot.tsx` (mount point), and `steps.ts` (per-step validate/render). `WizardShell.tsx` is the generic runtime — owns navigation, persistence, breadcrumbs, history; calls into the manifest's contract methods. `_registry.ts` lazy-imports manifests and validates `basePath` uniqueness at boot. Routes mount under `/:clientSlug/${manifest.basePath}/*` so the URL is the source of truth for both active client AND active app.

**Tech Stack:** unchanged — React 19 + Vite 7 + React Router 7 + vitest 2.x + @testing-library/react 16. No new dependencies.

**PR scope:** App framework + first app extraction. The legacy `UseCaseWizardPage.tsx` route stays mounted for the other 7 use cases until PRs 4–10 extract them. Both routing systems coexist for the duration of the rebuild — the new `/:clientSlug/edit-image/*` route handles edit-image; `/create/:useCaseId` keeps serving the rest. PR 10 deletes the monolith.

---

## Latent-bug decision: `paths.profile` schema

**Background:** PR 2 left `paths.profile(slug)` returning `clients/{slug}/profile` — a 3-segment path, illegal as a Firestore document reference. The PR 2 import script + tests worked around it by writing to `clients/{slug}/profile/data` (4-segment).

**Decision (locked unless user flips before Task 3 starts):** **Option B** — drop `paths.profile` entirely. Profile fields live on the `clients/{slug}` document itself. `paths.client(slug)` already returns the right doc reference. The Firestore rules already allow `clients/{slug}/{document=**}` so the rules don't change. The import script rewrites to use `paths.client(slug)` and writes the profile fields directly onto that doc.

**Why B over A:**
- One canonical client doc instead of two co-located rows (`clients/{slug}` + `clients/{slug}/profile/data`).
- Future per-client custom-claims migration is one doc to read for membership lookups, not two.
- `assets/{assetId}` and `apps/{appId}/...` are already subcollections of `clients/{slug}`; profile being on the parent doc is the natural shape.
- Cost neutral — same number of reads at runtime.

**If the user prefers A** (rename helper to return 4-segment): Task 3 swaps the helper signature to `paths.profile(slug) => 'clients/{slug}/profile/data'` and the import script + drift test stay as-is. Reversal is ~3 lines.

---

## File structure

**Files created in this PR:**

- `src/apps/_registry.ts` — manifest registry with basePath collision guard.
- `src/apps/_registry.test.ts` — registry validation regression test.
- `src/apps/types.ts` — `AppManifest`, `WizardStep`, `StepData` shared types.
- `src/platform/wizard/WizardShell.tsx` — generic wizard runtime implementing the 7-method contract.
- `src/platform/wizard/WizardShell.test.tsx` — contract test with a fake two-step manifest.
- `src/platform/wizard/usePersistedStepData.ts` — extracted persistence helper (localStorage + Firestore `creatives/{id}` sync).
- `src/apps/edit-image/manifest.ts` — `AppManifest` for edit-image (id `edit-image`, basePath `edit-image`, 5 steps, lifecycle hooks).
- `src/apps/edit-image/AppRoot.tsx` — mounts `<WizardShell manifest={manifest} />` under the per-app route.
- `src/apps/edit-image/steps.ts` — barrel: `selectStep`, `describeStep`, `modelStep`, `reviewStep`, `approveStep`.
- `src/apps/edit-image/steps/SelectStep.tsx` — wraps existing `src/components/edit-image/steps/SelectAnalyzeStep.tsx`. Initial implementation just delegates.
- `src/apps/edit-image/steps/DescribeStep.tsx` — extracted from monolith lines covering the `describe` step for edit-image.
- `src/apps/edit-image/steps/ModelStep.tsx` — extracted from monolith.
- `src/apps/edit-image/steps/ReviewStep.tsx` — extracted from monolith.
- `src/apps/edit-image/steps/ApproveStep.tsx` — extracted from monolith.
- `src/apps/edit-image/manifest.test.ts` — per-step `validate()` fixtures.

**Files modified in this PR:**

- `src/platform/firebase/paths.ts` — drop `paths.profile`. Comment header updated to reflect that profile fields live on the `clients/{slug}` doc.
- `src/platform/firebase/__tests__/paths.test.ts` — remove the `paths.profile` assertion; add an explicit assertion that `paths.client(slug)` is the profile doc.
- `scripts/import-brand-profiles.ts` — write profile fields onto `clients/{slug}` doc via `paths.client(slug)` instead of `clients/{slug}/profile/data`.
- `scripts/__tests__/import-brand-profiles.test.ts` — assertions updated to read from `clients/{slug}` doc.
- `src/App.tsx` — add `<Route path="/:clientSlug/edit-image/*" element={<EditImageAppRoot />} />` (or registry-driven). Keep legacy `/create/:useCaseId` mounted for the other 7 apps.
- `src/pages/CreatePage.tsx` — when the user clicks the `edit-image` tile, navigate to `/${client.slug}/edit-image` instead of `/create/edit-image`. (Other tiles keep navigating to `/create/:useCaseId`.)

**Files NOT touched in this PR:**

- `src/pages/use-cases/UseCaseWizardPage.tsx` — the monolith. The edit-image branches stay there but become unreachable for the new route. Removed in PR 10.
- `src/components/edit-image/**` — utilities (`parseAlliAnalysis`, `buildRecommendations`, `extractBrandColors`) and `SelectAnalyzeStep.tsx` stay where they are; the new `src/apps/edit-image/` imports from them. Moving them is a follow-up cleanup, not in scope.
- `src/constants/useCases.ts` — stays. The `edit-image` entry stays in `USE_CASES` because `CreatePage` still renders all 8 tiles. Removal is in PR 10.

---

## Manifest contract (the 7 methods)

```ts
// src/apps/types.ts (sketch — exact types in Task 3)

export type StepData = Record<string, unknown>;

export interface WizardStep<S extends StepData = StepData> {
  id: string;                                         // stable step id (e.g. 'select')
  name: string;                                       // breadcrumb label
  render: (props: StepRenderProps<S>) => React.ReactNode;
  validate: (data: S) => { ok: true } | { ok: false; reason: string };
  onEnter?: (ctx: StepContext<S>) => void | Promise<void>;
  onLeave?: (ctx: StepContext<S>) => void | Promise<void>;
  next?: (ctx: StepContext<S>) => string | number | undefined;  // override default advance-by-index
}

export interface AppManifest {
  id: AppId;                                          // matches paths.AppId union
  basePath: string;                                   // URL slug, must be unique across all manifests
  title: string;
  steps: WizardStep[];
  onMount?: (ctx: AppContext) => void | Promise<void>;
  initialStepData: () => StepData;                    // factory; called once per new creative
}
```

WizardShell calls these in this order:

1. `manifest.onMount` — once when the AppRoot mounts (`useEffect` with empty deps).
2. `manifest.initialStepData()` — once when starting a new creative.
3. For each navigation:
   - Outgoing step: `step.validate(stepData)` → if `ok:false`, block + show reason.
   - Outgoing step: `step.onLeave(ctx)` — persistence hook fires here.
   - Determine next step id: `step.next(ctx)` if provided, else advance by index.
   - Incoming step: `step.onEnter(ctx)` — fetch data, prefetch, etc.
   - Re-render with new step.

`StepContext` exposes `{ stepData, mergeStepData, navigate, client, creativeId }`. `mergeStepData` follows the immutability rule from `~/.claude/rules/common/coding-style.md` — returns a new step-data object, never mutates.

---

## Routing model

```
/:clientSlug/edit-image                            → AppRoot (step index 0)
/:clientSlug/edit-image/:stepId                    → AppRoot (jump to step)
/:clientSlug/edit-image?creative=:id               → AppRoot (resume existing creative)
/create/:useCaseId  (legacy)                       → UseCaseWizardPage (untouched)
```

`<EditImageAppRoot />` reads `:clientSlug` via `useParams()` and asserts membership through `ClientProvider` (PR 2). The `:stepId` URL segment is read by WizardShell — letting users deep-link or refresh on a specific step. WizardShell writes the step id into the URL on each step change via `navigate(..., { replace: true })`.

For PR 3 we mount the route explicitly. PR 4 generalizes this into `<Routes>{registry.map(m => <Route path={`/:clientSlug/${m.basePath}/*`} element={m.AppRoot} />)}</Routes>` once we have a second app to validate the pattern.

---

## Task 1: Branch off dev

**Files:** none (git operations only)

- [ ] **Step 1.1:** Confirm clean working tree on `dev`. Run `git checkout dev && git pull --ff-only && git status`. Expected: "up to date" + "nothing to commit".
- [ ] **Step 1.2:** Branch: `git checkout -b feat/app-registry`. Do NOT push until first meaningful commit.
- [ ] **Step 1.3:** Commit this plan file as the first commit on the branch:
  ```
  docs: add PR 3 implementation plan (app registry + WizardShell + edit-image)
  ```
  Push with `-u origin feat/app-registry` so subsequent commits stream up.

---

## Task 2: Author shared types

**Files created:**
- `src/apps/types.ts`

**Files modified:** none

- [ ] **Step 2.1: Define `WizardStep`, `AppManifest`, `StepContext`, `StepRenderProps`, `AppContext`.** Use `AppId` from `src/platform/firebase/paths.ts`. `StepData` is `Record<string, unknown>`; per-app step files narrow with generics.
- [ ] **Step 2.2: Export everything from `src/apps/types.ts`.** No barrel `index.ts` needed yet.

**Acceptance:** `tsc --noEmit` is clean. No runtime code yet.

---

## Task 3: Fix `paths.profile` (Option B)

**Files modified:**
- `src/platform/firebase/paths.ts`
- `src/platform/firebase/__tests__/paths.test.ts`
- `scripts/import-brand-profiles.ts`
- `scripts/__tests__/import-brand-profiles.test.ts`

- [ ] **Step 3.1: Update existing `paths.test.ts` first (RED).** Remove the `paths.profile` test case. Add an assertion: `expect(paths.client('acme')).toBe('clients/acme')` and a comment-coupled note that profile fields live on this doc.
- [ ] **Step 3.2: Drop `paths.profile` from `paths.ts`.** Update header comment to remove the `clients/{slug}/profile` line and add: "Profile fields are stored on the `clients/{slug}` document itself."
- [ ] **Step 3.3: Update `import-brand-profiles.ts`.** Replace any reference to `clients/${slug}/profile/data` with `paths.client(slug)`. Use `setDoc(doc(db, paths.client(slug)), profileFields, { merge: true })` so existing fields are preserved on re-runs.
- [ ] **Step 3.4: Update `import-brand-profiles.test.ts`.** Idempotency assertion now reads back from `clients/{slug}` via `paths.client(slug)`.
- [ ] **Step 3.5: Verify drift-test still passes.** `functions/src/_shared/__tests__/allowlist-drift.test.ts` is unaffected (it asserts allowlist sync, not paths).
- [ ] **Step 3.6: Run `npm test` + `npm run test:rules` (emulator).** All green.

**Acceptance:** No code references `clients/{slug}/profile` or `clients/{slug}/profile/data`. `paths.profile` is gone. Import script writes a single `clients/{slug}` doc per allowlisted client.

**Commit:**
```
refactor(paths): fold profile fields onto clients/{slug} doc

Drop paths.profile() — was returning a 3-segment path that's illegal
as a Firestore document reference. Profile fields now live on the
clients/{slug} doc itself, alongside the assets/ and apps/
subcollections. Import script + tests updated.
```

---

## Task 4: Build the registry

**Files created:**
- `src/apps/_registry.ts`
- `src/apps/_registry.test.ts`

- [ ] **Step 4.1: Write `_registry.test.ts` first (RED).** Test cases:
  1. `getRegistry()` returns the list of registered manifests.
  2. Registering two manifests with the same `basePath` throws at boot.
  3. Registering a manifest with `basePath` containing `/` or whitespace throws.
  4. Registering a manifest whose `id` is not in the `AppId` union — TypeScript prevents this; add a `// @ts-expect-error` test asserting the compile error fires.
- [ ] **Step 4.2: Implement `_registry.ts`.** Define a `MANIFESTS: AppManifest[]` constant initialized via lazy imports of each per-app `manifest.ts` (only `edit-image` for now). Run validation on module-load. Export `getRegistry()` returning the frozen list.
- [ ] **Step 4.3: Validation function.** `assertNoBasePathCollisions(manifests)`: builds a `Map<string, string>` of basePath → manifest id; throws on duplicate.
- [ ] **Step 4.4: Run `npm test`.** Green.

**Acceptance:** Adding a malformed manifest fails at boot, not at runtime.

**Commit:**
```
feat(apps): add app registry with basePath collision guard
```

---

## Task 5: Build the WizardShell

**Files created:**
- `src/platform/wizard/WizardShell.tsx`
- `src/platform/wizard/WizardShell.test.tsx`
- `src/platform/wizard/usePersistedStepData.ts`

- [ ] **Step 5.1: Write `WizardShell.test.tsx` first (RED).** Use a fake manifest with two trivial steps `('a', 'b')`. Test:
  1. Initial render shows step `a`.
  2. Clicking "Next" calls `validate(stepData)` on `a`; if `ok:false`, stays on `a` and surfaces the reason.
  3. If `ok:true`, calls `onLeave(a)` then `onEnter(b)` then renders `b`.
  4. `step.next()` returning `'a'` after `b` jumps back to `a` (out-of-order navigation works).
  5. `step.next()` returning an invalid step id logs a console.warn and falls back to advance-by-index.
  6. Persistence: `mergeStepData({foo:1})` followed by remount restores `{foo:1}`.
  7. Resume: rendering with `?creative=abc` in the URL calls `onEnter` of step 0 and reads existing stepData.
  8. URL sync: navigating to step `b` writes `:stepId=b` into the URL via `replace`.
- [ ] **Step 5.2: Implement `WizardShell`.** Owns:
  - `currentStepIndex` state (derived from URL `:stepId`).
  - `stepData` state (delegated to `usePersistedStepData`).
  - `creativeId` (created lazily on first persist via `creativeService.createCreative(client.slug, manifest.id)`).
  - Navigation: `goNext()`, `goBack()`, `goTo(stepId)`.
  - Render shell: breadcrumb, current step body via `step.render({ stepData, mergeStepData, navigate, client, creativeId })`, footer with prev/next.
- [ ] **Step 5.3: Implement `usePersistedStepData`.** Reads/writes `localStorage[creative_${slug}_${manifestId}]` (mirror of monolith's behavior at lines 1111, 1124, 1141, 1161, 1175). On mount, reads the localStorage record id and hydrates from Firestore via `creativeService.getCreative(slug, id)`. On every `mergeStepData`, debounce-persists to Firestore.
- [ ] **Step 5.4: `manifest.onMount`** fires once on AppRoot mount. `manifest.initialStepData()` is called only when no persisted record exists.
- [ ] **Step 5.5: Run all WizardShell tests.** Green.

**Acceptance:** A fake manifest can be driven through forward, back, jump, and resume flows entirely from tests — no edit-image dependencies. This is the contract.

**Commit:**
```
feat(wizard): add WizardShell implementing 7-method manifest contract

Generic wizard runtime — owns navigation, validation, persistence,
breadcrumbs, and URL ↔ step sync. Validated by fake-manifest tests
before any concrete app consumes it.
```

---

## Task 6: Extract the edit-image manifest

**Files created:**
- `src/apps/edit-image/manifest.ts`
- `src/apps/edit-image/AppRoot.tsx`
- `src/apps/edit-image/steps.ts`
- `src/apps/edit-image/steps/SelectStep.tsx`
- `src/apps/edit-image/steps/DescribeStep.tsx`
- `src/apps/edit-image/steps/ModelStep.tsx`
- `src/apps/edit-image/steps/ReviewStep.tsx`
- `src/apps/edit-image/steps/ApproveStep.tsx`
- `src/apps/edit-image/manifest.test.ts`

- [ ] **Step 6.1: Write `manifest.test.ts` first (RED).** Per-step `validate(stepData)` fixtures:
  - `select.validate({})` → `{ok:false, reason:'image required'}`.
  - `select.validate({imageUrl:'...', alliAnalysis:{...}})` → `{ok:true}`.
  - `describe.validate({editPrompt:''})` → `{ok:false}`.
  - `describe.validate({editPrompt:'change background'})` → `{ok:true}`.
  - `model.validate({})` → `{ok:false}`. `model.validate({model:'gemini-2.5-flash-image'})` → `{ok:true}`.
  - `review.validate({})` → `{ok:false}`. `review.validate({selectedVariation:'...'})` → `{ok:true}`.
  - `approve.validate({approved:true})` → `{ok:true}`.
- [ ] **Step 6.2: Author `manifest.ts`** with the 5 steps from `WIZARD_STEPS['edit-image']` (lines 345–351 of the monolith). `id: 'edit-image'`, `basePath: 'edit-image'`, `title: 'Edit Existing Image'`. `onMount`: noop initially. `initialStepData()`: returns `{}`.
- [ ] **Step 6.3: Author `SelectStep.tsx`** as a thin wrapper around the existing `src/components/edit-image/steps/SelectAnalyzeStep.tsx`. Adapter shape: takes `StepRenderProps`, passes through `stepData.imageUrl`, `mergeStepData` for upload events. The existing component already does the right thing — this is mostly a prop adapter.
- [ ] **Step 6.4: Author `DescribeStep.tsx`, `ModelStep.tsx`, `ReviewStep.tsx`, `ApproveStep.tsx`.** Lift the JSX from the corresponding edit-image branches in `UseCaseWizardPage.tsx`. **The existing monolith JSX is the source of truth — do not redesign.** Identify the JSX by searching for `useCaseId === 'edit-image'` blocks within each step's switch and lift verbatim, then rewire props to `StepRenderProps`.

  Concretely, search the monolith for these landmarks and hoist their JSX:
  - `describe` step: the `<textarea>` for `editPrompt`.
  - `model` step: the model picker UI (gemini-2.5-flash-image, ideogram, etc.).
  - `review` step: the variation grid.
  - `approve` step: the download/save UI.

  Backend calls (the actual generation Cloud Functions) stay imported from existing services — do not move them. Step components become thin: render UI + call existing service + `mergeStepData(result)`.
- [ ] **Step 6.5: Author `steps.ts` barrel.** Re-exports the 5 step objects (`{ id, name, render, validate }` shapes) for the manifest.
- [ ] **Step 6.6: Author `AppRoot.tsx`.** Body: `return <WizardShell manifest={manifest} />`. Wrap in any error boundary the platform already provides; no new ones.
- [ ] **Step 6.7: Register the manifest** in `src/apps/_registry.ts` — one line: `import editImageManifest from './edit-image/manifest';` plus an entry in `MANIFESTS`.
- [ ] **Step 6.8: Run `npm test`.** All edit-image manifest validate-tests green. Existing `parseAlliAnalysis.test.ts`, `buildRecommendations.test.ts`, `extractBrandColors.test.ts` unchanged and still green (regression).

**Acceptance:** `src/apps/edit-image/` is a self-contained app module. The 5 steps validate independently. The existing utility tests still pass.

**Commit:**
```
feat(apps): extract edit-image into src/apps/edit-image/

First app module under the WizardShell contract. Manifest + 5 steps
lifted out of UseCaseWizardPage's edit-image branches. Existing
edit-image utilities (parseAlliAnalysis, buildRecommendations,
extractBrandColors) unchanged — imported from
src/components/edit-image/utils/.
```

---

## Task 7: Mount the route

**Files modified:**
- `src/App.tsx`
- `src/pages/CreatePage.tsx`

- [ ] **Step 7.1: In `App.tsx`,** add `<Route path="/:clientSlug/edit-image/*" element={<EditImageAppRoot />} />` inside the authed `<AppLayout />` block, **before** the existing `/create/:useCaseId` legacy route. Import `EditImageAppRoot` from `./apps/edit-image/AppRoot`.
- [ ] **Step 7.2: In `CreatePage.tsx`,** when the user clicks the `edit-image` tile, navigate to `/${client.slug}/edit-image` instead of `/create/edit-image`. Other 7 tiles unchanged. Use the registry to pick the right path: `const manifest = getRegistry().find(m => m.id === useCaseId); navigate(manifest ? \`/\${client.slug}/\${manifest.basePath}\` : \`/create/\${useCaseId}\`)`. This way as PRs 4–9 land, each tile auto-routes to the new path on the next deploy without further edits.
- [ ] **Step 7.3: Smoke test in browser.** `npm run dev`. Sign in. Pick a client. Click Edit Existing Image tile → URL becomes `/<client>/edit-image`. Click each step's primary action → URL updates with `:stepId`. Refresh on `/<client>/edit-image/describe` → re-renders on the describe step. Click an unrelated tile (e.g. Resize Image) → URL becomes `/create/image-resize` (legacy route still works).

**Acceptance:** edit-image is fully reachable via the new URL pattern; no other use case is affected.

**Commit:**
```
feat(app): route edit-image via per-app /<:clientSlug>/edit-image/*

Legacy /create/:useCaseId route stays mounted for the other 7 use
cases until PRs 4-10 extract them. CreatePage navigates via the
registry — as more apps register, more tiles auto-route to their
new module without further changes.
```

---

## Task 8: Regression sweep

**Files modified:** none (verification only)

- [ ] **Step 8.1: Run full test suite.** `npm run test:run && npm run test:rules`. All 66 prior tests + new tests green.
- [ ] **Step 8.2: TypeScript clean.** `npm run typecheck` (or `tsc --noEmit`). Zero errors.
- [ ] **Step 8.3: Lint clean.** `npm run lint` (if present in package.json).
- [ ] **Step 8.4: Build clean.** `npm run build`. Vite emits no errors and no new warnings beyond what `dev` already had.
- [ ] **Step 8.5: Smoke test legacy use cases.** In the running dev server, exercise at least one of the *other* 7 use cases (e.g. resize-image) — confirm it still loads via `/create/:useCaseId`. The monolith branches for those are untouched and must keep working.
- [ ] **Step 8.6: Manual edit-image walkthrough.** Upload an image → describe an edit → pick a model → review variations → approve. End-to-end happy path works.

**Acceptance:** PR is greenlight to push for review.

---

## Task 9: PR checklist

- [ ] **Step 9.1: Branch is rebased on latest `dev`.** `git fetch origin && git rebase origin/dev`.
- [ ] **Step 9.2: Squash review** — confirm commit history is the 5 commits from Tasks 1–7 (plan, paths fix, registry, WizardShell, edit-image, route). Don't squash; keep them granular for the diff reviewer.
- [ ] **Step 9.3: Push and open PR** against `dev`:
  ```
  gh pr create --base dev --title "feat: app registry + WizardShell + edit-image extraction (rebuild Step 3)" \
    --body-file docs/superpowers/plans/2026-05-04-pr3-app-registry.md
  ```
- [ ] **Step 9.4: PR body** includes:
  - Link to Issue #1.
  - Summary of the 7-method WizardShell contract.
  - The `paths.profile` Option B decision.
  - Test plan: `npm test`, `npm run test:rules`, manual edit-image walkthrough, legacy-use-case smoke.
  - Reviewer note: PRs 4–9 will follow the same pattern; after this lands they unblock and can run in parallel.
- [ ] **Step 9.5: Update INDEX.** Edit `docs/superpowers/plans/2026-04-30-INDEX-modular-soc2-rebuild.md` — mark PR 3 row "In review", record commit hashes once merged. (Can be a follow-up commit on `dev` after merge if more convenient.)

---

## Don'ts (carry-overs from PRs 1–2 and from this PR's design)

- Do NOT delete `UseCaseWizardPage.tsx`. PR 10 owns that.
- Do NOT delete `src/constants/useCases.ts` — `CreatePage` still iterates it.
- Do NOT move utilities out of `src/components/edit-image/utils/`. They stay where they are; the new `src/apps/edit-image/` imports them. Moving them is post-rebuild cleanup.
- Do NOT redesign edit-image UI. JSX is lifted verbatim from the monolith.
- Do NOT change Cloud Function signatures. PR 8 (video-cutdown) is the only PR allowed to touch backend functions.
- Do NOT `firebase deploy`. New rules + the new route only run locally / on `dev` until the May 15 cutover.
- Do NOT inline localStorage logic into step components. All persistence flows through `usePersistedStepData` so PR 4–9 inherit the same behavior for free.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Lifting JSX from the monolith misses a piece of state coupled across the old `useCaseId === 'edit-image'` switches. | Smoke walkthrough in Task 8.6. The existing edit-image flow is the bar — if it regresses, find the missed coupling and fix before pushing. |
| `WizardShell` contract has a subtle bug only one app would surface. | Fake-manifest tests in 5.1 cover the 7-method ordering plus persistence + URL sync. If a real app surfaces an edge case in PRs 4–9, the WizardShell can be patched in that PR with the regression test added back here. The contract is owned by this PR but not frozen forever. |
| `_registry.ts` collision check fires at module load — hard to debug if it throws during Vite boot. | Throw a clearly-formatted error: `App registry collision: manifests "edit-image" and "X" both declare basePath "edit-image"`. Test in Step 4.1.3. |
| `CreatePage` registry lookup mis-routes a tile during the transition window (PR 3 → PR 9). | Fallback path is the legacy `/create/:useCaseId` route — only edit-image is in the registry until PRs 4–9 add the rest. Verified in Step 7.3. |

---

## After this PR lands

1. Update INDEX (Step 9.5).
2. Update `~/.gstack/projects/pmg-creative-studio/checkpoints/` with a new checkpoint marking PR 3 merged.
3. Open six worktrees (or six branches) for PRs 4–9. Per-PR plans for those follow the same shape: copy `2026-05-04-pr3-app-registry.md`, swap edit-image for the target app, list the monolith branches to lift. Each is ~150 LOC of plan, much smaller than this one.
4. Coordinate with Dillon to claim a couple of the easy ones (resize-image, new-image) so the rebuild parallelizes per the original PRD.
