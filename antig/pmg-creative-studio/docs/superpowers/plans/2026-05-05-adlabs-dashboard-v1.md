# AdLabs Dashboard v1 — Implementation Plan

**Date:** 2026-05-05
**Owner:** Diego Escobar
**Origin:** /grill-me synthesis (see commits 8a93440…9e7999e on `dev` for the prototype evolution at `html_prototypes/dashboard (1).html`)

## Context

Creative Studio is being rebranded as **AdLabs** — a tab inside the Alli platform. AdLabs's product thesis is _fast edits on dynamic templates for dynamic ad feeds_, replacing two specific frictions:
1. The current static-image → HTML → JS-injection flow for new dynamic templates.
2. Manual HTML edits and long approval rounds for variant iteration.

The modular SOC2 rebuild (apps registry, WizardShell, path-scoped Firestore) is the technical groundwork that makes this absorption clean. v1 ships the new dashboard surface with **two clickable apps** so the codebase is in shape to keep building apps in isolation.

## Locked decisions (do not re-litigate)

1. **Archive `CreatePage`.** The new `DashboardPage` becomes the create surface. No split-brain.
2. **Stats / Active Batch Jobs / Top Performer / Recent Generated render with mocks** in v1. Real data wiring is a follow-up PR per section.
3. **No platform banner in v1.** That chrome rework lands later. v1 keeps `AppLayout.tsx` chrome untouched.
4. **Sidebar shape stays exactly as `AppLayout.tsx` has it today** — `Alli Studio` + `Client Asset House` nav items, header with `Alli Studio` title + `RALPH LAUREN / Change` row + DEV ribbon, footer with avatar + name + client button + logout. Three client-switch entry points (header, footer, eventual banner) all preserved.
5. **Two clickable apps in v1**: New Dynamic Template (links to existing `/:slug/template-builder`) and Video Cutdown (lift out of monolith into `src/apps/video-cutdown/`, register manifest, mount route).
6. **Coming-soon shelf** below the live apps for: Resize Image, Edit & Tweak, Batch Variants. No styling treatment that implies they're clickable.
7. **Visual reference**: `html_prototypes/dashboard (1).html` on `dev` is the source of truth for layout, copy, and styling.

## Out of scope for v1

- Brand Asset House v2 schema (templatized text/image elements, provenance, AI-extracted draft → promoted lifecycle). Future work.
- Deterministic AI re-targeting pipeline (Resize image → BAH lift + AI expand/crop). Future work.
- Alli platform icon rail (Dashboards / Data / Strategy & Planning / Actions / Audiences / Creative / **AdLabs** / Products + Settings). Future chrome rework.
- Persistent Alli platform banner (alli wordmark + Ralph Lauren / Change pill + help/notifications/avatar). Future chrome rework.
- Lifting Resize Image, Edit & Tweak, Batch Variants out of the monolith. Future per-app PRs.
- `execution-plan.html` prototype — not a UX artifact, ignore it.
- `canvas-editor.html` — folds into the existing `template-builder` app in a later PR; not a separate destination.
- `template-picker.html` — for already-existing templates only; not a v1 dashboard concern.

## Step list

Each step is one PR, mergeable independently. Order matters: 1 → 2 → 3 → 4. Steps 5–8 are additive and can be parallelized after Step 4.

### Step 1 — `DashboardPage` component (replaces `CreatePage`)

**Files:**
- New: `src/pages/DashboardPage.tsx`
- New: `src/pages/__tests__/DashboardPage.test.tsx`
- Modified: `src/App.tsx` (route swap: `/:clientSlug/` now mounts `DashboardPage` instead of `CreatePage`)
- Deleted (after route swap is verified): `src/pages/CreatePage.tsx`, `src/pages/__tests__/CreatePage.test.tsx` if any

**Behavior:**
- Reads `getRegistry()` from `src/apps/_registry.ts`.
- Renders one `<AppCard>` per registered manifest. v1 expects exactly two registered manifests after Step 2 lands: `template-builder` and `video-cutdown`.
- Renders the "coming soon" shelf with hardcoded entries for Resize Image, Edit & Tweak, Batch Variants. No registry dependency — these are visual-only stubs.
- Page header: greeting (`Good Afternoon, ${userName}!`), one-line subtitle, date-range pill (mocked, non-functional in v1).
- Below apps grid: stats row, active-jobs section, top-performer card, recent-assets grid — **all mocked** via local hardcoded data. Each section gets a TODO comment naming its future data source.

**Visual:** mirror `html_prototypes/dashboard (1).html` line-by-line. Convert vanilla CSS to Tailwind classes (the repo uses Tailwind via `@agencypmg/tailwindcss-config`). Preserve `--alli-` color palette by mapping to existing Tailwind tokens (`blue-600`, `blue-gray-700`, etc.) where possible.

**Verification:**
- `npm run typecheck` passes.
- `npm run test -- DashboardPage` passes.
- Manual: visit `/ralph_lauren/` in dev, see the dashboard, click "New Dynamic Template" → lands in template-builder. Click "Video Cutdown" → 404 until Step 2 ships (acceptable for staged rollout).

### Step 2 — Lift Video Cutdown into `src/apps/video-cutdown/`

**Files:**
- New: `src/apps/video-cutdown/manifest.ts` (exports `AppManifest` with `id: 'video-cutdown'`, `basePath: 'video-cutdown'`, page-level metadata)
- New: `src/apps/video-cutdown/VideoCutdownApp.tsx` (entry component)
- New: `src/apps/video-cutdown/__tests__/manifest.test.ts`
- Modified: `src/apps/_registry.ts` — add `videoCutdownManifest` to `MANIFESTS` array (alphabetical by basePath)

**Lift strategy:**
- Mirror the `template-builder` lift pattern (PR 4/5 in the rebuild). Pull JSX, services, and step contracts out of `UseCaseWizardPage` for `useCaseId === 'video-cutdown'` only. Other `useCaseId` branches stay in the monolith for now.
- The `WizardShell` 7-method contract applies (`render`, `validate`, `onEnter`, `onLeave`, `next`, `onMount`, `initialStepData`).
- Path-scoped Firestore writes go under `clients/{slug}/apps/video-cutdown/...` per the locked rebuild path.

**Verification:**
- Registry collision guard test passes (`src/apps/_registry.test.ts`).
- Manual: dashboard → Video Cutdown card → upload a video → AI cutdown flow runs end-to-end on the lifted app, no monolith fallback for this `useCaseId`.

### Step 3 — Sidebar styling polish in `AppLayout.tsx`

**Files:**
- Modified: `src/components/AppLayout.tsx`

**Changes (visual-only, zero logic):**
- Active nav state to `bg-blue-50 text-blue-600` (already current — verify and tighten if needed).
- Hover state to `bg-gray-100`.
- Footer avatar size + spacing match prototype.
- DEV ribbon stays gated on `import.meta.env.DEV` per existing comment in file.

No route changes, no auth changes, no client-switch drawer changes.

### Step 4 — Wire Active Batch Jobs section to real data

**Files:**
- Modified: `src/pages/DashboardPage.tsx`
- Possibly new: `src/services/batches.ts` extension or new query helpers

**Behavior:**
- Read in-flight batches from `clients/{slug}/apps/{appId}/batches` (or wherever the batch records live post-rebuild — verify with `src/services/batches.ts`).
- Replace the mock `batches[]` array in `DashboardPage` with the real query.
- Empty state: "No active batches" with a CTA back to the apps grid.

### Steps 5–8 (parallelizable, follow Step 4)

5. **Wire stats row to real counts.** `variants generated`, `active batches`, `live variants`, `avg CTR lift`. Each is a separate aggregation; ship one section per small PR.
6. **Wire Recent Generated grid** to `clients/{slug}/assets/...` newest-first query.
7. **Wire Top Performer** (requires Performance data — may bottleneck on a separate data pipeline; acceptable to leave mocked indefinitely until data is available).
8. **Date-range pill** becomes functional, filters all real-data sections.

## Risks

- **Step 1 vs Step 2 ordering:** if Step 1 ships before Step 2, the Video Cutdown card is a dead link. Mitigations: (a) ship Step 2 first and have Step 1's PR depend on it (preferred), or (b) ship Step 1 with Video Cutdown card disabled/hidden behind a feature flag and unhide when Step 2 lands.
- **Mock data drift:** mocks in Step 1 should look plausible enough that stakeholders don't read them as real metrics. Add a small "demo data" indicator near each mocked section, removed when each section gets its real-data PR.
- **`CreatePage` deletion timing:** archive (don't delete) `CreatePage.tsx` in the same PR as the route swap, in case rollback is needed. Delete it in a follow-up cleanup PR after a soak period.

## Cutover relationship

This work targets `dev` and is independent of the SOC2 rebuild's coordinated cutover. It can land before, during, or after the cutover — the apps registry path and `WizardShell` contract are already on `dev`, and the new `DashboardPage` has no schema dependencies that require cutover gating.

## What this plan does NOT decide

- Whether the chrome rework (Alli platform rail + persistent banner) is one PR or several. Defer until v1 dashboard is live and we have real users on it.
- BAH v2 scope, schema, and migration. Tracked separately when AI re-targeting pipeline work begins.
- Whether `WizardShell` needs a sibling `WorkspaceShell` for batch-editor / canvas-editor style surfaces. Not relevant for v1 since Video Cutdown is wizard-shaped.
