# "More Info" Tool-Overview Popover — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each AdLabs dashboard card's existing (no-op) "More Info" button reveal a Glance popover — tool title, one-line blurb, and a before→after outcome visual.

**Architecture:** A focused `AppInfoPopover` component built on `@floating-ui/react` (already a dependency) handles the trigger + anchored popover + hover/focus/click/dismiss interactions + ARIA. Per-tool content comes from a new optional `overview` field on `AppManifest`; the dashboard `AppCard` renders `AppInfoPopover` in place of the old button. When a tool has no `overview`, the button is hidden.

**Tech Stack:** React + TypeScript, `@floating-ui/react`, Tailwind, `@agencypmg/alli-design-system` `Button`, vitest + `@testing-library/react` (jsdom, jest-dom matchers, `globals: false`).

**Spec:** `docs/superpowers/specs/2026-06-16-app-info-popover-design.md`

---

## File Structure

- `src/apps/types.ts` — **modify**: add `AppOverview` interface + optional `overview` field on `AppManifest`.
- `src/apps/ad-resizing/manifest.ts`, `src/apps/template-builder/manifest.ts`, `src/apps/video-cutdown/manifest.ts` — **modify**: add `overview`. (`video-stitch` stays preview, no `overview`.)
- `src/pages/AppInfoPopover.tsx` — **create**: the trigger button + popover (one responsibility: show a tool's overview).
- `src/pages/AppInfoPopover.test.tsx` — **create**: component behavior + a11y.
- `src/pages/DashboardPage.tsx` — **modify**: export `AppCard`; swap the no-op "More Info" `Button` for `<AppInfoPopover>`.
- `src/pages/DashboardPage.test.tsx` — **create**: `AppCard` smoke (button shown/hidden by `overview`; Open still works).
- `public/app-overviews/<id>/…` — **curated by the user** (not a code task); paths referenced by manifests.

---

## Task 1: Data model + first consumer (ad-resizing)

**Files:**
- Modify: `src/apps/types.ts`
- Modify: `src/apps/ad-resizing/manifest.ts`

- [ ] **Step 1: Add the `AppOverview` type + `overview` field**

In `src/apps/types.ts`, add above the `AppManifest` interface:

```ts
/** Content for the dashboard "More Info" Glance popover. */
export interface AppOverview {
  /** Tighter than `description`, ~8–12 words; the popover headline line. */
  blurb: string;
  /** "Before"/source image path, e.g. /app-overviews/ad-resizing/before.webp */
  before: string;
  /** 1–6 "after"/output image paths. */
  after: string[];
}
```

Then add this field inside `interface AppManifest` (right after the `description?` field):

```ts
  /** Optional Glance-popover overview shown by the dashboard "More Info" button. */
  overview?: AppOverview;
```

- [ ] **Step 2: Populate ad-resizing's overview**

In `src/apps/ad-resizing/manifest.ts`, add the `overview` field to the manifest object (after `description`):

```ts
  overview: {
    blurb: 'One creative, resized for every placement.',
    before: '/app-overviews/ad-resizing/before.webp',
    after: [
      '/app-overviews/ad-resizing/after-1.webp',
      '/app-overviews/ad-resizing/after-2.webp',
      '/app-overviews/ad-resizing/after-3.webp',
    ],
  },
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b --noEmit` (from repo root)
Expected: exits 0 (no errors).

- [ ] **Step 4: Commit**

```bash
git add src/apps/types.ts src/apps/ad-resizing/manifest.ts
git commit -m "feat(adlabs): add AppManifest.overview field + ad-resizing content"
```

---

## Task 2: `AppInfoPopover` component (TDD)

**Files:**
- Create: `src/pages/AppInfoPopover.tsx`
- Test: `src/pages/AppInfoPopover.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/pages/AppInfoPopover.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { AppInfoPopover } from './AppInfoPopover';
import type { AppOverview } from '../apps/types';

const overview: AppOverview = {
  blurb: 'One creative, resized for every placement.',
  before: '/app-overviews/ad-resizing/before.webp',
  after: [
    '/app-overviews/ad-resizing/after-1.webp',
    '/app-overviews/ad-resizing/after-2.webp',
    '/app-overviews/ad-resizing/after-3.webp',
  ],
};

describe('AppInfoPopover', () => {
  it('renders nothing when overview is absent', () => {
    const { container } = render(<AppInfoPopover title="Resize Image" />);
    expect(screen.queryByRole('button', { name: /more info/i })).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the trigger but no popover content until opened', () => {
    render(<AppInfoPopover title="Resize Image" overview={overview} />);
    const btn = screen.getByRole('button', { name: /more info/i });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(overview.blurb)).toBeNull();
  });

  it('opens on focus: blurb + before + every after image, with aria wiring', () => {
    render(<AppInfoPopover title="Resize Image" overview={overview} />);
    const btn = screen.getByRole('button', { name: /more info/i });
    fireEvent.focus(btn);

    const region = screen.getByRole('region', { name: /resize image overview/i });
    expect(within(region).getByText(overview.blurb)).toBeInTheDocument();
    // 1 before + 3 after = 4 images
    expect(within(region).getAllByRole('img')).toHaveLength(4);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    expect(btn).toHaveAttribute('aria-describedby', region.id);
  });

  it('toggles on click (tap/touch path)', () => {
    render(<AppInfoPopover title="Resize Image" overview={overview} />);
    const btn = screen.getByRole('button', { name: /more info/i });
    fireEvent.click(btn);
    expect(screen.getByText(overview.blurb)).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.queryByText(overview.blurb)).toBeNull();
  });

  it('closes on Escape', () => {
    render(<AppInfoPopover title="Resize Image" overview={overview} />);
    fireEvent.focus(screen.getByRole('button', { name: /more info/i }));
    expect(screen.getByText(overview.blurb)).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByText(overview.blurb)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/pages/AppInfoPopover.test.tsx`
Expected: FAIL — `Failed to resolve import './AppInfoPopover'` (module not created yet).

- [ ] **Step 3: Implement the component**

Create `src/pages/AppInfoPopover.tsx`:

```tsx
import { useState } from 'react';
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useHover,
  useFocus,
  useClick,
  useDismiss,
  useInteractions,
  safePolygon,
  FloatingPortal,
  useId,
} from '@floating-ui/react';
import { Button } from '@agencypmg/alli-design-system';
import type { AppOverview } from '../apps/types';

interface AppInfoPopoverProps {
  title: string;
  overview?: AppOverview;
}

/**
 * The dashboard card's "More Info" trigger + its Glance popover. Hover (pointer)
 * or focus (keyboard) or click (touch) opens it; Esc / outside-click / mouse-leave
 * closes it. Renders nothing when the tool has no curated `overview`.
 */
export function AppInfoPopover({ title, overview }: AppInfoPopoverProps) {
  const [open, setOpen] = useState(false);
  const popoverId = useId();

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'top',
    whileElementsMounted: autoUpdate,
    middleware: [offset(10), flip(), shift({ padding: 8 })],
  });

  const hover = useHover(context, {
    delay: { open: 80, close: 120 },
    handleClose: safePolygon(),
  });
  const focus = useFocus(context);
  const click = useClick(context);
  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, click, dismiss]);

  if (!overview) return null;

  return (
    <>
      <Button
        ref={refs.setReference}
        variant="secondary"
        type="button"
        aria-expanded={open}
        aria-describedby={open ? popoverId : undefined}
        {...getReferenceProps()}
      >
        More Info
      </Button>

      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            id={popoverId}
            role="region"
            aria-label={`${title} overview`}
            style={floatingStyles}
            className="z-50 w-64 rounded-xl border border-gray-200 bg-white p-3 shadow-xl"
            {...getFloatingProps()}
          >
            <p className="text-sm font-semibold text-gray-900">{title}</p>
            <p className="mt-0.5 text-xs leading-snug text-gray-600">{overview.blurb}</p>
            <div className="mt-2 flex items-center gap-2">
              <img
                src={overview.before}
                alt={`${title} source example`}
                className="h-10 w-9 shrink-0 rounded object-cover"
              />
              <span aria-hidden className="text-gray-400">→</span>
              <div className="grid flex-1 grid-cols-3 gap-1">
                {overview.after.map((src, i) => (
                  <img
                    key={src}
                    src={src}
                    alt={`${title} output example ${i + 1}`}
                    className="h-9 w-full rounded object-cover"
                  />
                ))}
              </div>
            </div>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/pages/AppInfoPopover.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/AppInfoPopover.tsx src/pages/AppInfoPopover.test.tsx
git commit -m "feat(adlabs): AppInfoPopover Glance popover component"
```

---

## Task 3: Wire `AppInfoPopover` into the dashboard card

**Files:**
- Modify: `src/pages/DashboardPage.tsx`
- Test: `src/pages/DashboardPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/pages/DashboardPage.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppCard } from './DashboardPage';
import type { AppManifest } from '../apps/types';

const base: AppManifest = {
  id: 'ad-resizing',
  basePath: 'ad-resizing',
  title: 'Resize Image',
  description: 'Resize a creative for any placement.',
  status: 'live',
  steps: [],
  initialStepData: () => ({}),
};

const withOverview: AppManifest = {
  ...base,
  overview: {
    blurb: 'One creative, resized for every placement.',
    before: '/app-overviews/ad-resizing/before.webp',
    after: ['/app-overviews/ad-resizing/after-1.webp'],
  },
};

describe('AppCard', () => {
  it('shows the More Info button when the manifest has an overview', () => {
    render(<AppCard manifest={withOverview} onOpen={() => {}} />);
    expect(screen.getByRole('button', { name: /more info/i })).toBeInTheDocument();
  });

  it('hides More Info when there is no overview, and Open still fires', () => {
    const onOpen = vi.fn();
    render(<AppCard manifest={base} onOpen={onOpen} />);
    expect(screen.queryByRole('button', { name: /more info/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    expect(onOpen).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/pages/DashboardPage.test.tsx`
Expected: FAIL — `AppCard` is not exported from `./DashboardPage` (currently a private function).

- [ ] **Step 3: Implement — export `AppCard` and swap the button**

In `src/pages/DashboardPage.tsx`:

1. Add the import near the top (with the other local imports):

```tsx
import { AppInfoPopover } from './AppInfoPopover';
```

2. Change `function AppCard(...)` to `export function AppCard(...)`.

3. Inside `AppCard`, replace the old "More Info" button:

```tsx
        <Button
          variant="secondary"
          type="button"
          onClick={() => console.log('Button was pressed')}
        >
          More Info
        </Button>
```

with:

```tsx
        <AppInfoPopover title={manifest.title} overview={manifest.overview} />
```

(Leave the `Open`/`Preview` primary button untouched.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/pages/DashboardPage.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/DashboardPage.tsx src/pages/DashboardPage.test.tsx
git commit -m "feat(adlabs): wire AppInfoPopover into the dashboard card"
```

---

## Task 4: Overview content for the remaining live tools

**Files:**
- Modify: `src/apps/template-builder/manifest.ts`
- Modify: `src/apps/video-cutdown/manifest.ts`

(`video-stitch` is `status: 'preview'` — intentionally NO `overview`, so its "More Info" button stays hidden until the tool ships.)

- [ ] **Step 1: Add template-builder's overview**

In `src/apps/template-builder/manifest.ts`, add to the manifest object (after `description`):

```ts
  overview: {
    blurb: 'Turn a data feed into on-brand creative at scale.',
    before: '/app-overviews/template-builder/before.webp',
    after: [
      '/app-overviews/template-builder/after-1.webp',
      '/app-overviews/template-builder/after-2.webp',
      '/app-overviews/template-builder/after-3.webp',
    ],
  },
```

- [ ] **Step 2: Add video-cutdown's overview**

In `src/apps/video-cutdown/manifest.ts`, add to the manifest object (after `description`):

```ts
  overview: {
    blurb: 'Cut a long video into a punchy social reel.',
    before: '/app-overviews/video-cutdown/before.webp',
    after: [
      '/app-overviews/video-cutdown/after-1.webp',
      '/app-overviews/video-cutdown/after-2.webp',
    ],
  },
```

- [ ] **Step 3: Typecheck + run the full suite + lint**

Run: `npx tsc -b --noEmit`
Expected: exits 0.

Run: `npx vitest run src/pages/AppInfoPopover.test.tsx src/pages/DashboardPage.test.tsx`
Expected: PASS (7 tests total).

Run: `npx eslint src/pages/AppInfoPopover.tsx src/pages/DashboardPage.tsx`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/apps/template-builder/manifest.ts src/apps/video-cutdown/manifest.ts
git commit -m "feat(adlabs): overview content for template-builder + video-cutdown"
```

---

## Curated assets (user-provided, not a code task)

Drop the curated images at the paths the manifests reference. Until they exist, the
popover shows broken-image boxes in dev (tests don't load images, so they pass). Per the
spec's criteria: WebP preferred, long edge 240–480px, <80KB each, native aspect (no
pre-crop), avoid text-heavy creatives.

```
public/app-overviews/ad-resizing/      before.webp, after-1.webp … after-3.webp
public/app-overviews/template-builder/ before.webp, after-1.webp … after-3.webp
public/app-overviews/video-cutdown/    before.webp, after-1.webp, after-2.webp
```

---

## Self-review notes

- **Spec coverage:** popover surface (Task 2), Glance density + before/after + no inner
  buttons (Task 2 markup), hover/focus/click/Esc triggers (Task 2 interactions), manifest
  `overview` data model (Task 1), hidden-when-absent (Task 2 `if (!overview) return null`
  + Task 3 test), ARIA `aria-expanded`/`aria-describedby` (Task 2), assets criteria
  (assets section). All covered.
- **Open item resolved:** the spec's "verify DS popover primitive" → use
  `@floating-ui/react` (already a dependency); DS `Button` forwards refs + spreads props,
  so it's the trigger.
- **Hover in tests:** jsdom can't reliably simulate floating-ui pointer hover; the
  open/close state is covered via focus + click + Escape, which exercise the same state.
