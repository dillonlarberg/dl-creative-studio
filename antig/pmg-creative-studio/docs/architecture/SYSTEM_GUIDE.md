# pmg-creative-studio — System Guide

> A guide for the primary dev. Read this to build a deep mental model of the
> system: what the business logic actually *is*, where it lives today, how a
> mature PMG frontend (`alli-frontend-marketplacev2`) organizes the same kind
> of code, and the concrete path to get there.
>
> Written 2026-05-29. Companion to the refactor tracked in GitHub Issue
> (Architecture: extract a domain layer + decouple app from domain).

---

## How to read this guide

1. **Part 1 — The domain.** The business concepts, in plain language. Learn
   this first; everything else is plumbing around it.
2. **Part 2 — Where the logic lives now.** A reading map: which files to open
   to understand each concept, and the layers they sit in.
3. **Part 3 — Trace it end-to-end.** Two real walkthroughs (a resize run, a
   template build) so you can follow control flow through the layers.
4. **Part 4 — The reference repo.** How `alli-frontend-marketplacev2` is
   organized and *why* — the target we're mirroring.
5. **Part 5 — The gap + the plan.** Where our boundaries leak and the ordered
   fixes.

If you only read one part to "know the system," read **Part 1 and Part 2.**

---

## Part 1 — The domain (what the business logic actually is)

This app is **AdLabs**: a multi-tenant creative studio where PMG users generate
ad creative for clients. Strip away React and Firebase and the domain is small.
Learn these eight nouns and you understand the business.

| Concept | Plain meaning | Identity / where it's keyed |
|---|---|---|
| **Client** | A brand we do work for (Ralph Lauren, SharkNinja…). Everything is scoped to one client. | `clientSlug` (e.g. `ralph_lauren`) |
| **App** | A self-contained creative workflow. Four exist: Resize Image (`ad-resizing`), Dynamic Template Builder (`template-builder`), Batch Variants (stub), Video Cutdown (stub). | `AppId` union |
| **Brand standards** | A client's colors, fonts, and logos. Some apps refuse to run until these exist (the "Client Asset House"). | `clients/{slug}` profile + asset house |
| **Wizard / Step** | The multi-step UI an app walks the user through. Each step validates before you can advance. | `WizardStep`, `StepData` |
| **Creative** | An in-progress draft / working state of a wizard run, persisted so you can leave and return. | `clients/{slug}/apps/{appId}/creatives/{id}` |
| **Batch** | One "generate" action that produces N outputs sharing a config (e.g. 1 image → 6 resized dimensions). | `clients/{slug}/apps/{appId}/batches/{id}` |
| **Output** | A single generated asset (one image, one video). The **canonical** unit — there's one unified `OutputDoc` schema across all apps. | `clients/{slug}/apps/{appId}/outputs/{id}` |
| **Template** | A reusable HTML ad layout (template-builder only) that binds to a product feed. | `clients/{slug}/apps/template-builder/templates/{id}` |

**The two business rules worth internalizing:**

1. **Tenant isolation.** All data lives under `clients/{slug}/...`. A user must
   never read another client's data. This is a SOC2 requirement, enforced by
   Firestore rules + an email allowlist — *and* by the discipline of routing
   every path through one helper (`paths.ts`). Hand-built path strings are the
   regression that breaks this.
2. **A batch fans out into outputs.** The mental model for almost every app is:
   user configures → one `Batch` is created → a Cloud Function generates →
   each result is written as an `Output` under that batch. The dashboard and
   any future "your generations" view read `outputs/`, never the raw batch.

That's the whole domain. Everything in Part 2 is *how* we currently express it.

---

## Part 2 — Where the logic lives now (reading map)

Our layers today, outermost to innermost:

```
ROUTES        src/App.tsx (hand-wired) + src/pages/*
APP MODULES   src/apps/<id>/  (AppRoot, manifest, steps, app-local hooks/utils)
PLATFORM      src/platform/   (WizardShell, ClientProvider, firebase/paths)
SERVICES      src/services/   (Firestore/Storage I/O)
INFRA         src/firebase.ts (auth, db, storage, functions singletons)
```

There is **no `domain/` layer.** Domain types and rules are *distributed* across
the services and apps. That's the central thing this guide wants you to see —
so here is exactly where each domain concept currently lives:

| Domain concept | Type definition | Logic / rules | Persistence |
|---|---|---|---|
| **AppId / paths** | `platform/firebase/paths.ts` | `isAppId()`, `paths.*` | n/a (this *is* the path layer) |
| **Output** | `types/outputs.ts` (`OutputDoc`, Zod schema) ✅ best example | `services/outputs.ts` (`createOutput`/`updateOutput`) | `services/outputs.ts` |
| **Batch** | `services/batches.ts` (`BatchRecord` inline) | `batchService.addResult` shapes the OutputDoc inline | `services/batches.ts` |
| **Creative** | `services/creative.ts` (`CreativeRecord` inline) | `platform/wizard/usePersistedStepData.ts` | `services/creative.ts` |
| **Template** | `services/templates.ts` (`TemplateRecord` inline) | `apps/template-builder/_internal/handlers.ts` | `services/templates.ts` |
| **Brand standards** | `services/clientAssetHouse.ts` | `checkBrandStandards()` (mixed into the service) | `services/clientAssetHouse.ts` |
| **Wizard contract** | `apps/types.ts` (`AppManifest`, `WizardStep`) ⚠️ wrong layer | `platform/wizard/WizardShell.tsx` | n/a |
| **Feeds** | `apps/template-builder/types.ts` (`SelectedFeed`) | `apps/template-builder/_internal/handlers.ts` ⚠️ shared via app→app import | n/a (Alli API) |
| **Client** | `platform/client/ClientProvider.tsx` + legacy `types/index.ts` | `ClientProvider`, `hooks/useClientBootstrap.ts` | `services/alli.ts` (Alli API) |

**Reading order to understand the code (open these in this order):**

1. `platform/firebase/paths.ts` — the data schema. The whole Firestore layout in
   one file. Start here; it's the spine.
2. `apps/types.ts` — the `AppManifest`/`WizardStep` contract every app implements.
3. `platform/wizard/WizardShell.tsx` — the generic engine that runs any manifest.
4. `apps/_registry.ts` + `App.tsx` — how the four apps get registered and routed.
5. `services/outputs.ts` + `types/outputs.ts` — the canonical output model (and
   our cleanest example of a domain type + its data-access split).
6. `apps/template-builder/` — the reference *wizard* app (manifest → steps →
   `_internal/handlers.ts`).
7. `apps/ad-resizing/AppRoot.tsx` — the reference *custom* app (no WizardShell;
   also our most coupled module — read it knowing that).

**The platform layer** (`src/platform/`) is our closest thing to a "framework":
`WizardShell` (generic step runner), `ClientProvider` (URL → active client),
`paths.ts` (typed Firestore/Storage paths). It's shared by every app and is
mostly clean — `WizardShell` has zero Firebase knowledge.

**The services layer** (`src/services/`) is our data-access boundary and is
*mostly* real — but see Part 5 for where it's bypassed.

---

## Part 3 — Trace it end-to-end

### A. A resize run (`ad-resizing`)

```
/adlabs/ralph_lauren/ad-resizing/
  → App.tsx matches → <ClientProvider><AdResizingAppRoot/></ClientProvider>
  → ClientProvider reads :clientSlug, fetches alliService.getClients(), exposes currentClient
  → AppRoot mounts at stage='browse'
  → user connects a feed → FeedConnectScreen → fetchDataSources()  [⚠ imported from template-builder/_internal]
  → user picks channels/dimensions from data/channels.ts
  → Generate → useOutpaintRunner().runBatch() → httpsCallable(functions,'runOutpaintBatch')
  → in parallel: useBatchOutputs() opens onSnapshot on the batch + outputs   [⚠ raw Firestore in a hook]
  → Cloud Function writes Output docs → tiles re-render live
  → download → getDownloadURL(ref(storage,...))   [⚠ Storage SDK called from the component]
```
The ⚠ marks are exactly the decoupling problems in Part 5 — note how the
business flow is sound, but the *layer* each step runs in is wrong.

### B. A template build (`template-builder`)

```
/adlabs/ralph_lauren/template-builder/
  → TemplateBuilderAppRoot = <WizardShell manifest={templateBuilderManifest}/>
  → WizardShell reads manifest.steps[], syncs step ↔ URL, runs validate() each render
  → usePersistedStepData hydrates the draft Creative from Firestore (debounced writes back)
  → each step (ContextStep, IntentStep, ...) is a WizardStep object: render + validate + onEnter
  → GenerateStep.onEnter → clientAssetHouseService.getAssetHouse() → generateCandidates()  [business logic in _internal/handlers.ts]
  → ExportStep → batchService.createBatch() → addResult() per output → outputs/
```
This is the "blessed" shape: a thin `AppRoot`, a manifest of steps, business
logic in `_internal/handlers.ts`. `ad-resizing` predates it and is the outlier.

---

## Part 4 — The reference repo (`alli-frontend-marketplacev2`)

This is the mature PMG Alli frontend. Its organizing principle is the one thing
we're missing: **business logic lives in a framework-free `domain/` layer, and
every other layer depends inward on it.**

```
src/app/
  domain/      ← business logic + entity types. NO React/Redux/antd. One folder per
                 bounded context (workflow/, blueprint/, credentials/, ...), each with
                 shapes.ts (types), enums.ts, index.ts (barrel), and pure logic files.
  redux/       ← all state (RTK slices + RTK Query). Imports FROM domain, never into it.
  routing/     ← URL structure + data-fetch side effects; renders pages.
  pages/       ← connected containers. The index.tsx/ComponentName.tsx split (see below).
  containers/  ← legacy pages (being eliminated).
  components/  ← shared presentational components (reused across 2+ pages only).
  hooks/       ← shared React hooks (permissions, routing, feature flags).
  lib/         ← singleton infra services (analytics, Monaco).
src/types/     ← global ambient .d.ts only.
```

**Five patterns worth stealing (and one to skip):**

1. **The `domain/` layer.** Entity shapes + pure rules, framework-agnostic,
   organized by concept. This is *the* idea.
2. **`APILike` — one injectable data-access contract** (`domain/api/API.ts`).
   It's injected into state/thunks and mocked in tests. Our `services/outputs.ts`
   already does this (takes `Firestore` as a param) — generalize it.
3. **Container/presentational split.** `index.tsx` = connected (reads
   state/permissions/flags), `ComponentName.tsx` = pure props-only and trivially
   testable. This is what would tame our 970-line `ad-resizing/AppRoot.tsx`.
4. **Path aliases + barrels.** `app/*`, `alli/*` aliases (no `../../../`), and an
   `index.ts` in every folder controlling its public surface. Barrels are *how
   they stop code reaching into internals* — exactly our `ad-resizing →
   template-builder/_internal` problem.
5. **`AGENTS.md` encodes the rules.** "Business logic in `domain/`", "new state
   in RTK Query", "design-system → custom → antd". The structure stays honest
   because the rules are written down.

**Skip:** their Redux Toolkit + RTK Query machinery. It exists to poll a REST
API for a huge workflow builder. Our Firestore `onSnapshot` realtime model is
genuinely simpler and correct for us — adopting Redux to "match them" would be
cargo-culting. Mirror the **layering discipline**, not the state library.

---

## Part 5 — The gap + the plan

### The decoupling verdict: *partially* decoupled

We have a real boundary (`services/` + `paths.ts` + generic `WizardShell` +
the `apps/types` contract). It's punctured in specific places, almost all in
`ad-resizing`, which is the most coupled module in the codebase.

**Where it's already clean (keep as the model):**
`platform/firebase/paths.ts` · `ClientProvider` · `WizardShell` (zero Firebase) ·
`apps/types.ts` (Firebase-free contract) · `services/outputs.ts` (dependency-
injected `Firestore` — the `APILike` pattern, already here).

**The five highest-impact coupling fixes (priority order):**

1. **`ad-resizing/hooks/useBatchOutputs.ts`** — raw Firestore `onSnapshot` +
   a *shadow* `OutputDoc` type duplicating `types/outputs.ts`. → Extract to a
   service returning a typed domain stream; delete the duplicate type.
2. **Storage access from UI** — `AppRoot.tsx:489` dynamic `import('firebase/
   storage')` + `useStorageUrl.ts` calling `getDownloadURL` directly. → Route
   through a `storageService`.
3. **App→app coupling** — `ad-resizing/components/FeedConnectScreen.tsx:14`
   imports `fetchDataSources`/`fetchFeedSample` + module-level caches from
   `template-builder/_internal/handlers`. This is also a latent multi-tenant
   cache-bleed risk. → Move feed logic to `domain/feeds/` or `services/feedService`.
4. **Domain types coupled to Firestore `Timestamp`** — `types/outputs.ts:2,77`
   imports `Timestamp` into the canonical entity; `BatchRecord`/`CreativeRecord`/
   `TemplateRecord` use `createdAt: any` + unvalidated `as` casts at reads. →
   Neutral timestamp type in `domain/`; isolate `Timestamp` to the service seam.
5. **Layering inversion** — `platform/wizard/` imports `src/apps/types.ts` (the
   framework depends on the app layer). → Move the wizard contract into
   `domain/wizard/` (or `platform/`) so both sides import inward.

### The ordered plan to mirror the reference repo

Each step is independently shippable. Do them in order; don't try to boil it
all in one PR.

| Phase | Move | Why first/here |
|---|---|---|
| **0. Guardrails** | Add `@/*` path alias (tsconfig + vite) + `eslint-plugin-import` `no-restricted-paths`: ban UI→`firebase/*`, app→other-app `_internal/`, `domain/`→React/Firebase. | Cheapest, highest leverage. New code can't deepen the coupling while you refactor. |
| **1. Create `src/domain/`** | Move `BatchRecord`, `CreativeRecord`, `TemplateRecord`, `OutputDoc` into `domain/<concept>/shapes.ts` with barrels. Services import from domain. | Establishes the layer. Pure type moves, low risk. |
| **2. Decouple types from Firestore** | Neutral timestamp type; isolate `Timestamp` to service read/write. Validate reads with Zod instead of `as` casts. | Makes the domain genuinely framework-free. |
| **3. Extract shared logic** | `checkBrandStandards()` → `domain/brand/`; feed logic → `domain/feeds/`; `loadCustomFont()` → `utils/`; move wizard contract out of `apps/types.ts`. | Fixes app→app + service-mixing + the platform inversion. |
| **4. Refactor `ad-resizing`** | Route Firestore/Storage through services; split the 970-line `AppRoot` toward container/presentational. | The big one; now safe because the boundaries exist. |
| **5. Document** | `AGENTS.md` + `ARCHITECTURE.md` encoding the layer rules. | Keeps it from re-rotting. |

### Becoming the dev who knows this deeply

- **The schema is the system.** `paths.ts` is the one file to keep in your head.
  If you know the Firestore tree, you know where everything lives.
- **One app is the template.** `template-builder` is the blessed shape. When in
  doubt, make the thing look like template-builder, not ad-resizing.
- **Follow the data, not the components.** A feature is: config → Batch → Cloud
  Function → Outputs → realtime read. Trace that, not the JSX.
- **The boundary rule, in one line:** *UI talks to services; services talk to
  Firebase; domain talks to nobody.* When you add code, ask which of those three
  it is, and put it there.

---

*Generated from a 3-agent architecture audit (reference-repo map, our-repo map,
app/domain decoupling audit) on 2026-05-29.*
