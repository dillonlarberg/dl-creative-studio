# Modularity Audit — 03: Duplication & Missing Abstractions

Scope: `src/` — focus on copy-paste between `src/apps/template-builder/` and `src/components/edit-image/`, plus shared services/utils.

Findings are grouped by category. Citations are `path:line` and were taken from a structural pass over the relevant files. Lines are best-effort and may shift with edits.

---

## 1. Firebase Storage upload pattern (3 sites)

The `ref(storage, path)` → `uploadBytes()` → `getDownloadURL()` triple is open-coded in multiple places with subtly different path conventions.

- `src/components/edit-image/steps/SelectAnalyzeStep.tsx:229-231` — path: `edit-image/{slug}/{ts}_{name}`
- `src/pages/use-cases/UseCaseWizardPage.tsx` (monolith) — path: `uploads/{slug}/{ts}_{name}`
- `src/services/clientAssetHouse.ts:83-85` — already wrapped (`uploadAsset()`), but the underlying triple is duplicated rather than reused.

**Missing abstraction:** `useFileUpload({ pathPrefix, validate })` hook or `storageService.upload(file, path)` helper. Centralize: file-type/size validation, path construction, error mapping, optional preview-URL generation.

---

## 2. `useEffect` + cancel-flag asset-house fetch (4 sites)

Each template-builder step boots with the same `let cancelled = false` + `clientAssetHouseService.getAssetHouse()` pattern, copy-pasted.

- `src/apps/template-builder/steps/GenerateStep.tsx:77-91`
- `src/apps/template-builder/steps/MappingStep.tsx:55-69`
- `src/apps/template-builder/steps/RefineStep.tsx:91-102`
- `src/apps/template-builder/steps/SourceStep.tsx:78-88`

**Missing abstraction:** `useClientAssetHouse(clientSlug)` returning `[assetHouse, isLoading, error]` with cancellation built in. Removes ~15 lines × 4 files of boilerplate.

---

## 3. Firestore CRUD envelope (4 services)

Each service redefines `addDoc + serverTimestamp()` and `updateDoc + updatedAt: serverTimestamp()`.

- `src/services/templates.ts:23-32` — `saveTemplate()`
- `src/services/creative.ts:18-27` — `createCreative()`
- `src/services/batches.ts:28-33` — `createBatch()`
- `src/services/clientAssetHouse.ts:64-79` — `saveAssetHouse()` (manual `setDoc`/`updateDoc` merge)

**Missing abstraction:** Generic `createDoc(coll, data)` / `updateDocWithTimestamp(ref, patch)` / `getDocTyped<T>(ref)` helpers in a single `src/services/firestore.ts`, or a `FirestoreRepository<T>` class. Would also unify the inconsistent `createdAt`/`updatedAt` naming.

---

## 4. Step component prop shapes diverge gratuitously

Both wizard surfaces have step components with overlapping responsibilities but different prop contracts.

- `src/apps/template-builder/types.ts` (`StepRenderProps<T>`): `{ stepData, mergeStepData, client, navigate }`
- `src/components/edit-image/types.ts` (`EditImageStepProps`): `{ stepData, onStepDataChange, clientSlug, assetHouse, isLoading, setIsLoading, onAdvance }`

Naming differs (`mergeStepData` vs `onStepDataChange`, `client` vs `clientSlug`) but semantics are identical.

**Missing abstraction:** A single shared `StepComponentProps<T>` in a top-level `src/apps/types.ts` (or `src/platform/wizard/`). Consolidates wizard concept and prevents future drift as a third wizard appears.

---

## 5. Fetch + auth-header + error-text wrapper (multiple sites)

Manual `fetch` with header construction, `.ok` checks, and `await response.text()` for error bodies repeats.

- `src/services/alli.ts:33-45` — `getMe()`
- `src/services/alli.ts:90-100` — fallback in `getClients()`
- `src/components/edit-image/steps/SelectAnalyzeStep.tsx:128-203` — `fetchAnalysisForAsset()` with hand-rolled request-id dedupe

**Missing abstraction:** `fetchWithAuth(url, options)` returning typed JSON or throwing a structured error. Built-in: bearer token injection, `Accept: application/json`, error-body extraction, log-prefix tagging.

---

## 6. Step validation imperative blocks (5 steps)

Each step's `validate()` open-codes a series of `if (!x) return { ok: false, reason: ... }` checks.

- `src/apps/template-builder/steps/IntentStep.tsx:289-299`
- `src/apps/template-builder/steps/ContextStep.tsx:421-429`
- `src/apps/template-builder/steps/SourceStep.tsx` (`validate`)
- `src/apps/template-builder/steps/MappingStep.tsx` (`validate`)
- `src/apps/template-builder/steps/RefineStep.tsx` (`validate`)

**Missing abstraction:** A small `StepValidator` builder or `validate([...rules])` helper. Keeps validation declarative and testable independently of the component.

---

## 7. Form-control styling open-coded everywhere (7+ sites)

Same Tailwind classes for label + input recur:

```
<label className="block text-[10px] font-black text-blue-600 uppercase tracking-widest mb-2">
<input className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 focus:border-blue-600 focus:ring-4 focus:ring-blue-50 outline-none transition-all">
```

- `src/apps/template-builder/steps/ContextStep.tsx:185-194`
- `src/apps/template-builder/steps/IntentStep.tsx:108-117`
- `src/apps/template-builder/steps/MappingStep.tsx` (column mapping inputs)
- `src/components/edit-image/steps/SelectAnalyzeStep.tsx:320-329`

**Missing abstraction:** `<FormLabel>` / `<FormInput>` / `<FormTextarea>` primitives in `src/components/ui/`. The exact same theme tokens are hand-typed in every file — high churn risk if branding changes.

---

## 8. Cancellation token pattern (`let cancelled = false`)

Identical pattern in at least four `useEffect`s — see #2 above. This is structurally a hook missing from the codebase.

**Missing abstraction:** `useAsyncData(fn, deps)` returning `{ data, isLoading, error }`. Also covers Firestore reads (#3), Alli fetches (#5), and feed/template loaders.

---

## 9. Loading state boilerplate

`const [isLoading, setIsLoading] = useState(false)` + try/finally + spinner UI repeats:

- `src/components/edit-image/steps/SelectAnalyzeStep.tsx:69-76` (multiple loading flags)
- `src/apps/template-builder/steps/SourceStep.tsx:52-56`
- `src/apps/template-builder/steps/RefineStep.tsx:73-75`
- `src/apps/template-builder/steps/GenerateStep.tsx`

**Missing abstraction:** `useAsyncAction(fn)` → `{ run, isLoading, error }`. Alternatively, expose `<AsyncContainer isLoading error>` for the UI side.

---

## 10. Pagination logic open-coded (2 sites)

- `src/components/edit-image/steps/SelectAnalyzeStep.tsx:106-110` — full grid pagination with `ASSETS_PER_PAGE`
- `src/apps/template-builder/steps/ContextStep.tsx:386-408` — partial (`.slice(0, 2)` hardcoded)

**Missing abstraction:** `usePagination(items, pageSize)` returning `{ page, totalPages, paginatedItems, next, prev, setPage }`, plus a `<Paginator>` component for the controls.

---

## 11. Loading skeleton UI (2 sites)

Same `animate-spin text-blue-600` + pulsing skeleton:

- `src/components/edit-image/steps/SelectAnalyzeStep.tsx:332-338`
- `src/pages/ClientAssetHousePage.tsx:40-68`

**Missing abstraction:** `<LoadingGrid />` or `<Spinner label="..." />` primitive.

---

## 12. Inconsistent error logging (5+ sites)

Raw `console.error/warn` with ad-hoc prefixes, no shared format.

- `src/services/alli.ts:84` — `'Fetch Clients Error...'`
- `src/components/edit-image/steps/SelectAnalyzeStep.tsx:192` — `'Failed to fetch...'`
- `src/apps/template-builder/steps/ContextStep.tsx:56` — `'Failed to fetch templates:'`
- `src/apps/template-builder/_internal/handlers.ts` — mixed `console.warn` fallbacks
- `src/services/clientAssetHouse.ts` — silent catches in places

**Missing abstraction:** A thin `logger` (`src/utils/log.ts`) with `logger.error(category, action, err)`. Also makes it trivial to wire Sentry/Datadog later.

---

## 13. Silent error fallbacks vs. user-visible error UI

Inconsistent strategy: some steps render an error banner, others silently set state to empty.

- `src/apps/template-builder/steps/SourceStep.tsx:68-70` — silent empty array on fetch fail
- `src/components/edit-image/steps/SelectAnalyzeStep.tsx:92` — `.catch(() => setAssets([]))`
- `src/apps/template-builder/steps/GenerateStep.tsx:85-86` — `.catch(() => setAssetHouse(null))`
- `src/components/edit-image/steps/SelectAnalyzeStep.tsx:219-220` — does show inline error UI

**Missing abstraction:** A documented step-level error contract — either a `<StepErrorBoundary>` or a standardized `error: string | null` slot in the step prop shape. Without it, users see different failure modes per step.

---

## 14. Resetting downstream wizard state

In `SelectAnalyzeStep.tsx:205-244` two distinct user actions (`selectAlliAsset` vs `handleFileUpload`) both clear the same set of downstream fields (`editType`, `imageAnalysis`, `recommendations`, ...) inline. The same pattern recurs in template-builder steps where changing an upstream selection ought to invalidate downstream choices but is sometimes forgotten.

**Missing abstraction:** A `clearDownstream(stepData, fromStep)` helper driven by a manifest-aware dependency map. The wizard manifests already encode order — they're the right place to declare downstream invalidation.

---

## 15. Wireframe baseline data spread is a hidden contract

`src/apps/template-builder/steps/ContextStep.tsx:63-71` spreads `BASELINE_ASSETS` (headline, image1, image2, logo, ...) on wireframe selection. The fields exist in `src/apps/template-builder/types.ts:42-54` as bare optionals — there's no named type for "the locked-in subset" and no test asserting they line up.

**Missing abstraction:**

```ts
export const WIREFRAME_BASELINE_FIELDS = [...] as const;
export type WireframeBaseline = Pick<TemplateBuilderStepData, typeof WIREFRAME_BASELINE_FIELDS[number]>;
```

Plus a unit test asserting `BASELINE_ASSETS satisfies WireframeBaseline`.

---

## Cross-cutting observations

- **Two parallel wizard frameworks.** `src/apps/template-builder/` has a manifest + `StepRenderProps` + `mergeStepData`. `src/components/edit-image/` has an ad-hoc steps array + `EditImageStepProps` + `onStepDataChange`. They do the same job. The natural home for a shared abstraction is `src/platform/wizard/` (manifest, hook, prop type).
- **Service layer is half-abstracted.** `clientAssetHouse.ts` shows the right shape (typed methods, single Firestore touch-point), but `templates.ts`, `creative.ts`, `batches.ts` keep open-coding `addDoc`/`serverTimestamp`. Pull these to a common base.
- **No HTTP client.** All Alli fetches are raw `fetch`. A 30-line `fetchWithAuth` would absorb #5 and the analysis-fetch path in `SelectAnalyzeStep`.

---

## Suggested refactor order (highest ROI first)

| # | Abstraction | Eliminates | Risk |
|---|---|---|---|
| 1 | `useClientAssetHouse()` hook | #2, #8 (4 copies) | low |
| 2 | `firestore.ts` helpers (`createDoc`, `updateDocWithTimestamp`) | #3 (4 services) | low |
| 3 | `fetchWithAuth()` + structured error | #5, #12 (≥6 sites) | low |
| 4 | Unified `StepComponentProps<T>` in `src/platform/wizard/` | #4, partly #13, #14 | medium (touches both wizards) |
| 5 | `useFileUpload()` hook | #1 (3 sites) | low |
| 6 | `<FormLabel>` / `<FormInput>` primitives | #7 (7+ sites) | low (mechanical) |
| 7 | `usePagination()` + `<Paginator>` | #10 | low |
| 8 | `useAsyncAction()` / `useAsyncData()` | #8, #9 | low |
| 9 | `logger` utility | #12 | trivial |
