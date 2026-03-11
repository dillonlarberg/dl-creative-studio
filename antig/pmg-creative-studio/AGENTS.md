# Repository Guidelines

## Project Structure & Module Organization
`src/` contains the React + TypeScript frontend: routes in `src/pages/`, shared UI in `src/components/`, backend clients in `src/services/`, types in `src/types/`, and helpers in `src/utils/`. Static assets live in `public/` and `src/assets/`. Do not edit `dist/`.

`functions/` is a separate Firebase Functions workspace. Source lives in `functions/src/`; compiled output lands in `functions/lib/`. Keep local support services in `local-services/` and project notes in `docs/`.

Start with `CLAUDE.md` for the canonical local command set and architecture notes. For current edit-image status, check `docs/edit-image-changelog.md` and `docs/superpowers/plans/2026-03-10-change-background.md` before asking for background context.

## Build, Test, and Development Commands
- `npm run dev` starts the Vite dev server.
- `npm run build` runs `tsc -b` and produces the production bundle in `dist/`.
- `npm run lint` runs ESLint across the repo.
- `npm run preview` serves the built frontend locally.
- `npm run build` compiles Cloud Functions TypeScript to `lib/`.
- `npm run serve` builds functions and starts the Firebase emulator.
- `npm run deploy` deploys Cloud Functions only.

## Coding Style & Naming Conventions
Use TypeScript for frontend and functions changes. Follow existing file-local formatting; most feature files use 4-space indentation. Use `PascalCase` for React components and page files (`ClientAssetHousePage.tsx`) and `camelCase` for services/utilities (`imageEditService.ts`).

Linting is configured in `eslint.config.js` with TypeScript and React Hooks rules. Run `npm run lint` before opening a PR. Do not edit generated output in `dist/` or `functions/lib/`.

## Testing Guidelines
There is no established automated test suite in the root app yet. Minimum verification is `npm run lint`, manual UI checks in `npm run dev`, and `cd functions && npm run serve` for backend changes. When adding tests, place them near the feature or in `__tests__/` and name them `*.test.ts` or `*.test.tsx`.

## Commit & Pull Request Guidelines
Recent history mostly follows short, imperative commits with prefixes like `feat:` and `fix:`. Prefer that format, for example: `feat: add client asset font loading`.

PRs should include a brief summary, impacted areas, manual test notes, and screenshots for UI changes. Link the relevant issue when available, and call out any Firebase config, secrets, or deploy steps reviewers must repeat.

## Agent-Specific Notes
Before asking the user for status, check the repo docs first. Ask only targeted follow-ups: which step changes next, whether the issue is frontend/functions/local API, or the exact failing command and error.
