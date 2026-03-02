# Alli Design System — Reference Guide

> **Source:** `alli-frontend-design-system` repo (cloned locally)
> **Stack:** React 17 + Tailwind 3 + TypeScript
> **CSS Prefix:** `alli-` (all Tailwind classes use this prefix)

---

## Design Principles

1. **Consistency and Coherence** — unified visual language and brand identity
2. **Efficiency and Reusability** — modular, pre-built components
3. **Collaboration and Communication** — shared language between design/dev teams

---

## Color System

- **Primary:** Blue-600 (`#0C69EA`) — used for primary buttons, links, active states
- **Neutrals:** Blue-gray scale — used for text, borders, backgrounds
- **Caution/Alerts:** Red — restricted to destructive actions and error states
- **Background gradient:** `brand-gradient` — subtle blue-to-light gradient overlay
- **Guidance:** Use neutrals/blue-gray as much as possible, let bright colors "pop"

### Color References from Components
| Usage | Class | Likely Hex |
|-------|-------|------------|
| Primary button bg | `alli-bg-blue-600` | `#0C69EA` |
| Primary button hover | `alli-bg-blue-500` | lighter blue |
| Primary button active | `alli-bg-blue-700` | darker blue |
| Secondary text | `alli-text-blue-gray-750` | dark blue-gray |
| Disabled bg | `alli-bg-gray-300` | light gray |
| Disabled text | `alli-text-gray-600` | medium gray |
| Caution | `alli-text-red-400`, `alli-ring-red-400` | red |
| Body text | `alli-text-gray-800` | dark gray |
| Step complete | `alli-bg-blue-600` | primary blue |
| Step upcoming | `alli-border-gray-700` | dark gray border |
| Background | `alli-bg-white` | white |

---

## Typography

- **Text size:** `alli-text-sm` is default for most UI elements
- **Font weight:** `alli-font-medium` for buttons and interactive elements
- **Font family:** Inherited from `@agencypmg/tailwindcss-config` (not accessible directly without npm install)

---

## Available Components (43 total)

| Component | Key Props/Variants | Use in Our Tool |
|-----------|-------------------|-----------------|
| **Button** | primary, secondary, tertiary, caution, text, text-secondary | All CTAs |
| **Steps** | complete, current, upcoming, disabled | **Wizard/process flow** ⭐ |
| **Modal** | ContentModal, align, variant | Confirmations, previews |
| **Tabs** | — | Use case switching |
| **Form elements** | Input, Checkbox, RadioGroup, RadioLargeCards, RadioSmallCards, SelectMenus, Toggle | All forms |
| **AiPrompt** | — | **AI interaction** ⭐ |
| **Alert** | — | Status messages |
| **Badge** | — | Status indicators |
| **Spinner/Loading** | CenterSpinner, LoadingStars | Loading states |
| **Drawer** | — | Side panels |
| **Accordion** | — | Collapsible sections |
| **Table** | Tanstack-based | Data display |
| **Pagination** | — | Result browsing |
| **Tooltip** | NestedTooltips | Help text |
| **Popover** | ConfirmPopover | Inline confirmations |
| **SideNav** | SecondarySideNav | Navigation |
| **PageHeader** | — | Page titles |
| **Breadcrumbs** | — | Navigation path |
| **Avatar/Gravatar** | UserInitial | User identification |
| **Empty** | — | Empty states |
| **DatePicker/Calendar** | — | Date selection |
| **Tree** | — | Hierarchical data |
| **WaveAnimation** | — | Branding animation |

---

## Key Technical Details

| Aspect | Detail |
|--------|--------|
| **Tailwind prefix** | `alli-` (e.g., `alli-bg-blue-600`) |
| **Design tokens** | `@agencypmg/tailwindcss-config` (private npm package) |
| **Icons** | `@heroicons/react` (Heroicons v2) |
| **Headless components** | `@headlessui/react` v1 |
| **Class utilities** | `clsx` + `tailwind-merge` via custom `cn()` function |
| **Forms** | `react-hook-form` |
| **Tables** | `@tanstack/react-table` |
| **Drag & Drop** | `@dnd-kit/core` + `@dnd-kit/sortable` |
| **Tooltips/Popovers** | `@floating-ui/react` |

---

## Implications for Our Build

1. **Use React** — the design system is React-based, so our tool should be too
2. **Use Tailwind 3** — with the `alli-` prefix for consistency
3. **Leverage existing components** — Steps, Button, Modal, Form, AiPrompt are all directly usable for our wizard flow
4. **Steps component is perfect** — it maps exactly to our process-oriented flow (complete → current → upcoming)
5. **AiPrompt component exists** — purpose-built for AI interactions within Alli
6. **We can reference color patterns** even without the full token set — Blue-600 as primary, blue-gray for neutrals
