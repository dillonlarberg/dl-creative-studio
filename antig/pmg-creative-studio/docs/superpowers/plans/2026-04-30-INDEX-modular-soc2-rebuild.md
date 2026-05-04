# Modular Apps + SOC2 Rebuild — Execution Plan INDEX

> **For agentic workers:** This is the master index. Each PR has its own plan file in this directory. Plans 2-9 are written progressively after their predecessor lands, because PR 3 validates the WizardShell contract that PRs 4-9 implement against.

**Goal:** Rebuild Alli Studio with (1) database-enforced multi-client tenant isolation closing the SOC2 hole, and (2) a per-app modular architecture replacing the 4,311-line `UseCaseWizardPage.tsx` monolith. Source PRD: [Issue #1](https://github.com/dillonlarberg/dl-creative-studio/issues/1).

**Architecture:** Custom Firebase claims (`token.clients: string[]`) carry per-user client membership; Firestore/Storage rules enforce `slug in token.clients` at the database boundary. Every app lives in `src/apps/<id>/` and implements a 7-method `WizardShell` contract. Selected client is URL-encoded (`/:clientSlug/...`) so tabs cannot disagree.

**Tech Stack:** React 19 + Vite 7 + TypeScript 5.9 + Firebase 12 (Firestore, Storage, Cloud Functions, Auth) + React Router 7. Testing: vitest + @testing-library/react + @firebase/rules-unit-testing + jsdom.

---

## PR sequence

| # | Branch | Plan file | Depends on | Status |
|---|--------|-----------|------------|--------|
| 1 | `feat/test-runner` | `2026-04-30-pr1-test-runner-setup.md` | — | Merged |
| 2 | `feat/scoped-schema` | `2026-05-01-pr2-scoped-schema.md` | 1 | Merged |
| 3 | `feat/app-registry` | `2026-05-04-pr3-app-registry.md` | 2 | In review |
| 4 | `feat/extract-resize-image` | (written after PR 3 lands) | 3 | Pending |
| 5 | `feat/extract-new-image` | (written after PR 3 lands) | 3 | Pending |
| 6 | `feat/extract-edit-video` | (written after PR 3 lands) | 3 | Pending |
| 7 | `feat/extract-new-video` | (written after PR 3 lands) | 3 | Pending |
| 8 | `feat/extract-video-cutdown` | (written after PR 3 lands) | 3 | Pending |
| 9 | `feat/extract-edit-image` (was template-builder; swapped — see PR 3 redirect note) | (written after PR 3 lands) | 3 | Pending |
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

## PR 2 preview — Schema + rules + email allowlist

**Environment:** rebuild stays in `automated-creative-e10d7`. Creative Intelligence runs in the same project on `sbd-creative-intelligence` (named DB). Firestore rules are scoped per database, so deploying new rules to `(default)` cannot affect Creative Intelligence. No new Firebase project. Local iteration via Firebase emulators (`firebase emulators:start`).

**Auth model (revised after the prototype/scale conversation):** instead of custom claims with per-client membership, use a **hardcoded email allowlist** in the rules files. ≤10 PMG users; any allowlisted user can access any client. Path scoping (`clients/{slug}/apps/{appId}/...`) still gives data physical separation; the access-control layer is just simpler. No `syncClientClaims` Cloud Function, no token refresh ceremony, no claims-pending bootstrap state machine. Migration to per-client claims is a future option if SOC2 audit pressure requires it.

Build (in this order):
1. `src/platform/firebase/paths.ts` — typed path helpers, no string templates outside this file.
2. `functions/src/_shared/assertAlliStudioUser.ts` — caller email allowlist guard (`request.auth.token.email_verified == true && email in ALLOWLIST`).
3. `functions/src/_shared/assertResourceClient.ts` — resource path is under the asserted client's prefix. Independent of the user identity check; closes the IDOR called out in the eng review for `analyzeVideoForCutdowns` / `processVideoCutdowns`.
4. `firestore.rules` + `storage.rules` — `isAlliStudioUser()` predicate (verified email + allowlist), default-deny everywhere else. Allowlist defined as a function literal at the top of the rules file so a new hire is one line.
5. `src/platform/client/ClientProvider.tsx` — reads selected client from `useParams().clientSlug`, validates against the user's Alli `/clients` proxy response (used by the picker UI). URL is the source of truth for active client; tabs cannot disagree.
6. `scripts/import-brand-profiles.ts` — idempotent + `--dry-run`. Reads existing `(default).clientAssetHouse/*` (excluding `pmg`), writes to `(default).clients/{slug}/profile`.

Tests (all written first, RED → GREEN):
- `paths.ts` unit tests (compile-time slug+appId requirement, runtime path strings).
- `assertAlliStudioUser` unit tests (allowlisted + verified email, allowlisted + unverified email, non-allowlisted, missing token).
- `assertResourceClient` unit tests (matching client path, mismatched client path, malformed input).
- `firestore.rules` emulator tests (allowlisted user can read/write any `clients/{slug}/**`, non-allowlisted denied, unverified-email denied, unauthenticated denied, default-deny holds outside `clients/`).
- `storage.rules` emulator tests (same shape; previously-permissive `/uploads/{slug}/**` is denied for all).
- `ClientProvider` smoke test (renders when URL `clientSlug` is in the user's Alli client list, redirects when not).
- Brand-profile import idempotency test (running twice = same end state, `--dry-run` writes nothing).

PR 2 is one focused PR — much smaller than originally scoped. Plan written after PR 1 lands.

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
1. Verify the `dev` branch passes all tests (`npm run test:run` + Firestore rules emulator suite + Cloud Functions tests).
2. Smoke-test `dev` locally against Firebase emulators for each of the 8 apps + login + client switching.
3. Optionally smoke-test `dev` against `automated-creative-e10d7` by deploying to a separate Hosting target (multi-site Hosting, e.g. a `dev` site alongside the existing default site) without touching the production rules. Skip if local emulator coverage is sufficient.
4. Coordinated production cutover (single deploy):
   a. Run the brand-profile import script once against `(default)` Firestore — copies existing `clientAssetHouse/{slug}` docs to `clients/{slug}/profile` (excluding `pmg`). Idempotent; safe to re-run.
   b. Deploy new Cloud Functions (`syncClientClaims`, updated `analyzeVideoForCutdowns`, `processVideoCutdowns`).
   c. Deploy new frontend bundle (reads from `clients/{slug}/...` paths).
   d. Deploy new `firestore.rules` + `storage.rules` (locks down `(default)` to `isMember(slug)`).
   Steps b/c/d should be one `firebase deploy` invocation so there is no window where rules + code are out of sync.
5. After cutover, drop the obsolete `creatives/*` and `clientAssetHouse/*` collections from `(default)` (one-time cleanup script).
6. Merge `dev` → `main` in git.
7. Cutover runbook completes when production traffic is on the new schema with no `permission-denied` rule denials in Cloud Logging and Creative Intelligence (on `sbd-creative-intelligence`) is unaffected.

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
