# Resize Image — App Build Kickoff

**Owner:** Annie
**Skeleton landed:** PR `feature/resize-image-skeleton`
**Pattern source of truth:** `src/apps/template-builder/` — mirror its shape

This doc is the prompt for building Resize Image as a modular app inside AdLabs. The skeleton already wires the manifest into the registry, mounts the route, and gives you four placeholder steps. Your job is to fill in the steps and wire the AI-resize pipeline. **Do not invent a new structure** — follow the modular pattern below; everything else in AdLabs depends on it.

---

## What's already built (skeleton)

```
src/apps/resize-image/
├── manifest.ts              ← registered as 'resize-image' in _registry.ts
├── types.ts                 ← ResizeImageStepData (persistence schema)
├── steps.ts                 ← barrel re-exporting the 4 steps
├── steps/
│   ├── UploadStep.tsx       ← Step 1 stub
│   ├── SizesStep.tsx        ← Step 2 stub
│   ├── PreviewStep.tsx      ← Step 3 stub (where async submit goes)
│   └── ApproveStep.tsx      ← Step 4 stub (writes a BatchRecord)
├── AppRoot.tsx              ← single-line WizardShell mount
└── manifest.test.ts         ← contract guard
```

Already wired:
- Route: `/adlabs/:clientSlug/resize-image/*` mounts `ResizeImageAppRoot`
- Registry: `src/apps/_registry.ts` includes `resizeImageManifest`
- AppId union: `'resize-image'` already in `src/platform/firebase/paths.ts`
- Dashboard card: registry-driven, you don't have to add anything

---

## The contract you're implementing

Every app in AdLabs honors **two** types: `AppManifest<S>` and `WizardStep<S>` (see `src/apps/types.ts`). The platform-level `WizardShell` is the only thing that knows how to render a manifest. Your steps just have to satisfy the contract.

### Each `WizardStep<ResizeImageStepData>` provides:

- `id: string` — stable URL segment (`/resize-image/upload`, `/resize-image/sizes`, etc.).
- `name: string` — shows in the breadcrumb.
- `render(props)` — the step body. `props.stepData` is your typed state, `props.mergeStepData(patch)` is how you write to it. **Render is a pure function of stepData** — keep it that way; don't stash component-local state that needs to survive navigation.
- `validate(data) => ValidationResult` — gates the Continue button. Return `{ ok: true }` or `{ ok: false, requirements: [{label, met: false}] }`. Requirements render as the footer checklist.
- `next?(ctx) => string | undefined` — synchronous override for which step is next. Skip if "next step in array" is correct.
- `submit?(ctx) => Promise<{ nextStepId?: string }>` — **async** override. Use this when Continue must kick off server work before navigating (e.g. the AI-resize pipeline). The shell awaits, shows pending state, surfaces rejection in `wizard-validation-error`, and does NOT mutate state on rejection. Step components must defer writes until `submit` resolves.
- `onEnter?` / `onLeave?` — lifecycle hooks for non-Continue side effects.

### Persistence

- `manifest.initialStepData()` returns the empty state on first mount.
- `WizardShell` automatically persists `stepData` to localStorage and restores on remount. **Don't add your own persistence** — keep `ResizeImageStepData` JSON-serializable (no `Blob`, `FileList`, or `Date` instances; use ISO strings or upload URLs).
- Long-form binary data (uploaded images) goes to **Cloud Storage**, not stepData. Persist the resulting download URL in stepData.

---

## Where things go in Firestore + Storage

This is non-negotiable — it's the SOC2 path-scoping contract enforced across all four data services (PR #7 / `b4053d7`).

| Concern | Path | Helper |
|---|---|---|
| App's batch records | `clients/{slug}/apps/resize-image/batches/{batchId}` | `batchService.createBatch('resize-image', {...})` |
| Per-batch result | …/`batches/{batchId}/results/{resultId}` | `batchService.addResult(slug, 'resize-image', batchId, {...})` |
| Per-creative records | `clients/{slug}/apps/resize-image/creatives/{id}` | `creativeService.*` (slug + appId in every call) |
| Cloud Storage uploads | `clients/{slug}/apps/resize-image/<your-suffix>` | `paths.storage.app(slug, 'resize-image', suffix)` |

**Never** read or write to top-level collections (`/batches`, `/creatives`, etc.). The default-deny rule in `firestore.rules` blocks them.

The one exception, today: `clientAssetHouse/{slug}` — this is a known temporary state hot-fixed in PR #9. Use `clientAssetHouseService.getAssetHouse(slug)` and don't worry about it; the migration (Issue #10) will move it under `clients/{slug}` and the service abstraction won't change.

---

## What to build, in this order

### 1. UploadStep — the easy one to start with
Drag-drop or `<input type=file>`, write to Storage at
`paths.storage.app(slug, 'resize-image', \`sources/${ts}-${name}\`)`,
call `mergeStepData({ sourceImageUrl, sourceImagePath, sourceImageName })`.
Tighten `validate` to require `sourceImageUrl`.

**Tracer:** unit test that mounts `<UploadStep>`, simulates a file pick, asserts `mergeStepData` is called with a populated `sourceImageUrl`.

### 2. SizesStep — UI only
Multi-select of common ad sizes. The list of sizes can be hardcoded for v1 (1080×1080, 1080×1350, 1080×1920, 728×90, 300×250, 970×250). Future: pull from the asset house.
`mergeStepData({ selectedSizes: ['1080x1080', ...] })`.
`validate`: at least one size.

### 3. PreviewStep — the real work, async submit
Wire the AI-resize pipeline here. Likely candidates:
- Replicate (`REPLICATE_API_TOKEN` already in `.env.local`) — pick a model that supports outpainting/extending images
- A Cloud Function under `functions/src/` that wraps the Replicate call (preferred — keeps the API key server-side)

```ts
submit: async (ctx) => {
  const urls: Record<string, string> = {};
  for (const size of ctx.stepData.selectedSizes ?? []) {
    urls[size] = await runResize(ctx.client.slug, ctx.stepData.sourceImageUrl!, size);
  }
  ctx.mergeStepData({ previewUrls: urls });
  return { nextStepId: 'approve' };
}
```

**Failure handling:** throw on pipeline failure. The shell will keep the user on Preview with an error in `wizard-validation-error`. Do NOT swallow errors — partial success without explicit handling is worse than failure.

**Tracer:** unit test that mocks `runResize`, asserts `submit` calls it once per size, asserts `mergeStepData` is called with `previewUrls` keyed by size, asserts navigation happens. Plus a rejection test.

### 4. ApproveStep — terminal, writes the batch
Render an Approve button + a download grid for `previewUrls`. On click:

```ts
const batchId = await batchService.createBatch('resize-image', {
  clientSlug: client.slug,
  templateId: 'ai-resize',
  feedId: 'manual',
  feedName: stepData.sourceImageName ?? 'Untitled',
  status: 'pending',
  totalVariations: stepData.selectedSizes!.length,
  completedVariations: 0,
  ratio: 'mixed',
});
for (const [size, url] of Object.entries(stepData.previewUrls!)) {
  await batchService.addResult(client.slug, 'resize-image', batchId, {
    url, feedRowIndex: 0, metadata: { size },
  });
}
await batchService.updateBatchStatus(client.slug, 'resize-image', batchId, 'completed', stepData.selectedSizes!.length);
mergeStepData({ approved: true, batchId });
```

That single call appears on the dashboard's Active Batch Jobs section automatically (Step 4 reader iterates every live app's batches). You don't have to wire the dashboard.

### 5. Flip `requiresBrandStandards: true` in the manifest
…once any step depends on brand tokens (probably SizesStep if it pulls allowed sizes from the asset house, or PreviewStep if the resize prompt incorporates brand color/logo).

---

## Tracer-test discipline (REQUIRED)

Every change has a binary pass/fail gate. Don't write a step body without a tracer that proves it works.

### Vitest (unit + integration)
- Each step has a test in `src/apps/resize-image/steps/__tests__/`
- Mock external services (`alliService`, `batchService`, `creativeService`)
- Test the contract: validate behavior, mergeStepData calls, submit success + rejection paths

### Playwright (E2E)
- Add `tests/e2e/resize-image.spec.ts` mirroring `tests/e2e/step1-dashboard.spec.ts`
- Auth bypass is already wired (`VITE_E2E_AUTH_BYPASS=true` in `playwright.config.ts`)
- Cover: dashboard click → upload → sizes → preview (mock the pipeline at the network layer or via a feature-flagged stub mode) → approve → BatchRecord written

Run locally: `npm run test:tracers` (vitest then playwright).

---

## What NOT to do

- ❌ **Don't reach into `src/pages/use-cases/UseCaseWizardPage.tsx`** for ANY logic. The legacy resize-image branches in there are dead-code mirrors; if you find a behavior you need, port it cleanly into your step or `_internal/handlers.ts`.
- ❌ **Don't import from other apps' folders** (`src/apps/template-builder/_internal/...`). If you need shared logic, lift it into `src/utils/` or `src/services/`.
- ❌ **Don't add component-local state** that needs to survive step navigation. Use stepData.
- ❌ **Don't write to top-level Firestore collections.** Always use `paths.app(slug, 'resize-image', ...)` and the service helpers.
- ❌ **Don't change `_registry.ts`'s order** — registry order drives dashboard card order, and the e2e tracer at `tests/e2e/step1-dashboard.spec.ts:Tracer 1` asserts a specific count.
- ❌ **Don't mutate the AppManifest type** in `src/apps/types.ts`. It's shared. If you need a new optional field, propose it in a PR comment first.
- ❌ **Don't extend the `AppId` union** without coordinating — adding strings there forces every `Record<AppId, ...>` map to add a key (the legacy `WIZARD_STEPS` in `UseCaseWizardPage.tsx` is the canary).

---

## You're done when

- [ ] All four step bodies are real (no TODO panels)
- [ ] `manifest.ts` has `requiresBrandStandards: true` if applicable
- [ ] `manifest.test.ts` still passes + every step has its own unit test
- [ ] Playwright E2E spec exists and passes
- [ ] `npm run test:run` green
- [ ] `npm run test:e2e` green
- [ ] `npm run build` green (no TS errors anywhere)
- [ ] Manual smoke: brand-standards-ready PMG-internal user can complete the full flow on dev for at least one client
- [ ] One BatchRecord per completed run exists at `clients/{slug}/apps/resize-image/batches/...` and shows on the dashboard's Active Batch Jobs

---

## Where to ask

- Architectural questions (what belongs in shell vs step, async submit semantics): tag Diego in the PR.
- Tenant-isolation / Firestore paths: ping Annie / read PR #7's commit message.
- AI-resize pipeline choice: open a separate spike PR before committing to a vendor — Replicate, a Cloud Function, or a direct browser call (probably bad for API key safety) all have different cost/latency profiles.

Good luck.
