# PR 1 — Test Runner Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install and configure vitest as the test runner for this project so the orphan tests at `src/components/edit-image/utils/__tests__/*.test.ts` execute green and the runner is ready for the React component tests + Firestore rules tests that PR 2 will add.

**Architecture:** vitest runs in jsdom mode for component tests, node mode for rules tests via separate config target. `@testing-library/react` + `@testing-library/jest-dom` provide React assertions; `@firebase/rules-unit-testing` provides Firebase Emulator helpers. Two existing pure-function tests serve as the red→green proof that the runner works.

**Tech Stack:** vitest 1.6+, @testing-library/react 16+, @testing-library/jest-dom 6+, @firebase/rules-unit-testing 3.0+, jsdom 25+. Existing project: Vite 7, TypeScript 5.9, React 19.

**PR scope:** This is the only PR allowed to merge into `dev` before PR 2 (`feat/scoped-schema`). Without it, every later PR's "tests" claim is unverifiable.

---

## File structure

**Files created in this PR:**
- `vitest.config.ts` — vitest configuration, points at jsdom for component tests, sets up testing-library globals.
- `src/test-setup.ts` — imports `@testing-library/jest-dom` matchers so `expect(el).toBeInTheDocument()` etc. work.
- `tsconfig.test.json` — TypeScript config that includes vitest's globals so `describe`/`it`/`expect` resolve without import in test files (matches how the existing tests are written: they DO import from 'vitest', so this is belt + suspenders for future tests).

**Files modified in this PR:**
- `package.json` — add devDependencies and `test` / `test:run` / `test:ui` scripts.
- `tsconfig.app.json` — exclude `**/__tests__/**` and `**/*.test.ts(x)` from the production build (vitest handles them via its own config).

**Files NOT touched in this PR:**
- The two existing `src/components/edit-image/utils/__tests__/*.test.ts` files (already correct vitest syntax — they just couldn't run).
- Any source code under `src/`. Tooling-only PR.

---

## Task 1: Create branches off main

**Files:**
- None (git operations only)

- [ ] **Step 1.1: Confirm clean working tree on main**

Run:
```bash
git checkout main
git status
```

Expected output: `On branch main` and `nothing to commit, working tree clean` (or only `?? docs/superpowers/`).

If the tree is dirty with anything else, stop and resolve before continuing.

- [ ] **Step 1.2: Create the long-lived `dev` integration branch**

Run:
```bash
git checkout -b dev
git push -u origin dev
```

Expected output: `Switched to a new branch 'dev'` then `Branch 'dev' set up to track remote branch 'dev' from 'origin'.`

`dev` now exists on the remote. All rebuild work merges here.

- [ ] **Step 1.3: Create `feat/test-runner` off dev**

Run:
```bash
git checkout -b feat/test-runner
```

Expected output: `Switched to a new branch 'feat/test-runner'`.

This is the working branch for PR 1.

---

## Task 2: Confirm the failing state — `npm test` does not exist today

**Files:**
- None (verification only)

The "failing test" for a tooling PR is the absence of a working test runner. Capture this state explicitly before fixing it.

- [ ] **Step 2.1: Verify npm test is undefined today**

Run:
```bash
npm test
```

Expected output: an error along the lines of `npm ERR! Missing script: "test"` or `npm ERR! Lifecycle script "test" failed`.

Record this as the RED state. PR 1 makes it GREEN.

- [ ] **Step 2.2: Verify the orphan tests would fail without a runner**

Run:
```bash
ls src/components/edit-image/utils/__tests__/
```

Expected output:
```
buildRecommendations.test.ts
parseAlliAnalysis.test.ts
```

These two files import from `'vitest'` but vitest is not installed. They cannot execute today. After this PR they will run green.

---

## Task 3: Install test runner dependencies

**Files:**
- Modify: `package.json` (devDependencies block)
- Modify: `package-lock.json` (auto-generated)

- [ ] **Step 3.1: Install vitest + jsdom + testing-library + Firebase rules testing**

Run:
```bash
npm install --save-dev vitest@^1.6.0 jsdom@^25.0.0 @testing-library/react@^16.0.0 @testing-library/jest-dom@^6.6.0 @firebase/rules-unit-testing@^3.0.4
```

Expected output: `added N packages` with no `npm ERR!` lines. If npm flags peer dependency conflicts with React 19, accept them with `--legacy-peer-deps` only if the warning specifically names `@testing-library/react` and React 19 — testing-library 16+ supports React 19 but the peer range may still flag.

- [ ] **Step 3.2: Verify package.json devDependencies**

Run:
```bash
grep -A2 '"devDependencies"' package.json | head -20
node -e "const pkg = require('./package.json'); ['vitest', 'jsdom', '@testing-library/react', '@testing-library/jest-dom', '@firebase/rules-unit-testing'].forEach(d => console.log(d, '=>', pkg.devDependencies[d] || 'MISSING'))"
```

Expected output: each of the five packages prints with a real version string, none print `MISSING`.

If any prints `MISSING`, redo Step 3.1 for that specific package.

---

## Task 4: Create vitest configuration

**Files:**
- Create: `vitest.config.ts`
- Create: `src/test-setup.ts`

- [ ] **Step 4.1: Create `vitest.config.ts`**

Create the file at the project root with this exact content:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test-setup.ts'],
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'src/**/__tests__/**/*.{ts,tsx}',
    ],
    exclude: [
      'node_modules',
      'dist',
      '.firebase',
      'functions',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/**/__tests__/**',
        'src/test-setup.ts',
        'src/main.tsx',
      ],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
```

Why these choices:
- `environment: 'jsdom'` — required for the React component tests PR 2 will add (ClientProvider smoke, bootstrap state machine). Pure-function tests (the existing edit-image tests) run fine in jsdom.
- `globals: false` — tests must explicitly `import { describe, it, expect } from 'vitest'`. Matches the existing edit-image test files which already do this.
- `setupFiles: ['./src/test-setup.ts']` — loads the testing-library jest-dom matchers once.
- `include` covers both colocated `*.test.ts` files and `__tests__/` directories.
- `exclude` keeps vitest out of the `functions/` tree (Firebase Functions has its own test setup that PR 2 establishes).
- v8 coverage provider is the vitest default; included now so `npm test -- --coverage` works on day one.

- [ ] **Step 4.2: Create `src/test-setup.ts`**

Create the file at `src/test-setup.ts` with this exact content:

```ts
import '@testing-library/jest-dom/vitest';
```

That single import registers all jest-dom matchers (`toBeInTheDocument`, `toHaveTextContent`, etc.) onto vitest's `expect`. PR 2's component tests will rely on these matchers.

---

## Task 5: Add npm scripts

**Files:**
- Modify: `package.json` (scripts block)

- [ ] **Step 5.1: Add `test`, `test:run`, and `test:ui` scripts**

Open `package.json`. Locate the `"scripts"` object (currently lines 5-9):

```json
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview"
  },
```

Replace it with:

```json
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview",
    "test": "vitest",
    "test:run": "vitest run",
    "test:ui": "vitest --ui"
  },
```

Why three scripts:
- `test` — interactive watch mode for development. The default for `npm test` because it's what a developer wants 95% of the time.
- `test:run` — single non-watch run. Used by CI and pre-commit hooks.
- `test:ui` — vitest's browser-based test explorer. Useful for debugging hairy tests; costs nothing to add.

Note: do NOT install `@vitest/ui` until someone actually runs `test:ui`. The script will tell vitest to install it on first invocation.

---

## Task 6: Exclude tests from the production build

**Files:**
- Modify: `tsconfig.app.json`

- [ ] **Step 6.1: Read current `tsconfig.app.json`**

Run:
```bash
cat tsconfig.app.json
```

Expected output: a JSON file with a `"include": ["src"]` line (or similar). Note its current shape before editing.

- [ ] **Step 6.2: Add test exclusions**

Open `tsconfig.app.json`. If it has an `"exclude"` field, add the test patterns to it. If it doesn't, add one as a sibling to `"include"`. The result should contain:

```json
  "include": ["src"],
  "exclude": [
    "src/**/*.test.ts",
    "src/**/*.test.tsx",
    "src/**/__tests__/**",
    "src/test-setup.ts"
  ]
```

This stops `tsc -b` (run during `npm run build`) from compiling test files into the production bundle. Vitest reads tests directly through its own pipeline and does not need them in the build's TypeScript include set.

- [ ] **Step 6.3: Verify the production build still works**

Run:
```bash
npm run build
```

Expected output: build completes successfully, ends with `vite build` summary showing chunk sizes. No TypeScript errors.

If the build fails with errors referring to test files, the exclusion patterns are wrong — re-check Step 6.2.

---

## Task 7: Verify the runner works — make the orphan tests GREEN

**Files:**
- None (verification only)

This is the moment where RED → GREEN. Today the existing edit-image tests cannot execute. After this task, they pass.

- [ ] **Step 7.1: Run the test runner**

Run:
```bash
npm run test:run
```

Expected output: vitest discovers two test files under `src/components/edit-image/utils/__tests__/`, runs them, and reports both as passing. The summary line should look approximately like:

```
 Test Files  2 passed (2)
      Tests  N passed (N)
```

Where `N` is the number of `it()` blocks in those two files.

- [ ] **Step 7.2: If any test fails, diagnose and fix**

If a test fails, the most likely cause is one of:
- The test imports something that depends on browser globals not present in jsdom (rare for these pure-function tests).
- The test file uses a TypeScript feature that vitest's transformer rejects.
- `@testing-library/jest-dom` is not loading correctly (check `src/test-setup.ts` was saved).

Read the failure output. Fix the cause without modifying the test logic — these tests are pre-existing and known good. If you cannot make them pass without modifying assertions, stop and escalate; the orphan tests may have always been wrong.

- [ ] **Step 7.3: Run interactively to verify watch mode works**

Run:
```bash
npm test
```

Expected output: vitest enters watch mode and prints `PASS  src/components/edit-image/utils/__tests__/*.test.ts` for both files. Press `q` to quit.

If watch mode reports a different state than `test:run`, something is misconfigured — re-check `vitest.config.ts`.

---

## Task 8: Add a single smoke test that exercises testing-library

**Files:**
- Create: `src/__tests__/test-runner-smoke.test.tsx`

This is one test that proves the React + testing-library + jsdom + jest-dom stack works end to end. PR 2 will build component tests on top of this stack; verifying it works once now means PR 2 starts in a known-good state.

- [ ] **Step 8.1: Write the smoke test**

Create `src/__tests__/test-runner-smoke.test.tsx` with this exact content:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('test runner smoke test', () => {
  it('renders a React component into jsdom', () => {
    render(<h1>hello vitest</h1>);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('hello vitest');
  });
});
```

What this proves:
- vitest discovers `.test.tsx` files (TypeScript + JSX).
- `@vitejs/plugin-react` transforms JSX during the test run.
- jsdom provides `document` so `render()` has somewhere to mount.
- testing-library's `screen` query API works.
- jest-dom matchers (`toBeInTheDocument`, `toHaveTextContent`) are registered.

If any of these is broken, the test fails with a different error per layer — making this an excellent diagnostic.

- [ ] **Step 8.2: Run the smoke test**

Run:
```bash
npm run test:run
```

Expected output: now reports `Test Files 3 passed (3)` and `Tests N+1 passed (N+1)` (one more test than before).

- [ ] **Step 8.3: If the smoke test fails, diagnose by error**

| Failure | Likely cause | Fix |
|---------|--------------|-----|
| `Cannot find name 'describe'` (TS error) | `globals: false` and missing import | Confirm the import line at the top of the test file |
| `document is not defined` | jsdom not active | Re-check `environment: 'jsdom'` in `vitest.config.ts` |
| `screen.getByRole is not a function` | testing-library not installed or wrong import | Re-run Step 3.1 |
| `expect(...).toBeInTheDocument is not a function` | jest-dom matchers not loaded | Re-check `src/test-setup.ts` and `setupFiles` in vitest config |
| JSX parse error | React plugin not active in vitest config | Re-check the `plugins: [react()]` line |

---

## Task 9: Commit

**Files:**
- All staged changes from Tasks 3-8.

- [ ] **Step 9.1: Stage the changes**

Run:
```bash
git add package.json package-lock.json vitest.config.ts src/test-setup.ts tsconfig.app.json src/__tests__/test-runner-smoke.test.tsx
```

Verify with:
```bash
git status --short
```

Expected output (exactly these lines, in any order):
```
M  package.json
M  package-lock.json
M  tsconfig.app.json
A  src/__tests__/test-runner-smoke.test.tsx
A  src/test-setup.ts
A  vitest.config.ts
```

If anything else is staged or unstaged, sort it out before committing.

- [ ] **Step 9.2: Commit**

Run:
```bash
git commit -m "$(cat <<'EOF'
chore: install vitest test runner with React + jsdom + Firebase rules support

- Add vitest, jsdom, @testing-library/react, @testing-library/jest-dom,
  @firebase/rules-unit-testing as devDependencies.
- Configure vitest.config.ts for jsdom + JSX + testing-library setup file.
- Add test, test:run, test:ui scripts.
- Activate the orphan tests at src/components/edit-image/utils/__tests__/
  that previously could not run (vitest was imported but not installed).
- Add a smoke test under src/__tests__/ that exercises React + jsdom + jest-dom
  end-to-end so PR 2's component tests start on a known-good stack.
- Exclude tests from the production tsc build.

Step 0 of the modular-apps + SOC2 rebuild. Tracking: dillonlarberg/dl-creative-studio#1
EOF
)"
```

Expected output: `[feat/test-runner <hash>] chore: install vitest test runner ...` with a 6-files-changed summary.

- [ ] **Step 9.3: Push to remote**

Run:
```bash
git push -u origin feat/test-runner
```

Expected output: `Branch 'feat/test-runner' set up to track remote branch 'feat/test-runner' from 'origin'.`

---

## Task 10: Open PR

**Files:**
- None (GitHub operation only)

- [ ] **Step 10.1: Open the PR against `dev`**

Run:
```bash
gh pr create \
  --base dev \
  --head feat/test-runner \
  --title "chore: install vitest test runner (rebuild Step 0)" \
  --body "$(cat <<'EOF'
## Summary

- Installs vitest + jsdom + testing-library + Firebase rules-unit-testing as devDependencies.
- Configures vitest.config.ts for the React + jsdom stack PR 2 will build component tests on.
- Activates two existing orphan tests under `src/components/edit-image/utils/__tests__/` that have been on disk since the early prototype but could never execute (vitest was imported, never installed).
- Adds one new smoke test that exercises React + jsdom + jest-dom end-to-end.

## Why this is Step 0 of the rebuild

Issue #1 PRD v2 calls out that no test runner exists today, despite test files existing on disk. Until \`npm test\` works, every later PR's testing claims are unverifiable. This is the only PR allowed to merge into \`dev\` before \`feat/scoped-schema\` (PR 2).

## Test plan

- [x] \`npm run test:run\` passes — 3 test files, all green
- [x] \`npm test\` enters watch mode and reports passing
- [x] \`npm run build\` still succeeds (tests excluded from tsc build)
- [x] Committed devDependencies match what was installed (\`node -e\` check in plan Task 3)

Tracking: #1
EOF
)"
```

Expected output: a PR URL printed. Open it in the browser to verify the description rendered correctly.

- [ ] **Step 10.2: Mark PR ready for self-review (or merge if you're the only reviewer)**

For a solo dev project, you can merge yourself once CI is green (or immediately if no CI is configured yet). For a team setup, request review from whoever owns this codebase before merging.

When merging, use a merge commit (not squash) so the individual commits in this branch are preserved on `dev`. Each commit on `dev` should remain individually rollback-able for the duration of the rebuild.

---

## Definition of Done

PR 1 is complete when **all** of the following are true:

- [ ] `dev` branch exists on `origin` and is up to date with `main` plus this PR.
- [ ] `feat/test-runner` is merged into `dev`.
- [ ] On a fresh checkout of `dev`, `npm install && npm test -- --run` passes with at least 3 test files green.
- [ ] On a fresh checkout of `dev`, `npm run build` succeeds.
- [ ] `vitest.config.ts`, `src/test-setup.ts`, and the smoke test file all exist.
- [ ] The two pre-existing edit-image tests are passing (not skipped).
- [ ] PR 1 row in `2026-04-30-INDEX-modular-soc2-rebuild.md` is updated to "Done" with the merge commit hash.
- [ ] PR 2's plan (`2026-04-30-pr2-scoped-schema.md`) is written before PR 2 work begins.

If any of these is false, PR 1 is not done.
