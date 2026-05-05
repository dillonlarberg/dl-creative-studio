# Agent Prompt — Contribute to the Dynamic Template Builder

Use this prompt to dispatch a coding agent (Claude Code, Cursor, Copilot, etc.) to **modify or improve** the Dynamic Template Builder app — fill in placeholder steps, polish UI, fix bugs, add features, etc.

This is different from extracting a *new* app from the monolith — you're improving an app that's already in the modular framework.

---

## What needs work right now

| Area | Status | Where |
|---|---|---|
| `ContextStep` UI | ✅ Lifted from monolith | `src/apps/template-builder/steps/ContextStep.tsx` |
| `IntentStep` UI | ✅ Lifted | `src/apps/template-builder/steps/IntentStep.tsx` |
| `ExportStep` UI | ✅ Lifted | `src/apps/template-builder/steps/ExportStep.tsx` |
| `SourceStep` UI | 🟡 **Placeholder** — needs JSX lift from monolith lines ~2695-2952 | `src/apps/template-builder/steps/SourceStep.tsx` |
| `MappingStep` UI | 🟡 **Placeholder** — needs JSX lift from monolith lines ~2953-3567 | `src/apps/template-builder/steps/MappingStep.tsx` |
| `GenerateStep` UI | 🟡 **Placeholder** (handler IS wired in `onEnter`) — needs JSX lift from monolith lines ~3568-3804 | `src/apps/template-builder/steps/GenerateStep.tsx` |
| `RefineStep` UI | 🟡 **Placeholder** — needs JSX lift from monolith lines ~3805-4140 | `src/apps/template-builder/steps/RefineStep.tsx` |
| `assetHouse` data | 🟡 Currently passed as `null` to `generateCandidates` | `src/apps/template-builder/_internal/handlers.ts` |
| New features (e.g. wireframe variants, new export targets) | 🔲 Open | wherever it fits |

Comment in `#studio-eng` to claim a piece before starting so two agents don't pick the same one.

---

## How to use this prompt

1. `git checkout dev && git pull --ff-only`
2. `git checkout -b feat/template-builder-<short-description>` (e.g. `feat/template-builder-mapping-step`).
3. Open your agent.
4. Paste the prompt below, replacing `<what-you're-doing>` with a one-line description of your change.

---

## The prompt

> I'm contributing to the Dynamic Template Builder app at `src/apps/template-builder/`. The work: **`<what-you're-doing>`**. Working dir: the `pmg-creative-studio` package.
>
> **Read these first, in order:**
>
> 1. `docs/superpowers/plans/2026-05-04-pr3-app-registry.md` — the framework plan and the 7-method `WizardShell` contract. Sections to focus on: "Manifest contract" and "Routing model."
> 2. `src/apps/types.ts` — the `AppManifest`, `WizardStep`, `StepRenderProps` types. Do NOT modify these.
> 3. `src/apps/template-builder/manifest.ts` — the 7-step manifest. Read it top to bottom.
> 4. `src/apps/template-builder/types.ts` — `TemplateBuilderStepData` (the persisted shape).
> 5. `src/apps/template-builder/steps/ContextStep.tsx` — a fully-lifted reference step. Mirror its shape.
> 6. The step file you're working on (e.g. `MappingStep.tsx`).
> 7. `src/apps/template-builder/_internal/` — `TemplatePreview.tsx`, `FilledTemplatePreview.tsx`, `injectIntoHtml.ts`, `handlers.ts`, `baseline.ts`. These are ported helpers; reuse them, don't duplicate.
> 8. `src/platform/wizard/WizardShell.tsx` — the runtime that drives this manifest. Don't modify; just understand what `step.render` receives: `{ stepData, mergeStepData, navigate, client: { slug }, creativeId }`.
> 9. **The monolith** — `src/pages/use-cases/UseCaseWizardPage.tsx`. If you're lifting placeholder UI: grep for `useCaseId === 'template-builder'` to find every branch; the per-step JSX lives within blocks that switch on `step.id` (e.g. lines ~2695-2952 for the `source` step). Lift verbatim.
>
> **Hard constraints:**
>
> - **Lift JSX verbatim** if you're filling in a placeholder. Same Tailwind classes, same Heroicons, same `cn()` calls. Do NOT redesign.
> - Persistent state flows through `mergeStepData({...})`. Transient UI state (`isSubmitting`, `isFetchingFeeds`, `currentFeedIndex`) can use local `useState`.
> - **Backend calls go through the existing handlers** in `src/apps/template-builder/_internal/handlers.ts` (`analyzeCreativeIntent`, `generateCandidates`, `handleExecuteBatch`) — these wrap `templateService` / `batchService` / etc. Do NOT call services directly from step components if a handler already exists.
> - **DO NOT modify:**
>   - `src/pages/use-cases/UseCaseWizardPage.tsx` (the legacy monolith).
>   - Cloud Functions (`functions/src/**`).
>   - Services (`src/services/**`).
>   - Firestore rules / Storage rules.
>   - `src/apps/types.ts` or `src/platform/wizard/*` (the framework — separate PR if these need changes).
> - Conditional flow logic (e.g. "skip step X if Y") belongs in `step.next(ctx)` returning a step id. The framework already supports this — see `ContextStep.next` and `MappingStep.next` for examples mirroring monolith lines 1219/1245/1248.
> - No `console.log` in production code. Immutable updates only.
> - If a step needs new persisted fields, add them to `TemplateBuilderStepData` in `types.ts` (optional fields preferred).
>
> **Tests:**
>
> - If you change a step's `validate()`, `next()`, or `onEnter()`, add or update the corresponding case in `src/apps/template-builder/manifest.test.ts`.
> - If you add a new helper or handler, write a unit test alongside it.
> - If you only change render JSX, no new test required (but `npm run test:run` must still pass).
>
> **Before you commit:**
>
> - `npx tsc --noEmit` must be clean.
> - `npm run test:run` must be clean.
> - `npm run build` must complete without new errors.
> - Smoke-test in `npm run dev`: route to `/<your-client-slug>/template-builder`, walk through to your changed step, exercise it end-to-end.
>
> **Commit message format:**
>
> ```
> feat(template-builder): <short imperative description>
>
> <one-paragraph explanation of what changed and why, including
> any monolith line ranges you lifted from.>
> ```
>
> **Final report (under 300 words):**
>
> 1. Files created/modified + line counts.
> 2. Test count delta.
> 3. Commit hash.
> 4. Smoke-test result (which steps you walked through, what you saw).
> 5. Anything you noticed but didn't fix (latent bugs, technical debt, follow-ups) — flag, don't fix.

---

## After the agent finishes

1. Push: `git push -u origin feat/template-builder-<short-description>`.
2. Open a PR against `dev`. Title: `feat(template-builder): <description>`.
3. PR body:
   - What changed and why.
   - Which monolith line range was lifted (if any).
   - Smoke-test checklist (paste your agent's smoke-test result).
   - Screenshots if it's a UI change.
4. Tag a reviewer.

## Hard "do not"s

- Don't deploy. Cutover happens when Diego declares it.
- Don't merge to `main`. Everything lands on `dev`.
- Don't redesign. Lift verbatim from the monolith for placeholder fills.
- Don't extend the WizardShell framework inside a template-builder PR. If the contract is missing something you need, raise it in `#studio-eng` and we'll patch the framework separately.
- Don't touch the other 7 apps in this PR. One PR = one app.
