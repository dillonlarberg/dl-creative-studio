---
name: Creative Alli Studio
description: Template-based ad creative builder for PMG media strategists
colors:
  brand-blue: "#0C69EA"
  brand-blue-deep: "#0b5ed4"
  campaign-slate: "#2D3142"
  slate-mid: "#42485C"
  slate-muted: "#6F768B"
  slate-border: "#CCD2DD"
  surface-bg: "#EEF1F7"
  surface-wash: "#F4F7FC"
  surface-canvas: "#F9FBFE"
  body-text: "#1f2937"
  success: "#16a34a"
  warning: "#f59e0b"
  error: "#ef4444"
  ai-accent: "#9333ea"
typography:
  display:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "normal"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.2em"
    textTransform: "uppercase"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.5625rem"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "0.2em"
    textTransform: "uppercase"
  micro:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.4375rem"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "0.3em"
    textTransform: "uppercase"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.brand-blue}"
    textColor: "#ffffff"
    rounded: "{rounded.lg}"
    padding: "12px 32px"
    typography: "{typography.label}"
  button-primary-hover:
    backgroundColor: "{colors.brand-blue-deep}"
  button-secondary:
    backgroundColor: "#ffffff"
    textColor: "{colors.body-text}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.slate-muted}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
  input:
    backgroundColor: "#ffffff"
    textColor: "{colors.body-text}"
    rounded: "{rounded.md}"
    padding: "6px 10px"
  chip-active:
    backgroundColor: "{colors.brand-blue}"
    textColor: "#ffffff"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  chip-inactive:
    backgroundColor: "transparent"
    textColor: "{colors.slate-muted}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  badge-success:
    backgroundColor: "#f0fdf4"
    textColor: "#15803d"
    rounded: "{rounded.sm}"
    padding: "2px 6px"
  badge-warning:
    backgroundColor: "#fffbeb"
    textColor: "#b45309"
    rounded: "{rounded.sm}"
    padding: "2px 6px"
---

# Design System: Creative Alli Studio

## 1. Overview

**Creative North Star: "The Campaign Desk"**

This is a purpose-built workspace, not a consumer product. The people using it are PMG media strategists — they manage live campaigns, they're accountable for performance, and they have 15 minutes to map a feed and generate 200 ads before a client review. Every element on screen answers to that constraint: it earns its place or it's gone. Nothing is decorative. Nothing explains itself twice.

The aesthetic philosophy is compressed utility. Text is small because there's a lot of information and the user is a professional who can read it. Color is restrained — the brand blue fires once, on the thing you're supposed to do next. Neutrals carry everything else. The surface feels like the Alli 360 dashboard: familiar, controlled, data-forward.

This system explicitly rejects the approaches named in PRODUCT.md: Canva's playfulness (rounded-everything, bright illustrations, drag-and-drop playground energy), Google Ads UI's density-without-hierarchy (gray on gray, too many tabs, no clear path forward), and Figma's technical aesthetics (dark mode, component annotations, "designed for designers" signals). The target is someone who runs ad ops, not someone who crafts UI.

**Key Characteristics:**
- Single blue accent, used sparingly — its rarity is the signal
- Blue-gray neutrals everywhere else (the Alli palette, not generic Tailwind grays)
- All-caps Inter with wide tracking for every label and section header
- Flat surfaces at rest; shadow only for primary containers
- Micro typography (7–10px) is the dominant scale — this is a mapping tool, not a reading experience

## 2. Colors: The Campaign Palette

A restrained system built around one assertive blue and a family of blue-tinted grays. The palette is deliberate: blue-gray reads as "Alli data surface," pure gray reads as "generic app," and the distinction matters for brand coherence.

### Primary
- **Alli Campaign Blue** (`#0C69EA` / `blue-600`): The single primary accent. Used on CTAs, focus rings, active states, progress indicators, and any UI element that indicates "this is the next action." Nowhere else.
- **Campaign Blue Deep** (`#0b5ed4` / `blue-700`): Hover and pressed state for the primary button only.

### Neutral (Blue-Gray Family)
- **Campaign Slate** (`#2D3142` / `blue-gray-800`): Primary dark surface. Zone inspector headers, dark panels, high-contrast labels. The brand's "black."
- **Slate Mid** (`#42485C` / `blue-gray-700`): Secondary dark text on light surfaces.
- **Slate Muted** (`#6F768B` / `blue-gray-500`): Tertiary text, disabled labels, helper copy.
- **Slate Border** (`#CCD2DD` / `blue-gray-200`): Dividers, input borders, card borders at rest.
- **Surface Background** (`#EEF1F7` / `blue-gray-100`): Subtle section backgrounds, hover states on rows.
- **Surface Wash** (`#F4F7FC` / `blue-gray-50`): Page-level background on most screens.
- **Surface Canvas** (`#F9FBFE` / `blue-gray-25`): The lightest surface — template preview containers, elevated cards.

### Semantic
- **Success Green** (`#16a34a` / `green-600`): Mapped zones, confirmed states, progress completion.
- **Warning Amber** (`#f59e0b` / `amber-500`): Unmapped required fields, overflow detection, pre-flight issues.
- **Error Red** (`#ef4444` / `red-500`): Destructive actions, validation failures.
- **AI Purple** (`#9333ea` / `purple-600`): Ask Alli surfaces, AI-suggested mappings, AI source mode.

### Named Rules

**The One Blue Rule.** `#0C69EA` appears on ≤10% of any screen. Every additional use of the primary blue dilutes the signal. When everything is blue, nothing is an action.

**The Blue-Gray Rule.** Use the PMG blue-gray scale for neutrals, not standard Tailwind gray. `blue-gray-100` and `gray-100` look similar but the blue tint keeps the surface in the Alli brand family. Prefer `blue-gray-*` for any surface, border, or muted text.

**The Semantic Ceiling Rule.** Green, amber, and red are status indicators only. They are never used for decorative purposes, category labeling, or branding elements outside their assigned semantic role.

## 3. Typography

**Display / Body Font:** Inter (300, 400, 500, 600, 700, 900)

**Character:** A single-family system — no display face, no serif, no mono. Inter's neutral humanist proportions carry authority without affectation. The personality comes entirely from weight, case, and tracking: ultra-compressed all-caps labels at 7–10px sit alongside comfortable 14px body text, and the contrast between them creates the hierarchy.

### Hierarchy

- **Display** (semibold 600, 1.5rem / 24px): Page and section titles in the wizard shell. Rare — one per screen.
- **Title** (black 900, 10px, uppercase, tracking-[0.2em]): Section headers in panels, form group labels, button text in CTAs. The dominant label pattern.
- **Body** (regular 400–medium 500, 14px / sm, line-height 1.5): Field descriptions, helper text, prose. The baseline text size for non-label content.
- **Label** (black 900, 9px, uppercase, tracking-[0.2em]): Sub-section headers inside cards, field names in the mapping panel, zone identifiers. The most-used text style in the template builder.
- **Micro** (black 900, 7px, uppercase, tracking-[0.3em]): Type badges (`TEXT` / `IMAGE`), status chips, very compressed metadata. Used only when space is genuinely constrained.

### Named Rules

**The All-Caps Lock Rule.** Section headers, button labels, and field labels are always uppercase Inter with `tracking-[0.2em]` or wider. Sentence-case Inter at small sizes reads as generic app UI. The tracking is what makes 9px text legible and purposeful rather than just small.

**The Scale Contract.** The type scale is: 7px / 9px / 10px / 12px / 14px / 24px. These are the only font sizes in the product. Arbitrary intermediate sizes (`text-[11px]`, `text-[13px]`) signal that a new component is drifting from the system.

## 4. Elevation

Flat-by-default. Surfaces are white or blue-gray toned at rest; depth is expressed through the blue-gray tonal ramp (lighter surfaces float above darker ones), not through shadows. Shadows appear only on primary containers and modals — structural depth, not decorative layering.

### Shadow Vocabulary

- **Card** (`0 1px 3px rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)`): The primary container shadow. Appears on the main content card, the preview panel, the inspector card. One use: "this surface holds the primary content for this view."
- **Elevated** (`0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)`): Dropdowns, tooltips, popovers — anything that floats above the base surface temporarily.
- **Modal** (`0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)`): Full-overlay dialogs only.

### Named Rules

**The Flat-By-Default Rule.** Surfaces are flat at rest. The shadow-card appears exactly once per viewport — on the container that holds the primary working area. A zone inspector card that uses shadow-card inside a page that already has a shadow-card container creates two "primary" surfaces, which breaks the hierarchy.

## 5. Components

### Buttons

Buttons are declarative: their text tells you exactly what will happen. No icon-only primary buttons. No gradient fills.

- **Shape:** Large rounded corners (12px / rounded-xl) on primary CTAs; medium (6px / rounded-md) on secondary and inline actions.
- **Primary:** `bg-blue-600` + `text-white` + `px-8 py-3` + `text-[10px] font-black uppercase tracking-[0.2em]` + `shadow-xl`. The shadow on the primary button is the only decorative shadow in the system — it lifts the CTA off the page.
- **Hover / Focus:** `bg-blue-700` on hover; `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600` for keyboard focus.
- **Secondary / Outlined:** `bg-white` + `ring-1 ring-inset ring-gray-300` + `text-gray-900` + `rounded-md`. Used for secondary actions alongside a primary.
- **Ghost:** `text-gray-400` + `border border-gray-200` + `rounded-xl` + `hover:bg-gray-50`. For destructive-adjacent or low-priority actions ("Cancel", "Save & Exit").
- **Disabled:** `opacity-20 cursor-not-allowed grayscale bg-gray-400`. Hard visual stop — no ambiguity about interactivity.

### Chips / Toggle Pills

Used for source mode selection (Static / Feed / AI) and ratio/variant pickers.

- **Active:** `bg-blue-600 text-white border-blue-600 rounded-full`. Or `bg-purple-600 text-white` for AI mode.
- **Inactive:** `border-gray-200 text-gray-400 bg-white rounded-full`. Transitions smoothly: `transition-all`.
- **Size:** `px-2.5 py-0.5 text-[8px] font-semibold` — compact, readable at a glance.

### Cards / Containers

- **Primary Container:** `bg-white rounded-xl border border-gray-200 shadow-card p-6`. One per view.
- **Section Panel:** `bg-gray-50 rounded-xl border border-gray-100 p-3 space-y-2.5`. Subsections within a primary container.
- **Alert / Issue Panel (Warning):** `bg-amber-50 border border-amber-200 rounded-xl p-2.5`. Pre-flight issues, validation warnings.
- **Selected Row:** `bg-blue-50 rounded-xl px-2.5 -mx-2.5`. Inline row selection inside lists — no card border, just a background shift.

### Inputs / Fields

- **Style:** `border border-gray-200 rounded-lg bg-white text-[10px] font-medium text-gray-800 px-2.5 py-1.5`.
- **Focus:** `focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10`. A tight, visible ring — no harsh outline. The focus state is always the brand blue.
- **Label above input:** `text-[9px] font-semibold text-gray-400 uppercase tracking-wider`.
- **Error:** `border-red-400 focus:ring-red-500/10`.
- **Select / Grouped Column Picker:** Uses `<optgroup>` with group labels. Same border/focus treatment as text inputs.

### Status Badges

Inline status indicators for field mapping state and zone coverage.

- **Mapped / Success:** `bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20 rounded-md px-2 py-0.5 text-[9px] font-bold`.
- **Warning / Unmapped:** `bg-amber-50 text-amber-700 border border-amber-200 rounded-md px-2 py-0.5 text-[9px] font-bold`.
- **AI Suggested:** `bg-purple-100 text-purple-700 rounded-full px-1.5 py-0.5 text-[7px] font-black uppercase tracking-widest`.

### Zone Inspector (Signature Component)

The floating panel that appears when a custom canvas zone is selected. Positioned relative to the zone's bounding box (above if room, below if not). Dark header using Campaign Slate (`#2D3142`), white body, `shadow-xl`. Width: 284px fixed. Tabbed source selection (Static / Feed / AI for text zones; URL / Feed / My Uploads for image zones). Feed preview badge uses blue-50 background.

### Stepper / Wizard Progress

- **Current step:** `h-8 w-8 rounded-full border-2 border-blue-600 bg-white` with inner `h-2.5 w-2.5 rounded-full bg-blue-600`.
- **Complete step:** `h-8 w-8 rounded-full bg-blue-600 hover:bg-blue-700`.
- **Connector line:** `bg-blue-600` (complete) / `bg-gray-300` (upcoming). Animated: `transition-all duration-500`.

## 6. Do's and Don'ts

### Do:

- **Do** use `#0C69EA` as the single interactive blue. Use it for CTAs, focus rings, active tabs, progress fills, and nothing else.
- **Do** use Inter black (900) with uppercase and `tracking-[0.2em]` for every section header, field label, and button. This is the signature typographic treatment of the Alli dashboard.
- **Do** use the blue-gray scale (`blue-gray-*`) for all neutral surfaces, borders, and muted text instead of standard gray. The blue tint is the Alli brand marker.
- **Do** use the three-tier shadow vocabulary exactly as assigned: `shadow-card` for primary containers, `shadow-elevated` for floating overlays, `shadow-modal` for full-screen dialogs.
- **Do** use semantic colors for their assigned roles: green for success/mapped, amber for warning/unmapped, red for errors, purple exclusively for AI features (Ask Alli, AI-suggested values).
- **Do** keep type at the established scale (7 / 9 / 10 / 12 / 14 / 24px). Every size has a purpose; intermediate values signal a new component drifting from the system.
- **Do** use `rounded-xl` on primary containers and CTAs; `rounded-lg` on inputs; `rounded-full` on pills and chips.

### Don't:

- **Don't** make it feel like Canva. No rounded corners on everything, no bright illustration-style icons, no drag-and-drop playground affordances, no playful microcopy. This is a production tool for professionals.
- **Don't** make it feel like Google Ads UI. No gray-on-gray density, no tabs-inside-tabs, no wall of dropdowns without hierarchy. Every screen needs a clear "next action."
- **Don't** make it feel like Figma. No dark mode defaults, no technical overlay language ("component / variant / token"), no designer-tool chrome. Users are not designing; they are mapping.
- **Don't** use `border-left` or `border-right` greater than 1px as a decorative accent stripe on cards or list items. Replace with background tint or full border.
- **Don't** use gradient text (`background-clip: text`). Decorative, not meaningful.
- **Don't** use the primary blue on more than two elements per screen. If a third element needs emphasis, use weight and case instead of color.
- **Don't** use shadow-card inside a container that already has shadow-card. One structural shadow per viewport.
- **Don't** add motion for its own sake. Transitions exist for state changes (hover, focus, expansion, progress). No entrance animations, no scroll choreography.
- **Don't** use purple for anything other than Ask Alli and AI-generated content. Purple is the AI signal; diluting it breaks the mental model.
- **Don't** use arbitrary font sizes outside the established scale (7 / 9 / 10 / 12 / 14 / 24px).
