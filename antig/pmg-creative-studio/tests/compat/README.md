# Compatibility tests — `#thegreatmigration`

This directory exists for the lifetime of the **unified output schema migration**
(Plan B, `docs/superpowers/plans/2026-05-15-unified-output-schema-migration.md`).

It holds tests that span the migration: they assert behaviors that must remain
true *across* PRs while the schema is being reshaped — e.g., during the
dual-write phase, both legacy `results/` and new `outputs/` paths must agree;
ad-resizing and template-builder batches must continue to round-trip end-to-end.

## When to add a test here

Add a compat test when a PR in the migration series changes a contract that the
next PR depends on. The test pins the contract so a future PR can't silently
break it.

Examples (planned):
- `schema-drift.test.ts` — client and admin Zod schemas stay in lockstep (added at Task 5)
- `ad-resizing-roundtrip.test.ts` — runOutpaintBatch writes the canonical shape (added at Task 6)
- `template-builder-roundtrip.test.ts` — `batches.addResult` writes the canonical shape (added at Task 7)
- `dual-write-parity.test.ts` — legacy + new docs have matching content during the dual-write window (Tasks 7–9)
- `legacy-reader-works.test.ts` — `getBatchResults` still works against the new shape during the dual-write window (Tasks 7–9; deletable at Task 10)

## When to delete

Most tests here are temporary. Delete a compat test when:

- The dual-write window closes (Task 10 — drop the dual-write parity + legacy-reader tests)
- The migration ships its final smoke test (Task 13 — most of the rest can go)

The **schema-drift** test is the exception: it survives the migration because the
two-SDK (client + admin) drift problem outlives the schema reshape.

## Lifecycle marker

Every test in this directory should open with a comment block:

```
// COMPAT TEST — keep until: Task N completes
// Pins: <contract this test protects>
```

So future-you knows when to delete it without re-reading the plan.

## Why a dedicated directory

Putting these next to the modules they test (`src/services/__tests__/...`)
would make them invisible at cleanup time. Centralizing them makes the deletion
boundary obvious: at Task 13's PR, this directory shrinks to only the
schema-drift test (or disappears entirely).
