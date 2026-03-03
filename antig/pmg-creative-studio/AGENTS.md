# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains the React + TypeScript frontend.
- `src/pages/` holds route-level screens, `src/components/` reusable UI, `src/services/` Firebase/API calls, and `src/utils/` shared helpers.
- `functions/src/` contains Firebase Cloud Functions source code. `functions/lib/` is compiled output from TypeScript builds.
- `public/` stores static assets. Root config files include `vite.config.ts`, `eslint.config.js`, `firebase.json`, `firestore.rules`, and `storage.rules`.

## Build, Test, and Development Commands
- `npm run dev` (root): starts the Vite dev server.
- `npm run build` (root): runs TypeScript build checks and creates a production bundle in `dist/`.
- `npm run lint` (root): lints frontend TypeScript/TSX files.
- `npm --prefix functions run build`: compiles Cloud Functions to `functions/lib/`.
- `npm --prefix functions run serve`: builds and runs local Firebase emulators for functions.
- `npm --prefix functions run deploy`: deploys functions only.

## Coding Style & Naming Conventions
- TypeScript is strict in both frontend and backend configs; resolve type and lint issues before opening a PR.
- Use `PascalCase` for React component/page files (for example, `DashboardPage.tsx`).
- Use `camelCase` for service and utility modules (for example, `videoService.ts`, `fontParser.ts`).
- Prefer functional components and keep page-specific orchestration in `src/pages/`.
- No dedicated formatter is configured; keep formatting consistent with the file being edited and run `npm run lint`.

## Testing Guidelines
- There is currently no automated test runner configured (`npm test` is not defined).
- Minimum verification for each change:
- `npm run lint`
- `npm run build`
- `npm --prefix functions run build` for backend updates
- If adding tests, use colocated `*.test.ts` or `*.test.tsx` files near the code under test.

## Commit & Pull Request Guidelines
- Follow the existing commit style with conventional prefixes like `feat:` and `fix:`.
- Keep commit subjects imperative and outcome-focused; limit each commit to one logical change.
- PRs should include a short summary, linked ticket/issue, impacted paths (for example, `src/services/...` or `functions/src/...`), and UI screenshots/videos when relevant.
- Call out Firebase rule changes or function deployment impacts explicitly.
