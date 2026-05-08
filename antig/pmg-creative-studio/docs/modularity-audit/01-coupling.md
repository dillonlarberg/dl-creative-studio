# Modularity Audit — Coupling & Module Boundaries

Scope: `src/{apps,components,pages,services,platform,utils}` cross-module imports.
Method: grep on relative imports across boundary directories; line counts for fan-out and god-module candidates.

## Intended layering (inferred)

`utils` → `services` → `platform` → `components` / `apps` → `pages` → `App.tsx`

- `platform/*` should be domain-agnostic infra (firebase paths, wizard shell, client context).
- `services/*` should be data/IO only — no UI imports.
- `apps/*` are self-contained vertical features that mount via the registry.
- `components/*` should be presentational/shared.
- `pages/*` compose everything.

## Top 10 issues (priority order)

### 1. `pages/use-cases/UseCaseWizardPage.tsx` is a god-page (CRITICAL)
- 4,311 lines, 18 imports, fans into 9 service modules.
- File: `src/pages/use-cases/UseCaseWizardPage.tsx:1-18` (imports lines 3–18 hit `clientAssetHouse`, `creative`, `videoService`, `alli`, `templates`, `batches`, plus types and utils).
- Violates the 800-line cap; encodes wizard logic that belongs in an `apps/*` module behind `platform/wizard/WizardShell`. Should be decomposed and migrated into the apps registry (parallel to `apps/template-builder`).

### 2. `platform/*` depends on `services/*` and `apps/*` (boundary inversion, CRITICAL)
Platform is supposed to be the lowest UI layer; it should not know about apps or domain services.
- `src/platform/wizard/WizardShell.tsx:14` imports from `../../apps/types` — platform → apps.
- `src/platform/wizard/usePersistedStepData.ts:2` imports `creativeService` from `../../services/creative` — platform → services.
- `src/platform/wizard/usePersistedStepData.ts:3` imports `AppManifest, StepData` from `../../apps/types`.
- `src/platform/client/ClientProvider.tsx:3` imports `alliService` from `../../services/alli`.
- `src/platform/wizard/WizardShell.test.tsx:4,6` imports both `apps/types` and `services/creative`.

Fix: move shared types (`AppManifest`, `StepData`, `WizardStep`, `ValidationResult`) from `apps/types.ts` into `platform/wizard/types.ts`, and inject services into platform components via props/context instead of importing them directly.

### 3. `apps/types.ts` reaches into `platform/firebase` (cyclic risk, HIGH)
- `src/apps/types.ts:2` imports `AppId, ClientSlug, CreativeId` from `../platform/firebase/paths`.
- Combined with #2, this creates a `platform ↔ apps` cycle (platform/wizard → apps/types → platform/firebase). Move the ID brand types into a neutral location (e.g., `src/types/ids.ts`) consumed by both.

### 4. `services/alli.ts` is a god-service (HIGH fan-in)
- 246 lines, imported by 13+ call sites across `pages`, `components`, `apps`, and `platform`:
  - `src/components/AppLayout.tsx:16`, `src/pages/ClientSelectPage.tsx:3`, `src/pages/CreatePage.tsx:21`, `src/pages/use-cases/UseCaseWizardPage.tsx:13`, `src/components/edit-image/steps/SelectAnalyzeStep.tsx:15`, `src/apps/template-builder/_internal/handlers.ts:9`, `src/apps/template-builder/_internal/handlers.test.ts:3`, `src/platform/client/ClientProvider.tsx:3`, plus tests.
- Treat as an integration boundary: split by capability (auth/session, brand/asset analysis, creative-insights) so that not every layer pulls in the full surface.

### 5. `services/clientAssetHouse.ts` is the second god-service (HIGH fan-in)
- Imported in 9 places spanning `pages`, `components`, `apps`:
  - `src/pages/ClientAssetHousePage.tsx:3-4`, `src/pages/CreatePage.tsx:19-20`, `src/pages/use-cases/UseCaseWizardPage.tsx:8-9`, `src/components/edit-image/types.ts:1`, `src/components/edit-image/utils/extractBrandColors.ts:1`, `src/apps/template-builder/steps/MappingStep.tsx:16`, `src/apps/template-builder/steps/RefineStep.tsx:20`, `src/apps/template-builder/steps/GenerateStep.tsx:17`, `src/apps/template-builder/_internal/handlers.ts:10`, `src/components/AppLayout.tsx:19`.
- `ClientAssetHouse` type is re-imported as a shared domain model — promote it to `src/types/clientAssetHouse.ts` so consumers don’t couple to the service module just for types.

### 6. `components/AppLayout.tsx` is a UI god-module (HIGH)
- 355 lines, 12 imports, pulls 3 services (`auth`, `alli`, `clientAssetHouse`) into a layout component.
  - `src/components/AppLayout.tsx:4`, `:16`, `:19`.
- Layout shouldn’t fetch domain data. Move data fetching into a context/provider (extend `platform/client/ClientProvider`) and let `AppLayout` consume props.

### 7. `apps/template-builder/_internal/handlers.ts` couples a feature app to three services (MEDIUM)
- `src/apps/template-builder/_internal/handlers.ts:8-10`: imports `batchService`, `alliService`, and `ClientAssetHouse` directly.
- 451 lines — borderline god-handler. Acceptable for a feature module but should funnel external IO through a single `apps/template-builder/api.ts` boundary so the rest of the app depends only on app-local types.

### 8. `apps/template-builder/steps/*` import services directly, bypassing the app boundary (MEDIUM)
- `steps/ContextStep.tsx:14-15` (`templates`), `steps/RefineStep.tsx:20-21` (`clientAssetHouse`, `templates`), `steps/MappingStep.tsx:16` (`clientAssetHouse`), `steps/GenerateStep.tsx:17` (`clientAssetHouse`).
- Each step reaches up three levels (`../../../services/...`) — fragile, and prevents the app from being relocated/extracted. Channel through `_internal/handlers.ts` or an app-scoped service facade.

### 9. `components/edit-image/*` is a feature masquerading as a component (MEDIUM)
- 659-line `SelectAnalyzeStep.tsx` plus `steps/`, `utils/`, `types.ts` — the shape of an `apps/*` module, not a shared component.
  - `src/components/edit-image/steps/SelectAnalyzeStep.tsx:15` imports `alliService`; `:19-21` import its own utils; `components/edit-image/utils/extractBrandColors.ts:1` imports `services/clientAssetHouse`.
- No external consumer imports `components/edit-image/*` (grep returned no matches outside the folder). It should move to `src/apps/edit-image/` and register through `apps/_registry.ts` for consistency with `template-builder`.

### 10. Pages import service-owned types instead of dedicated domain types (LOW)
- `src/pages/ClientAssetHousePage.tsx:4`, `src/pages/use-cases/UseCaseWizardPage.tsx:9,11,17`, `src/pages/CreatePage.tsx:20`, `src/apps/template-builder/steps/ContextStep.tsx:15` all `import type { ... } from '../services/...'`.
- Couples consumers to the service module path even when only types are needed; complicates moving service implementations. Extract shared record types to `src/types/`.

## Boundary-violation summary

| Violation | Count | Severity |
| --- | --- | --- |
| `platform/*` → `services/*` | 3 (`ClientProvider.tsx:3`, `usePersistedStepData.ts:2`, `WizardShell.test.tsx:6`) | CRITICAL |
| `platform/*` → `apps/*` | 3 (`WizardShell.tsx:14`, `WizardShell.test.tsx:4`, `usePersistedStepData.ts:3`) | CRITICAL |
| `apps/*` → `platform/firebase` (via `apps/types.ts:2`) — completes a cycle with the above | 1 | HIGH |
| `services/*` → UI layers | 0 | OK |
| `apps/*` → `components/*` (other than self) | 0 | OK |
| Type-only leaks from services | 6+ | LOW |

## Fan-in / fan-out hot list

| Module | LOC | Fan-in (importers) | Fan-out (cross-module imports) |
| --- | --- | --- | --- |
| `pages/use-cases/UseCaseWizardPage.tsx` | 4311 | 1 (App.tsx routing) | 9 services + utils |
| `apps/template-builder/_internal/handlers.ts` | 451 | step files + tests | 3 services |
| `components/AppLayout.tsx` | 355 | layout root | 3 services + utils |
| `services/alli.ts` | 246 | 13+ call sites across all layers | n/a |
| `services/clientAssetHouse.ts` | 107 | 10 call sites across all layers | n/a |
| `components/edit-image/steps/SelectAnalyzeStep.tsx` | 659 | 0 external | services + sibling utils |

## Recommended remediation order

1. Break the `platform ↔ apps ↔ services` cycle: extract neutral type modules (`src/types/ids.ts`, `src/types/wizard.ts`).
2. Inject services into `platform/*` and `components/AppLayout` via context instead of direct imports.
3. Decompose `pages/use-cases/UseCaseWizardPage.tsx` into an `apps/use-cases` module behind the registry.
4. Promote `components/edit-image` to `apps/edit-image`.
5. Funnel `apps/template-builder/steps/*` through a single app-scoped API facade.

DONE

