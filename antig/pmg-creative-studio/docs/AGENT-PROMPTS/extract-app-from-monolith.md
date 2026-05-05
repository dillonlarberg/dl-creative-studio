# Agent Prompt — Extract an app from the monolith

Use this prompt to dispatch a coding agent (Claude Code, Cursor, Copilot, etc.) to extract one of the remaining 7 apps out of `UseCaseWizardPage.tsx` into the new modular framework.

**Status of the queue:**

| App | Branch | Status |
|---|---|---|
| `template-builder` | `feat/app-registry` | ✅ Done (the reference pattern) |
| `resize-image` | `feat/extract-resize-image` | 🔲 Open |
| `new-image` | `feat/extract-new-image` | 🔲 Open |
| `edit-image` | `feat/extract-edit-image` | 🔲 Open (needs design review first — monolith never fully implemented its steps) |
| `edit-video` | `feat/extract-edit-video` | 🔲 Open |
| `new-video` | `feat/extract-new-video` | 🔲 Open |
| `video-cutdown` | `feat/extract-video-cutdown` | 🔲 Open (also rewires Cloud Functions to take `videoStoragePath` — see PR 8 notes in INDEX) |
| `feed-processing` | `feat/extract-feed-and-cleanup` | 🔲 Open (PR 10 — also deletes the monolith) |

Claim an app in `#studio-eng` before starting so two people don't pick the same one.

---

## How to use this prompt

1. `git checkout dev && git pull --ff-only`
2. `git checkout -b feat/extract-<app-name>`
3. Open your agent (Claude Code / Cursor / Copilot Chat).
4. Paste the prompt below, replacing every `<app-name>` with the kebab-case app id (e.g. `resize-image`, `new-image`, `edit-video`).

---

## The prompt

> I'm extracting the **`<app-name>`** workflow out of the monolith `src/pages/use-cases/UseCaseWizardPage.tsx` and into a new module at `src/apps/<app-name>/`, following the pattern established at `src/apps/template-builder/`. Working dir: the `pmg-creative-studio` package.
>
> **Read these first, in order:**
>
> 1. `docs/superpowers/plans/2026-05-04-pr3-app-registry.md` — the framework plan, the 7-method WizardShell contract, and the routing model.
> 2. `src/apps/types.ts` — the `AppManifest`, `WizardStep`, `StepContext`, `StepRenderProps` types. Do NOT modify these.
> 3. `src/apps/template-builder/manifest.ts` + `AppRoot.tsx` + `steps.ts` + `types.ts` + a couple of files in `steps/` (e.g. `ContextStep.tsx`, `IntentStep.tsx`, `ExportStep.tsx`) — the working reference. **Mirror this shape exactly.**
> 4. `src/platform/wizard/WizardShell.tsx` — the runtime that drives manifests. Don't modify it; just understand the props each `step.render` receives: `{ stepData, mergeStepData, navigate, client: { slug }, creativeId }`.
> 5. `src/platform/wizard/usePersistedStepData.ts` — the persistence hook. Read enough to know `mergeStepData` is debounced + immutable.
> 6. `src/apps/_registry.ts` — where you'll register the manifest at the end.
> 7. **The monolith.** Run `grep -n "useCaseId === '<app-name>'\|useCaseId === \"<app-name>\"" src/pages/use-cases/UseCaseWizardPage.tsx` to find every branch. Read each with surrounding context. Also look at `WIZARD_STEPS['<app-name>']` (around line 340-405 of the monolith) for the step ID list.
>
> **Deliver one commit with all of these:**
>
> - `src/apps/<app-name>/manifest.ts` — default-exports an `AppManifest` with id, basePath, title, steps, optional `onMount`, and `initialStepData()`.
> - `src/apps/<app-name>/AppRoot.tsx` — `return <WizardShell manifest={manifest} />`.
> - `src/apps/<app-name>/steps.ts` — barrel re-exporting the step objects.
> - `src/apps/<app-name>/types.ts` — `<AppName>StepData` interface (what each step reads/writes via `mergeStepData`).
> - `src/apps/<app-name>/steps/<StepName>Step.tsx` — one file per step. Each exports a `WizardStep<<AppName>StepData>` object with `id`, `name`, `render`, `validate`, optional `onEnter`, `onLeave`, `next`.
> - `src/apps/<app-name>/manifest.test.ts` — unit tests for each step's `validate()` (positive + negative cases). If your app has conditional `next()` overrides, add tests covering both branches.
> - **Modify** `src/apps/_registry.ts` to import + register the new manifest (one line in the import section, one entry in the `MANIFESTS` array).
> - **Modify** `src/App.tsx` to add `<Route path="/:clientSlug/<base-path>/*" element={<<AppName>AppRoot />} />` inside the authed `<AppLayout />` block, wrapped in `<ClientProvider>`. Mount it BEFORE the legacy `/create/:useCaseId` route.
>
> **Critical constraints:**
>
> - **Lift JSX verbatim from the monolith.** Same Tailwind classes, same Heroicons, same `cn()` calls. Do NOT redesign.
> - Replace monolith state setters with `mergeStepData({...})`. Persistent state flows through `mergeStepData`; transient UI state (e.g. `isSubmitting`) can use local `useState`.
> - **DO NOT modify** `src/pages/use-cases/UseCaseWizardPage.tsx` — it stays running for the un-extracted apps.
> - **DO NOT modify** Cloud Functions (`functions/src/**`), services (`src/services/**`), Firestore rules, or Storage rules.
> - **DO NOT modify** `src/apps/types.ts` or `src/platform/wizard/*` — those are the framework, owned by other PRs.
> - Conditional flow logic (e.g. monolith blocks like `if (useCaseId === '<app>' && stepData.X)` inside `handleNext`) belongs in that step's `next(ctx)` override returning a step `id`. Mirror what the monolith does behaviorally.
> - Mount-effect data fetches in the monolith line 476 area belong in `manifest.onMount` if they're app-wide, or in a step's `onEnter` if they're step-specific.
> - No `console.log` in production code. Immutable updates only.
>
> **Before you commit:**
>
> - `npx tsc --noEmit` must be clean.
> - `npm run test:run` must be clean — your new manifest tests should pass and no prior test should regress.
> - `npm run build` must complete without new errors.
> - Confirm `CreatePage.tsx` is unchanged — its registry-driven nav already routes new tiles automatically.
>
> **Commit message:**
>
> ```
> feat(apps): extract <app-name> into src/apps/<app-name>/
>
> Lifted from UseCaseWizardPage's <app-name> branches. Manifest
> implements the 7-method WizardShell contract; <N> step components
> render the same UI as the legacy /create/<app-name> route. Existing
> services and Cloud Functions unchanged.
> ```
>
> **Final report (under 400 words):**
>
> 1. Files created + line counts.
> 2. Test count delta (was 95; now ?).
> 3. Commit hash.
> 4. Any conditional `next()` overrides you implemented (and which monolith line each came from).
> 5. Any monolith state you couldn't cleanly map to `<AppName>StepData` — what you did.
> 6. Any service-layer touches (ideally: zero).
> 7. Anything you spotted that looks like a latent bug in the monolith — flag, don't fix.

---

## After the agent finishes

1. Smoke-test locally: `npm run dev`, sign in, click your app's tile from `/`, walk through every step.
2. Push: `git push -u origin feat/extract-<app-name>`.
3. Open a PR against `dev` titled `feat: extract <app-name> (rebuild Step <N>)`.
4. PR body should include:
   - Link to Issue #1.
   - List of steps extracted + which monolith line each came from.
   - Test plan: tile routes correctly, each step's `validate()` gating works, persistence survives refresh, smoke walkthrough completed.
   - Any deviation from the agent prompt above (e.g. service touches that turned out to be unavoidable).
5. Tag a reviewer.

## Hard "do not"s

- Don't deploy. Cutover happens when Diego declares it.
- Don't merge to `main`. Everything lands on `dev`.
- Don't extend the framework (`WizardShell`, `_registry`, `types.ts`) inside an extraction PR. If the contract is missing something for your app, surface it in `#studio-eng` and we'll patch the framework in a separate PR.
- Don't delete `UseCaseWizardPage.tsx`. PR 10 owns that.
