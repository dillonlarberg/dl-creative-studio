# Remove 8.5×11" Print Preset from Resize Image App

**Date:** 2026-05-14
**Branch:** `feat/remove-print-8x11`
**Scope:** Resize Image app only

## Context

Issue #25 added an 8.5×11" print preset (`print-8x11`, 2550×3300) to the Resize
Image app's dimension picker, along with a backend rounding fix in
`functions/src/resize/pipeline.ts` so the API would accept dimensions just under
the 8,388,608 px ceiling. PR #36 merged that work into `dev`.

Product decision: we are not supporting print as a user-facing format. The
8.5×11 entry should be removed.

## Scope

**In scope:**

- Delete the `print-8x11` row in `src/apps/ad-resizing/data/channels.ts`.
- Tests verifying the entry is gone and the rest of the Print channel still works.

**Out of scope (intentionally):**

- The Print channel itself remains. `print-4x6` and `print-5x7` stay.
- The backend rounding fix in `functions/src/resize/pipeline.ts` and its
  regression test at `functions/src/resize/pipeline.test.ts:69` stay. They now
  test a dimension no user can pick, but we're keeping them as defense-in-depth
  for any future preset that lands near the 8.4M-pixel ceiling.
- The internal resize-tracer tool (`tools/resize-tracer/src/config.ts`) keeps
  its `print-letter` entry — it's a dev/eval tool, not user-facing.
- Template Builder and UseCaseWizard pages still list `'8.5x11'` as a ratio
  option in their own context — not touched.

## Change

One data deletion in `src/apps/ad-resizing/data/channels.ts`:

```diff
   {
     id: 'print',
     label: 'Print',
     dimensions: [
-      { id: 'print-8x11', label: '8.5×11"', width: 2550, height: 3300, channelId: 'print', channelLabel: 'Print' },
       { id: 'print-4x6', label: '4×6"', width: 1200, height: 1800, channelId: 'print', channelLabel: 'Print' },
       { id: 'print-5x7', label: '5×7"', width: 1500, height: 2100, channelId: 'print', channelLabel: 'Print' },
     ],
   },
```

## Tests

### Unit test — `src/apps/ad-resizing/data/channels.test.ts` (new)

Asserts both the contract (the row is gone) and a regression floor (the rest of
the Print channel is intact, and the dedup helper reflects the removal):

- `CHANNELS` contains no dimension with `id === 'print-8x11'` across all channels.
- The `print` channel has no dimension with `width === 2550 && height === 3300`.
- The `print` channel still contains exactly `print-4x6` and `print-5x7`.
- `getDeduplicatedDimensions(['print'])` returns exactly 2 dimensions, and none
  has `width === 2550 && height === 3300`.

### Component test — `src/apps/ad-resizing/components/ResizeConfigPanel.test.tsx` (new)

Renders the panel with the Print channel selected so the dimension rows are
materialized in the DOM:

- No element with text `8.5×11"` is rendered.
- `4×6"` and `5×7"` are present.

The panel's exact prop shape is read from the existing component
(`ResizeConfigPanel.tsx`) at implementation time. Use `@testing-library/react`
matching the project's existing vitest setup (`vitest.config.ts` at repo root).

## Test framework notes

- Project uses Vitest (`npm run test` → `vitest`, `npm run test:run` → `vitest run`).
- No existing test files under `src/apps/ad-resizing/`. These two are the first.
- Both tests are pure — no Firebase emulator, MSW, or network.

## Verification before merge

- [ ] `npm run test:run -- src/apps/ad-resizing` passes (the two new tests
      green, no other resize tests break since there are none yet).
- [ ] `npm run lint` passes.
- [ ] `npm run build` passes (TypeScript catches any stale reference to
      `print-8x11`).
- [ ] Manual: in `npm run dev`, open Resize Image app, expand Print channel,
      confirm only 4×6 and 5×7 appear.

## Why this matters

Small change, but it locks the product surface area: any future PR that
re-introduces 8.5×11 — via channels.ts directly or via a different code path
that surfaces a 2550×3300 dimension under Print — fails the unit test. The
component test guards against a parallel UI shortcut that bypasses the
CHANNELS data structure.
