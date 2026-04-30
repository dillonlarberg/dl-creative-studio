# Modular Apps + SOC2 Rebuild — Execution Plan INDEX

> **For agentic workers:** This is the master index. Each PR has its own plan file in this directory. Plans 2-9 are written progressively after their predecessor lands, because PR 3 validates the WizardShell contract that PRs 4-9 implement against.

**Goal:** Rebuild Alli Studio with (1) database-enforced multi-client tenant isolation closing the SOC2 hole, and (2) a per-app modular architecture replacing the 4,311-line `UseCaseWizardPage.tsx` monolith. Source PRD: [Issue #1](https://github.com/dillonlarberg/dl-creative-studio/issues/1).

**Architecture:** Custom Firebase claims (`token.clients: string[]`) carry per-user client membership; Firestore/Storage rules enforce `slug in token.clients` at the database boundary. Every app lives in `src/apps/<id>/` and implements a 7-method `WizardShell` contract. Selected client is URL-encoded (`/:clientSlug/...`) so tabs cannot disagree.

**Tech Stack:** React 19 + Vite 7 + TypeScript 5.9 + Firebase 12 (Firestore, Storage, Cloud Functions, Auth) + React Router 7. Testing: vitest + @testing-library/react + @firebase/rules-unit-testing + jsdom.

---

## PR sequence

| # | Branch | Plan file | Depends on | Status |
|---|--------|-----------|------------|--------|
| 1 | `feat/test-runner` | `2026-04-30-pr1-test-runner-setup.md` | — | Plan written |
| 2 | `feat/scoped-schema` | (written after PR 1 lands) | 1 | Pending |
| 3 | `feat/app-registry` | (written after PR 2 lands) | 2 | Pending |
| 4 | `feat/extract-resize-image` | (written after PR 3 lands) | 3 | Pending |
| 5 | `feat/extract-new-image` | (written after PR 3 lands) | 3 | Pending |
| 6 | `feat/extract-edit-video` | (written after PR 3 lands) | 3 | Pending |
| 7 | `feat/extract-new-video` | (written after PR 3 lands) | 3 | Pending |
| 8 | `feat/extract-video-cutdown` | (written after PR 3 lands) | 3 | Pending |
| 9 | `feat/extract-template-builder` | (written after PR 3 lands) | 3 | Pending |
| 10 | `feat/extract-feed-and-cleanup` | (written after PRs 4-9 land) | 4-9 | Pending |
| 11 | `dev` → `main` promotion | (cutover runbook) | 10 | Pending |

PRs 4-9 are independent and can run in parallel worktrees once PR 3 lands. Only `src/apps/_registry.ts` is shared (one append-only line per app) and conflicts auto-resolve.

## Branching model

```
main ──────────────────────────────────────────────►
   │
   └─► dev ──┬──► feat/test-runner          (PR 1) ──┐
             │                                       │
             ├──► feat/scoped-schema         (PR 2) ──┤
             │                                       │
             ├──► feat/app-registry          (PR 3) ──┤
             │                                       │
             ├──► feat/extract-resize-image  (PR 4) ──┤
             ├──► feat/extract-new-image     (PR 5) ──┤  parallel
             ├──► feat/extract-edit-video    (PR 6) ──┤  worktrees
             ├──► feat/extract-new-video     (PR 7) ──┤  after PR 3
             ├──► feat/extract-video-cutdown (PR 8) ──┤
             ├──► feat/extract-template-bldr (PR 9) ──┤
             │                                       │
             ├──► feat/extract-feed-cleanup  (PR 10)──┤
             │                                       │
             └──◄ dev ────────────────────────► main  (PR 11 promotion)
```

## PR 1 summary — Test runner setup

Install vitest + testing-library + Firebase rules unit testing, configure for React component tests, verify the orphan tests at `src/components/edit-image/utils/__tests__/*.test.ts` execute green. This is a prerequisite gate — no other PR may merge into `dev` until `npm test` works.

**Why first:** the PRD's testing claims are non-functional today. `package.json` has no test runner, but vitest-flavored tests already exist on disk. Until those pass green, every later PR's "tests" section is a fiction.

See: `2026-04-30-pr1-test-runner-setup.md`

## PR 2 preview — Schema + rules + claims

Build (in this order):
1. New Firebase project (`automated-creative-dev`).
2. `src/platform/firebase/paths.ts` — typed path helpers, no string templates outside this file.
3. `functions/src/_shared/assertClient.ts` — caller membership guard.
4. `functions/src/_shared/assertResourceClient.ts` — resource ownership guard for URL/path inputs.
5. `functions/src/syncClientClaims.ts` — Alli `/clients` → Firebase custom claims, with retry + empty-list + oversize handling.
6. `firestore.rules` + `storage.rules` — `isMember(slug)` predicate, locked-down everywhere else.
7. `src/platform/client/ClientProvider.tsx` — reads claims, exposes `currentClient`/`allowedClients`/`setCurrentClient`. URL-driven (`useParams().clientSlug`).
8. Bootstrap state machine — six pages: anonymous, claims pending, sync failed, no access, one-client auto-select, multi-client picker.
9. `scripts/import-brand-profiles.ts` — idempotent + `--dry-run`.

Tests (all written first, RED → GREEN):
- `paths.ts` unit tests (compile-time slug+appId requirement, runtime path strings).
- `assertClient` unit tests (member, non-member, missing claim).
- `assertResourceClient` unit tests (matching client path, mismatched client path, malformed input).
- `syncClientClaims` integration tests against mocked Alli (success, transient error, empty list, oversize).
- `firestore.rules` emulator tests (member can read/write own client subtree, non-member denied, unauthenticated denied, default-deny holds).
- `storage.rules` emulator tests (same shape; `/uploads/{slug}/**` denied for all).
- `ClientProvider` smoke test (unallowed `setCurrentClient` is a no-op).
- Bootstrap state machine component tests (each of 6 states renders correctly + transitions).
- Brand-profile import idempotency test (running twice = same end state).

PR 2 is the largest of the rebuild. Plan written after PR 1 lands.

## PR 3 preview — App registry + WizardShell + edit-image

Build:
1. `src/apps/_registry.ts` — lazy imports + basePath collision validation at boot.
2. `src/platform/wizard/WizardShell.tsx` — implements the 7-method contract, owns navigation/persistence/breadcrumbs/history.
3. `src/apps/edit-image/manifest.ts`, `AppRoot.tsx`, `steps.ts` — first app extracted. Reuses the existing `src/components/edit-image/` utilities (parseAlliAnalysis, buildRecommendations, extractBrandColors).
4. `App.tsx` — replaces the `/create/:useCaseId` route with `<Routes>` mounting per-app routes under `/:clientSlug/${manifest.basePath}/*`.

Tests:
- Registry validation: two manifests with overlapping basePath throw at boot (regression test).
- WizardShell contract test: fake manifest with two trivial steps; verify forward/back nav, validate gating, next() jumping, onEnter/onLeave ordering, persistence, resume.
- WizardShell receives invalid step id from `next()`: logs warning, falls back to advance-by-index.
- edit-image manifest tests: each step's `validate(stepData)` with fixtures.
- Existing `parseAlliAnalysis.test.ts` and `buildRecommendations.test.ts` still pass after the move (regression).

PR 3 is the contract-validation step. After it lands, PRs 4-9 follow the same pattern.

## PRs 4-9 — App extractions (parallel)

Each follows the same shape:
1. Create `src/apps/<id>/manifest.ts` + `AppRoot.tsx` + `steps.ts`.
2. Move app-specific state out of `UseCaseWizardPage.tsx` into the app's manifest contract methods.
3. Map each `useCaseId === '<this-app>'` branch in the monolith to the corresponding contract method (the 17-branch inventory in `docs/ARCHITECTURE_FINDINGS_AND_PROPOSAL.md` shows which method each branch becomes).
4. Add one line to `src/apps/_registry.ts`.
5. Write per-step `validate`/`next`/`onLeave` unit tests with stepData fixtures.
6. Smoke-test the extracted app end-to-end against the dev Firebase project.

Special considerations:
- **PR 8 (video-cutdown):** also rewrites `analyzeVideoForCutdowns` and `processVideoCutdowns` Cloud Functions to take `videoStoragePath` instead of `videoUrl`, and adds `assertResourceClient` calls. Closes the IDOR called out in the eng review.
- **PR 9 (template-builder):** the most tangled extraction. Has 7 steps and the conditional skip-ahead logic (lines 1219, 1245, 1248 of the current monolith). The `next()` contract method earns its keep here.

## PR 10 — Feed processing + monolith deletion

1. Extract `feed-processing` (last app).
2. Delete `src/pages/use-cases/UseCaseWizardPage.tsx`.
3. Delete `src/constants/useCases.ts` (folded into per-app manifests).
4. `src/pages/use-cases/` becomes a thin manifest resolver, or the directory is removed entirely if no longer needed.

After PR 10, the monolith is gone. `dev` is feature-complete.

## PR 11 — Promote dev → main

This is a cutover runbook, not a code PR:
1. Verify all 10 prior PRs deployed cleanly to the `automated-creative-dev` Firebase project.
2. Run smoke tests against dev project for each of the 8 apps + login + client switching.
3. Verify rules tests pass against dev project's rules.
4. Decide promotion strategy:
   - **Option A:** swap Firebase Hosting site — point the existing `automated-creative-e10d7` hosting site at the dev project's build artifacts.
   - **Option B:** rename — make `automated-creative-dev` the new prod project, update `.firebaserc`, archive the old project.
5. Merge `dev` → `main` in git.
6. Deploy main to production hosting.
7. Cutover runbook completes when production traffic is on the new schema with no rule denials in Cloud Logging.

## Out-of-scope reminders (from PRD)

- No new apps. Eight existing apps extracted as-is.
- No UI redesign. Visual + copy preserved.
- No audit logging implementation. Cloud Audit Logs available as a checkbox if needed.
- No org layer. PMG is the agency, excluded from clients.
- No mobile, no SSR, no rate limiting, no anomaly detection.
- No migration of existing creatives. All dropped.
- Brand profiles re-imported only.

## Status tracking

After each PR lands on `dev`:
- [ ] Update this INDEX with the PR's actual merged commit hash.
- [ ] Write the next PR's plan file.
- [ ] Update the PR's row in the table above to "Done".

## How to execute

Each per-PR plan uses bite-sized TDD steps with checkbox tracking. Two execution modes:
- **Subagent-driven** (recommended): one fresh subagent per task, two-stage review between tasks.
- **Inline**: execute tasks in the current session with checkpoint pauses.

Choose the mode when starting each PR.
