# Modularity Audit — File Size & Cohesion

Generated: 2026-05-05. Scope: `src/**/*.{ts,tsx}`. Threshold: > 400 lines.

## Files over 400 lines (sorted desc)

| Lines | File |
|------:|------|
| 4311 | `src/pages/use-cases/UseCaseWizardPage.tsx` |
| 914  | `src/apps/template-builder/steps/MappingStep.tsx` |
| 659  | `src/components/edit-image/steps/SelectAnalyzeStep.tsx` |
| 593  | `src/pages/ClientAssetHousePage.tsx` |
| 507  | `src/apps/template-builder/steps/RefineStep.tsx` |
| 467  | `src/apps/template-builder/steps/SourceStep.tsx` |
| 463  | `src/apps/template-builder/steps/ContextStep.tsx` |
| 451  | `src/apps/template-builder/_internal/handlers.ts` |
| 400  | `src/apps/template-builder/steps/GenerateStep.tsx` |

Only 9 files cross the 400-line threshold, but they account for ~62% of the total `src` line count (8,865 / 14,198). Almost all of the bulk lives in the legacy wizard monolith and the template-builder step modules that were lifted from it. The 10th-largest file (`AppLayout.tsx`, 355 lines) is included below for context since it is just under threshold and shows similar cohesion drift.

---

## Top 10 — Responsibilities & Cohesion Findings

### 1. `src/pages/use-cases/UseCaseWizardPage.tsx` — 4,311 lines (CRITICAL)

**Doing many jobs.** This is the source-of-truth monolith for every legacy use-case wizard. It mixes:

- Two module-level preview components: `TemplatePreview` (L33–96) and `FilledTemplatePreview` (L239–319), plus a 65-line `injectIntoHtml` helper (L173–237) and two large lookup tables `FIELD_ID_MAP` / `CSS_INJECTION_MAP` (L108–170). These are already duplicated into `src/apps/template-builder/_internal/{TemplatePreview,FilledTemplatePreview,injectIntoHtml,baseline}.ts(x)` — the in-file copies appear to be dead/legacy. (Cite: L22–319.)
- Static wizard configuration: `BASELINE_ASSETS` (L323), `WIZARD_STEPS` per use case (L338–404), `MODEL_MAPPING` (L405).
- The `UseCaseWizardPage` component (L409–end) which holds **40+ `useState` hooks** (L412–454) covering: navigation, history, video assets, alli assets, pagination, template-builder feeds, candidates, ratios, requirements approval, brand colors, font/logo/headline scaling, modals, etc.
- Data-fetching effects: `fetchTemplates` (L487), `fetchAlliAssets` (L504), `fetchDataSources` (L675), `fetchFeedSample` (L723), `fetchHistory` (L1080), `fetchStatus` (L1095). All inline; many overlap with `apps/template-builder/_internal/handlers.ts`.
- Business logic: `generateCandidates` (L873), `handleExecuteBatch` (L637), `handleSaveTemplate` (L603), requirement add/remove (L585–602), `resumeProject` (L1172), and a 500+ line `handleNext` (L1194) that performs persistence, wizard branch logic, and step-skip rules.
- A render tree spanning ~3,000 lines with at least 9 step branches selected by `steps[currentStep].id` (L1574, 1608, 1999, 2221, 2539, 2695, 2953, 3568, 3805, 4141) — every legacy use-case (asset-resize, edit-video, generate-static, edit-image, content-extension, **and** template-builder) renders inline despite the new `apps/template-builder` modular package already existing.
- Embedded ad-hoc UI: history sidebar, wireframe library modal, feed picker modal, brand control sliders.

**Concrete split points:**
- Delete the obsolete previews/helpers at L22–319 — they are superseded by `apps/template-builder/_internal/*` (cross-check against `injectIntoHtml.ts`, `FilledTemplatePreview.tsx`, `TemplatePreview.tsx`, `baseline.ts`).
- Move `WIZARD_STEPS` (L338–404) and `MODEL_MAPPING` (L405) to `src/constants/wizardSteps.ts` (or per-use-case `src/apps/<id>/manifest.ts`, mirroring `apps/template-builder/manifest.ts`).
- Migrate the template-builder branches (L2221, 2539, 2695, 2953, 3568, 3805, 4141) to the existing `apps/template-builder/steps/*` — those step modules already exist; this page should route through `WizardShell` instead of re-implementing it.
- Extract each remaining use-case's per-step JSX into `src/apps/<use-case-id>/steps/<StepName>.tsx` (e.g., `apps/edit-video/steps/ConfigureStep.tsx`, `apps/generate-static/steps/ContextStep.tsx`).
- Pull `handleNext` (L1194) into a state machine module: `src/platform/wizard/wizardReducer.ts` + `useWizardController` hook, consuming the per-app `WizardStep.next()` contract that already exists in `src/apps/types.ts`.
- Move data fetchers (L487, 504, 675, 723, 1080, 1095) into per-app handler files mirroring `apps/template-builder/_internal/handlers.ts` (e.g., `apps/edit-image/_internal/handlers.ts`).
- Lift the wireframe-library modal and history sidebar into reusable shells under `src/platform/wizard/`.

Target: this file becomes a < 100-line router that reads `useCaseId`, looks up the manifest from `apps/_registry`, and renders `<WizardShell app={app} />`.

---

### 2. `src/apps/template-builder/steps/MappingStep.tsx` — 914 lines (HIGH)

**Doing >1 job.** A single `MappingStepBody` component (L38–890) renders both the left mapping-controls column and the right preview column; the sections are visible at L95 (mapping controls), L370 (live FilledTemplatePreview), L540/590/640 (color controls × 3 nearly identical), L690 (font selector), L724 (mapped-field badge bar), L749 (no-wireframe Generative Asset Constructor fallback). The "alternate path" alone (no-wireframe) is ~140 lines living inside the same component. Asset-house fetch (L55–69) is duplicated verbatim across `RefineStep`/`GenerateStep`.

**Concrete split points:**
- Extract `MappingControls` (left column) → `steps/mapping/MappingControls.tsx` (mapping table per requirement, mode toggles).
- Extract `MappingPreview` (right column, wireframe path) → `steps/mapping/MappingPreview.tsx`.
- Extract `GenerativeAssetFallback` (L749–end of fallback) → `steps/mapping/GenerativeAssetFallback.tsx`.
- Collapse the three near-identical color pickers (L540, L590, L640) into a `<BrandColorPicker label color onChange/>` component in `steps/mapping/BrandColorPicker.tsx`.
- Extract per-requirement row UI (logo branch L110–, image-or-text branches following) into `steps/mapping/RequirementRow.tsx` with subcomponents `LogoRequirementRow` and `FieldRequirementRow`.
- Move duplicated asset-house fetch into `src/platform/client/useAssetHouse.ts` hook; reuse from Mapping, Refine, Generate.

---

### 3. `src/components/edit-image/steps/SelectAnalyzeStep.tsx` — 659 lines (HIGH)

**Doing >1 job.** The file packages three concerns: (a) `SelectAnalyzeStep` exports the picker + analysis flow at L58–582, (b) `RecommendationCard` at L584–end renders the analysis panel, (c) `RecommendationIcon` at L46–56 is a tiny presentational helper. Inside `SelectAnalyzeStep` the body covers: source toggle, alli-asset listing with platform/search filters and pagination (state at L67–75; effects L78, L82), per-asset analysis fetch (`fetchAnalysisForAsset` L128–216), file upload (`handleFileUpload` L217–246), edit-type "apply" handler (`handleApply` L247–264), then a 300+ line render starting L266 covering tabs, asset grid, upload drop zone, inline analysis panel, and edit-type cards (L25–44 constant). The mix of "select asset" + "run/display analysis" + "choose edit type" is three logically distinct steps fused together.

**Concrete split points:**
- Split into 3 sibling step components under a wizard sub-flow:
  - `steps/select/SelectAssetStep.tsx` — source toggle + filter + grid + upload (L266–~440).
  - `steps/analyze/AnalyzePanel.tsx` — the recommendation pane (L584–end + `RecommendationIcon`).
  - `steps/select/EditTypePicker.tsx` — the `EDIT_TYPES` constant (L25–44) + the apply UI.
- Move `fetchAnalysisForAsset` (L128) into `src/services/alli.ts` or `services/imageAnalysis.ts`.
- Move `handleFileUpload` (L217) into `src/platform/uploads/useFileUpload.ts` (also reusable by `ClientAssetHousePage`).

---

### 4. `src/pages/ClientAssetHousePage.tsx` — 593 lines (MEDIUM-HIGH)

**Doing >1 job.** A single component owns: brand-standards form (logos at L299, colors+typography at L341), dynamic brand variables CRUD (L398), status/save (L493), and bulk-asset upload + library (L528). `handleFileUpload` (L71–161) handles two distinct flows — logo and font — with branching, sanitization, progress, and auto-save side effects in one ~90-line function.

**Concrete split points:**
- Sections → `pages/asset-house/sections/{BrandStandards,DynamicVariables,AssetLibrary,SaveStatus}.tsx`.
- Split `handleFileUpload` into `useLogoUpload` and `useFontUpload` hooks under `src/platform/uploads/`. The font path requires distinct sanitization/diagnostics (L59–70) — those belong with font logic, not in a general handler.
- Move `fetchAssetHouse` (L40) into `services/clientAssetHouse.ts` as a hook (`useAssetHouse(slug)`); the page should not own the loading state.

---

### 5. `src/apps/template-builder/steps/RefineStep.tsx` — 507 lines (MEDIUM)

**Doing >1 job.** `RefineStepBody` (L67–500) renders left preview-carousel (L189) AND right control panel (L369), with sub-sections: branding (L371) + color palettes (L378) + logo management (L397) + typography (L430) + font selection (L434) + dynamic sizing (L459). A `FALLBACK_LOGO` constant at L40 is defined at module level — same pattern duplicated across step files.

**Concrete split points:**
- `steps/refine/RefinePreviewCarousel.tsx` (L189–367) — the multi-size preview + feed quick-nav (L345).
- `steps/refine/RefineControls.tsx` (L369–499), itself containing `BrandingPanel`, `LogoManagementPanel`, `TypographyPanel`, `SizingPanel`.
- Hoist `FALLBACK_LOGO` and shared brand constants into `apps/template-builder/_internal/constants.ts` (avoids redefinition across `RefineStep`, `MappingStep`, `UseCaseWizardPage`).

---

### 6. `src/apps/template-builder/steps/SourceStep.tsx` — 467 lines (MEDIUM)

**Doing >1 job.** Mixes a metadata reader utility (`readMetadata` L42), the feed-list/selected-feed rendering (L127–206), and a 200+ line "Field Overview" panel with header + scrollable content (L207–456) inside one body component.

**Concrete split points:**
- Move `readMetadata` (L42) into `src/apps/template-builder/_internal/feedMetadata.ts` (testable in isolation).
- Extract `steps/source/FeedList.tsx` (L127–206) and `steps/source/FieldOverviewPanel.tsx` (L207–456). The panel itself can be split into `FieldOverviewHeader` + `FieldOverviewScroll`.

---

### 7. `src/apps/template-builder/steps/ContextStep.tsx` — 463 lines (MEDIUM)

**Mostly cohesive but bloated.** A `CHANNELS` constant + `ratiosForChannel` helper (L25–38) live alongside the `ContextStepBody` component which renders Job Title (L183), Channel Selection (L197), Aspect Ratios (L220), Wireframes & Historical (L261), and Historical Templates (L373). The historical-templates pane is a separable feature.

**Concrete split points:**
- Extract `steps/context/ChannelPicker.tsx` (L197–219) and `steps/context/RatioPicker.tsx` (L220–260).
- Extract `steps/context/HistoricalTemplatesList.tsx` (L373–end).
- Extract `steps/context/WireframeGallery.tsx` (L261–372).
- Move `CHANNELS` + `ratiosForChannel` into `apps/template-builder/_internal/channels.ts`.

---

### 8. `src/apps/template-builder/_internal/handlers.ts` — 451 lines (MEDIUM)

**Modest cohesion drift.** Five exported async handlers in one file: `fetchFeedSample` (L45), `fetchDataSources` (L211), `analyzeCreativeIntent` (L256), `generateCandidates` (L314), `handleExecuteBatch` (L417). They share Alli/feed semantics, but each has an independent error model and signature; sharing one file makes diff blast-radius unnecessarily wide.

**Concrete split points:**
- Split into `_internal/handlers/{fetchFeedSample,fetchDataSources,analyzeCreativeIntent,generateCandidates,executeBatch}.ts` with a barrel `_internal/handlers/index.ts`.
- Lift `FeedSampleErrorInfo` / `FeedSampleResult` (L20, L31) into `apps/template-builder/types.ts` so consumers don't re-import from a sibling internal module.

---

### 9. `src/apps/template-builder/steps/GenerateStep.tsx` — 400 lines (MEDIUM)

**Doing >1 job.** `GenerateStepBody` (L63–361) renders both the **wireframe-path** (live FilledTemplatePreview rows L177–253) and the **non-wireframe candidate path** (L255–360 — "Candidate Preview Card" with logo/main-image/text-overlay slots and a descriptor footer L336). These are two render shapes for two product modes glued into one body.

**Concrete split points:**
- Extract `steps/generate/WireframeRowList.tsx` (L177–253) and `steps/generate/CandidatePreviewCard.tsx` (L255–360).
- Reuse the duplicated asset-house fetch via `useAssetHouse` (see #2).
- Move the inline header (L103–176) into `steps/generate/GenerateHeader.tsx`.

---

### 10. `src/components/AppLayout.tsx` — 355 lines (just under threshold; included for context)

**Doing >1 job.** A layout component owns: helper `nameFromEmail` (L27), the layout itself (L38), sidebar/logo (L155), nav (L171), user/client selector (L199), main content (L227), background-wave decoration (L230), AND a full Client Selection Drawer with search and client list (L244–end at ~L355).

**Concrete split points:**
- `components/layout/Sidebar.tsx`, `components/layout/MainContentBackground.tsx`, `components/layout/ClientSelectorDrawer.tsx` (the drawer alone is ~110 lines and is independently mountable).
- Move `nameFromEmail` to `src/utils/nameFromEmail.ts`.

---

## Cross-Cutting Findings

1. **Duplicated logic across template-builder steps.** Asset-house fetch repeats in `MappingStep` (L55–69), `RefineStep`, and `GenerateStep`. Extract `src/platform/client/useAssetHouse.ts`.
2. **Step files mix two render paths (wireframe / no-wireframe).** Pattern repeats in `MappingStep` (L749), `GenerateStep` (L177 vs L255). Each step should expose a small router that picks a sub-component, not a single body that branches in JSX.
3. **The legacy monolith and the new modular `apps/template-builder` package overlap.** `UseCaseWizardPage.tsx` re-implements `TemplatePreview`, `FilledTemplatePreview`, `injectIntoHtml`, and the entire template-builder render tree that already exists at `src/apps/template-builder/**`. Until the page is collapsed onto `WizardShell`, every change risks divergence between the two trees.
4. **`handleNext` (UseCaseWizardPage L1194) is a hidden state machine.** Moving it to `src/platform/wizard/wizardReducer.ts` is the highest-leverage single split — it would shed several hundred lines and unlock per-app `next()` testing.

## Recommended Priority Order

1. Migrate `UseCaseWizardPage` template-builder branches to `WizardShell` + `apps/template-builder/steps/*` (eliminates the 4,311-line file's bulk).
2. Split `MappingStep.tsx` into Controls / Preview / Fallback subcomponents and extract `BrandColorPicker`.
3. Trifurcate `SelectAnalyzeStep.tsx` (Select / Analyze / EditTypePicker).
4. Section `ClientAssetHousePage.tsx` and split `handleFileUpload` per asset type.
5. Split each remaining step file (`RefineStep`, `SourceStep`, `ContextStep`, `GenerateStep`) into per-section subcomponents.
6. Split `_internal/handlers.ts` into per-handler modules.
