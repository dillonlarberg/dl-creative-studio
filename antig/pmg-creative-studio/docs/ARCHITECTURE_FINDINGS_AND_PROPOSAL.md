# Alli Studio — Architecture Findings & Modularization / SOC2 Proposal

**Date:** 2026-04-30
**Author:** Architecture review (Claude + Diego Escobar)
**Scope:** Full codebase audit of `pmg-creative-studio` with focus on (1) per-app modularity, (2) SOC2-grade tenant isolation, (3) scalability for adding new "apps" inside Alli Studio.

**Status:** Decisions finalized via grilling session 2026-04-30. See [§6 Resolved Decisions](#6-resolved-decisions) for the locked-in plan; earlier sections describe findings and reasoning.

**Glossary:**
- **PMG** = the agency (Performance Marketing Group). PMG is *not* a client — it is the organization that operates Alli Studio. Every user of the app is a PMG employee.
- **Client** = an end-brand PMG manages on behalf of (e.g. `ralph_lauren`, `sharkninja`, `apple_services`). Only end-brands are clients. The existing `clientAssetHouse/pmg` document is an artifact and will not be migrated.
- **App** = a use case inside Alli Studio (Resize Image, Edit Existing Image, Generate New Image, Edit Existing Video, Generate New Video, Video Cutdown, Dynamic Template Builder, Process Product Feed).

---

## 1. Executive Summary

Alli Studio currently hosts **8 creative "apps"** (Resize Image, Edit Existing Image, Generate New Image, Edit Existing Video, Generate New Video, Video Cutdown, Dynamic Template Builder, Process Product Feed) inside a single React + Firebase project. Three structural problems block the goals you described:

1. **One mega-component drives every app.** `src/pages/use-cases/UseCaseWizardPage.tsx` is **4,311 lines** and contains the steps, state, validation, and rendering for all 8 use cases. Only `edit-image` has been partially extracted into its own folder. Adding a 9th app today means editing this file.
2. **The `creatives` Firestore collection is a multi-tenant pool keyed only by a client-supplied `clientSlug` field.** Firestore rules permit *any authenticated user* to read or write *any* creative document. Ralph Lauren, Shark Ninja, Apple Services, and PMG creative drafts all live in the same collection, isolated only by application-layer filtering. This is a SOC2 finding — there is no database-enforced tenant boundary.
3. **No per-app data ownership.** Storage paths, Cloud Functions, and Firestore documents are flat. Nothing in the data model says "this row belongs to *Edit Image* for *Ralph Lauren*"; everything is in one bucket.

This document proposes a phased migration to (a) per-app modules with their own state/services/types, (b) a `clients/{clientSlug}/apps/{appId}/...` Firestore hierarchy that is rules-enforced, and (c) a plug-in registry so adding a new app is a single folder + single registry entry.

---

## 2. Findings — Current State

### 2.1 Source layout

```
src/
├── App.tsx                          # 50 lines — 5 routes
├── main.tsx
├── pages/
│   ├── CreatePage.tsx               # 182 lines — grid of 8 use cases
│   ├── LoginPage.tsx
│   ├── ClientSelectPage.tsx
│   ├── ClientAssetHousePage.tsx
│   └── use-cases/
│       └── UseCaseWizardPage.tsx    # 4,311 lines — MONOLITH for all 8 apps
├── components/
│   ├── AppLayout.tsx                # 356 lines — sidebar, client switcher, /me
│   ├── edit-image/                  # ✅ only modular app
│   │   ├── types.ts
│   │   ├── steps/SelectAnalyzeStep.tsx
│   │   ├── utils/ (parseAlliAnalysis, buildRecommendations, extractBrandColors)
│   │   └── __tests__/
│   ├── ApprovalFlow.tsx, FileUpload.tsx, Breadcrumbs.tsx, ...
├── constants/
│   └── useCases.ts                  # 140 lines — USE_CASES + PLATFORM_SIZES + AI_PROVIDERS + SOCIAL_WIREFRAMES
├── services/
│   ├── auth.ts                      # Firebase OIDC via Alli
│   ├── alli.ts                      # /me, /clients proxies + asset cache
│   ├── creative.ts                  # `creatives` collection CRUD
│   ├── clientAssetHouse.ts          # `clientAssetHouse/{slug}` CRUD
│   ├── videoService.ts, templates.ts, batches.ts
├── types/index.ts                   # Shared UseCaseId, UseCase, Client
└── utils/
```

```
functions/src/
├── index.ts          # 16 lines — re-exports
├── alliProxy.ts      # getMeProxy, getClientsProxy (no tenant scoping)
├── ai.ts             # analyzeVideoForCutdowns (Gemini)
└── video.ts          # processVideoCutdowns (FFmpeg)
```

### 2.2 The wizard monolith

`UseCaseWizardPage.tsx` contains:
- `WIZARD_STEPS: Record<UseCaseId, Step[]>` hardcoded for all 8 apps (lines ~338–403)
- 40+ `useState` hooks mixing video durations, image platforms, template field maps, feed batch state
- Long `if (useCaseId === '...')` chains for per-app rendering and validation
- Constants for one specific app (`FIELD_ID_MAP`, `CSS_INJECTION_MAP`, `BASELINE_ASSETS`) at module scope

Adding a new app requires editing this file in 6+ places (route, steps array, render branch, validation, persistence shape, navigation).

### 2.3 Firestore data model — the SOC2 problem

Two collections exist today (per your screenshots and `src/services/`):

**`creatives/{creativeId}`** — flat, shared across clients:
```
creatives/0EDEbK3I5dbNlWmCGvQ3
  ├── clientSlug: "sharkninja"
  ├── useCaseId: "edit-image"
  ├── status: "draft"
  ├── currentStep: 0
  ├── stepData: { ... }
  ├── createdAt, updatedAt
```

**`clientAssetHouse/{clientSlug}`** — already path-scoped per client:
```
clientAssetHouse/apple_services
  ├── clientSlug: "apple_services"
  ├── primaryColor, fontPrimary, ...
  └── assets, variables
```

`firestore.rules` today (full file):
```
match /clientAssetHouse/{clientSlug} {
  allow read, write: if request.auth != null;       // ❌ any user, any client
}
match /creatives/{creativeId} {
  allow read, write: if request.auth != null;       // ❌ any user, any creative
}
```

**Concrete leakage path:** any user with a valid Alli Firebase token can:
1. Open browser devtools, run `getDocs(collection(db, 'creatives'))`.
2. Receive every draft for every client across every app.
3. Call `setDoc(doc(db, 'creatives', '<other-client-id>'), {...})` and overwrite their state.

`storage.rules` is worse — `/uploads/{clientSlug}/**` allows `read, write: if true` (no auth at all).

### 2.4 Auth & client context

- Login: Firebase OIDC via Alli → access token in `sessionStorage`.
- Selected client: stored in `localStorage` as `selectedClient` (slug, name, id). No backend session links a user's UID to the clients they're entitled to.
- `creativeService.createCreative(clientSlug, ...)` trusts the caller's `clientSlug`. There is no server check that this user may act on this client.

### 2.5 Cloud Functions

| Function | Purpose | Tenant check |
|----------|---------|---------------|
| `getMeProxy` | proxy Alli `/me` | passes JWT through, no scoping |
| `getClientsProxy` | proxy Alli `/clients` | returns user's allowed clients (good source of truth — currently unused server-side) |
| `analyzeVideoForCutdowns` | Gemini analysis | accepts any `videoUrl`, no client check |
| `processVideoCutdowns` | FFmpeg stitching | accepts any `videoUrl`, no client check |

### 2.6 Coupling hotspots (high fan-in)

1. `UseCaseWizardPage.tsx` — imports every service, owns every app's state.
2. `services/creative.ts` — single shape used by every app (`stepData: Record<string, any>`).
3. `constants/useCases.ts` — the only "registry," but it's metadata-only and doesn't know about steps or components.
4. `AppLayout.tsx` — one navbar/sidebar for all apps; no per-app extension hooks.

---

## 3. Proposal

### 3.1 Target source layout — one folder per app

```
src/
├── apps/                            # ⬅ NEW. Each subfolder is a self-contained app.
│   ├── _registry.ts                 # Maps appId → manifest (lazy import)
│   ├── _shared/                     # Cross-app primitives ONLY (Wizard shell, ApprovalFlow, etc.)
│   │   ├── WizardShell.tsx
│   │   ├── steps/                   # Generic steps reusable by apps (FileUpload, Approve)
│   │   └── hooks/
│   ├── edit-image/
│   │   ├── manifest.ts              # id, title, description, icon, category, route
│   │   ├── steps.ts                 # ordered Step[] for this app
│   │   ├── components/              # app-specific UI (already partly here)
│   │   ├── hooks/
│   │   ├── services/                # app-specific Firestore calls (scoped writes)
│   │   ├── types.ts
│   │   └── index.ts                 # default export = manifest
│   ├── resize-image/  ...           # same shape
│   ├── new-image/  ...
│   ├── edit-video/  ...
│   ├── new-video/  ...
│   ├── video-cutdown/  ...
│   ├── template-builder/  ...
│   └── feed-processing/  ...
├── platform/                        # ⬅ NEW. Cross-cutting concerns owned by no single app.
│   ├── auth/                        # current-user, /me, token refresh
│   ├── client/                      # selected-client context, custom claims
│   ├── firebase/                    # firestore/storage init, typed paths
│   ├── ui/                          # shadcn primitives, AppLayout, Breadcrumbs
│   └── analytics/
├── pages/                           # thin route-level pages
└── App.tsx
```

**Manifest contract** (`apps/<id>/manifest.ts`):
```ts
export const manifest: AppManifest = {
  id: 'edit-image',
  title: 'Edit Existing Image',
  category: 'images',
  icon: BrushIcon,
  steps: () => import('./steps').then(m => m.steps),
  component: () => import('./AppRoot'),
  // optional capabilities
  requiresClientAssetHouse: true,
  outputs: ['image/png'],
};
```

**Registry** (`apps/_registry.ts`) — compiled, but loads steps/components lazily:
```ts
export const APP_REGISTRY = [
  () => import('./edit-image'),
  () => import('./resize-image'),
  () => import('./new-image'),
  // ...
];
```

Adding a new app = (1) `mkdir src/apps/my-new-app`, (2) drop a manifest, (3) add one line to the registry. No edits to `UseCaseWizardPage` (which becomes a thin shell that resolves a manifest and renders).

### 3.2 Firestore data model — path-based tenant isolation

Replace the flat `creatives` collection with a client-scoped, app-scoped hierarchy:

```
clients/{clientSlug}/
  ├── profile (doc)                        # ← what `clientAssetHouse/{slug}` becomes
  │   primaryColor, fontPrimary, logoPrimary, ...
  ├── assets/{assetId}                     # brand assets
  ├── members/{userUid}                    # who can access this client (role)
  └── apps/{appId}/
      ├── creatives/{creativeId}           # ← what today's `creatives` becomes
      │   stepData, status, currentStep, ...
      ├── templates/{templateId}           # app-specific (template-builder)
      └── batches/{batchId}                # app-specific (feed-processing)
```

Why this shape:

- **Path is the tenant boundary.** Rules can enforce "the path's `clientSlug` must be in the caller's allowed list." No application-layer filter required.
- **Per-app subtree** means each app owns its own collections; you can index them independently, you can delete an app's data with one path, and an app's schema changes don't touch siblings.
- **Members subcollection** establishes which user UIDs may access a client. Replaces today's `localStorage` trust model.

### 3.3 Custom claims for cheap, correct rules

On login, a Cloud Function (callable, e.g. `syncClientClaims`) calls Alli `/clients` for the authenticated user, computes the allowed slugs, and writes them to Firebase custom claims:

```ts
admin.auth().setCustomUserClaims(uid, { clients: ['ralph_lauren', 'sharkninja'] });
```

Then `firestore.rules` becomes:

```
match /clients/{clientSlug} {
  allow read: if isMember(clientSlug);
  match /profile {
    allow read, write: if isMember(clientSlug);
  }
  match /apps/{appId}/{document=**} {
    allow read, write: if isMember(clientSlug);
  }
  match /members/{userUid} {
    allow read: if isMember(clientSlug);
    allow write: if false;                 // members are managed server-side
  }
}

function isMember(slug) {
  return request.auth != null
      && slug in request.auth.token.clients;
}
```

Same shape for `storage.rules`:
```
match /clients/{clientSlug}/{allPaths=**} {
  allow read, write: if request.auth != null
                     && clientSlug in request.auth.token.clients;
}
```
And remove the `if true` upload rule entirely — uploads must go under `clients/{slug}/...`.

### 3.4 Server-side enforcement for Functions

Every callable function gets a 5-line guard:

```ts
function assertClient(context: CallableContext, clientSlug: string) {
  const claims = context.auth?.token as { clients?: string[] } | undefined;
  if (!claims?.clients?.includes(clientSlug)) {
    throw new HttpsError('permission-denied', 'Not a member of client');
  }
}
```

`analyzeVideoForCutdowns`, `processVideoCutdowns`, and any new app function take `clientSlug` + `appId` and call `assertClient` first.

### 3.5 React layer — `ClientContext` replaces `localStorage`

A single `ClientProvider` at the app root:
- Reads claims from the ID token.
- Exposes `{ currentClient, allowedClients, setCurrentClient }`.
- Refuses to set a client not in `allowedClients`.
- All app code reads `useCurrentClient()`; no component reaches into `localStorage`.

Service layer becomes path-typed:

```ts
// platform/firebase/paths.ts
export const paths = {
  client: (slug: string) => `clients/${slug}`,
  app:    (slug: string, appId: AppId) => `clients/${slug}/apps/${appId}`,
  creatives: (slug: string, appId: AppId) => `clients/${slug}/apps/${appId}/creatives`,
};
```

Each app's `services/creatives.ts` calls only its own path. Cross-app reads are impossible by construction.

### 3.6 Migration plan — wipe and rebuild on a dev branch

This is a prototype on a Firebase project independent of any production system. Existing creatives are drafts and demos with no production value. The 4 brand profiles in `clientAssetHouse` (Ralph Lauren, Shark Ninja, Apple Services, plus any others — **excluding the `pmg` doc, which is an artifact**) are the only data worth keeping. Phased dual-write/backfill is unnecessary overhead; we rebuild instead.

**Branch strategy:** A long-lived `dev` branch holds the rebuild. Each step below ships as its own short-lived feature branch off `dev`, PRs into `dev`, and deploys to an isolated Firebase project. When `dev` is fully baked, `dev` → `main`. Firebase Hosting versions every deploy, so any step is one-click rollback-able from the Firebase console.

| Step | Branch | Goal |
|------|--------|------|
| **1. Schema + rules + claims** | `feat/scoped-schema` | Stand up `clients/{slug}/...` schema; deploy locked-down `firestore.rules` + `storage.rules`; deploy `syncClientClaims` Cloud Function; build `ClientProvider`. Re-import the (filtered) brand profiles via a one-shot script. Verify login + client switching work end-to-end against the new Firebase project. |
| **2. App registry + WizardShell + first app** | `feat/app-registry` | Build `src/apps/_registry.ts`, the `AppManifest` contract, `WizardShell`, per-app top-level routing in `App.tsx`. Extract `edit-image` (already half-modular) as the contract validator. Old apps still work via a slimmed-down `UseCaseWizardPage`. |
| **3. Image apps** | `feat/extract-image-apps` | Extract `resize-image` and `new-image`. They share shape with `edit-image`, so the manifest pattern transfers cleanly. |
| **4. Simple video apps** | `feat/extract-video-apps` | Extract `edit-video` and `new-video`. |
| **5. Video Cutdown** | `feat/extract-video-cutdown` | Extract `video-cutdown` — its own PR because the Gemini analysis + FFmpeg pipeline state is the most tangled. |
| **6. Template Builder** | `feat/extract-template-builder` | Extract `template-builder` — its own PR for the same reason (7 steps, FIELD_ID_MAP, CSS_INJECTION_MAP). |
| **7. Feed Processing + retire monolith** | `feat/extract-feed-and-cleanup` | Extract `feed-processing`. Delete `UseCaseWizardPage.tsx`. `pages/use-cases/` becomes a thin manifest resolver. |
| **8. Promote to main** | merge `dev` → `main` | Production cutover. New Firebase project becomes the prod project, or DNS swaps to point at the new deployment. |

**What gets preserved before the wipe (one-shot export script):**
- `clientAssetHouse/ralph_lauren`, `clientAssetHouse/sharkninja`, `clientAssetHouse/apple_services`, plus any additional end-brand docs.
- Storage assets under `clients/{slug}/...` for those brands (logos, fonts).

**What gets dropped:**
- All `creatives/*` documents (drafts and demos).
- `clientAssetHouse/pmg` (PMG is the agency, not a client).
- Storage uploads under `/uploads/{slug}/**` (temp files).

Steps 1–2 must ship in order; steps 3–7 can ship in any order against the registry. Step 8 only happens after `dev` is verified.

### 3.7 Adding a 9th app — what it looks like after the migration

1. `mkdir src/apps/audio-generator`
2. Create `manifest.ts` (declares `id`, `basePath: '/audio-generator'`, `routes: [...]`, `category`, `icon`), plus `AppRoot.tsx`, `steps.ts`, `services/creatives.ts` (reuses `paths.creatives(slug, 'audio-generator')`).
3. Add one line to `apps/_registry.ts`.
4. Done. Rules already cover `clients/{slug}/apps/{appId}/**`. The shell automatically mounts the new app's routes. No edits to `App.tsx`, `AppLayout`, or any other app's code. No rule changes.

---

## 4. Routing — per-app top-level routes

Each app owns its URL namespace. The shell mounts `manifest.routes` under `manifest.basePath` and otherwise stays out of the way.

```
/                                    → CreatePage (the app launcher grid)
/select-client                       → ClientSelectPage (platform-level)
/client-asset-house                  → ClientAssetHousePage (platform-level)
/edit-image                          → edit-image default screen
/edit-image/new                      → wizard for new creative
/edit-image/:creativeId              → resume an existing creative
/edit-image/library                  → asset library (future)
/template-builder                    → template-builder default
/template-builder/templates/:id      → template editor
/template-builder/batches/:id        → batch run view
/video-cutdown                       → video-cutdown default
... etc per app
```

Manifest contract:

```ts
export const manifest: AppManifest = {
  id: 'edit-image',
  title: 'Edit Existing Image',
  category: 'images',
  basePath: '/edit-image',
  routes: [
    { path: '',              element: <EditImageHome /> },
    { path: 'new',           element: <EditImageWizard /> },
    { path: ':creativeId',   element: <EditImageWizard /> },
  ],
  icon: BrushIcon,
  requiresClientAssetHouse: true,
};
```

`App.tsx` becomes a small loop over the registry:

```tsx
<Routes>
  <Route path="/" element={<CreatePage />} />
  <Route path="/select-client" element={<ClientSelectPage />} />
  <Route path="/client-asset-house" element={<ClientAssetHousePage />} />
  {APP_REGISTRY.map(({ manifest }) => (
    <Route
      key={manifest.id}
      path={`${manifest.basePath}/*`}
      element={<AppShell manifest={manifest} />}
    />
  ))}
</Routes>
```

Rule of thumb: **never** put per-app route definitions in a central router file. Each app owns its own routes in its own manifest. The shell just mounts what it finds.

---

## 5. Concrete next steps (one-week slice for Step 1)

Step 1 of the migration plan (Schema + rules + claims) is the only blocking work; everything after it can ship at a sustainable pace.

1. **Day 1:** Stand up the new Firebase project (or new Firestore database in the existing project). Add `clients/{slug}/...` schema definitions to `platform/firebase/paths.ts`. Write the export-and-reimport script for the 4 brand profiles (excluding `pmg`).
2. **Day 2:** Deploy `syncClientClaims` Cloud Function. Build `ClientProvider`. Wire the login flow to call the function and force-refresh the ID token before the client picker renders.
3. **Day 3:** Write and deploy the new `firestore.rules` and `storage.rules` with `isMember(slug)` predicates. Verify denied operations are visible in Cloud Logging (named conditions for readability).
4. **Day 4:** Migrate `creativeService` and `clientAssetHouseService` to write under the new paths. Re-run the brand profile import. Smoke test the `edit-image` flow end-to-end.
5. **Day 5:** Open `feat/app-registry` branch (Step 2). Build the manifest contract and `WizardShell`. Extract `edit-image`.

After Day 5, the SOC2 risk is closed and the modularization pattern is validated. Steps 3–7 of the migration plan happen at a comfortable pace from there.

---

## 6. Resolved Decisions

The following decisions were locked in during the architecture grilling session on 2026-04-30. They override any earlier framing in this doc.

| # | Decision | Resolution | Reasoning |
|---|----------|------------|-----------|
| 1 | **PMG vs clients** | PMG is the agency / org, **not a client**. Only end-brands (`ralph_lauren`, `sharkninja`, `apple_services`, etc.) are clients. The existing `clientAssetHouse/pmg` document is an artifact and is **not migrated**. No org layer in the schema. | Every user is a PMG employee; PMG itself never appears in the client-selection list. Adding an org layer for hypothetical cross-client features would propagate complexity to every read/write for no current benefit. |
| 2 | **Migration approach** | Wipe & rebuild on a dev branch + isolated Firebase project. Re-import only the end-brand profiles. Drop all existing `creatives/*` documents. | Prototype with no production users. Existing data is drafts and demos. Phased dual-write/backfill is overhead with no upside in this context. |
| 3 | **Membership / auth** | Firebase custom claims (`token.clients: string[]`). A `syncClientClaims` Cloud Function calls Alli `/clients` on login and writes the user's allowed slugs as claims. Rules check `slug in request.auth.token.clients`. A hidden "Sync clients" debug button covers mid-session client additions. | Steady-state runtime is identical to today's permissive setup; only login pays a one-time ~500ms cost. The Firestore-membership-doc alternative (Option B) would add ~30–80ms to every operation via `get()` in rules. |
| 4 | **Modularization scope** | Big bang, executed iteratively across multiple PRs. Feature branches off `dev`, PRs merge into `dev`. `dev` → `main` when fully baked. Firebase Hosting versions every deploy for instant rollback. | Solo developer + free rollback eliminates the merge-risk argument for a phased monolith-coexists approach. Doing all 8 apps in one branch produces one coherent story and avoids carrying a "legacy wizard" code path. |
| 5 | **Routing** | Per-app top-level routes. Each manifest declares `basePath` and `routes[]`; the shell mounts them. No central routes table beyond the registry. | Almost every app is multi-screen. A single `/create/:useCaseId` dispatcher would force every app to reinvent nested-route conventions. Per-app namespaces let each app grow (`library`, `templates`, `history`) without coordinating. |
| 6 | **Audit logging** | Skipped for prototype. Revisit when a customer or auditor requires it. | Cloud Audit Logs (free, infrastructure-level) remain available as a one-checkbox upgrade if needed; application-layer audit trails are not worth building speculatively. |
