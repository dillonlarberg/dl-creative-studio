# PR 2 — Scoped Schema + Email Allowlist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the path-scoped Firestore schema (`clients/{slug}/apps/{appId}/...`), lock down access with a hardcoded email allowlist in Firestore + Storage rules, add the two Cloud Function shared guards (`assertAlliStudioUser`, `assertResourceClient`), build the URL-driven `ClientProvider`, and ship an idempotent brand-profile import script. After PR 2, the SOC2-relevant data physical separation is in place and PR 3 can start extracting `edit-image` against the new path layer.

**Architecture:** Email allowlist (≤10 PMG users) lives in two places: a function literal in `firestore.rules` / `storage.rules` and a TypeScript constant in `functions/src/_shared/allowlist.ts`. A drift unit test asserts the two stay in sync. Path scoping is centralized in `src/platform/firebase/paths.ts` so every Firestore read/write requires a typed `clientSlug` (and where relevant `appId`) at compile time. URL is the source of truth for active client (`/:clientSlug/...`); `ClientProvider` reads it via `useParams()` and validates against Alli `/clients`.

**Tech Stack:** vitest 2.x + @testing-library/react 16 + @firebase/rules-unit-testing (version TBD in Task 2 — see deferred peer-dep from PR 1).

**PR scope:** This is the data-layer foundation. PR 3 (`feat/app-registry`) starts wiring apps to the new schema. PR 2 lands on `dev` but does NOT deploy to production rules — the existing `automated-creative-e10d7` continues running its old rules until the final coordinated cutover. Local iteration uses Firebase emulators throughout.

---

## File structure

**Files created in this PR:**

- `src/platform/firebase/paths.ts` — typed path helpers. Single source of truth for Firestore + Storage path strings.
- `src/platform/client/ClientProvider.tsx` — URL-driven React context for active client.
- `src/platform/client/useCurrentClient.ts` — convenience hook re-export.
- `functions/src/_shared/allowlist.ts` — TypeScript constant of allowlisted PMG emails, plus a tiny helper.
- `functions/src/_shared/assertAlliStudioUser.ts` — caller-identity guard for callable functions.
- `functions/src/_shared/assertResourceClient.ts` — resource-ownership guard for URL/path inputs.
- `functions/src/_shared/__tests__/assertAlliStudioUser.test.ts`
- `functions/src/_shared/__tests__/assertResourceClient.test.ts`
- `functions/src/_shared/__tests__/allowlist-drift.test.ts` — asserts allowlist in `firestore.rules` matches the TypeScript constant.
- `tests/rules/firestore.rules.test.ts` — emulator-based tests for the new Firestore rules.
- `tests/rules/storage.rules.test.ts` — emulator-based tests for the new Storage rules.
- `scripts/import-brand-profiles.ts` — idempotent migration script.
- `scripts/__tests__/import-brand-profiles.test.ts` — idempotency test against the emulator.
- `firebase.emulators.json` — emulator port config.
- `src/platform/firebase/__tests__/paths.test.ts` — unit test for path strings.
- `src/platform/client/__tests__/ClientProvider.test.tsx` — smoke test.

**Files modified in this PR:**

- `firestore.rules` — full rewrite. New `isAlliStudioUser()` predicate + path-scoped rules.
- `storage.rules` — full rewrite. Same predicate; remove permissive `/uploads/{slug}/**`.
- `src/firebase.ts` — no functional change but add inline doc that this points at `(default)`.
- `package.json` — add `@firebase/rules-unit-testing` (version resolved in Task 2), add `firebase-tools` dev dependency for the emulator suite, add `test:rules`, `emulators:start`, `import-brand-profiles` scripts.
- `firebase.json` — add `emulators` block + the new `firestore.rules` / `storage.rules` if their paths change.
- `tsconfig.app.json` — exclude any new test directory patterns.
- `vitest.config.ts` — extend `include` to cover `tests/rules/**/*.test.ts` if those run alongside (or split into a separate `vitest.rules.config.ts` — Task 11 decides).

**Files NOT touched in this PR:**

- `src/services/creative.ts`, `src/services/clientAssetHouse.ts`, `src/services/templates.ts`, `src/services/batches.ts` — these stay on the old paths until PR 3 wires apps to the new schema. PR 2 is foundation-only.
- `functions/src/ai.ts` (`analyzeVideoForCutdowns`), `functions/src/video.ts` (`processVideoCutdowns`) — guards are written but not wired in until PR 8 (`feat/extract-video-cutdown`) so we don't break the running prototype.
- `src/pages/use-cases/UseCaseWizardPage.tsx` — the monolith. Untouched.

---

## Allowlist placeholder

The actual email list is provided by the project owner just before Task 7 (rules) and Task 8 (allowlist module). Until then, every reference to specific emails in this plan uses the placeholder `<ALLOWLIST_EMAILS>`. **Tasks 1-6 do not need the emails and can run immediately.**

---

## Task 1: Branch off dev

**Files:** none (git operations only)

- [ ] **Step 1.1: Confirm clean working tree on `dev`**

Run:
```bash
git checkout dev
git pull --ff-only
git status
```

Expected: "Your branch is up to date with 'origin/dev'." and "nothing to commit, working tree clean".

- [ ] **Step 1.2: Create `feat/scoped-schema` branch**

Run:
```bash
git checkout -b feat/scoped-schema
```

Do NOT push yet. Push happens after first meaningful commit.

---

## Task 2: Resolve `@firebase/rules-unit-testing` peer-dep

**Files modified:**
- `package.json`
- `package-lock.json`

PR 1 deferred installing `@firebase/rules-unit-testing` because version 3.x peers `firebase ^10` and version 4.x peers `firebase ^11`, both incompatible with this project's `firebase ^12.9.0`.

Strategy (in order of preference):

- [ ] **Step 2.1: Check for a newer release**

Run:
```bash
npm view @firebase/rules-unit-testing versions --json 2>&1 | tail -5
npm view @firebase/rules-unit-testing peerDependencies --json
```

If a 5.x release exists and its peer dep includes `firebase ^12`, install that:
```bash
npm install --save-dev @firebase/rules-unit-testing@^5.0.0
```

If only 3.x and 4.x are published as of execution time, fall back to Step 2.2.

- [ ] **Step 2.2: Install with `--legacy-peer-deps` (scoped to this single install)**

Run:
```bash
npm install --save-dev @firebase/rules-unit-testing@^4.0.0 --legacy-peer-deps
```

This is the ONLY package we ever install with `--legacy-peer-deps`. The reason is documented in this plan; future installs go through the strict resolver.

Verify install worked:
```bash
node -e "const pkg = require('./package.json'); console.log('@firebase/rules-unit-testing =>', pkg.devDependencies['@firebase/rules-unit-testing'] || 'MISSING')"
```

Expected: prints a real version string.

- [ ] **Step 2.3: Install firebase-tools for the emulator**

Run:
```bash
npm install --save-dev firebase-tools@^13.0.0
```

This gives us `firebase emulators:start` locally without requiring a global install. Verify with:
```bash
npx firebase --version
```

Expected: prints a version string ≥ 13.

- [ ] **Step 2.4: Commit**

Stage exactly:
```bash
git add package.json package-lock.json
```

Commit:
```bash
git commit -m "chore: install @firebase/rules-unit-testing and firebase-tools for emulator-based rules tests

PR 1 deferred this install due to peer-dep conflict between rules-unit-testing 3.x/4.x and firebase 12. Resolution: <installed version, e.g. ^4.0.0 with --legacy-peer-deps>. The conflict is in the declared peer range only; the runtime API surface is stable across firebase 11 and 12.

PR 2 needs this for the firestore.rules and storage.rules emulator test suites in Tasks 9-10.

Tracking: dillonlarberg/dl-creative-studio#1"
```

---

## Task 3: Set up Firebase emulator config

**Files created:**
- `firebase.emulators.json` (or extend `firebase.json` — pick one in Step 3.1)

- [ ] **Step 3.1: Decide config location**

Read `firebase.json`. If it already has an `emulators` block, extend it. If not, add one. Preferred shape (single source of truth):

```json
{
  "firestore": { "rules": "firestore.rules" },
  "storage": { "rules": "storage.rules" },
  "hosting": { ... },
  "functions": [ ... ],
  "emulators": {
    "auth": { "port": 9099 },
    "firestore": { "port": 8080 },
    "storage": { "port": 9199 },
    "functions": { "port": 5001 },
    "ui": { "enabled": true, "port": 4000 },
    "singleProjectMode": true
  }
}
```

Add the block to the existing `firebase.json` (do NOT create a separate file — `firebase emulators:start` reads from `firebase.json`).

- [ ] **Step 3.2: Add npm scripts**

Open `package.json`. Add to `scripts`:

```json
"emulators:start": "firebase emulators:start --only auth,firestore,storage",
"test:rules": "vitest run --config vitest.rules.config.ts"
```

(The `vitest.rules.config.ts` config file is created in Task 11.)

- [ ] **Step 3.3: Verify emulators start**

Run (in a separate terminal that you can `Ctrl+C` out of):
```bash
npm run emulators:start
```

Expected: emulators boot, the UI is reachable at `http://localhost:4000`. Press `Ctrl+C` to stop.

If a port is in use (e.g. 8080 conflicts with another local service), pick a different port in `firebase.json` and re-run.

- [ ] **Step 3.4: Commit**

Stage:
```bash
git add firebase.json package.json
```

Commit:
```bash
git commit -m "chore: add Firebase emulator config and npm scripts

Adds emulators block to firebase.json (auth, firestore, storage, functions, ui ports). Adds emulators:start and test:rules npm scripts. Verified locally that 'npm run emulators:start' boots the suite and the UI renders at localhost:4000.

The test:rules script will be wired to vitest.rules.config.ts in Task 11.

Tracking: dillonlarberg/dl-creative-studio#1"
```

---

## Task 4: Build `paths.ts` (typed path helpers)

**Files created:**
- `src/platform/firebase/paths.ts`
- `src/platform/firebase/__tests__/paths.test.ts`

This is the load-bearing seam. Every Firestore read/write must go through these helpers.

- [ ] **Step 4.1: Write the failing test**

Create `src/platform/firebase/__tests__/paths.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { paths, type AppId } from '../paths';

describe('paths', () => {
  describe('client', () => {
    it('returns the client root path', () => {
      expect(paths.client('ralph_lauren')).toBe('clients/ralph_lauren');
    });
  });

  describe('profile', () => {
    it('returns the brand profile path', () => {
      expect(paths.profile('ralph_lauren')).toBe('clients/ralph_lauren/profile');
    });
  });

  describe('assets', () => {
    it('returns the assets collection path', () => {
      expect(paths.assets('ralph_lauren')).toBe('clients/ralph_lauren/assets');
    });

    it('returns a single asset doc path when given an id', () => {
      expect(paths.asset('ralph_lauren', 'logo_primary')).toBe(
        'clients/ralph_lauren/assets/logo_primary'
      );
    });
  });

  describe('app subtree', () => {
    it('returns the app root path', () => {
      const appId: AppId = 'edit-image';
      expect(paths.app('ralph_lauren', appId)).toBe(
        'clients/ralph_lauren/apps/edit-image'
      );
    });

    it('returns the creatives collection path', () => {
      expect(paths.creatives('ralph_lauren', 'edit-image')).toBe(
        'clients/ralph_lauren/apps/edit-image/creatives'
      );
    });

    it('returns a single creative doc path when given an id', () => {
      expect(paths.creative('ralph_lauren', 'edit-image', 'abc123')).toBe(
        'clients/ralph_lauren/apps/edit-image/creatives/abc123'
      );
    });
  });

  describe('storage paths', () => {
    it('returns a client-scoped storage prefix', () => {
      expect(paths.storage.client('ralph_lauren')).toBe('clients/ralph_lauren');
    });

    it('returns a typed app-scoped storage path with arbitrary suffix', () => {
      expect(paths.storage.app('ralph_lauren', 'edit-image', 'uploads/abc.png')).toBe(
        'clients/ralph_lauren/apps/edit-image/uploads/abc.png'
      );
    });
  });

  describe('compile-time invariants (these would be TS errors if regressed)', () => {
    it('app() refuses an unknown AppId at compile time', () => {
      // @ts-expect-error — 'not-an-app' is not a valid AppId
      paths.app('ralph_lauren', 'not-an-app');
      // The runtime call still produces a string; the test passes if the @ts-expect-error
      // directive matches a real type error. If AppId becomes string this test fails to compile.
      expect(true).toBe(true);
    });
  });
});
```

- [ ] **Step 4.2: Run test to verify it fails**

Run:
```bash
npm run test:run -- src/platform/firebase/__tests__/paths.test.ts
```

Expected: import error — `paths` does not exist yet.

- [ ] **Step 4.3: Write the implementation**

Create `src/platform/firebase/paths.ts`:

```ts
/**
 * Single source of truth for Firestore and Storage path strings.
 *
 * Every Firestore read/write and every Storage upload/download must go
 * through these helpers. Hand-built path strings elsewhere in the codebase
 * are a regression — the typed signatures here enforce that a clientSlug
 * and (where relevant) an appId are always supplied.
 *
 * Schema:
 *   clients/{slug}                                  ← profile metadata
 *     /assets/{assetId}                             ← brand assets
 *     /apps/{appId}                                 ← per-app subtree
 *       /creatives/{creativeId}                     ← drafts, completed runs
 *       /templates/{templateId}                     ← template-builder app
 *       /batches/{batchId}                          ← feed-processing app
 *
 * Storage mirrors the same hierarchy:
 *   clients/{slug}/apps/{appId}/<arbitrary suffix>
 */

export type AppId =
  | 'resize-image'
  | 'edit-image'
  | 'new-image'
  | 'edit-video'
  | 'new-video'
  | 'video-cutdown'
  | 'template-builder'
  | 'feed-processing';

export type ClientSlug = string;
export type CreativeId = string;
export type AssetId = string;

const root = (slug: ClientSlug) => `clients/${slug}`;

export const paths = {
  client: (slug: ClientSlug) => root(slug),
  profile: (slug: ClientSlug) => `${root(slug)}/profile`,

  assets: (slug: ClientSlug) => `${root(slug)}/assets`,
  asset: (slug: ClientSlug, id: AssetId) => `${root(slug)}/assets/${id}`,

  app: (slug: ClientSlug, appId: AppId) => `${root(slug)}/apps/${appId}`,
  creatives: (slug: ClientSlug, appId: AppId) => `${root(slug)}/apps/${appId}/creatives`,
  creative: (slug: ClientSlug, appId: AppId, id: CreativeId) =>
    `${root(slug)}/apps/${appId}/creatives/${id}`,

  storage: {
    client: (slug: ClientSlug) => root(slug),
    app: (slug: ClientSlug, appId: AppId, suffix: string) =>
      `${root(slug)}/apps/${appId}/${suffix.replace(/^\/+/, '')}`,
  },
} as const;

export type Paths = typeof paths;
```

- [ ] **Step 4.4: Run test to verify it passes**

Run:
```bash
npm run test:run -- src/platform/firebase/__tests__/paths.test.ts
```

Expected: 7 tests pass (or 8, depending on how the `@ts-expect-error` test reports). If the `@ts-expect-error` test fails because `'not-an-app'` is accepted, the AppId union type was not enforced — fix the type definition.

- [ ] **Step 4.5: Run full test suite to verify no regressions**

Run:
```bash
npm run test:run
```

Expected: 4 test files now pass (paths + the existing 3).

- [ ] **Step 4.6: Commit**

```bash
git add src/platform/firebase/paths.ts src/platform/firebase/__tests__/paths.test.ts
git commit -m "feat(platform): add typed Firestore + Storage path helpers

Single source of truth for path strings. Every Firestore read/write must go through paths.client / paths.profile / paths.creatives / paths.creative / paths.assets / paths.app, and every Storage path through paths.storage.*. The AppId union type makes an unknown app a compile-time error.

This is the load-bearing seam for SOC2 tenant isolation: an unscoped query is impossible by construction because every helper requires a clientSlug at the type level.

Tests: 7 unit tests + 1 compile-time @ts-expect-error guard.

Tracking: dillonlarberg/dl-creative-studio#1"
```

---

## Task 5: Build `assertResourceClient` (no email dep)

**Files created:**
- `functions/src/_shared/assertResourceClient.ts`
- `functions/src/_shared/__tests__/assertResourceClient.test.ts`

This is one of the two Cloud Function shared guards. It does NOT need the email allowlist — it validates that a resource path belongs to the asserted client. Used by callable functions that take URL/path inputs (the IDOR fix from PR v2 eng review).

- [ ] **Step 5.1: Write the failing test**

Create `functions/src/_shared/__tests__/assertResourceClient.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import { assertResourceClient } from '../assertResourceClient';

describe('assertResourceClient', () => {
  it('does not throw when the resource path is under the asserted client', () => {
    expect(() =>
      assertResourceClient('ralph_lauren', 'clients/ralph_lauren/apps/edit-image/uploads/abc.png')
    ).not.toThrow();
  });

  it('does not throw when the resource path is at the client root', () => {
    expect(() =>
      assertResourceClient('ralph_lauren', 'clients/ralph_lauren/profile')
    ).not.toThrow();
  });

  it('throws permission-denied when the resource path is under a different client', () => {
    expect(() =>
      assertResourceClient('ralph_lauren', 'clients/sharkninja/apps/edit-image/uploads/abc.png')
    ).toThrow(HttpsError);

    try {
      assertResourceClient('ralph_lauren', 'clients/sharkninja/apps/edit-image/uploads/abc.png');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpsError);
      expect((err as HttpsError).code).toBe('permission-denied');
    }
  });

  it('throws when the resource path does not start with clients/', () => {
    expect(() =>
      assertResourceClient('ralph_lauren', 'public/some-other-bucket/file.png')
    ).toThrow(HttpsError);
  });

  it('throws when the resource path is empty', () => {
    expect(() => assertResourceClient('ralph_lauren', '')).toThrow(HttpsError);
  });

  it('throws when the resource path attempts a traversal escape', () => {
    expect(() =>
      assertResourceClient('ralph_lauren', 'clients/ralph_lauren/../sharkninja/secret')
    ).toThrow(HttpsError);
  });

  it('rejects a path that LOOKS like the right prefix but is a different client (prefix attack)', () => {
    // 'ralph_lauren' is a prefix of 'ralph_lauren_evil'
    expect(() =>
      assertResourceClient('ralph_lauren', 'clients/ralph_lauren_evil/secret')
    ).toThrow(HttpsError);
  });
});
```

- [ ] **Step 5.2: Run test to verify it fails**

The functions/ directory has its own test setup. Verify a vitest config exists for functions, OR run via the root vitest config if it includes functions/.

Run from project root:
```bash
npm run test:run -- functions/src/_shared/__tests__/assertResourceClient.test.ts
```

Expected: import error — `assertResourceClient` doesn't exist.

If `vitest.config.ts` excludes `functions/` (which it does — see PR 1's config), this test will be skipped. Add a separate `functions/vitest.config.ts` AND update the root `vitest.config.ts` to either include `functions/src/**/*.test.ts` (single test runner for whole repo) OR keep the exclusion and run two separate vitest invocations.

**Decision: single test runner for the whole repo.** Update the root `vitest.config.ts`:

```ts
exclude: [
  'node_modules',
  'dist',
  '.firebase',
  // Removed 'functions' from exclude so functions tests run too.
],
include: [
  'src/**/*.test.{ts,tsx}',
  'src/**/__tests__/**/*.test.{ts,tsx}',
  'functions/src/**/*.test.ts',
  'functions/src/**/__tests__/**/*.test.ts',
],
```

Run again — should now report the missing import.

- [ ] **Step 5.3: Write the implementation**

Create `functions/src/_shared/assertResourceClient.ts`:

```ts
import { HttpsError } from 'firebase-functions/v2/https';

/**
 * Verifies that a resource path (Firestore doc path, Storage path, or any
 * client-scoped path string) belongs to the asserted client. Throws a
 * permission-denied HttpsError if the path falls under a different client
 * or is not client-scoped at all.
 *
 * Used by callable Cloud Functions that accept URL or path arguments to
 * prevent cross-client IDOR — a member of one client passing a foreign
 * URL into a function that processes it.
 *
 * Path traversal sequences (`..`) and prefix attacks are rejected.
 */
export function assertResourceClient(clientSlug: string, resourcePath: string): void {
  if (!resourcePath || typeof resourcePath !== 'string') {
    throw new HttpsError('permission-denied', 'Invalid resource path');
  }

  if (resourcePath.includes('..')) {
    throw new HttpsError('permission-denied', 'Resource path contains traversal');
  }

  // Match exact prefix `clients/{slug}/` or exact equality with `clients/{slug}`.
  // This prevents prefix attacks where 'ralph_lauren' would otherwise match
  // 'ralph_lauren_evil/...'.
  const expectedRoot = `clients/${clientSlug}`;
  const expectedPrefix = `${expectedRoot}/`;

  if (resourcePath !== expectedRoot && !resourcePath.startsWith(expectedPrefix)) {
    throw new HttpsError(
      'permission-denied',
      `Resource path does not belong to client '${clientSlug}'`
    );
  }
}
```

- [ ] **Step 5.4: Run test to verify it passes**

```bash
npm run test:run -- functions/src/_shared/__tests__/assertResourceClient.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 5.5: Run full test suite**

```bash
npm run test:run
```

Expected: 5 test files pass (paths + assertResourceClient + 3 existing).

- [ ] **Step 5.6: Commit**

```bash
git add functions/src/_shared/assertResourceClient.ts functions/src/_shared/__tests__/assertResourceClient.test.ts vitest.config.ts
git commit -m "feat(functions): add assertResourceClient guard against cross-client IDOR

Closes the IDOR called out in the PR-v2 engineering review. Cloud Functions that accept URL or storage path arguments can now validate that the resource belongs to the asserted client. A path under a different client, a non-clients-scoped path, a path with traversal (..), or an empty path all throw permission-denied.

Prefix attacks are rejected (e.g. asserting 'ralph_lauren' does not match 'clients/ralph_lauren_evil/...') by requiring exact equality with 'clients/{slug}' or a 'clients/{slug}/' prefix with the trailing slash.

Wired into analyzeVideoForCutdowns and processVideoCutdowns in PR 8 (feat/extract-video-cutdown).

Also: vitest.config.ts now includes functions/src/**/*.test.ts so the same vitest invocation covers the whole repo.

Tests: 7 unit tests covering the IDOR scenarios.

Tracking: dillonlarberg/dl-creative-studio#1"
```

---

## Task 6: Build `ClientProvider` (URL-driven, no email dep)

**Files created:**
- `src/platform/client/ClientProvider.tsx`
- `src/platform/client/useCurrentClient.ts`
- `src/platform/client/__tests__/ClientProvider.test.tsx`

`ClientProvider` reads the active client slug from `useParams()`, validates it against the user's Alli `/clients` response, and exposes `{ currentClient, allowedClients, isLoading, error }`. There is no `setCurrentClient` — switching clients means navigating to a new URL.

For PR 2 we wire ClientProvider but do NOT integrate it into the existing app. PR 3 makes that integration. This keeps the running prototype unaffected.

- [ ] **Step 6.1: Write the failing test**

Create `src/platform/client/__tests__/ClientProvider.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ClientProvider } from '../ClientProvider';
import { useCurrentClient } from '../useCurrentClient';
import * as alliService from '@/services/alli';

vi.mock('@/services/alli', () => ({
  alliService: {
    getClients: vi.fn(),
  },
}));

function ProbeComponent() {
  const ctx = useCurrentClient();
  if (ctx.isLoading) return <p>loading</p>;
  if (ctx.error) return <p>error: {ctx.error}</p>;
  if (!ctx.currentClient) return <p>no client</p>;
  return <p>client: {ctx.currentClient.slug}</p>;
}

const allowed = [
  { slug: 'ralph_lauren', name: 'Ralph Lauren', id: 'rl-1' },
  { slug: 'sharkninja', name: 'Shark Ninja', id: 'sn-1' },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ClientProvider', () => {
  it('renders loading state while Alli /clients resolves', () => {
    vi.mocked(alliService.alliService.getClients).mockReturnValue(new Promise(() => {}));
    render(
      <MemoryRouter initialEntries={['/ralph_lauren']}>
        <Routes>
          <Route
            path="/:clientSlug"
            element={
              <ClientProvider>
                <ProbeComponent />
              </ClientProvider>
            }
          />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('loading')).toBeInTheDocument();
  });

  it('exposes currentClient when URL slug is in the user-allowed list', async () => {
    vi.mocked(alliService.alliService.getClients).mockResolvedValue(allowed);
    render(
      <MemoryRouter initialEntries={['/ralph_lauren']}>
        <Routes>
          <Route
            path="/:clientSlug"
            element={
              <ClientProvider>
                <ProbeComponent />
              </ClientProvider>
            }
          />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText('client: ralph_lauren')).toBeInTheDocument());
  });

  it('surfaces an error when URL slug is NOT in the user-allowed list', async () => {
    vi.mocked(alliService.alliService.getClients).mockResolvedValue(allowed);
    render(
      <MemoryRouter initialEntries={['/apple_services']}>
        <Routes>
          <Route
            path="/:clientSlug"
            element={
              <ClientProvider>
                <ProbeComponent />
              </ClientProvider>
            }
          />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText(/error:/)).toBeInTheDocument());
  });

  it('surfaces an error when Alli /clients fails', async () => {
    vi.mocked(alliService.alliService.getClients).mockRejectedValue(new Error('alli down'));
    render(
      <MemoryRouter initialEntries={['/ralph_lauren']}>
        <Routes>
          <Route
            path="/:clientSlug"
            element={
              <ClientProvider>
                <ProbeComponent />
              </ClientProvider>
            }
          />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText(/error:/)).toBeInTheDocument());
  });
});
```

- [ ] **Step 6.2: Run test to verify it fails**

```bash
npm run test:run -- src/platform/client/__tests__/ClientProvider.test.tsx
```

Expected: import error.

- [ ] **Step 6.3: Write the implementation**

Create `src/platform/client/ClientProvider.tsx`:

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { alliService } from '@/services/alli';

export interface Client {
  slug: string;
  name: string;
  id: string;
}

interface ClientContextValue {
  currentClient: Client | null;
  allowedClients: Client[];
  isLoading: boolean;
  error: string | null;
}

const ClientContext = createContext<ClientContextValue | null>(null);

export function ClientProvider({ children }: { children: ReactNode }) {
  const { clientSlug } = useParams<{ clientSlug: string }>();
  const [allowedClients, setAllowedClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    alliService
      .getClients()
      .then((list) => {
        if (cancelled) return;
        setAllowedClients(list);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load clients');
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  let currentClient: Client | null = null;
  if (!isLoading && !error && clientSlug) {
    const found = allowedClients.find((c) => c.slug === clientSlug);
    if (found) {
      currentClient = found;
    } else {
      // URL slug is not in the user's allowed list. Surface as an error;
      // a higher-level router decides whether to redirect to /select-client.
      return (
        <ClientContext.Provider
          value={{
            currentClient: null,
            allowedClients,
            isLoading: false,
            error: `Client '${clientSlug}' is not in your allowed list`,
          }}
        >
          {children}
        </ClientContext.Provider>
      );
    }
  }

  return (
    <ClientContext.Provider value={{ currentClient, allowedClients, isLoading, error }}>
      {children}
    </ClientContext.Provider>
  );
}

export function useClientContext(): ClientContextValue {
  const ctx = useContext(ClientContext);
  if (!ctx) {
    throw new Error('useClientContext must be used inside <ClientProvider>');
  }
  return ctx;
}
```

Create `src/platform/client/useCurrentClient.ts`:

```ts
export { useClientContext as useCurrentClient } from './ClientProvider';
```

- [ ] **Step 6.4: Run test to verify it passes**

```bash
npm run test:run -- src/platform/client/__tests__/ClientProvider.test.tsx
```

Expected: 4 tests pass.

- [ ] **Step 6.5: Run full test suite**

```bash
npm run test:run
```

Expected: 6 test files pass.

- [ ] **Step 6.6: Commit**

```bash
git add src/platform/client/
git commit -m "feat(platform): add URL-driven ClientProvider

Reads the active client slug from useParams().clientSlug and validates against the user's Alli /clients response. Exposes { currentClient, allowedClients, isLoading, error }. There is no setCurrentClient — switching clients means navigating to a new URL, which gives cross-tab consistency by construction.

Not yet integrated into App.tsx; PR 3 wires it in alongside the per-app routes. PR 2 lands the provider so PR 3's first task is route mounting, not provider design.

Tests: 4 component tests covering loading, allowed-slug, denied-slug, and Alli-failure states.

Tracking: dillonlarberg/dl-creative-studio#1"
```

---

## Task 7: Build the email allowlist module — **PAUSE FOR EMAILS**

**Files created:**
- `functions/src/_shared/allowlist.ts`

**This task requires the actual list of allowlisted PMG emails.** Pause execution until the project owner provides them. Once provided, replace `<ALLOWLIST_EMAILS>` below with the real list and resume.

- [ ] **Step 7.1: Receive the email allowlist from the project owner**

The list is a small set (≤10) of `*@pmg.com` addresses for PMG employees who should have access to Alli Studio. Capture the list verbatim as an array of strings.

- [ ] **Step 7.2: Write the failing test**

Create `functions/src/_shared/__tests__/allowlist.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ALLI_STUDIO_USERS, isAlliStudioUserEmail } from '../allowlist';

describe('ALLI_STUDIO_USERS', () => {
  it('is a non-empty Set of strings', () => {
    expect(ALLI_STUDIO_USERS.size).toBeGreaterThan(0);
    for (const email of ALLI_STUDIO_USERS) {
      expect(typeof email).toBe('string');
    }
  });

  it('contains only @pmg.com addresses', () => {
    for (const email of ALLI_STUDIO_USERS) {
      expect(email).toMatch(/@pmg\.com$/);
    }
  });

  it('contains only lowercase addresses (rules and TS comparisons are case-sensitive)', () => {
    for (const email of ALLI_STUDIO_USERS) {
      expect(email).toBe(email.toLowerCase());
    }
  });
});

describe('isAlliStudioUserEmail', () => {
  it('returns true for an allowlisted email', () => {
    const someAllowed = ALLI_STUDIO_USERS.values().next().value!;
    expect(isAlliStudioUserEmail(someAllowed)).toBe(true);
  });

  it('returns false for a non-allowlisted email', () => {
    expect(isAlliStudioUserEmail('random@example.com')).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isAlliStudioUserEmail(undefined)).toBe(false);
  });

  it('is case-sensitive (preventing case-mismatch bypasses)', () => {
    const someAllowed = ALLI_STUDIO_USERS.values().next().value!;
    expect(isAlliStudioUserEmail(someAllowed.toUpperCase())).toBe(false);
  });
});
```

- [ ] **Step 7.3: Run test to verify it fails**

```bash
npm run test:run -- functions/src/_shared/__tests__/allowlist.test.ts
```

Expected: import error.

- [ ] **Step 7.4: Write the implementation**

Create `functions/src/_shared/allowlist.ts`:

```ts
/**
 * Hardcoded email allowlist for Alli Studio access control.
 *
 * The same list MUST appear in firestore.rules and storage.rules. The
 * allowlist-drift test (Task 9) asserts the two stay in sync at build time.
 *
 * Adding a PMG user is a two-line change:
 *   1. Add their email here.
 *   2. Add their email to the isAlliStudioUser() function in firestore.rules
 *      and storage.rules (the function literal is identical in both files).
 *
 * Future migration to per-client claims: replace this allowlist with a
 * `syncClientClaims` Cloud Function that calls Alli /clients on login and
 * writes per-client membership to Firebase custom claims. The rules predicate
 * swaps from "email in [list]" to "slug in token.clients". The TS-side
 * change is contained to this module plus the assertAlliStudioUser guard.
 */

export const ALLI_STUDIO_USERS: ReadonlySet<string> = new Set([
  // <ALLOWLIST_EMAILS> — replace with the project-owner-supplied list. Example:
  // 'diego.escobar@pmg.com',
]);

export function isAlliStudioUserEmail(email: string | undefined): boolean {
  if (!email) return false;
  return ALLI_STUDIO_USERS.has(email);
}
```

Replace the placeholder comment and example with the actual allowlist provided in Step 7.1. Use one email per line, lowercase, alphabetically sorted for readability.

- [ ] **Step 7.5: Run tests to verify**

```bash
npm run test:run -- functions/src/_shared/__tests__/allowlist.test.ts
```

Expected: 7 tests pass (3 ALLI_STUDIO_USERS shape tests + 4 isAlliStudioUserEmail tests).

- [ ] **Step 7.6: Commit**

```bash
git add functions/src/_shared/allowlist.ts functions/src/_shared/__tests__/allowlist.test.ts
git commit -m "feat(functions): add hardcoded email allowlist for Alli Studio access

ALLI_STUDIO_USERS is the prototype-scale access control: <N> PMG users with @pmg.com email addresses verified by Firebase Auth via Alli OIDC. Future migration to per-client custom claims is documented inline.

isAlliStudioUserEmail is the predicate consumed by assertAlliStudioUser (Task 8). Comparison is case-sensitive to prevent case-mismatch bypasses; the test suite asserts all entries are lowercased.

The same list lives in firestore.rules and storage.rules. The drift test in Task 10 asserts the two stay in sync.

Tracking: dillonlarberg/dl-creative-studio#1"
```

---

## Task 8: Build `assertAlliStudioUser` (needs allowlist module)

**Files created:**
- `functions/src/_shared/assertAlliStudioUser.ts`
- `functions/src/_shared/__tests__/assertAlliStudioUser.test.ts`

- [ ] **Step 8.1: Write the failing test**

Create `functions/src/_shared/__tests__/assertAlliStudioUser.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { assertAlliStudioUser } from '../assertAlliStudioUser';
import { ALLI_STUDIO_USERS } from '../allowlist';

const allowedEmail = ALLI_STUDIO_USERS.values().next().value!;

function fakeRequest(authToken: Record<string, unknown> | null): CallableRequest {
  return {
    auth: authToken ? ({ uid: 'test-uid', token: authToken } as any) : undefined,
  } as CallableRequest;
}

describe('assertAlliStudioUser', () => {
  it('does not throw for an allowlisted user with verified email', () => {
    const req = fakeRequest({ email: allowedEmail, email_verified: true });
    expect(() => assertAlliStudioUser(req)).not.toThrow();
  });

  it('throws for an allowlisted user with UNVERIFIED email', () => {
    const req = fakeRequest({ email: allowedEmail, email_verified: false });
    expect(() => assertAlliStudioUser(req)).toThrow(HttpsError);
  });

  it('throws for a non-allowlisted user with verified email', () => {
    const req = fakeRequest({ email: 'random@example.com', email_verified: true });
    expect(() => assertAlliStudioUser(req)).toThrow(HttpsError);
  });

  it('throws when there is no auth context at all', () => {
    expect(() => assertAlliStudioUser(fakeRequest(null))).toThrow(HttpsError);
  });

  it('throws when the email field is missing from the token', () => {
    const req = fakeRequest({ email_verified: true });
    expect(() => assertAlliStudioUser(req)).toThrow(HttpsError);
  });

  it('throws permission-denied (not unauthenticated) so the caller cannot distinguish causes', () => {
    try {
      assertAlliStudioUser(fakeRequest(null));
    } catch (err) {
      expect((err as HttpsError).code).toBe('permission-denied');
    }
  });
});
```

- [ ] **Step 8.2: Run test to verify it fails**

```bash
npm run test:run -- functions/src/_shared/__tests__/assertAlliStudioUser.test.ts
```

Expected: import error.

- [ ] **Step 8.3: Write the implementation**

Create `functions/src/_shared/assertAlliStudioUser.ts`:

```ts
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { isAlliStudioUserEmail } from './allowlist';

/**
 * Caller-identity guard for callable Cloud Functions.
 *
 * Throws permission-denied unless the caller's auth token has:
 *   - email_verified === true
 *   - email === one of the entries in ALLI_STUDIO_USERS
 *
 * Always throws permission-denied (never unauthenticated) so a probe cannot
 * distinguish "no auth" from "auth but not allowlisted".
 *
 * Pair with assertResourceClient when the function takes a URL or path
 * argument: this guard checks WHO is calling; that one checks WHAT they
 * are operating on.
 */
export function assertAlliStudioUser(req: CallableRequest<unknown>): void {
  const token = req.auth?.token as { email?: string; email_verified?: boolean } | undefined;
  const email = token?.email;
  const verified = token?.email_verified === true;

  if (!verified || !isAlliStudioUserEmail(email)) {
    throw new HttpsError('permission-denied', 'Not an Alli Studio user');
  }
}
```

- [ ] **Step 8.4: Run test to verify it passes**

```bash
npm run test:run -- functions/src/_shared/__tests__/assertAlliStudioUser.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 8.5: Commit**

```bash
git add functions/src/_shared/assertAlliStudioUser.ts functions/src/_shared/__tests__/assertAlliStudioUser.test.ts
git commit -m "feat(functions): add assertAlliStudioUser caller-identity guard

Throws permission-denied unless the caller's token has email_verified === true and email is in ALLI_STUDIO_USERS. Always throws the same error code (permission-denied, not unauthenticated) so probes cannot distinguish 'no auth' from 'auth but not allowlisted'.

Wired into the existing alliProxy functions in Task 14, and into analyzeVideoForCutdowns / processVideoCutdowns in PR 8.

Tests: 6 unit tests covering all branches (verified+allowed, verified+denied, unverified+allowed, no auth, missing email, error code).

Tracking: dillonlarberg/dl-creative-studio#1"
```

---

## Task 9: Write new `firestore.rules` + emulator tests (needs allowlist)

**Files modified:**
- `firestore.rules` (full rewrite)

**Files created:**
- `tests/rules/firestore.rules.test.ts`
- `vitest.rules.config.ts`

- [ ] **Step 9.1: Write the failing test**

Create `tests/rules/firestore.rules.test.ts`. The test needs the allowlist emails — read them from `functions/src/_shared/allowlist.ts` so the rules and the test don't drift:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { ALLI_STUDIO_USERS } from '../../functions/src/_shared/allowlist';

const allowedEmail = ALLI_STUDIO_USERS.values().next().value!;
const deniedEmail = 'outsider@example.com';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-alli-studio-rules-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

describe('firestore.rules', () => {
  describe('clients/{slug}/** subtree', () => {
    it('allows read+write for an allowlisted user with verified email', async () => {
      const ctx = env.authenticatedContext('test-uid', { email: allowedEmail, email_verified: true });
      const ref = ctx.firestore().doc('clients/ralph_lauren/profile');
      await expect(ref.set({ primaryColor: '#000' })).resolves.not.toThrow();
      await expect(ref.get()).resolves.toBeDefined();
    });

    it('denies read for an allowlisted user with UNVERIFIED email', async () => {
      const ctx = env.authenticatedContext('test-uid', { email: allowedEmail, email_verified: false });
      const ref = ctx.firestore().doc('clients/ralph_lauren/profile');
      await expect(ref.get()).rejects.toThrow();
    });

    it('denies read for a non-allowlisted user', async () => {
      const ctx = env.authenticatedContext('test-uid', { email: deniedEmail, email_verified: true });
      const ref = ctx.firestore().doc('clients/ralph_lauren/profile');
      await expect(ref.get()).rejects.toThrow();
    });

    it('denies read for an unauthenticated request', async () => {
      const ctx = env.unauthenticatedContext();
      const ref = ctx.firestore().doc('clients/ralph_lauren/profile');
      await expect(ref.get()).rejects.toThrow();
    });

    it('allows allowlisted user to write under apps/{appId}/creatives', async () => {
      const ctx = env.authenticatedContext('test-uid', { email: allowedEmail, email_verified: true });
      const ref = ctx.firestore().doc('clients/ralph_lauren/apps/edit-image/creatives/abc');
      await expect(ref.set({ status: 'draft', stepData: {} })).resolves.not.toThrow();
    });
  });

  describe('default-deny outside clients/', () => {
    it('denies read of legacy /creatives even for an allowlisted user', async () => {
      const ctx = env.authenticatedContext('test-uid', { email: allowedEmail, email_verified: true });
      const ref = ctx.firestore().doc('creatives/legacy-doc');
      await expect(ref.get()).rejects.toThrow();
    });

    it('denies read of legacy /clientAssetHouse even for an allowlisted user', async () => {
      const ctx = env.authenticatedContext('test-uid', { email: allowedEmail, email_verified: true });
      const ref = ctx.firestore().doc('clientAssetHouse/ralph_lauren');
      await expect(ref.get()).rejects.toThrow();
    });
  });
});
```

Create `vitest.rules.config.ts` (separate config because rules tests need the emulator running and shouldn't run as part of the default `npm test`):

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/rules/**/*.test.ts'],
    testTimeout: 30000,
  },
});
```

- [ ] **Step 9.2: Run test to verify it fails (and reveals the missing rules content)**

In one terminal:
```bash
npm run emulators:start
```

In another:
```bash
npm run test:rules
```

Expected: tests fail. Either because the emulator can't reach the test (if it's not running), or because the current `firestore.rules` content allows everything for `request.auth != null` (so the "denied" assertions fail).

- [ ] **Step 9.3: Write the new rules**

Replace `firestore.rules` entirely. The `<ALLOWLIST_EMAILS>` placeholder is the same set as in Task 7's TypeScript module:

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // ─────────────────────────────────────────────────────────────────────
    // Email allowlist for Alli Studio access. Must stay in sync with
    // functions/src/_shared/allowlist.ts (asserted by the drift test in
    // functions/src/_shared/__tests__/allowlist-drift.test.ts).
    // ─────────────────────────────────────────────────────────────────────
    function isAlliStudioUser() {
      return request.auth != null
          && request.auth.token.email_verified == true
          && request.auth.token.email in [
               // <ALLOWLIST_EMAILS> — paste the same emails from
               // functions/src/_shared/allowlist.ts here, one per line, lowercase.
             ];
    }

    // Path-scoped tenant subtree.
    match /clients/{clientSlug}/{document=**} {
      allow read, write: if isAlliStudioUser();
    }

    // Default-deny everything else, including legacy `creatives` and
    // `clientAssetHouse` collections from the pre-rebuild schema.
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

- [ ] **Step 9.4: Run test to verify it passes**

```bash
npm run test:rules
```

Expected: all 7 tests pass.

If the allowlist tests fail because emails aren't matching, double-check the `<ALLOWLIST_EMAILS>` block in the rules file is identical to `functions/src/_shared/allowlist.ts` (case, spelling, no extra whitespace).

- [ ] **Step 9.5: Commit**

```bash
git add firestore.rules tests/rules/firestore.rules.test.ts vitest.rules.config.ts
git commit -m "feat(rules): replace permissive firestore.rules with email-allowlist + path scoping

New isAlliStudioUser() predicate checks email_verified == true and email in [hardcoded allowlist]. Same allowlist as functions/src/_shared/allowlist.ts (drift test in Task 10 asserts the two stay in sync).

Path-scoped tenant subtree at clients/{slug}/{document=**}. Default-deny everywhere else, including legacy creatives/{id} and clientAssetHouse/{slug} which are dropped at cutover.

Emulator-based test suite covers: allowlisted+verified can read/write any client subtree, allowlisted+unverified denied, non-allowlisted denied, unauthenticated denied, legacy paths denied even for allowlisted users.

Run with: npm run test:rules (requires npm run emulators:start in another terminal).

This commit changes rules in the repo but does NOT deploy to production. The running prototype on automated-creative-e10d7 continues using the old rules until the coordinated cutover at the end of dev.

Tracking: dillonlarberg/dl-creative-studio#1"
```

---

## Task 10: Write new `storage.rules` + emulator tests + drift test

**Files modified:**
- `storage.rules` (full rewrite)

**Files created:**
- `tests/rules/storage.rules.test.ts`
- `functions/src/_shared/__tests__/allowlist-drift.test.ts`

- [ ] **Step 10.1: Write the failing storage.rules test**

Create `tests/rules/storage.rules.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { ALLI_STUDIO_USERS } from '../../functions/src/_shared/allowlist';

const allowedEmail = ALLI_STUDIO_USERS.values().next().value!;
const deniedEmail = 'outsider@example.com';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-alli-studio-storage-rules-test',
    storage: {
      rules: readFileSync('storage.rules', 'utf8'),
      host: '127.0.0.1',
      port: 9199,
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

describe('storage.rules', () => {
  it('allows read+write under clients/{slug}/ for an allowlisted verified user', async () => {
    const ctx = env.authenticatedContext('test-uid', { email: allowedEmail, email_verified: true });
    const ref = ctx.storage().ref('clients/ralph_lauren/apps/edit-image/uploads/abc.png');
    await expect(ref.put(new Uint8Array([1, 2, 3]))).resolves.not.toThrow();
  });

  it('denies for an unverified-email user', async () => {
    const ctx = env.authenticatedContext('test-uid', { email: allowedEmail, email_verified: false });
    const ref = ctx.storage().ref('clients/ralph_lauren/apps/edit-image/uploads/abc.png');
    await expect(ref.put(new Uint8Array([1, 2, 3]))).rejects.toThrow();
  });

  it('denies for a non-allowlisted user', async () => {
    const ctx = env.authenticatedContext('test-uid', { email: deniedEmail, email_verified: true });
    const ref = ctx.storage().ref('clients/ralph_lauren/apps/edit-image/uploads/abc.png');
    await expect(ref.put(new Uint8Array([1, 2, 3]))).rejects.toThrow();
  });

  it('denies the previously-permissive /uploads/{slug}/** path for ALL callers', async () => {
    const ctx = env.authenticatedContext('test-uid', { email: allowedEmail, email_verified: true });
    const ref = ctx.storage().ref('uploads/ralph_lauren/abc.png');
    await expect(ref.put(new Uint8Array([1, 2, 3]))).rejects.toThrow();
  });

  it('denies anonymous uploads anywhere', async () => {
    const ctx = env.unauthenticatedContext();
    const ref = ctx.storage().ref('clients/ralph_lauren/apps/edit-image/uploads/abc.png');
    await expect(ref.put(new Uint8Array([1, 2, 3]))).rejects.toThrow();
  });
});
```

- [ ] **Step 10.2: Run test to verify it fails**

```bash
npm run test:rules
```

Expected: storage rules tests fail because current `storage.rules` has `allow read, write: if true` for `/uploads/{slug}/**`.

- [ ] **Step 10.3: Write the new storage.rules**

Replace `storage.rules` entirely:

```
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {

    // ─────────────────────────────────────────────────────────────────────
    // Email allowlist — must stay in sync with firestore.rules and
    // functions/src/_shared/allowlist.ts.
    // ─────────────────────────────────────────────────────────────────────
    function isAlliStudioUser() {
      return request.auth != null
          && request.auth.token.email_verified == true
          && request.auth.token.email in [
               // <ALLOWLIST_EMAILS> — same set as firestore.rules.
             ];
    }

    match /clients/{clientSlug}/{allPaths=**} {
      allow read, write: if isAlliStudioUser();
    }

    // Default-deny everywhere else, including the previously-permissive
    // /uploads/{slug}/** path.
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

- [ ] **Step 10.4: Write the allowlist drift test**

Create `functions/src/_shared/__tests__/allowlist-drift.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ALLI_STUDIO_USERS } from '../allowlist';

function extractEmailsFromRules(filePath: string): Set<string> {
  const content = readFileSync(filePath, 'utf8');
  const matches = content.match(/'([^']+@pmg\.com)'/g) ?? [];
  return new Set(matches.map((m) => m.replace(/^'|'$/g, '')));
}

describe('allowlist drift detection', () => {
  it('firestore.rules and functions allowlist contain identical email sets', () => {
    const fromRules = extractEmailsFromRules(resolve('firestore.rules'));
    const fromTs = ALLI_STUDIO_USERS;
    expect([...fromRules].sort()).toEqual([...fromTs].sort());
  });

  it('storage.rules and functions allowlist contain identical email sets', () => {
    const fromRules = extractEmailsFromRules(resolve('storage.rules'));
    const fromTs = ALLI_STUDIO_USERS;
    expect([...fromRules].sort()).toEqual([...fromTs].sort());
  });
});
```

- [ ] **Step 10.5: Run all tests**

```bash
npm run test:run        # runs paths + asserts + ClientProvider + drift test
npm run test:rules      # runs firestore + storage rules emulator tests
```

Expected: every test passes. If drift test fails, the rules files have a different set of emails than the TS module — fix whichever is wrong (the TS module is the source of truth; copy from there).

- [ ] **Step 10.6: Commit**

```bash
git add storage.rules tests/rules/storage.rules.test.ts functions/src/_shared/__tests__/allowlist-drift.test.ts
git commit -m "feat(rules): lock down storage.rules + add allowlist drift test

storage.rules now requires isAlliStudioUser() (same predicate as firestore.rules) for any read/write under clients/{slug}/{allPaths=**}. The previously-permissive /uploads/{slug}/** path is denied for ALL callers — anonymous uploads are no longer possible, even for allowlisted users.

The allowlist-drift test asserts that the email set in firestore.rules, storage.rules, and functions/src/_shared/allowlist.ts are identical. Catches an admin updating one file but not the others.

Storage emulator test suite covers: allowlisted+verified can write, unverified denied, non-allowlisted denied, legacy /uploads path denied for all, anonymous denied.

This commit changes rules in the repo but does NOT deploy to production.

Tracking: dillonlarberg/dl-creative-studio#1"
```

---

## Task 11: Build the brand-profile import script + idempotency test

**Files created:**
- `scripts/import-brand-profiles.ts`
- `scripts/__tests__/import-brand-profiles.test.ts`

The script reads existing `(default).clientAssetHouse/{slug}` documents (excluding `pmg`) and writes them to `(default).clients/{slug}/profile`. Idempotent: running it twice produces identical state. Supports `--dry-run` to print planned writes without executing.

- [ ] **Step 11.1: Write the failing test**

Create `scripts/__tests__/import-brand-profiles.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { importBrandProfiles } from '../import-brand-profiles';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-import-test',
    firestore: {
      // Permissive rules for the import test — this isolates the script's
      // logic from access control.
      rules: 'rules_version = "2"; service cloud.firestore { match /databases/{db}/documents { match /{document=**} { allow read, write: if true; } } }',
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

describe('importBrandProfiles', () => {
  it('copies clientAssetHouse/{slug} docs to clients/{slug}/profile', async () => {
    const ctx = env.authenticatedContext('admin', {});
    const db = ctx.firestore();

    await db.doc('clientAssetHouse/ralph_lauren').set({
      clientSlug: 'ralph_lauren',
      primaryColor: '#000',
      fontPrimary: 'Inter',
    });
    await db.doc('clientAssetHouse/sharkninja').set({
      clientSlug: 'sharkninja',
      primaryColor: '#FF0',
      fontPrimary: 'Helvetica',
    });

    const result = await importBrandProfiles(db, { dryRun: false });

    expect(result.imported).toEqual(['ralph_lauren', 'sharkninja']);
    expect(result.skipped).toEqual([]);

    const rl = await db.doc('clients/ralph_lauren/profile').get();
    expect(rl.exists).toBe(true);
    expect(rl.data()?.primaryColor).toBe('#000');
  });

  it('excludes the pmg artifact document', async () => {
    const ctx = env.authenticatedContext('admin', {});
    const db = ctx.firestore();

    await db.doc('clientAssetHouse/ralph_lauren').set({ primaryColor: '#000' });
    await db.doc('clientAssetHouse/pmg').set({ primaryColor: '#FFF' });

    const result = await importBrandProfiles(db, { dryRun: false });

    expect(result.imported).toEqual(['ralph_lauren']);
    expect(result.excluded).toEqual(['pmg']);

    const pmgProfile = await db.doc('clients/pmg/profile').get();
    expect(pmgProfile.exists).toBe(false);
  });

  it('is idempotent — running twice produces the same end state', async () => {
    const ctx = env.authenticatedContext('admin', {});
    const db = ctx.firestore();

    await db.doc('clientAssetHouse/ralph_lauren').set({ primaryColor: '#000' });

    const first = await importBrandProfiles(db, { dryRun: false });
    expect(first.imported).toEqual(['ralph_lauren']);
    expect(first.skipped).toEqual([]);

    const second = await importBrandProfiles(db, { dryRun: false });
    expect(second.imported).toEqual([]);
    expect(second.skipped).toEqual(['ralph_lauren']); // already up to date

    const profile = await db.doc('clients/ralph_lauren/profile').get();
    expect(profile.data()?.primaryColor).toBe('#000');
  });

  it('--dry-run produces no writes', async () => {
    const ctx = env.authenticatedContext('admin', {});
    const db = ctx.firestore();

    await db.doc('clientAssetHouse/ralph_lauren').set({ primaryColor: '#000' });

    const result = await importBrandProfiles(db, { dryRun: true });

    expect(result.imported).toEqual([]);
    expect(result.planned).toEqual(['ralph_lauren']);

    const profile = await db.doc('clients/ralph_lauren/profile').get();
    expect(profile.exists).toBe(false);
  });
});
```

- [ ] **Step 11.2: Run test to verify it fails**

```bash
npm run test:rules
```

(rules tests are configured to run against the emulator; the import test runs against the same emulator but with permissive rules — vitest.rules.config.ts already includes `tests/**` if we extend it; otherwise add a new config or include scripts/ in the rules config.)

Update `vitest.rules.config.ts`:

```ts
test: {
  environment: 'node',
  globals: false,
  include: ['tests/rules/**/*.test.ts', 'scripts/__tests__/**/*.test.ts'],
  testTimeout: 30000,
},
```

Expected: import error.

- [ ] **Step 11.3: Write the implementation**

Create `scripts/import-brand-profiles.ts`:

```ts
import type { Firestore } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';

interface ImportOptions {
  dryRun: boolean;
}

interface ImportResult {
  imported: string[];
  skipped: string[]; // already up to date (idempotent skip)
  excluded: string[]; // explicitly excluded slugs (e.g. pmg)
  planned: string[]; // dry-run only
}

const EXCLUDED_SLUGS = new Set(['pmg']);

function contentHash(data: unknown): string {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

export async function importBrandProfiles(
  db: Firestore,
  opts: ImportOptions
): Promise<ImportResult> {
  const result: ImportResult = { imported: [], skipped: [], excluded: [], planned: [] };

  const sourceSnapshot = await db.collection('clientAssetHouse').get();

  for (const doc of sourceSnapshot.docs) {
    const slug = doc.id;
    if (EXCLUDED_SLUGS.has(slug)) {
      result.excluded.push(slug);
      continue;
    }

    const sourceData = doc.data();
    const sourceHash = contentHash(sourceData);

    const targetRef = db.doc(`clients/${slug}/profile`);
    const targetDoc = await targetRef.get();

    if (targetDoc.exists) {
      const targetHash = contentHash({ ...targetDoc.data(), _importHash: undefined });
      const recordedHash = (targetDoc.data() as { _importHash?: string })._importHash;
      if (recordedHash === sourceHash || targetHash === sourceHash) {
        result.skipped.push(slug);
        continue;
      }
    }

    if (opts.dryRun) {
      result.planned.push(slug);
      continue;
    }

    await targetRef.set({ ...sourceData, _importHash: sourceHash });
    result.imported.push(slug);
  }

  return result;
}

// CLI entry — reads --dry-run from argv, initializes admin SDK, runs.
async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const { initializeApp, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');

  initializeApp({ credential: applicationDefault() });
  const db = getFirestore();

  const result = await importBrandProfiles(db, { dryRun });

  console.log('Brand-profile import result:');
  console.log(`  Imported: ${result.imported.length} (${result.imported.join(', ')})`);
  console.log(`  Skipped (already up to date): ${result.skipped.length} (${result.skipped.join(', ')})`);
  console.log(`  Excluded: ${result.excluded.length} (${result.excluded.join(', ')})`);
  if (dryRun) {
    console.log(`  Planned (dry-run): ${result.planned.length} (${result.planned.join(', ')})`);
  }
}

if (process.argv[1]?.endsWith('import-brand-profiles.ts') || process.argv[1]?.endsWith('import-brand-profiles.js')) {
  main().catch((err) => {
    console.error('Import failed:', err);
    process.exit(1);
  });
}
```

Add to `package.json` scripts:
```json
"import-brand-profiles": "tsx scripts/import-brand-profiles.ts",
"import-brand-profiles:dry": "tsx scripts/import-brand-profiles.ts --dry-run"
```

Install `tsx` if not already:
```bash
npm install --save-dev tsx
```

- [ ] **Step 11.4: Run test to verify it passes**

```bash
npm run test:rules
```

Expected: all import tests pass.

- [ ] **Step 11.5: Commit**

```bash
git add scripts/ vitest.rules.config.ts package.json package-lock.json
git commit -m "feat(scripts): add idempotent brand-profile import script

Reads existing (default).clientAssetHouse/{slug} docs (excluding 'pmg' as an artifact) and writes them to (default).clients/{slug}/profile. Idempotent via SHA-256 content hash: a re-run with no source changes is a no-op. Supports --dry-run.

The script runs once during the final coordinated cutover, against the production (default) Firestore database, after the new rules deploy. It can also be run dry against production at any point during the dev cycle to validate the source data shape.

Tests: 4 emulator-based tests covering happy path, pmg exclusion, idempotency, and --dry-run.

Tracking: dillonlarberg/dl-creative-studio#1"
```

---

## Task 12: Final verification + push + open PR

- [ ] **Step 12.1: Run the full test suite**

```bash
npm run test:run
npm run emulators:start &  # background
sleep 5
npm run test:rules
kill %1  # stop emulators
```

Expected: every test passes. Across both suites, the test count should be approximately:
- `paths`: 7
- `assertResourceClient`: 7
- `assertAlliStudioUser`: 6
- `allowlist`: 7
- `allowlist-drift`: 2
- `ClientProvider`: 4
- `firestore.rules`: 7
- `storage.rules`: 5
- `import-brand-profiles`: 4
- Pre-existing edit-image tests: 13
- Smoke test: 1

Total: ~63 tests across ~11 test files.

- [ ] **Step 12.2: Run the production build**

```bash
npm run build
```

Expected: clean build, no TypeScript errors. The new platform/ files are picked up by the existing tsc include.

- [ ] **Step 12.3: Push the branch**

```bash
git push -u origin feat/scoped-schema
```

- [ ] **Step 12.4: Open the PR**

```bash
gh pr create \
  --base dev \
  --head feat/scoped-schema \
  --title "feat: path-scoped schema + email allowlist + Cloud Function guards (rebuild Step 1)" \
  --body "$(cat <<'EOF'
## Summary

PR 2 of the modular-apps + SOC2 rebuild. Lays the data-layer foundation:

- **Typed path helpers** (`src/platform/firebase/paths.ts`) — single source of truth for Firestore + Storage paths. Every helper requires a `clientSlug` (and where relevant `appId`) at the type level.
- **Email allowlist** in `firestore.rules` and `storage.rules` (≤10 PMG users), mirrored in `functions/src/_shared/allowlist.ts`. Drift test asserts the two stay in sync.
- **Cloud Function guards** — `assertAlliStudioUser` (caller identity, allowlist-checked) and `assertResourceClient` (resource ownership, IDOR fix from PR-v2 eng review).
- **URL-driven `ClientProvider`** — reads active client from `useParams().clientSlug`, validates against Alli `/clients`. No `setCurrentClient`; switching clients is navigation.
- **Idempotent brand-profile import script** — `scripts/import-brand-profiles.ts` with `--dry-run`. Runs once during cutover.

## What ships, what doesn't

This PR lands the foundation on `dev` but does NOT deploy to production rules. The running prototype on `automated-creative-e10d7` continues using the old rules. The single coordinated production deploy happens at the end of the rebuild (after PR 10).

PR 3 (`feat/app-registry`) wires apps to the new schema starting with `edit-image`.

## Test plan

- [x] `npm run test:run` — ~50 unit/component tests across paths, asserts, allowlist, allowlist-drift, ClientProvider, plus pre-existing edit-image tests
- [x] `npm run test:rules` — emulator-based suite for `firestore.rules`, `storage.rules`, and `import-brand-profiles` idempotency
- [x] `npm run build` — production build succeeds
- [x] Allowlist drift test passes (rules files match TS allowlist)

## Design refs

- Architecture doc: `docs/ARCHITECTURE_FINDINGS_AND_PROPOSAL.md` (sections 3.3-3.5)
- INDEX plan: `docs/superpowers/plans/2026-04-30-INDEX-modular-soc2-rebuild.md`
- This PR's plan: `docs/superpowers/plans/2026-05-01-pr2-scoped-schema.md`

Tracking: #1
EOF
)"
```

- [ ] **Step 12.5: Update the INDEX**

Update `docs/superpowers/plans/2026-04-30-INDEX-modular-soc2-rebuild.md`:
- Change PR 2's row in the table from "Pending" to "Plan written" while the PR is in review, and to "Done" after merge with the merge-commit hash.

Commit and push the INDEX update:
```bash
git add docs/superpowers/plans/2026-04-30-INDEX-modular-soc2-rebuild.md
git commit -m "docs: update INDEX — PR 2 plan written and shipped"
git push
```

---

## Definition of Done

PR 2 is complete when **all** of the following are true:

- [ ] `feat/scoped-schema` is merged into `dev`.
- [ ] On a fresh checkout of `dev`, `npm install && npm run test:run` passes.
- [ ] On a fresh checkout of `dev`, `npm run emulators:start` (in one terminal) + `npm run test:rules` (in another) passes.
- [ ] On a fresh checkout of `dev`, `npm run build` succeeds.
- [ ] `firestore.rules` and `storage.rules` use `isAlliStudioUser()` predicate; legacy paths default-deny.
- [ ] `functions/src/_shared/allowlist.ts` exports `ALLI_STUDIO_USERS` Set with the project-owner-supplied emails (≤10).
- [ ] Allowlist drift test passes (rules match TS module).
- [ ] PR 2 row in `2026-04-30-INDEX-modular-soc2-rebuild.md` is updated to "Done" with the merge commit hash.
- [ ] PR 3's plan (`2026-05-01-pr3-app-registry.md`) is written before PR 3 work begins.

If any of these is false, PR 2 is not done.
