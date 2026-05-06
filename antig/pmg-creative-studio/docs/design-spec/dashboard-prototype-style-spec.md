# Dashboard Prototype — Alli Platform Style Spec

**Subject:** `html_prototypes/dashboard (1).html`
**Goal:** Align the Alli Studio dashboard prototype with the live Alli platform UI (`app.alliplatform.com`), ignoring content differences and focusing only on design / UI / UX parity.

**Sources of truth (in priority order):**
1. **Canonical tokens** — `src/index.css` (Tailwind `@theme` block — the platform's actual theme)
2. **Platform screenshots** — `app.alliplatform.com/client/apple_services/home` reference shots (provided by user)
3. **AppLayout.tsx** — for sidebar nav patterns

---

## Discrepancy Audit

| # | Area | Prototype (current) | Platform (target) | Severity |
|---|---|---|---|---|
| 1 | **Font family** | `Nunito Sans` | `Inter` (per `src/index.css`) | High — wrong typeface across entire app |
| 2 | **Module-card pattern** | Section title floats above bare cards on page-bg | Each section is wrapped in a white outer container card; title + content live inside | **Critical** — defining structural pattern of the platform |
| 3 | **Header logo size** | 22px tall | ~32–36px tall, more presence | Medium |
| 4 | **Sidebar active state** | Tinted bg + 3px left accent bar | Tinted bg only (no left bar) | Medium |
| 5 | **Sidebar icon size** | 20px | ~22–24px | Low |
| 6 | **Card shadows** | `0 1px 2px rgba(15,23,42,0.04)` (very faint) | `0 1px 3px rgba(0,0,0,0.1), 0 1px 2px -1px rgba(0,0,0,0.1)` (canonical `--shadow-card`) | Medium |
| 7 | **Brand wash gradient** | `rgba(12,105,234,0.07)` at top, fades over 320px | `rgba(12,105,234,0.10)` → `rgba(238,241,247,0.05)` over 300px (canonical) | Low |
| 8 | **Border color** | `#E5E7EB` (gray-200) — already correct | `#E5E7EB` | ✅ matches |
| 9 | **Primary blue** | `#0C69EA` | `#0C69EA` | ✅ matches |
| 10 | **Body text contrast** | Mixed (`--text-body` = #4B5563, `--text-muted` = #6B7280) | Platform uses `gray-800` / `gray-600` / `gray-500` consistently | Low — close enough |
| 11 | **Inner subcards within module** | N/A — no nesting today | KPI / item subcards live inside outer module card with thin border | Tied to #2 |
| 12 | **Stat-card icon badge** | 28×28 colored square | 28×28 with very subtle bg, icon larger — close, refine slightly | Low |
| 13 | **Job-card left accent bar** | 3px stripe | Platform "Calendar"-style rows use 4px accent | Low |
| 14 | **Section title weight** | 700 | Platform card titles ~600/700, slightly smaller (15–16px) | Low |
| 15 | **Stat value treatment** | All `--text-primary` (good) | Same | ✅ |
| 16 | **App-card hover** | `translateY(-1px)` + shadow | Platform doesn't translate on hover, just border + shadow | Low |
| 17 | **Page bg saturation** | `#EEF1F7` | `#EEF1F7` ish — visually matches | ✅ |
| 18 | **Coming-soon strip** | Dashed border | Platform uses solid borders consistently — convert to solid + muted bg | Low |

---

## Style Spec — Canonical Values

### Typography

```css
--font-sans: 'Inter', system-ui, -apple-system, sans-serif;
```

| Token | Use | Size | Weight | Color |
|---|---|---|---|---|
| `module-title` | Card / module heading | 16px | 500 | `gray-900` |
| `module-subtitle` | Card lede | 13px | 400 | `gray-500` |
| `stat-label` | KPI label | 13px | 500 | `gray-800` |
| `stat-value` | KPI number | 28px | 500 | `gray-900` |
| `app-card-name` | App card title | 16px | 500 | `gray-900` |
| `body` | Default body | 14px | 400 | `gray-600` |
| `meta` | List meta / timestamps | 12px | 400 | `gray-500` |

> Note: there is no page H1 — the dashboard opens straight into the Snapshot module card. The greeting and run-of-the-mill page lede pattern is dropped intentionally to match the platform's denser modules-first layout.

### Surfaces

| Token | Hex | Use |
|---|---|---|
| `--page-bg` | `#EEF1F7` | App page background |
| `--surface` | `#FFFFFF` | All card surfaces (outer + inner) |
| `--surface-alt` | `#F9FAFB` (`gray-50`) | Subtle muted surface (coming-soon, etc) |

### Borders

| Token | Hex | Use |
|---|---|---|
| `--border` | `#E5E7EB` (`gray-200`) | All idle card borders |
| `--border-hover` | `#C5D9FB` (`blue-200` ish) | Hover border on interactive cards |
| `--border-strong` | `#D1D5DB` (`gray-300`) | Heavier dividers |

### Radii

- `--radius-sm`: 6px (badges, buttons)
- `--radius`: 8px (small surfaces, icon badges)
- `--radius-lg`: 12px (all cards — outer module + inner subcards)

### Shadows (canonical, from `src/index.css`)

- `--shadow-card`: `0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)` — module cards default
- `--shadow-elevated`: `0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)` — hover

### Brand wash

```css
linear-gradient(
  to bottom,
  rgba(12, 105, 234, 0.10) 0%,
  rgba(238, 241, 247, 0.05) 300px,
  transparent 100%
);
```

---

## Component patterns

### Module Card (outer container)

The structural unit of the platform. Every section on the dashboard is wrapped in one.

```
.module-card {
  background: #FFFFFF;
  border: 1px solid #E5E7EB;
  border-radius: 12px;
  box-shadow: var(--shadow-card);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.module-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.module-title  { font-size: 16px; font-weight: 700; color: gray-900; }
.module-subtitle { font-size: 13px; color: gray-500; margin-top: 2px; }
```

### Subcard (inside module card)

KPI cards, job rows, asset tiles when nested in an outer module.

```
.subcard {
  background: #FFFFFF;
  border: 1px solid #E5E7EB;
  border-radius: 12px;
  padding: 16–20px;
}
```

Inner subcards live on white-on-white inside the module card; they rely on border alone for separation (no shadow).

### Icon badge

```
.icon-badge {
  width: 28px; height: 28px;
  border-radius: 8px;
  display: inline-flex; align-items: center; justify-content: center;
}
.icon-badge svg { width: 16px; height: 16px; }
```

Tints: blue / amber / green / coral / violet / cyan — mirror platform's "Executive Summary / Last 24 Hours / Last 7 Days / Implications" treatment.

### Sidebar nav

- Rail: 64px wide
- Nav buttons: 40×40, radius 8
- Active: bg `blue-50` (#EFF6FF), color `blue-600` — **no left accent bar**
- Disabled: color `gray-300`, pointer-events none
- Tooltip on hover: bg `gray-900`, color white, 12/500

### Header banner

- Height 56px
- Logo: 28–32px tall, sits in 64px slot above sidebar rail
- 1px × 32px divider after logo, then client name + Change button
- Right cluster: help / notifications / avatar

---

## Layout rules

- Page padding: `32px 36px 40px`
- Page max-width: 1440px, centered
- **Section gap (between module cards): 16px** (was 24px)
- Two-column split for mid-page: `1fr 360px`, gap 16px

---

## Migration summary

The single biggest visual lift is **wrapping every section in `.module-card`** so titles + content live inside a white container instead of floating above bare cards. This is the dominant structural pattern of the platform and converting to it will instantly read as "Alli native."

Secondary: switch font to Inter, beef up logo size, drop sidebar left-bar accent, upgrade shadows to canonical `--shadow-card`.

Everything else is incremental polish.

---

## Round 2 — Weight & Spacing Calibration (Inter retune)

**Issue:** Inter renders noticeably heavier than Nunito Sans at the same numeric weight. After the Round 1 font swap, side-by-side screenshots against the live Alli platform showed the prototype's typography reading as bolder/blockier than the platform across the board. The platform clearly trends 500–600 for emphasis (and even lighter for hero featured numbers in some surfaces).

**Fix:** Drop every weight one notch (700 → 600, 600 → 500, 800 → 600), and reduce a couple of negative letter-spacing values that were tuned against Nunito's wider glyphs.

### Selectors changed

| Selector | Property | Before | After |
|---|---|---|---|
| `.page-title` | `letter-spacing` | `-0.4px` | `-0.3px` |
| `.module-title` | `font-weight` | `700` | `600` |
| `.section-title` | `font-weight` | `700` | `600` |
| `.stat-label` | `font-weight` | `600` | `500` |
| `.stat-value` | `font-weight` | `700` | `600` |
| `.stat-value` | `letter-spacing` | `-0.5px` | `-0.3px` |
| `.app-card-name` | `font-weight` | `700` | `600` |
| `.app-card-name` | `letter-spacing` | `-0.2px` | `-0.15px` |
| `.job-name` | `font-weight` | `600` | `500` |
| `.perf-stat-val` | `font-weight` | `700` | `600` |
| `.perf-stat-val` | `letter-spacing` | `-0.3px` | `-0.2px` |
| `.asset-more-num` | `font-weight` | `800` | `600` |
| `.progress-pct` | `font-weight` | `700` | `600` |
| `.badge` | `font-weight` | `700` | `600` |

Unchanged (already correct): `.perf-name` (600), `.platform-client-name` (600), `.platform-change` (600), `.coming-tag` (600), `.btn` / `.btn-primary` (500), `.app-card-coming-title` (600).

---

## Round 3 — Drop another notch + remove page H1

**Issue:** Round 2 still read as too bold side-by-side with the platform. Inter at 600 carries more visual heft than the platform's emphasis.

**Fix:**
- **Sweeping reduction:** every remaining `font-weight: 600` in the prototype dropped to `font-weight: 500` (medium). This brings module titles, stat values, app-card titles, perf stats, badges, progress percentages, asset names, and platform header labels all to medium weight — matching the platform's quieter typographic register. The only weights left in the file are 500 (medium) and 400 (regular).
- **Removed page-header block:** dropped the `Good Afternoon, Annie!` greeting and `3 batch jobs in flight · 847 live variants for Ralph Lauren` lede entirely. The dashboard now opens straight into the Snapshot module card. The date-range selector and `New Batch Job` button were preserved and right-aligned in a new `.page-actions` row above the first module.
- Removed `.page-header`, `.page-title`, `.page-subtitle` CSS rules; replaced with `.page-actions { display: flex; justify-content: flex-end; gap: 10px; }`.

