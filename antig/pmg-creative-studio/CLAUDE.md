# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev                        # Start Vite dev server
npm run build                      # TypeScript check + production build to dist/
npm run lint                       # Lint frontend TypeScript/TSX
npm --prefix functions run build   # Compile Cloud Functions to functions/lib/
npm --prefix functions run serve   # Build + run local Firebase emulators
npm --prefix functions run deploy  # Deploy functions only
```

**Minimum verification before any PR:** `npm run lint && npm run build` (add `npm --prefix functions run build` for backend changes). No automated test runner is configured.

## Architecture

**Stack:** React 19 + TypeScript + Vite 7 + Tailwind CSS v4 + Firebase (Auth, Firestore, Storage, Cloud Functions)

### Frontend (`src/`)

- **Routing** (`App.tsx`): React Router v7 with protected routes. Login redirects through Alli OIDC. All authenticated routes render inside `AppLayout` (sidebar + content outlet).
- **Routes:** `/` (dashboard), `/create` (use case selection), `/create/:useCaseId` (wizard), `/select-client`, `/client-asset-house` (brand assets), `/login`
- **State:** No state manager — React hooks for local state, singleton services for shared state, `localStorage` for selected client, `sessionStorage` for Alli access token.
- **Services** (`src/services/`): Singleton pattern throughout.
  - `auth.ts` — Firebase OIDC + Alli token management
  - `alli.ts` — Proxied API calls to Alli platform (clients, creative assets, product feeds) with in-memory cache
  - `creative.ts` — Firestore CRUD for creative projects (status: draft → processing → completed/failed)
  - `clientAssetHouse.ts` — Brand standards per client (colors, fonts, logos, dynamic variables) stored in Firestore `clientAssetHouse` collection; handles Firebase Storage uploads and dynamic font loading
  - `videoService.ts` — Calls Cloud Functions for Gemini-based video analysis and FFmpeg cutdowns (10min timeout)
- **Types** (`src/types/index.ts`): Central type definitions including `UseCaseId`, `Client`, `CreativeAsset`, `AIProvider`
- **Constants** (`src/constants/useCases.ts`): Use case definitions, platform ad sizes (Meta/Google/Pinterest/TikTok/YouTube), AI provider configs
- **Utility:** `cn()` in `src/utils/cn.ts` — `clsx` + `tailwind-merge` for class merging
- **Design tokens:** Custom Tailwind theme in `src/index.css` (blue primary palette, card/elevated/modal shadows)

### Backend (`functions/src/`)

- `alliProxy.ts` — CORS proxy endpoints for Alli API (getMeProxy, getClientsProxy, getCreativeAssetsProxy)
- `video.ts` — Video processing: Gemini 3 Pro Preview analysis + parallel FFmpeg cutting/stitching with platform-specific aspect ratios (4GB memory, 540s timeout)
- `ai.ts` — AI integration functions

**Firestore collections:** `creatives`, `clientAssetHouse`

## Conventions

- **Strict TypeScript** in both frontend and backend — resolve all type/lint errors before PR
- **File naming:** PascalCase for React components/pages, camelCase for services/utilities
- **Commits:** Conventional prefixes (`feat:`, `fix:`, etc.), imperative subject, one logical change per commit
- **Components:** Functional components only; page-specific logic stays in `src/pages/`
- **No formatter configured** — match the style of the file being edited
