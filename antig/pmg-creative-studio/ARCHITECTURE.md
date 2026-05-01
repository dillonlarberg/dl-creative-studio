# Alli Studio — Architecture

> **Audience:** anyone trying to understand what Alli Studio is, what it's becoming, and how to integrate with it (or build a new app inside it).
>
> **Status (2026-05):** the architecture described in §3 is in flight on the `dev` branch. `main` still reflects §2. Cutover to the new architecture happens as a single coordinated deploy after all rebuild PRs land. See §6 for the live status of that work.

---

## 1. What is Alli Studio?

Alli Studio is a **collection of small creative-tooling apps** that PMG employees use to produce, edit, and remix advertising creative on behalf of agency clients (Ralph Lauren, Shark Ninja, Apple Services, etc.). Today it bundles eight apps:

- **Image:** Resize Image · Edit Existing Image · Generate New Image
- **Video:** Edit Existing Video · Generate New Video · Video Cutdown
- **Dynamic versioning:** Dynamic Template Builder · Process Product Feed

It runs in the Firebase project `automated-creative-e10d7` (frontend on Firebase Hosting, data in Firestore + Storage, backend in Cloud Functions). A separate prototype app called **Creative Intelligence** lives in the same Firebase project on a different named Firestore database (`sbd-creative-intelligence`); the two apps share a project but their data is fully isolated.

**Key terms in this doc:**

| Term | Meaning |
|------|---------|
| **PMG** | The agency. Every Alli Studio user is a PMG employee. PMG is *not* a client. |
| **Client** | An end-brand PMG works for (e.g. `ralph_lauren`). Lives at a slug. |
| **App** | One of the eight tooling workflows above. Each is its own use case. |
| **Wizard** | The step-by-step UI shape every app uses today. |

---

## 2. The current architecture (today, on `main`)

Three structural problems gave rise to the rebuild:

### 2.1 One mega-component drives every app

```
src/
├── App.tsx                                    50 lines
├── pages/
│   └── use-cases/
│       └── UseCaseWizardPage.tsx           4,311 lines  ← all 8 apps live here
├── components/
│   └── edit-image/                           ← ONLY app partially extracted
│       ├── steps/
│       └── utils/
└── services/
    ├── creative.ts                           ← shared CRUD for all apps
    └── clientAssetHouse.ts                   ← shared brand profile CRUD
```

`UseCaseWizardPage.tsx` contains the steps, state, validation, side effects, and rendering for every app. Adding a 9th app means editing this one file in **17 different `if (useCaseId === '...')` branches**. Apps cannot be reasoned about, tested, or extended in isolation.

### 2.2 Client data lives in a flat shared collection

```
Firestore (default)
  └── creatives/
        ├── 0EDEbK3I5dbNlWmCGvQ3  { clientSlug: "sharkninja", useCaseId: "edit-image", ... }
        ├── 31COgq4aTQQ0wX1PCRUq  { clientSlug: "ralph_lauren", useCaseId: "video-cutdown", ... }
        └── ...                    (every client's drafts in one bucket)
```

All clients' draft creatives live in one collection, isolated only by an application-layer `clientSlug` field that the client itself supplies. The Firestore rule for this collection is `allow read, write: if request.auth != null` — any authenticated PMG user can query *any* client's data via direct Firestore SDK calls. This is the SOC2 finding the rebuild closes.

### 2.3 No per-app data ownership

Storage paths, Cloud Functions, and Firestore documents are flat. Nothing in the data model says "this row belongs to *Edit Image* for *Ralph Lauren*." Adding a new app requires inventing a new collection or polluting an existing one.

---

## 3. The new architecture (in progress on `dev`)

The rebuild does two things at once:

1. **Modularize per app.** Each app becomes its own folder implementing a small contract. The wizard shell becomes a passive framework that knows nothing about specific apps.
2. **Path-scope client data.** Every read and write is keyed by `clients/{slug}/apps/{appId}/...`. Each client's data lives in its own subtree, deletable independently, never co-mingled.

Auth gets simpler at the same time: a hardcoded email allowlist (≤10 PMG users) in `firestore.rules` and `storage.rules` gates access. No custom claims, no per-client membership ceremony — the application UI continues to filter the client picker via Alli `/clients`, and the database refuses anyone outside the allowlist.

### 3.1 New source layout

```
src/
├── App.tsx                                    ← thin route mounter, no app-specific logic
├── apps/                                      ⬅ NEW. One folder per app.
│   ├── _registry.ts                           ← lazy imports + basePath collision check
│   ├── edit-image/
│   │   ├── manifest.ts                        ← id, basePath, routes, contract methods
│   │   ├── AppRoot.tsx
│   │   ├── steps.ts
│   │   ├── components/
│   │   ├── hooks/
│   │   └── __tests__/
│   ├── resize-image/
│   ├── new-image/
│   ├── edit-video/
│   ├── new-video/
│   ├── video-cutdown/
│   ├── template-builder/
│   └── feed-processing/
├── platform/                                  ⬅ NEW. Cross-cutting infrastructure.
│   ├── firebase/
│   │   └── paths.ts                           ← typed path helpers (single source of truth)
│   ├── client/
│   │   └── ClientProvider.tsx                 ← URL-driven active-client context
│   └── wizard/
│       └── WizardShell.tsx                    ← passive shell, knows no app id
├── services/                                  ← shared, app-agnostic services
└── pages/                                     ← thin pages: Login, ClientPicker, AppLauncher

functions/src/
├── _shared/
│   ├── allowlist.ts                           ← email allowlist (mirrored in rules files)
│   ├── assertAlliStudioUser.ts                ← caller-identity guard
│   └── assertResourceClient.ts                ← resource-ownership guard (IDOR fix)
├── alliProxy.ts                               ← /me, /clients (existing)
├── ai.ts                                      ← analyzeVideoForCutdowns
└── video.ts                                   ← processVideoCutdowns
```

### 3.2 New Firestore shape

```
Firestore (default)
  └── clients/                                  ← every client's data is here
        ├── ralph_lauren/
        │     ├── profile          ← brand colors, fonts, logos
        │     ├── assets/          ← brand assets (subcollection)
        │     │     └── {assetId}
        │     └── apps/
        │           ├── edit-image/
        │           │     └── creatives/
        │           │           └── {creativeId}
        │           ├── template-builder/
        │           │     ├── creatives/
        │           │     └── templates/
        │           └── ... (one subtree per app)
        ├── sharkninja/
        │     └── ... (same shape)
        └── apple_services/
              └── ... (same shape)
```

Storage mirrors the same hierarchy: every file lives under `clients/{slug}/apps/{appId}/{path}`.

### 3.3 New rules (the SOC2 fix)

`firestore.rules` and `storage.rules` use the same predicate:

```
function isAlliStudioUser() {
  return request.auth != null
      && request.auth.token.email_verified == true
      && request.auth.token.email in [
           // up to ~10 emails. Adding a PMG user is one line.
         ];
}

match /clients/{clientSlug}/{document=**} {
  allow read, write: if isAlliStudioUser();
}

match /{document=**} {
  allow read, write: if false;          ← default-deny everything else
}
```

The same email list lives in `functions/src/_shared/allowlist.ts` and is consumed by `assertAlliStudioUser` so Cloud Functions enforce the same rule. A drift unit test asserts the two lists stay in sync.

### 3.4 The WizardShell — a contract, not a switch statement

Today's wizard knows about every app. The new wizard knows about a contract:

```
┌──────────────────────────────────────────────────────────────────────┐
│  WizardShell  (knows no app id, never branches on useCaseId)         │
│                                                                      │
│  Inputs from each app's manifest:                                    │
│    • render(ctx)        → step UI                                    │
│    • validate(stepData) → can the user advance?                      │
│    • onEnter(ctx)       → side effects when step becomes active      │
│    • onLeave(ctx)       → side effects when user clicks Next         │
│    • next(stepData)     → next step id (allows skip-ahead)           │
│    • initialStepData()  → what's in stepData when step opens         │
│    • onMount(ctx)       → app-level setup (data prefetch, etc.)      │
│                                                                      │
│  Owns: navigation, draft persistence, breadcrumbs, history drawer    │
└──────────────────────────────────────────────────────────────────────┘
                                  ▲
                                  │ implements the contract
                                  │
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  edit-image  │  │  new-image   │  │ video-cutdown│  │   template-  │
│   manifest   │  │   manifest   │  │   manifest   │  │    builder   │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
```

Each app provides its own typed step machine. The shell loops the contract; apps can have wildly different step graphs without the shell caring.

### 3.5 URL-encoded active client

Active client is a URL path segment, not a localStorage value:

```
/                                              → login or app launcher
/select-client                                 → pick a client
/:clientSlug                                   → app launcher for that client
/:clientSlug/edit-image                        → edit-image home
/:clientSlug/edit-image/new                    → wizard for a new creative
/:clientSlug/edit-image/:creativeId            → resume a draft
/:clientSlug/edit-image/library                → app-owned subroute (future)
/:clientSlug/template-builder/templates/:id    → template-builder template editor
/:clientSlug/client-asset-house                → cross-app brand setup page
```

Two browser tabs cannot disagree about the active client because the URL is the source of truth. Each app namespaces its own routes under its `basePath`.

---

## 4. How this scales — adding a new app

This is the whole point of the refactor: **any new tooling workflow inside Alli Studio should be a folder, a manifest, and one registry line.** No edits to the shell, no edits to rules, no edits to other apps.

### 4.1 The three-step recipe

To add a hypothetical 9th app called `audio-generator`:

**Step 1 — Create the folder:**
```bash
mkdir -p src/apps/audio-generator/components
mkdir -p src/apps/audio-generator/__tests__
```

**Step 2 — Drop in a manifest, an `AppRoot`, and step definitions:**
```ts
// src/apps/audio-generator/manifest.ts
export const manifest: AppManifest = {
  id: 'audio-generator',
  title: 'Generate Audio',
  category: 'audio',
  basePath: '/audio-generator',
  icon: SpeakerIcon,
  routes: [
    { path: '',             element: <AudioGeneratorHome /> },
    { path: 'new',          element: <AudioGeneratorWizard /> },
    { path: ':creativeId',  element: <AudioGeneratorWizard /> },
  ],
  // The seven contract methods live here too
  initialStepData,
  onMount,
};
```

**Step 3 — Register it:**
```ts
// src/apps/_registry.ts
export const APP_REGISTRY = [
  () => import('./edit-image'),
  () => import('./resize-image'),
  // ... existing apps
  () => import('./audio-generator'),    // ⬅ one new line
];
```

That's it. The new app:

- ✅ **Routes work** — the shell mounts `manifest.routes` under `/:clientSlug/audio-generator/*` automatically.
- ✅ **Data path works** — `paths.creatives('ralph_lauren', 'audio-generator')` returns `clients/ralph_lauren/apps/audio-generator/creatives` with no schema change.
- ✅ **Rules work** — `clients/{slug}/{document=**}` already covers the new subtree.
- ✅ **Auth works** — same email allowlist gates the new app.
- ✅ **Wizard works** — the shell renders the manifest's contract methods.
- ✅ **History works** — drafts for the new app appear in the same history drawer.

No central files touched. No coordination with other app authors. No rule deploys.

### 4.2 What if the new "app" isn't wizard-shaped?

Some future workflows may not be wizards (e.g., a dashboard, a library browser, an analytics view). The architecture supports this — `manifest.routes` can render any React component, not just a `<WizardShell>`. The shell is opt-in. An app's `<AppRoot>` is free to compose its own UI as long as it stays inside `clients/{slug}/apps/{appId}/...` for any data it persists.

### 4.3 The boundaries

Every app gets the same contract surface:

- **Owns:** its UI, its step state, its validation, its side effects, its persisted Firestore documents under `clients/{slug}/apps/{appId}/...`, its Cloud Storage uploads under the same prefix.
- **Reuses:** `paths.ts` for path strings, `useCurrentClient()` for the active client, `WizardShell` for wizard-shaped flows, the email allowlist for access (no per-app rule changes).
- **Does not touch:** `App.tsx`, the layout/sidebar, other apps' folders, `firestore.rules`, `storage.rules`, the registry beyond its own one line.

---

## 5. How this doesn't break Creative Intelligence

Creative Intelligence is a separate prototype that runs in the same Firebase project (`automated-creative-e10d7`) but on a **different named Firestore database**: `sbd-creative-intelligence`.

Firebase rules are scoped per database. The rules in this repo's `firestore.rules` only deploy to the `(default)` database. Creative Intelligence's database has its own rules file and its own rule deploys. The two never overlap.

The same isolation holds for Cloud Functions (each codebase deploys functions with distinct names) and Hosting (each app has its own deployment target). The only shared resource is Firebase Auth users, and the new email-allowlist rules don't read any token field that Creative Intelligence cares about.

**Practical implication:** a developer working on Creative Intelligence can ignore this rebuild entirely. The rebuild's cutover does not touch their database, their rules, or their hosting target.

---

## 6. Status of the rebuild

Tracking issue: [#1 — Modular per-app architecture + SOC2 tenant isolation rebuild](https://github.com/dillonlarberg/dl-creative-studio/issues/1).

Branching model:

```
main ──────────────────────────────────────────────►
   │
   └─► dev ──┬──► feat/test-runner          (PR 1)  ✅ MERGED
             │
             ├──► feat/scoped-schema         (PR 2)  ⏳ in progress
             │
             ├──► feat/app-registry          (PR 3)  ⌛ next
             │
             ├──► feat/extract-resize-image  (PR 4) ┐
             ├──► feat/extract-new-image     (PR 5) │  parallel
             ├──► feat/extract-edit-video    (PR 6) │  worktrees
             ├──► feat/extract-new-video     (PR 7) │  after PR 3
             ├──► feat/extract-video-cutdown (PR 8) │
             ├──► feat/extract-template-bldr (PR 9) ┘
             │
             ├──► feat/extract-feed-cleanup  (PR 10)
             │
             └──◄ dev ────────────────────────► main  (PR 11 promotion)
```

Each PR is reviewable in isolation, ships to `dev`, and is rollback-able via Firebase Hosting versions. After PR 10 lands and `dev` is fully verified, a single coordinated `firebase deploy` ships the new functions + frontend + rules to production.

---

## 7. Where to learn more

| Doc | What it tells you |
|-----|-------------------|
| [GitHub Issue #1 — PRD](https://github.com/dillonlarberg/dl-creative-studio/issues/1) | The implementation contract. User stories, decisions, testing plan. |
| `docs/ARCHITECTURE_FINDINGS_AND_PROPOSAL.md` | Deep-dive design rationale: 17-branch monolith inventory, contract design, resolved decisions table. |
| `docs/superpowers/plans/2026-04-30-INDEX-modular-soc2-rebuild.md` | Master execution plan with per-PR previews. |
| `docs/superpowers/plans/2026-XX-XX-prN-*.md` | Detailed TDD-style plan for each individual PR. |

For questions about the rebuild, open an issue or comment on #1.
