# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
# Frontend (React + Vite)
npm run dev          # Start dev server with HMR
npm run build        # TypeScript check + Vite production build (tsc -b && vite build)
npm run lint         # ESLint on .ts/.tsx files
npm run preview      # Preview production build

# Firebase Functions
cd functions && npm run build    # Compile TS → JS
cd functions && npm run serve    # Local Firebase emulator
cd functions && npm run deploy   # Deploy to Firebase
cd functions && npm run logs     # Stream production logs

# Local Image Edit API (Python/FastAPI)
cd local-services/image-edit-api
uvicorn main:app --reload --host 127.0.0.1 --port 8001
```

```bash
# Tests (Vitest)
npm test             # Run unit tests
npm run test:watch   # Run Vitest in watch mode
```

Vitest is configured for unit tests (`src/**/__tests__/**/*.test.ts`). E2E tests are not yet configured.

## Architecture

**React 19 + TypeScript + Vite** creative asset studio ("Alli Studio") backed by **Firebase** (Auth, Firestore, Storage, Cloud Functions). Cloud Functions run on Node.js 22 with FFmpeg and Gemini AI for video processing.

### Source Layout

- `src/pages/` — Route-level page components. `use-cases/UseCaseWizardPage.tsx` is the dynamic wizard powering all 8 use cases.
- `src/components/` — Reusable UI (AppLayout shell, FileUpload, AIModelSelector, ApprovalFlow, etc.)
- `src/services/` — Repository-pattern data access layer. Each service encapsulates a backend integration:
  - `auth.ts` — Firebase Auth + OIDC with Alli (observable pattern for auth state)
  - `alli.ts` — Alli Central/Data Explorer API client with caching (singleton)
  - `creative.ts` — Firestore CRUD for in-progress creative records
  - `templates.ts` / `batches.ts` — Template persistence and batch processing
  - `clientAssetHouse.ts` — Brand standards storage + dynamic font injection
  - `videoService.ts` — Firebase HTTPS Callable functions for video cutdowns (600s timeout)
  - `imageEditService.ts` — FastAPI client for local image editing
- `src/types/index.ts` — Shared TypeScript interfaces (UseCaseId, Client, Asset, CreativeRecord, etc.)
- `src/constants/useCases.ts` — Use case definitions, platform sizes, AI provider configs
- `src/utils/` — Utilities (`cn.ts` for Tailwind class merging via clsx + tw-merge, `fontParser.ts`)
- `src/firebase.ts` — Firebase SDK initialization and service exports
- `src/App.tsx` — React Router routes with auth guard

### Functions Directory

`functions/src/` contains Cloud Functions for:
- Video cutdown processing (FFmpeg + Gemini AI analysis)
- Alli API proxy endpoints (6 rewrite rules in `firebase.json`)

### Use Cases

The platform supports 8 creative workflows: `image-resize`, `edit-image`, `new-image`, `edit-video`, `new-video`, `video-cutdown`, `template-builder`, `feed-processing`. All routed through the dynamic `UseCaseWizardPage`.

## Key Patterns

- **Auth flow**: OIDC via Alli → Firebase OAuthProvider → access token stored in `sessionStorage` (`alli_access_token`)
- **Client context**: Selected client persisted in `localStorage`, used across services
- **API proxying**: Dev uses Vite proxy (`/api/*` → Firebase Functions). Production uses Firebase Hosting rewrites.
- **Brand standards**: `ClientAssetHouse` stores mandatory brand elements (colors, fonts, logos) plus dynamic brand variables. Fonts are parsed with opentype.js and injected as `@font-face`.

## Configuration

- **Firebase project**: `automated-creative-e10d7`
- **TypeScript**: Strict mode with `noUnusedLocals`, `noUnusedParameters`
- **ESLint**: Flat config (v9) with TypeScript parser + React hooks rules
- **Tailwind CSS 4** via `@tailwindcss/vite` plugin
- **Image edit API URL**: Configurable via `VITE_IMAGE_EDIT_API_URL` (defaults to `http://127.0.0.1:8001`)

## gstack

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

Available skills:
- `/plan-ceo-review` — CEO-level plan review
- `/plan-eng-review` — Engineering plan review
- `/plan-design-review` — Design plan review
- `/design-consultation` — Design consultation
- `/review` — Code review
- `/ship` — Ship workflow
- `/browse` — Headless browser for web browsing, QA, and dogfooding
- `/qa` — QA testing
- `/qa-only` — QA testing only (no code changes)
- `/qa-design-review` — QA with design review
- `/setup-browser-cookies` — Configure browser cookies for authenticated browsing
- `/retro` — Retrospective
- `/document-release` — Document a release

If gstack skills aren't working, run `cd .claude/skills/gstack && ./setup` to build the binary and register skills.
