# Spec: "More Info" tool-overview popover (AdLabs dashboard)

**Date:** 2026-06-16
**Status:** Approved (brainstorm) — pending spec review → implementation plan
**Surface:** `src/pages/DashboardPage.tsx` (AdLabs dashboard app grid)

## Problem

Each tool on the AdLabs dashboard renders as an `AppCard` with a title, a Live/Preview
badge, the one-sentence `manifest.description`, and two buttons: **More Info** and
**Open**. The **More Info** button already exists but is a no-op (`console.log`). We want
it to give a fast, visual "what does this tool do?" overview — a short blurb plus a
**before → after** outcome visual — without leaving the dashboard.

## Decisions (locked in brainstorm)

| Dimension | Decision | Why |
|-----------|----------|-----|
| Surface | **Popover** anchored to the existing "More Info" button | Lightest "quick peek"; reuses the button already on the card. |
| Density | **Glance** — title + one-line blurb + before→after visual, **no buttons inside** | "Quick overview"; the card's own "Open" stays the action. |
| Visual | **Before → after outcome** (source thumbnail → output thumbnails) | For these tools the outcome *is* the explanation; cheapest to maintain. |
| Trigger | **Hover** (pointer devices) + **tap** (touch); Esc/leave/tap-outside to close | Glance-and-go on desktop; tap is the touch fallback (no hover). |
| Content source | **Extend `AppManifest`** with an optional `overview` field | Keeps everything about a tool co-located + typed; 4 tools, so Firestore/CMS is overkill. |
| Assets | **Static**, curated, in `public/app-overviews/<id>/` | Swappable later; no pipeline needed for v0. |

## Data model

Extend `AppManifest` (`src/apps/types.ts`) with an optional field:

```ts
export interface AppOverview {
  /** Tighter than `description`, ~8–12 words; headline for the popover. */
  blurb: string;
  /** Source/"before" image path, e.g. /app-overviews/ad-resizing/before.webp */
  before: string;
  /** 1–6 "after"/output image paths. */
  after: string[];
}

// on AppManifest:
overview?: AppOverview;
```

Optional by design: `video-stitch` (preview) and any un-curated tool can omit it. When
`overview` is absent, the "More Info" button is **hidden** (not a dead no-op).

Each app sets its own `overview` in its `manifest.ts` (e.g. `ad-resizing/manifest.ts`).

## Component design

A new focused component **`AppInfoPopover`** (own file under `src/pages/` or a
`components/` sibling, following existing structure), consumed by `AppCard` inside
`DashboardPage.tsx`.

- **Anchor:** the existing "More Info" `<Button>`. Popover renders above it with a
  downward arrow; flips below if there's no room.
- **Open/close:**
  - Pointer: `mouseenter` on the button opens; `mouseleave` (button + popover) closes
    after a short grace delay (~120ms) so the cursor can travel into the popover.
  - Touch: `click`/tap toggles open; tap-outside or Esc closes.
  - Keyboard: button focus + Enter/Space toggles; Esc closes; focus returns to button.
- **Content:** `overview.blurb` as the heading line; a before→after row — `before`
  in a small rounded box (`object-fit: cover`), an arrow, then `after[]` as a compact
  grid of thumbnails. No interactive elements inside.
- **Positioning + dismissal:** reuse the Alli design system's popover/tooltip primitive
  if one exists (**verify during planning** — `@agencypmg/alli-design-system`); otherwise
  a small anchored-popover helper (Floating-UI-style: anchor rect + viewport flip).
- **ARIA:** button gets `aria-expanded` and `aria-describedby={popoverId}`; popover is
  a labelled region; not focus-trapped (it's informational, no controls).

`AppCard` change: render `AppInfoPopover` for the button when `manifest.overview` is
present; hide the button otherwise.

## Assets — curation criteria

Per tool, under `public/app-overviews/<appId>/`:

- **Count:** 1 `before.webp` + **3–6** `after-N.webp` (cutdown can be 1–2 afters).
- **Format:** WebP preferred (PNG/JPG acceptable).
- **Resolution:** long edge **240–480px** (~2× display); each **< 80KB**.
- **Aspect ratio:** native to the example — **do not pre-crop**; boxes use `object-fit:
  cover`, and varied after-aspects sell the "reformatting" story.
- **Content:** real, on-brand example creatives; avoid text-heavy images (illegible at
  thumbnail size).

## Testing

Unit (vitest + RTL):
- Opens on hover and on focus; closes on Esc, on mouse-leave (after grace delay), and on
  tap-outside.
- Renders `overview.blurb` and exactly `overview.after.length` output thumbnails from the
  manifest; renders the `before` image.
- When `manifest.overview` is absent, the "More Info" button is not rendered.
- ARIA: `aria-expanded` toggles; `aria-describedby` points to the popover id.

## Not in scope (v0)

- Animated / video demos (the "looping demo" visual option).
- The "+ 3-step how-it-works" strip (richer popover density).
- Firestore/CMS-editable copy or images.
- Wiring the dashboard's Ask-Alli prompt.
- Modal / slide-over / inline-expand surfaces (popover chosen).

## Open items for planning

- Confirm whether `@agencypmg/alli-design-system` ships a Popover/Tooltip primitive to
  reuse vs. hand-rolling the anchored-popover helper.
- File placement for `AppInfoPopover` (inline in `DashboardPage` vs. extracted component
  file) — lean toward an extracted file for testability.
