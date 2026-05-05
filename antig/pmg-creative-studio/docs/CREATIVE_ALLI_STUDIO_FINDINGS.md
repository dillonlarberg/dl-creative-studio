# Creative Alli Studio — Findings, Logic Flow & Architecture

**Date:** 2026-05-05
**Authors:** Annie Nguyen + Claude
**Status:** Active — prepared for proposal meeting

---

## 1. What We're Building

Creative Alli Studio is a performance creative automation platform that lets PMG media and strategy teams produce, batch, and iterate on ad creatives without needing a designer for every variation.

The core loop:
1. Pick a template (or an existing variant)
2. Define slot values (headline, CTA, image)
3. Generate every combination at every required size
4. Connect performance data back to the best-performing variants
5. Seed the next batch from winners

**The end state:** a non-creative PMG team member can go from brief to 180 production-ready variants in a single session — and the performance data from those variants informs the next brief automatically.

---

## 2. The Two-Path Model

The most important structural finding from the wireframing session: **there are two fundamentally different entry points**, and treating them the same breaks the UX.

### Create New (Template-First)
> "I have a campaign concept. I need to create ads from scratch."

1. Pick a template (or build one)
2. Fill slots: Headline, CTA, Image, etc.
3. Choose output sizes
4. Run batch generation (Cartesian product of all slot values × all sizes)
5. Review render progress
6. Review outputs, seed winning variants

**Defining characteristic:** slot content is unknown upfront. The user is composing the creative.

### Edit Existing (Asset-First)
> "I already have a rendered variant. I need it in more sizes — or want to tweak it."

1. Select an existing rendered variant (e.g. `RL_Summer_H2_C2_I3`)
2. Pick new output sizes — already-rendered sizes are grayed out
3. Confirm and generate
4. Download new sizes

**Defining characteristic:** the scene graph is locked. Slot content does not change. Only output dimensions change. No template selection. No slot filling. Faster, lighter flow.

### Why this matters for the build
These two paths should share zero UI between template selection and render. They diverge at the very first screen. The sidebar, topbar badge, and dashboard mini-apps section all reflect which path the user is on.

**Terminology is fixed:** "Create new" and "Edit existing" are used consistently across the UI, codebase (`EntryPath` type: `create-new` | `optimize-existing`), and all documentation. No "Path A / Path B" anywhere.

---

## 3. Mini-App Inventory

| App | Path | Status |
|-----|------|--------|
| Create Static Ad | Create New | Wireframed |
| Batch Generator | Create New | Wireframed |
| Resize to New Sizes | Edit Existing | Wireframed |
| Edit & Tweak | Edit Existing | Wireframe placeholder |
| Video Cutdown | Edit Existing | Wireframe placeholder |

---

## 4. Application Logic Flow

### 4.1 Create New — Full Path

```
Dashboard
  └── [Create Static Ad] or [Batch Generator]
        └── Template Picker
              Select template by brand / format / size
              └── Canvas Editor
                    Define slots: Headline, CTA, Image
                    Set slot values (manual or from data feed)
                    └── Batch Editor
                          Preview variant grid
                          (Slot Compare mode: pivot grid by one slot variable)
                          Confirm sizes
                          └── Render Progress
                                Live tile grid (Headline × Size combos)
                                Per-variant status: queued → rendering → done
                                Live log feed
                                └── Performance Feedback (after campaign runs)
                                      CTR / ROAS per variant
                                      Alli Insights recommendations
                                      Seed Batch → back to Batch Editor with winner slots
```

### 4.2 Edit Existing — Full Path

```
Dashboard
  └── [Resize to New Sizes] or [Edit & Tweak]
        └── Select Existing Variant
              e.g. RL_Summer_H2_C2_I3
              Shows current sizes already rendered
              └── Size Picker
                    Grayed out: sizes already rendered
                    Selectable: new sizes only
                    "Scene graph locked — slot content will not change"
                    └── Confirm + Generate
                          Source variant + new sizes summary
                          └── Download
                                New size renders
```

### 4.3 Variant ID Convention

Variants follow a structured naming pattern:

```
{Brand}_{Campaign}_{Headline}_{CTA}_{Image}
RL_Summer_H2_C2_I3
         │   │   └─ Image slot value index
         │   └───── CTA slot value index
         └───────── Headline slot value index
```

This makes variant lineage traceable through the batch, performance data, and re-seeding.

### 4.4 Batch Math

The batch engine runs a Cartesian product of all slot values across all sizes:

```
5 Headlines × 3 CTAs × 4 Images = 60 variants
60 variants × 3 sizes = 180 renders
```

The render progress view shows all 180 as a tile grid. Slot Compare mode in the batch editor lets you pivot: lock CTA and Image to a fixed value, compare all 5 Headlines side-by-side.

**On render failures:** if a subset of tiles fail (e.g. 12 of 180), only the failed tiles re-run. Users are never charged double compute for a partial failure in a large batch.

### 4.5 Performance Feedback Loop

```
Campaign runs on platform (Meta, Google, TikTok, etc.)
  └── CTR / ROAS / Impressions flow back into Alli
        └── Performance Feedback view surfaces:
              - Winner variant (highest CTR vs. baseline)
              - Full metric breakdown
              - Alli Insights: auto-recommendations ("H2 outperforms H1 by 2.1×")
              └── Seed Batch
                    Winner's slot values pre-fill the next batch
                    User adjusts and runs a new generation cycle
```

---

## 5. Wireframes Produced

All files live in `antig/pmg-creative-studio/docs/wireframes/`.

| File | What it shows |
|------|--------------|
| `dashboard.html` | Home screen, two-path mini-apps, active jobs, top performer |
| `template-picker.html` | Template selection grid, filter by brand/format/size |
| `canvas-editor.html` | Slot definition, per-layer editing, preview |
| `mini-app-create-static-ad.html` | Single-ad creation flow, 4 steps |
| `batch-editor.html` | Variant grid, slot configuration, size selection |
| `batch-editor-slot-compare.html` | Pivot view: compare one slot variable across columns |
| `render-progress.html` | Live 180-tile render grid, log, ETA |
| `performance-feedback.html` | CTR/ROAS by variant, Alli Insights, Seed Batch |
| `mini-app-resize-existing.html` | Asset-first resize flow, 4 steps, locked scene graph |
| `execution-plan.html` | Build phasing and milestones |
| `architecture-diagram.html` | Visual system architecture |

All wireframes share the same Alli design system tokens and both-path sidebar nav.

---

## 6. Current Tech Architecture (dev branch)

### 6.1 Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite 7 |
| Routing | React Router v7 |
| Styling | Tailwind CSS v4 |
| Auth | Firebase Auth (OIDC via Alli SSO) |
| Database | Firestore |
| File Storage | Firebase Storage |
| Backend | Firebase Cloud Functions (Node) |
| AI / Video | Gemini (video analysis), FFmpeg (cutdowns) |
| Alli API | Proxied via Cloud Functions (`/api/getMeProxy`, `/api/getClientsProxy`) |

### 6.2 Source Layout

```
src/
├── App.tsx                        # Route tree (5 routes)
├── apps/
│   ├── _registry.ts               # App plug-in registry (boot-time validated)
│   ├── types.ts                   # AppManifest, WizardStep, StepContext generics
│   └── template-builder/          # ✅ First fully-modular app
│       ├── manifest.ts            # 7-step definition
│       ├── steps.ts               # Barrel re-export
│       ├── steps/
│       │   ├── ContextStep.tsx    # Client + campaign context
│       │   ├── IntentStep.tsx     # What do you want to make?
│       │   ├── SourceStep.tsx     # Template or data source
│       │   ├── MappingStep.tsx    # Slot → feed field mapping
│       │   ├── GenerateStep.tsx   # Kick off render
│       │   ├── RefineStep.tsx     # Review outputs
│       │   └── ExportStep.tsx     # Download / push to Alli
│       ├── _internal/
│       │   ├── TemplatePreview.tsx
│       │   ├── FilledTemplatePreview.tsx
│       │   ├── injectIntoHtml.ts
│       │   ├── handlers.ts
│       │   └── baseline.ts
│       └── types.ts
├── platform/
│   ├── firebase/
│   │   └── paths.ts               # Single source of truth for all Firestore + Storage paths
│   ├── wizard/
│   │   ├── WizardShell.tsx        # Generic step runner (URL sync, validation, lifecycle)
│   │   └── usePersistedStepData.ts
│   └── client/
│       ├── ClientProvider.tsx
│       └── useCurrentClient.ts
├── pages/
│   ├── CreatePage.tsx             # Use case grid (landing)
│   ├── LoginPage.tsx
│   ├── ClientSelectPage.tsx
│   ├── ClientAssetHousePage.tsx
│   └── use-cases/
│       └── UseCaseWizardPage.tsx  # ⚠️ Legacy 4,311-line monolith (being replaced)
├── components/
│   ├── AppLayout.tsx              # Shell: sidebar, client switcher
│   ├── edit-image/                # Partially extracted (pre-registry pattern)
│   └── ...
├── services/
│   ├── auth.ts                    # Firebase OIDC
│   ├── alli.ts                    # Alli API proxy client + cache
│   ├── templates.ts               # Firestore: templates CRUD
│   ├── batches.ts                 # Firestore: batches + results sub-collection
│   ├── creative.ts                # Firestore: creatives CRUD
│   ├── clientAssetHouse.ts        # Firestore: brand assets per client
│   └── videoService.ts
└── types/index.ts                 # Shared domain types (UseCaseId, EntryPath, Client)
```

### 6.3 Firestore Data Model (target schema, already in paths.ts)

```
clients/{slug}
  └── (brand profile fields: colors, fonts, logo)
  ├── assets/{assetId}             ← brand assets
  └── apps/{appId}/
      ├── creatives/{creativeId}   ← drafts + completed runs
      ├── templates/{templateId}   ← template-builder app
      └── batches/{batchId}/
          └── results/{resultId}   ← per-variant render outputs
```

**Why this matters:** tenant isolation is enforced at the database path level, not just application-layer filtering. This fixes the SOC2 finding from the April architecture audit where all creatives from all clients lived in a single flat `creatives/` collection.

### 6.4 App Registry Pattern

Adding a new app (e.g. Batch Generator, Resize Existing) is a defined contract:

1. Create `src/apps/<id>/manifest.ts` implementing `AppManifest`
2. Define steps with `render`, `validate`, optional `onEnter` / `onLeave` / `next`
3. Register in `src/apps/_registry.ts` (one import + one entry)
4. Route auto-mounts at `/:clientSlug/<basePath>/*` via App.tsx

The registry validates at boot — duplicate `basePath` values or malformed slugs throw synchronously and prevent the app from starting.

### 6.5 WizardShell

`WizardShell.tsx` is the generic runtime all apps share. It handles:
- URL ↔ step index sync via `:stepId` URL param
- Step data persistence (Firestore-backed via `usePersistedStepData`)
- Lifecycle hooks: `onMount` once, `onLeave` / `onEnter` on navigation
- Validation before advancing
- Conditional step routing via `step.next()` (e.g. skip a step based on earlier input)
- Back / Next / Reset chrome

No app-specific logic lives in WizardShell. Apps are fully self-contained.

### 6.6 What's Built vs. What's Wireframed

| Feature | Dev Branch Status |
|---------|------------------|
| Firebase auth (Alli SSO) | ✅ Working |
| Client selector | ✅ Working |
| Client Asset House (brand standards) | ✅ Working |
| App registry + WizardShell runtime | ✅ Working |
| Template Builder app (7 steps) | ✅ In progress (modular refactor complete) |
| Tenant-isolated Firestore schema | ✅ paths.ts defined, services partially migrated |
| Batch Generator app | ❌ Wireframed, not built |
| Slot Compare mode | ❌ Wireframed, not built |
| Render Progress (live tile grid) | ❌ Wireframed, not built |
| Performance Feedback view | ❌ Wireframed, not built |
| Resize Existing asset-first flow | ❌ Wireframed, not built |
| Canvas Editor (Fabric.js) | ❌ Wireframed, not built |

### 6.7 Known Tech Debt

- `UseCaseWizardPage.tsx` (4,311 lines) is the legacy monolith still handling 7 of 8 apps. Active refactor is moving each app into the registry pattern. `template-builder` is the first to land.
- `services/creative.ts` still writes to the old flat `creatives/` collection. Needs migration to `clients/{slug}/apps/{appId}/creatives/`.
- `services/templates.ts` and `services/batches.ts` also use old flat collections — same migration needed.
- `functions/alliProxy.ts` has no tenant scoping on the proxy endpoints.

---

## 7. Proposed Build Sequence

**Phase 0 — Template Bootstrap (pre-work, before first sprint)**
- Creative team produces a small, high-quality set of base templates for the first 2–3 pilot clients (e.g. Ralph Lauren, SharkNinja)
- These templates seed the "Create New" path so the product is usable from day one
- Templates are owned and maintained by the creative team going forward; any PMG user can use them, only the creative team can publish new ones
- This eliminates the "no road for the car" risk before Phase 2 begins

**Phase 1 — Foundation + First End-to-End Proof (current)**
- Finish modular app registry + WizardShell ✅
- Migrate all services to tenant-isolated Firestore schema
- Ship Template Builder as first fully-modular app (Create New path)
- Ship Resize to New Sizes as first Edit Existing app — it has no Canvas Editor or batch engine dependency, validates the WizardShell pattern, and gives us a working end-to-end flow in both paths before Phase 2

**Phase 2 — Batch Engine**
- Batch Generator app (Create New path)
- Slot definition UI (Canvas Editor simplified)
- Render progress + worker queue (Cloud Tasks + Cloud Run renderer workers — architecture decision required before Phase 2 starts)
- Variant ID convention enforced in data model
- Failed-tile re-run: only failed renders re-queue, not the full batch

> **Scene graph format — read this before writing the batch function**
>
> The batch engine must use a **JSON scene graph** as its canonical template format, not HTML injection.
>
> `injectIntoHtml.ts` works for single-size fixed-template preview (Template Builder) but cannot support:
> - **Multi-size re-layout** — a 1:1 ad and a 9:16 ad are not just crops; layer positions, text wrapping, and proportions restructure per size. With HTML you need a separate template file per size. With a scene graph you define one layout with per-size override rules.
> - **Delta rendering** — if two variants differ only in headline text, a scene graph lets the renderer reuse the cached image layer composite and only re-render the text layer. HTML injection re-renders the full template for every variant every time, with no shared work across a batch.
>
> **What to build at the start of Phase 2, before the batch generator itself:**
> 1. Define a JSON scene graph schema — flat list of layers (type, position, size, slot binding, per-size overrides).
> 2. Write a one-time converter: existing HTML template → JSON scene graph. Existing templates migrate automatically with no manual rebuild.
> 3. The render worker consumes the JSON scene graph, not HTML. Slot values are injected into the scene at render time, not into the DOM.
>
> `injectIntoHtml.ts` stays untouched for Template Builder preview. It is not extended or reused in the batch engine.

**Phase 3 — Performance Loop**
- Performance Feedback view
- Alli API integration for CTR/ROAS ingest
- Seed Batch flow from winner variants
- Alli Insights CTAs pre-fill Batch Generator with constrained slot values

**Phase 4 — Edit Existing (remainder)**
- Edit & Tweak app
- Scene graph lock + delta rendering logic

**Phase 5 — Video**
- Video Cutdown app (Cloud Functions + FFmpeg partially implemented in `videoService.ts` — build resumes here)

---

## 8. External Review — Codex Verdict (2026-05-05)

Codex was given the full codebase, all wireframes, and the findings doc. Reviewed as expert SWE, FDE, and marketing strategist.

### Verdict
Proceed with Phase 0 + Phase 1 now. Hard freeze on Phase 2 until the scene graph/render format is locked. Earliest credible demo of both paths: **week of May 25, 2026** — one working Create new flow, one Resize existing flow, seeded templates, tenant-scoped services, and narrow/mocked rendering.

### SWE
- App registry + WizardShell is directionally right but has two gaps: `App.tsx` hard-codes the Template Builder route (bundle bloat at 10 apps), and `_registry.ts` statically imports only Template Builder (needs lazy routing at scale).
- WizardShell lacks persisted-data loading state and route guards.
- Firestore schema in `paths.ts` is the right tenant boundary but incomplete for SOC2 — rules currently allow any authenticated PMG user to access any client subtree. Missing: per-client membership claims, roles, audit logs, field validation, approval permissions, retention policy, tenant checks in Cloud Functions.
- **Phase 1 is actively blocked by service drift** — `creative.ts`, `templates.ts`, `batches.ts`, and `clientAssetHouse.ts` all write to flat legacy collections. Rules already default-deny those paths. Migration to `clients/{slug}/apps/{appId}/...` must happen before Phase 1 ships.
- Render infrastructure recommendation: **Cloud Tasks + Cloud Run**. One task per render tile, deterministic task IDs, idempotent worker, retry only failed tiles. Avoids Cloud Functions' 9-min timeout. Decide before Phase 2 architecture starts.
- HTML injection is not viable as the batch engine's canonical format (see scene graph decision above and Phase 2 callout).
- Auth: keep Firebase Auth through Phase 1. Add an auth adapter layer now so Clerk can replace it later without touching every service.

### Front-end / Design
- UX logic is internally consistent. Create new is slot/math heavy; Edit existing is correctly lighter.
- `mini-app-resize-existing.html` is the strongest wireframe — the asset-first banner, locked scene copy, and grayed-out sizes make the mental model clear.
- Missing demo states: empty template library, brand kit unavailable, slot validation failure, render failure state, performance-data-pending state, approval/review gate, cost/time confirmation before batch kicks off.
- First batch editor build priority: slot value entry, live Cartesian math display, output-size toggles, 12–20 virtualized preview cards, confirm callout, job creation, partial retry. That is the "I get it" moment. Slot Compare comes after.
- Expensive as designed: full canvas editor with layers/handles/AI copy, live 180-tile render grid, and performance insights panel. Scope these carefully for Phase 2.
- Design system is viable. Needs extension before build: status tokens, density rules, data grid patterns, progress/tile components, semantic app badges, focus states, modals, toasts, chart styles.
- Terminology bug: `types/index.ts` says `optimize-existing`; product language is `edit-existing`. Fix before the build expands.

### Marketing Strategy
- Core loop is right for a performance agency. Missing experiment discipline: hypothesis tagging, audience/placement metadata, spend-weighted performance, statistical confidence, baseline/control creative, fatigue windows, approval status, trafficking IDs.
- Variant ID (`RL_Summer_H2_C2_I3`) is the right machine key, wrong primary label. Show human-readable slot values first — `Up to 50% Off · Shop Now · Product Hero` — and surface the ID as a copyable technical reference.
- The Alli moat is real but only if used more deeply than competitors (Bannerflow, Celtra, Smartly, Marpipe). Justified if: prefilling from Alli campaign context, enforcing PMG/client brand rules, pushing assets back into Alli workflows, and measuring performance without manual joins.
- Daily usage comes from removing handoffs, not from a nicer canvas. Media strategists return for faster learning cycles: seed from winner, generate the next test, export with correct naming, preserve approvals, explain what changed.

### Top 3 project killers (Codex)
1. Switching from HTML injection to scene graph after Phase 2 starts — full rebuild.
2. Underestimating render queue, idempotency, and partial retry complexity.
3. Weak Alli performance data joins or latency making "seed from winner" feel fake.

### Single most important decision (Codex)
Lock the canonical template/scene graph format before writing more Phase 2 code. **Decided: JSON scene graph. See Phase 2 callout above.**

---

## 9. Claude's Verdict + Feedback (2026-05-05)

Reviewed as the author of this document and all wireframes, with full session context.

### Verdict
Proceed. The product thesis is strong and the two-path model is the right architectural spine. Phase 1 scope is correct and achievable by May 25 if the service migration is prioritized immediately. The scene graph decision is the right call and is now locked. The biggest non-technical risk is template supply — Phase 0 needs a committed owner on the creative team before Phase 1 sprint starts.

### What's strong
- **The Alli closed loop is the real differentiator.** No third-party tool can close the brief → batch → campaign → performance → next batch cycle without owning the platform. This is the argument to lead with in every stakeholder conversation.
- **The two-path model is clean and defensible.** "Create new" and "Edit existing" diverge at the first screen for good reason. Keep resisting any pressure to merge them into one flow with a toggle.
- **The app registry + WizardShell pattern is the right long-term investment.** Each new mini-app is one folder + one registry entry. The overhead is front-loaded; the payoff compounds as apps are added.
- **Resize to New Sizes is the right Phase 1 proof.** It has no Canvas Editor or batch engine dependency, it validates WizardShell in the Edit existing path, and it ships something real in both paths before Phase 2 commits to the heavy machinery.

### What needs attention
- **Service migration is the immediate blocker.** Nothing else in Phase 1 ships until `creative.ts`, `templates.ts`, `batches.ts`, and `clientAssetHouse.ts` are writing to `clients/{slug}/apps/{appId}/...`. This is the first PR of Phase 1.
- **The `optimize-existing` → `edit-existing` rename** in `types/index.ts` is a 5-minute fix that should happen before the Edit existing path is built. Terminology drift between code and product language creates confusion as the team grows.
- **Empty and error states are missing from the wireframes.** The demo will hit them. The dashboard with zero jobs, the template picker with no templates, and a failed render tile are all states that need to be designed before the batch engine is built — not after.
- **Auth adapter layer before Clerk migration.** The Firebase → Clerk migration should not touch every service. An adapter wrapping `auth.ts` now means the migration is a one-file swap later.
- **Alli Insights CTAs need a defined destination.** The Performance Feedback wireframe shows "Create urgency-first batch →" as a CTA but the destination is unspecified. If it pre-fills the Batch Generator, the loop is closed. If it goes to a blank form, the insight was decorative. This needs to be decided before the Performance Feedback view is built.

### What I'd do first (in order)
1. Rename `optimize-existing` → `edit-existing` in `types/index.ts` — 5 minutes, clears technical debt before it spreads.
2. Migrate all four services to tenant-isolated paths — Phase 1 is blocked without this.
3. Confirm Phase 0 template owner on the creative team — product is unusable without seed templates.
4. Define the JSON scene graph schema (even a draft) — Phase 2 architecture depends on it.
5. Design the 3 critical missing states: empty dashboard, empty template picker, failed render tile.

---

## 10. Open Questions for the Meeting

1. **Render infrastructure:** Where do renders actually run? Cloud Functions have a 9-min timeout — batch jobs of 180 renders need a job queue (Cloud Tasks, BullMQ on Cloud Run, or similar). Decision required before Phase 2 starts.
2. **Template format: DECIDED — JSON scene graph from the start.** The Batch Generator will use a JSON scene graph as its canonical format, not HTML injection. Phase 2 will include a one-time converter that takes the existing HTML templates and produces a simple JSON layer list. This pays a small upfront cost to avoid a full rebuild if multi-size re-layout or delta rendering is needed later. `injectIntoHtml.ts` stays in place for the Template Builder preview (it already works there) but is not extended into the batch engine. See below for full rationale.
3. **Auth migration:** Firebase Auth (current) vs. Clerk (planned). Does this block Phase 1 or can it land in parallel?
4. **Who owns the Alli API proxy?** The current `getMeProxy` / `getClientsProxy` in Cloud Functions — is this the right long-term pattern or should the frontend call Alli Central directly with the user's token?
5. **Alli performance data latency:** Deferred — to be confirmed with the Alli data team before Performance Feedback view is specced out in Phase 3.
