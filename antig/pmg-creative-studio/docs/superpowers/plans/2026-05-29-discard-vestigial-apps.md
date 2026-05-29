# Cleanup: discard vestigial apps + remove Active Batch Jobs

**Date:** 2026-05-29
**Branch:** `chore/discard-vestigial-apps` (off `dev`)
**PR target:** `dev`

## Goal

Trim the codebase to the four apps we're actively developing and remove the
internal-only Active Batch Jobs dashboard widget for now.

**Keep (do not touch):** `template-builder`, `ad-resizing`, `video-cutdown`
(preview stub), `batch-variants` (preview stub).

## Assessment findings (multi-agent audit, 2026-05-29)

- The `UseCaseWizardPage.tsx` monolith and its `/create/:useCaseId` route were
  **already purged** (commit `4ddb5ec`). Nothing left there.
- The only genuinely vestigial **app** is `resize-image` — an old skeleton
  wizard distinct from the `ad-resizing` app we keep. It is routed at
  `/adlabs/:clientSlug/resize-image/*` but deliberately `void`-ed out of the
  dashboard registry. Safe to delete.
- **Active Batch Jobs** is entirely inline in `src/pages/DashboardPage.tsx`
  (a private `useActiveBatches` hook + a gated `<section>`), backed only by
  `batchService.listActiveBatchesForClient`.

## Changes

### 1. Delete the `resize-image` app

- Delete `src/apps/resize-image/` (AppRoot, manifest, manifest.test, steps.ts,
  types.ts, `steps/*`).
- `src/App.tsx`: drop the `ResizeImageAppRoot` import + its `<Route>` block.
- `src/apps/_registry.ts`: drop the `resizeImageManifest` import + the
  `void resizeImageManifest;` line and its comment.
- `src/platform/firebase/paths.ts`: drop `'resize-image'` from the `AppId`
  union and `VALID_APP_IDS`.
- `src/platform/firebase/__tests__/paths.test.ts`: drop `'resize-image'` from
  the `validIds` fixture.
- `src/apps/ad-resizing/utils/outputFilename.ts`: drop the dead
  `'resize-image': 'resize-img'` slug mapping.

### 2. Remove Active Batch Jobs from the dashboard

- `src/pages/DashboardPage.tsx`: remove `ACTIVE_STATUSES`, the `useActiveBatches`
  hook, the hook call + `liveAppIds`/`internal`/`user` locals, the
  `{internal && <section data-testid="active-batch-jobs">…</section>}` block,
  and the now-unused imports (`ClockIcon`, `useCurrentUser`, `isInternalUser`,
  `batchService`/`BatchRecord`, `AppId`, `useEffect`/`useState`).
- `src/services/batches.ts`: remove the orphaned `listActiveBatchesForClient`
  method, drop the now-unused `getDocs` import, and refresh the stale
  `BatchRecord` comment that referenced the widget.

### Left in place (intentional)

- Legacy `/:clientSlug/template-builder/*` bookmark-compat route — kept so old
  links don't 404.
- `src/auth/isInternalUser.ts` + `useCurrentUser.ts` — generic reusable
  helpers; now unreferenced but harmless.

## Verification

- `npm run lint`
- `npm run test:run`
- `npm run build` (`tsc -b && vite build`)
