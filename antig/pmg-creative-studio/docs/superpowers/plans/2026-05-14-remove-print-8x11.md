# Remove 8.5×11" Print Preset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `print-8x11` (8.5×11", 2550×3300) preset from the Resize Image app, with tests that lock the removal in place.

**Architecture:** Single-row deletion in a static data file (`src/apps/ad-resizing/data/channels.ts`), gated by two new tests that fail before the deletion and pass after. The Print channel itself stays (4×6 and 5×7 remain). Backend rounding fix at `functions/src/resize/pipeline.ts` and its regression test are intentionally untouched.

**Tech Stack:** TypeScript, React, Vitest (`vitest.config.ts` at repo root), `@testing-library/react` with `@testing-library/jest-dom/vitest` matchers (preloaded via `src/test-setup.ts`).

**Spec:** `docs/superpowers/specs/2026-05-14-remove-print-8x11-design.md`

**Working tree:** `~/Documents/dl-creative-studio/antig/pmg-creative-studio-remove-8x11/antig/pmg-creative-studio` on branch `feat/remove-print-8x11`. All commands below run from there unless stated.

---

## Task 1: Write the failing unit test for `CHANNELS` data

**Files:**

- Create: `src/apps/ad-resizing/data/channels.test.ts`
- Reads (don't modify): `src/apps/ad-resizing/data/channels.ts`

- [ ] **Step 1: Create the test file**

Create `src/apps/ad-resizing/data/channels.test.ts` with:

```typescript
import { describe, it, expect } from 'vitest';
import { CHANNELS, getDeduplicatedDimensions } from './channels';

describe('CHANNELS — 8.5×11" print preset removal', () => {
  const allDimensions = CHANNELS.flatMap((c) => c.dimensions);

  it('does not include a dimension with id "print-8x11"', () => {
    const ids = allDimensions.map((d) => d.id);
    expect(ids).not.toContain('print-8x11');
  });

  it('does not include a print dimension at 2550×3300', () => {
    const printChannel = CHANNELS.find((c) => c.id === 'print');
    expect(printChannel).toBeDefined();
    const has8x11 = printChannel!.dimensions.some(
      (d) => d.width === 2550 && d.height === 3300,
    );
    expect(has8x11).toBe(false);
  });
});

describe('CHANNELS — Print channel regression floor', () => {
  const printChannel = CHANNELS.find((c) => c.id === 'print');

  it('still contains exactly print-4x6 and print-5x7', () => {
    expect(printChannel).toBeDefined();
    const ids = printChannel!.dimensions.map((d) => d.id).sort();
    expect(ids).toEqual(['print-4x6', 'print-5x7']);
  });
});

describe('getDeduplicatedDimensions(["print"])', () => {
  it('returns exactly 2 dimensions and none are 2550×3300', () => {
    const dims = getDeduplicatedDimensions(['print']);
    expect(dims).toHaveLength(2);
    const has8x11 = dims.some((d) => d.width === 2550 && d.height === 3300);
    expect(has8x11).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails (RED)**

Run from the app dir:

```bash
npx vitest run src/apps/ad-resizing/data/channels.test.ts
```

Expected: 4 tests run, **3 fail** (the two "removal" assertions fail because `print-8x11` / 2550×3300 still exist; the `getDeduplicatedDimensions` assertion fails because it returns 3 dimensions instead of 2). The "regression floor" test will also fail (`ids` will be `['print-4x6', 'print-5x7', 'print-8x11']`). All four failures are expected at this point — that's the RED state we want.

Do **not** commit yet; we'll commit data + tests together in Task 3.

---

## Task 2: Write the failing component test for `ResizeConfigPanel`

**Files:**

- Create: `src/apps/ad-resizing/components/ResizeConfigPanel.test.tsx`
- Reads (don't modify): `src/apps/ad-resizing/components/ResizeConfigPanel.tsx`, `src/apps/ad-resizing/types.ts`

**Why this test renders with Print selected:** With no channels selected the panel shows a "No channel selected" empty state — none of the dimension labels are in the DOM, so a "not present" assertion would pass vacuously. Selecting Print materializes its three rows (after Task 3, only two), and also surfaces the channel-button summary line at `ResizeConfigPanel.tsx:122-124` (`channel.dimensions.map(d => d.label).join(' · ')`), which is a second place `8.5×11"` would appear if it were still present.

- [ ] **Step 1: Create the test file**

Create `src/apps/ad-resizing/components/ResizeConfigPanel.test.tsx` with:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ResizeConfigPanel from './ResizeConfigPanel';
import type { MockCreative } from '../types';

const fakeCreative: MockCreative = {
  id: 'test-creative-1',
  name: 'Test Creative',
  thumbnailUrl: 'https://example.com/thumb.png',
  width: 1200,
  height: 1200,
  fileType: 'PNG',
  uploadedAt: '2026-01-01T00:00:00.000Z',
  source: 'test',
  tags: [],
};

function renderPanel() {
  return render(
    <ResizeConfigPanel
      creative={fakeCreative}
      selectedChannels={['print']}
      selectedDimensions={new Set<string>()}
      onToggleChannel={vi.fn()}
      onToggleDimension={vi.fn()}
      onSetChannels={vi.fn()}
      onRun={vi.fn()}
      onClose={vi.fn()}
    />,
  );
}

describe('ResizeConfigPanel — Print channel rendering', () => {
  it('does not render the 8.5×11" option', () => {
    renderPanel();
    expect(screen.queryByText('8.5×11"')).not.toBeInTheDocument();
  });

  it('still renders 4×6" and 5×7" options', () => {
    renderPanel();
    // Each label appears at least twice (channel summary + dimension row),
    // so use getAllByText and assert non-empty.
    expect(screen.getAllByText('4×6"').length).toBeGreaterThan(0);
    expect(screen.getAllByText('5×7"').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails (RED)**

```bash
npx vitest run src/apps/ad-resizing/components/ResizeConfigPanel.test.tsx
```

Expected: 2 tests run, **the "does not render" test fails** with `8.5×11"` found in the document. The "still renders 4×6/5×7" test passes (those rows are present). The single failure is the RED state for this file.

Do **not** commit yet.

---

## Task 3: Remove the `print-8x11` row, verify both test files pass

**Files:**

- Modify: `src/apps/ad-resizing/data/channels.ts:29` (delete one line)

- [ ] **Step 1: Delete the row**

Open `src/apps/ad-resizing/data/channels.ts`. The Print channel block (lines 25–33) currently reads:

```typescript
  {
    id: 'print',
    label: 'Print',
    dimensions: [
      { id: 'print-8x11', label: '8.5×11"', width: 2550, height: 3300, channelId: 'print', channelLabel: 'Print' },
      { id: 'print-4x6', label: '4×6"', width: 1200, height: 1800, channelId: 'print', channelLabel: 'Print' },
      { id: 'print-5x7', label: '5×7"', width: 1500, height: 2100, channelId: 'print', channelLabel: 'Print' },
    ],
  },
```

Delete the `print-8x11` line so the block becomes:

```typescript
  {
    id: 'print',
    label: 'Print',
    dimensions: [
      { id: 'print-4x6', label: '4×6"', width: 1200, height: 1800, channelId: 'print', channelLabel: 'Print' },
      { id: 'print-5x7', label: '5×7"', width: 1500, height: 2100, channelId: 'print', channelLabel: 'Print' },
    ],
  },
```

- [ ] **Step 2: Run both new test files — expect GREEN**

```bash
npx vitest run src/apps/ad-resizing/data/channels.test.ts src/apps/ad-resizing/components/ResizeConfigPanel.test.tsx
```

Expected: **6 tests pass, 0 fail**.

- [ ] **Step 3: Run the full vitest suite — no regressions**

```bash
npm run test:run
```

Expected: All previously-passing tests still pass. If anything in the codebase had a hardcoded reference to `print-8x11` or a 2550×3300 expectation tied to the resize app (the backend pipeline test uses 2550×3300 but does NOT import `CHANNELS`, so it's unaffected), this is where it surfaces. Investigate any failure before continuing.

- [ ] **Step 4: Lint**

```bash
npm run lint
```

Expected: clean (or the same warnings that already existed on `dev`).

- [ ] **Step 5: TypeScript build sanity**

```bash
npm run build
```

Expected: build succeeds. Catches any stale `'print-8x11'` string literal referenced elsewhere as a literal type.

- [ ] **Step 6: Commit**

```bash
git add \
  src/apps/ad-resizing/data/channels.ts \
  src/apps/ad-resizing/data/channels.test.ts \
  src/apps/ad-resizing/components/ResizeConfigPanel.test.tsx
git commit -m "feat: remove 8.5x11 print preset from Resize Image app

Product decision — print is not a user-facing format. Removes the
print-8x11 preset (2550x3300) from src/apps/ad-resizing/data/channels.ts.
4x6 and 5x7 remain in the Print channel.

Backend rounding fix at functions/src/resize/pipeline.ts is intentionally
kept as defense-in-depth.

Tests:
- channels.test.ts asserts print-8x11 absent, 2550x3300 absent,
  remaining Print entries intact, getDeduplicatedDimensions reflects removal
- ResizeConfigPanel.test.tsx asserts the option no longer renders

Refs spec: docs/superpowers/specs/2026-05-14-remove-print-8x11-design.md"
```

---

## Task 4: Manual dev verification + push

**Files:** none modified

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Manual check in browser**

Open the dev URL printed in the terminal (usually `http://localhost:3000` or similar). Navigate to the Resize Image app, pick any creative, expand the **Print** channel in the Resize Settings panel.

Verify:

- The Print channel button summary shows `4×6" · 5×7"` (no 8.5×11).
- After selecting Print, the "Sizes to Generate" list shows exactly two rows: `4×6"` and `5×7"`. No `8.5×11"` row.
- The other channels (Social, Programmatic, Digital, Digital Signage) are unchanged.

Stop the dev server when satisfied (`Ctrl+C`).

- [ ] **Step 3: Push the branch**

```bash
git push -u origin feat/remove-print-8x11
```

- [ ] **Step 4: Open the PR**

```bash
gh pr create --base dev --title "Remove 8.5x11 print preset from Resize Image app" --body "$(cat <<'EOF'
## Summary

- Removes the \`print-8x11\` (2550×3300) preset from the Resize Image app's dimension picker
- Print channel keeps \`4×6\` and \`5×7\`
- Backend rounding fix at \`functions/src/resize/pipeline.ts\` intentionally kept as defense-in-depth

## Why

Product decision — print is not a user-facing format. PR #36 added 8.5×11; this rolls back the user-facing entry without disturbing the surrounding refactor.

## Tests

- New \`src/apps/ad-resizing/data/channels.test.ts\` — asserts \`print-8x11\` and 2550×3300 are gone, remaining Print entries intact, dedup helper reflects removal
- New \`src/apps/ad-resizing/components/ResizeConfigPanel.test.tsx\` — asserts the option no longer renders, 4×6 and 5×7 do

## Test plan

- [ ] \`npm run test:run\` green locally
- [ ] \`npm run lint\` green
- [ ] \`npm run build\` green
- [ ] Manual: dev server, open Resize app, expand Print channel, confirm only 4×6 and 5×7 appear

## Refs

- Spec: \`docs/superpowers/specs/2026-05-14-remove-print-8x11-design.md\`
- Undoes user-facing part of PR #36 (issue #25)
EOF
)"
```

---

## Verification checklist (end-state)

- [ ] `src/apps/ad-resizing/data/channels.ts` no longer contains `print-8x11`
- [ ] Two new test files exist and pass
- [ ] `npm run test:run`, `npm run lint`, `npm run build` all clean
- [ ] Manual: Print channel shows 4×6 and 5×7 only, in dev
- [ ] PR open against `dev`
