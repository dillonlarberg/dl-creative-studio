# Resize Image — Implementation Plan

**Author:** Annie  
**Date:** 2026-05-06  
**Based on skeleton:** PR `feature/resize-image-skeleton` (merged to `dev`)  
**Pattern source of truth:** `src/apps/template-builder/`

This plan fills in every stub left by Diego's skeleton. It is written as an engineering execution document — not a discovery doc. Every decision is already resolved; follow it in order.

---

## Current State (what Diego shipped)

```
src/apps/resize-image/
├── manifest.ts              ← live, registered, requiresBrandStandards: false
├── types.ts                 ← ResizeImageStepData (persistence schema)
├── steps.ts                 ← barrel re-exporting 4 stubs
├── steps/
│   ├── UploadStep.tsx       ← stub: TODO render, real validate
│   ├── SizesStep.tsx        ← stub: TODO render, real validate
│   ├── PreviewStep.tsx      ← stub: TODO render + submit, validate: always ok
│   └── ApproveStep.tsx      ← stub: TODO render, validate: always ok
├── AppRoot.tsx              ← single-line WizardShell mount (DO NOT TOUCH)
└── manifest.test.ts         ← 5 contract tests, all passing
```

Already wired (do not re-wire):
- Route `/adlabs/:clientSlug/resize-image/*` → `ResizeImageAppRoot` (App.tsx)
- `resizeImageManifest` in `src/apps/_registry.ts`
- `'resize-image'` in `AppId` union + `VALID_APP_IDS` (paths.ts)
- Dashboard card (registry-driven)

---

## New Files to Create

| File | Purpose |
|---|---|
| `src/services/storage.ts` | Upload helper; keeps Firebase Storage SDK out of step components |
| `src/apps/resize-image/_internal/handlers.ts` | AI pipeline call + any pure business logic |
| `src/apps/resize-image/steps/__tests__/UploadStep.test.tsx` | Unit tracer |
| `src/apps/resize-image/steps/__tests__/SizesStep.test.tsx` | Unit tracer |
| `src/apps/resize-image/steps/__tests__/PreviewStep.test.tsx` | Unit tracer |
| `src/apps/resize-image/steps/__tests__/ApproveStep.test.tsx` | Unit tracer |
| `tests/e2e/resize-image.spec.ts` | Playwright E2E tracer |
| `functions/src/resize.ts` | Cloud Function wrapping Replicate API call |
| `functions/src/resize.test.ts` | Unit tests for Cloud Function (auth, size parse, poll logic, error paths) |
| `storage.cors.json` | Firebase Storage CORS config (required for canvas/fetch downloads) |

---

## Dependency Map

### Runtime dependencies (already installed)
| Dependency | Usage | Source |
|---|---|---|
| `firebase/storage` | Upload file, get download URL | Already in package.json |
| `firebase-functions` | Cloud Function for Replicate proxy | Already in functions/package.json |
| `axios` | HTTP client in Cloud Function | Already in functions/package.json (used by ai.ts) |
| `batchService` | Write BatchRecord on approve | `src/services/batches.ts` |
| `paths.storage.app` | Storage path helper | `src/platform/firebase/paths.ts` |
| `assertAlliStudioUser` | Allowlist auth guard | `functions/src/_shared/` |

### New secrets required
| Secret | Where | Value |
|---|---|---|
| `REPLICATE_API_TOKEN` | Firebase secret (functions) | Already in `.env.local` for local dev; set as Cloud Functions secret before deploy |

**No new npm packages required** for core functionality. If ZIP download is added later, use `jszip`.

---

## Implementation Order

Follow this order exactly — each step builds on the previous one.

### Phase 0 — Storage Service (prerequisite for Step 1)

**Create `src/services/storage.ts`:**

```ts
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { paths } from '../platform/firebase/paths';
import type { AppId, ClientSlug } from '../platform/firebase/paths';

// Strip non-alphanumeric except . - _; replace spaces with -; lowercase.
function sanitizeFilename(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9._-]/g, '');
}

export const storageService = {
  async uploadForApp(
    clientSlug: ClientSlug,
    appId: AppId,
    suffix: string,
    file: File,
  ): Promise<{ downloadUrl: string; storagePath: string }> {
    const storagePath = paths.storage.app(clientSlug, appId, suffix);
    const storageRef = ref(getStorage(), storagePath);
    await uploadBytes(storageRef, file);
    const downloadUrl = await getDownloadURL(storageRef);
    return { downloadUrl, storagePath };
  },

  sanitizeFilename,
};
```

This is the **only** place Firebase Storage SDK is called from step components. If you need a different upload shape, add a second method here — don't inline Storage calls in steps.

---

### Phase 1 — UploadStep (fill `steps/UploadStep.tsx`)

**Behavior:**
- Render a drag-drop zone + `<input type="file" accept="image/*">` fallback
- On file selection: call `storageService.uploadForApp(client.slug, 'resize-image', \`sources/${Date.now()}-${storageService.sanitizeFilename(file.name)}\`, file)`
- Show upload progress (optional in v1; a loading spinner is fine)
- On success: `mergeStepData({ sourceImageUrl: downloadUrl, sourceImagePath: storagePath, sourceImageName: file.name })`
- On error: surface inline — do not throw (upload errors are recoverable)

**Validate** (already correct in stub, confirm):
```ts
validate: (data) =>
  data.sourceImageUrl
    ? { ok: true }
    : { ok: false, requirements: [{ label: 'Image selected', met: false }] }
```

**Key constraints:**
- `render` receives `{ stepData, mergeStepData, client }` from `StepRenderProps<ResizeImageStepData>` — use `client.slug` for the upload path
- Do NOT store the `File` object in stepData (not JSON-serializable). Store only the URL and path.

**Unit tracer** (`steps/__tests__/UploadStep.test.tsx`):
1. Mock `storageService.uploadForApp` to resolve with `{ downloadUrl: 'https://fake.url', storagePath: 'clients/test/apps/resize-image/sources/123-test.png' }`
2. Mount step, simulate file drop
3. Assert `mergeStepData` called with `{ sourceImageUrl: 'https://fake.url', sourceImagePath: '...', sourceImageName: 'test.png' }`
4. Assert `validate({ sourceImageUrl: 'https://fake.url' })` returns `{ ok: true }`
5. Assert `validate({})` returns `{ ok: false }`
6. Mock `storageService.uploadForApp` to reject → assert inline error shown, `mergeStepData` NOT called

---

### Phase 2 — SizesStep (fill `steps/SizesStep.tsx`)

**Behavior:**
- Show source image name from `stepData.sourceImageName` at top
- Render a 2-column grid of size toggle buttons (not checkboxes — clickable cards are cleaner)
- Hardcoded v1 list — DO NOT pull from asset house yet:

```ts
export const AD_SIZES = [
  { label: 'Square (1080×1080)', value: '1080x1080' },
  { label: 'Portrait (1080×1350)', value: '1080x1350' },
  { label: 'Story (1080×1920)',    value: '1080x1920' },
  { label: 'Leaderboard (728×90)', value: '728x90' },
  { label: 'Medium Rect (300×250)', value: '300x250' },
  { label: 'Billboard (970×250)',  value: '970x250' },
];
```

Note: `AD_SIZES` is a **named export** so it can be replaced with an async loader in v2 without touching callers.

- Size format is `{w}x{h}` strings — this exact format is the key used in `previewUrls` and `BatchResult.metadata.size`. Do not change format.
- On click: `mergeStepData({ selectedSizes: newSelection })`
- Support multi-select (toggle on/off). No max limit in v1.

**Validate** (already correct in stub):
```ts
validate: (data) =>
  data.selectedSizes?.length
    ? { ok: true }
    : { ok: false, requirements: [{ label: 'At least one size selected', met: false }] }
```

**Unit tracer** (`steps/__tests__/SizesStep.test.tsx`):
1. Mount step with empty stepData → Continue button disabled
2. Click one size button → `mergeStepData` called with array containing that size
3. Click same size again → `mergeStepData` called with empty array
4. `validate({ selectedSizes: ['1080x1080'] })` → `{ ok: true }`
5. `validate({ selectedSizes: [] })` → `{ ok: false }`

---

### Phase 3 — AI Pipeline (new `_internal/handlers.ts` + Cloud Function)

This is the most complex phase. Do it before PreviewStep so the step has something to call.

#### Cloud Function: `functions/src/resize.ts`

```ts
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import axios from 'axios';
import { assertAlliStudioUser } from './_shared/assertAlliStudioUser';

export const resizeImageForSize = functions
  .runWith({ secrets: ['REPLICATE_API_TOKEN'], timeoutSeconds: 300, memory: '512MB' })
  .https.onCall(async (data: { sourceImageUrl: string; size: string; outputStoragePath: string }, context) => {
    assertAlliStudioUser(context); // throws HttpsError('unauthenticated') if not on allowlist

    const { sourceImageUrl, size, outputStoragePath } = data;
    if (!sourceImageUrl || !size || !outputStoragePath) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing sourceImageUrl, size, or outputStoragePath.');
    }

    const [w, h] = size.split('x').map(Number);
    if (!w || !h) throw new functions.https.HttpsError('invalid-argument', `Invalid size format: ${size}`);

    const token = process.env.REPLICATE_API_TOKEN;
    // Use Replicate image-to-image with fill/outpaint model.
    // Model: black-forest-labs/flux-fill-pro (supports target dimensions)
    // ⚠️ Adjust model ID after spike — this is a placeholder. The input schema
    // (target_width, target_height, prompt) is model-specific; confirm it matches
    // the chosen model before deploying.
    const response = await axios.post(
      'https://api.replicate.com/v1/models/black-forest-labs/flux-fill-pro/predictions',
      {
        input: {
          image: sourceImageUrl,
          target_width: w,
          target_height: h,
          prompt: 'extend image to fill new dimensions, maintain style and composition',
        },
      },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );

    // Replicate is async — poll for completion (up to 80 × 3s = 240s max wait)
    let prediction = response.data;
    let attempts = 0;
    while (prediction.status !== 'succeeded' && prediction.status !== 'failed' && attempts < 80) {
      await new Promise(r => setTimeout(r, 3000));
      const poll = await axios.get(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      prediction = poll.data;
      attempts++;
    }

    if (prediction.status !== 'succeeded') {
      throw new functions.https.HttpsError('internal', `Replicate failed: ${prediction.error ?? prediction.status}`);
    }

    const replicateUrl: string | undefined = prediction.output?.[0];
    if (!replicateUrl) {
      throw new functions.https.HttpsError('internal', 'Replicate returned empty output.');
    }

    // Re-upload to Firebase Storage so the URL is permanent (Replicate CDN URLs expire)
    // and browser <a download> works cross-origin via Storage rules.
    const imageResponse = await axios.get(replicateUrl, { responseType: 'arraybuffer' });
    const bucket = admin.storage().bucket();
    const file = bucket.file(outputStoragePath);
    await file.save(Buffer.from(imageResponse.data), {
      contentType: imageResponse.headers['content-type'] ?? 'image/png',
    });
    const [downloadUrl] = await file.getSignedUrl({
      action: 'read',
      expires: '03-01-2500', // effectively permanent for internal use
    });

    return { outputUrl: downloadUrl };
  });
```

**Export from `functions/src/index.ts`:** add `export * from './resize';`

**⚠️ Before deploying:** Set the secret: `firebase functions:secrets:set REPLICATE_API_TOKEN`

**⚠️ Model decision:** The Replicate model choice requires a spike. Create a throwaway branch, test with one real image at 1080×1080, confirm output quality before committing to this model. The input schema (`target_width`, `target_height`, `prompt`) is Flux Fill Pro-specific — confirm these fields match the chosen model before deploying.

**Unit tests** (`functions/src/resize.test.ts`) — 6 cases:
1. Non-allowlisted user → throws `unauthenticated`
2. Missing `sourceImageUrl` → throws `invalid-argument`
3. Invalid size format (e.g. `'1080'`) → throws `invalid-argument`
4. Replicate POST fails → throws `internal`
5. Replicate returns `failed` status → throws `internal`
6. Replicate returns `succeeded` with empty output → throws `internal`

Mock `axios` and `assertAlliStudioUser` per the `handlers.test.ts` pattern in `template-builder/_internal/`.

#### Client-side handler: `src/apps/resize-image/_internal/handlers.ts`

```ts
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { ResizeImageStepData } from '../types';

interface ResizeResult { outputUrl: string }

export interface ResizePipelineResult {
  urls: Record<string, string>;
  errors: Record<string, string>;
}

export async function runResizePipeline(
  clientSlug: string,
  stepData: ResizeImageStepData,
  onProgress?: (completed: number, total: number) => void,
): Promise<ResizePipelineResult> {
  if (!stepData.sourceImageUrl) {
    throw new Error('runResizePipeline called without sourceImageUrl');
  }

  const fns = getFunctions();
  const resizeFn = httpsCallable<{ sourceImageUrl: string; size: string; outputStoragePath: string }, ResizeResult>(
    fns,
    'resizeImageForSize',
  );

  const sizes = stepData.selectedSizes ?? [];
  const urls: Record<string, string> = {};
  const errors: Record<string, string> = {};

  for (let i = 0; i < sizes.length; i++) {
    const size = sizes[i];
    const outputStoragePath = `clients/${clientSlug}/apps/resize-image/outputs/${Date.now()}-${size}.png`;
    try {
      const result = await resizeFn({ sourceImageUrl: stepData.sourceImageUrl, size, outputStoragePath });
      urls[size] = result.data.outputUrl;
    } catch (e: any) {
      errors[size] = e?.message ?? 'Unknown error';
    }
    onProgress?.(i + 1, sizes.length);
  }

  return { urls, errors };
}
```

**Note on timing:** Sequential calls take ~30–120s per size (Replicate generation time) plus queue time. For 6 sizes expect **3–12 minutes** total. The WizardShell shows a loading state during `submit`; PreviewStep passes `onProgress` to display 'Generating N/6 sizes...' so users know progress. Parallel with `Promise.all` is a v2 optimization.

---

### Phase 4 — PreviewStep (fill `steps/PreviewStep.tsx`)

**Behavior:**
- `submit` hook (async):
  - If `ctx.stepData.previewUrls` already exists → skip generation, return `{ nextStepId: 'approve' }` (idempotency guard: back-navigation from Approve doesn't re-burn Replicate credits)
  - Otherwise: call `runResizePipeline`, track progress via `useState`, merge results, advance
- `render`: show loading message if `previewUrls` is undefined; show a preview grid of `img` elements when `previewUrls` is populated; show a warning banner if `previewErrors` has entries

```tsx
submit: async (ctx) => {
  // Idempotency: previewUrls persists in localStorage — skip if already generated
  if (ctx.stepData.previewUrls && Object.keys(ctx.stepData.previewUrls).length > 0) {
    return { nextStepId: 'approve' };
  }

  const { urls, errors } = await runResizePipeline(
    ctx.client.slug,
    ctx.stepData,
    (completed, total) => ctx.mergeStepData({ _progressMessage: `Generating ${completed}/${total} sizes...` }),
  );

  if (Object.keys(urls).length === 0) {
    throw new Error('All sizes failed to generate. Check the error details and retry.');
  }

  ctx.mergeStepData({
    previewUrls: urls,
    previewErrors: Object.keys(errors).length > 0 ? errors : undefined,
    _progressMessage: undefined,
  });
  return { nextStepId: 'approve' };
},

render: ({ stepData }) => {
  if (stepData._progressMessage) {
    return <p className="text-sm text-blue-gray-500">{stepData._progressMessage}</p>;
  }
  if (!stepData.previewUrls) {
    return (
      <p className="text-sm text-blue-gray-500">
        Click Continue to generate previews for {stepData.selectedSizes?.length ?? 0} size(s).
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {stepData.previewErrors && Object.keys(stepData.previewErrors).length > 0 && (
        <p className="text-sm text-red-500">
          {Object.keys(stepData.previewErrors).length} size(s) failed:{' '}
          {Object.keys(stepData.previewErrors).join(', ')}
        </p>
      )}
      <div className="grid grid-cols-2 gap-4">
        {Object.entries(stepData.previewUrls).map(([size, url]) => (
          <div key={size} className="space-y-1">
            <img src={url} alt={`Preview ${size}`} className="w-full rounded border" />
            <p className="text-xs text-blue-gray-500 text-center">{size}</p>
          </div>
        ))}
      </div>
    </div>
  );
},
```

Add `_progressMessage?: string` and `previewErrors?: Record<string, string>` to `ResizeImageStepData` in `types.ts`.

**Validate** (keep always-ok — gated by submit completion):
```ts
validate: () => ({ ok: true })
```

**Unit tracer** (`steps/__tests__/PreviewStep.test.tsx`):
1. Mock `runResizePipeline` to resolve with `{ urls: { '1080x1080': 'https://out.url' }, errors: {} }`
2. Call `previewStep.submit(ctx)` with valid stepData (no previewUrls)
3. Assert `mergeStepData` called with `{ previewUrls: { '1080x1080': 'https://out.url' }, previewErrors: undefined, _progressMessage: undefined }`
4. Assert returns `{ nextStepId: 'approve' }`
5. Mock `runResizePipeline` to resolve with `{ urls: {}, errors: { '1080x1080': 'failed' } }` → assert `submit` throws (all sizes failed)
6. Call `submit` with stepData that already has `previewUrls` → assert `runResizePipeline` NOT called, returns `{ nextStepId: 'approve' }` immediately (idempotency)
7. Mock partial failure: `{ urls: { '1080x1080': '...' }, errors: { '728x90': 'timeout' } }` → assert `mergeStepData` called with previewErrors populated

---

### Phase 5 — ApproveStep (fill `steps/ApproveStep.tsx`)

**Behavior:**
- Render download grid: for each entry in `previewUrls`, an `<a download href={url}>` button. Since `previewUrls` now contains Firebase Storage signed URLs (not Replicate CDN URLs), browser `<a download>` works correctly.
- Render Approve button (primary action)
- On Approve click: guard against double-click with `isApproving` state

```tsx
const [isApproving, setIsApproving] = useState(false);

const handleApprove = async () => {
  // Guard: must have both previewUrls and selectedSizes to proceed
  if (!stepData.previewUrls || !stepData.selectedSizes?.length) {
    console.error('ApproveStep: missing previewUrls or selectedSizes');
    return;
  }

  setIsApproving(true);
  try {
    const batchId = await batchService.createBatch(client.slug, 'resize-image', {
      templateId: 'ai-resize',
      feedId: 'manual',
      feedName: stepData.sourceImageName ?? 'Untitled',
      status: 'pending',
      totalVariations: stepData.selectedSizes.length,
      completedVariations: 0,
      ratio: 'mixed',
    });

    for (const [size, url] of Object.entries(stepData.previewUrls)) {
      await batchService.addResult(client.slug, 'resize-image', batchId, {
        url,
        feedRowIndex: 0,
        metadata: { size },
      });
    }

    await batchService.updateBatchStatus(
      client.slug, 'resize-image', batchId, 'completed', stepData.selectedSizes.length
    );
    mergeStepData({ approved: true, batchId });
  } catch (e) {
    setIsApproving(false);
    throw e; // re-throw so WizardShell surfaces it
  }
};
```

- After approval: show success state — "Batch saved. View in Active Batch Jobs."
- If `stepData.approved && stepData.batchId`: render already-approved state (user refreshed after approving)
- Approve button: `disabled={isApproving || !!stepData.approved}`

**Validate:** Keep `() => ({ ok: true })` — ApproveStep is terminal; WizardShell hides Continue on last step.

**Unit tracer** (`steps/__tests__/ApproveStep.test.tsx`):
1. Mock `batchService.createBatch` → resolve `'batch-123'`
2. Mock `batchService.addResult`, `batchService.updateBatchStatus`
3. Render with `previewUrls: { '1080x1080': 'https://u1', '728x90': 'https://u2' }`
4. Click Approve
5. Assert `createBatch` called once with `appId: 'resize-image'`, `totalVariations: 2`
6. Assert `addResult` called twice (once per size)
7. Assert `updateBatchStatus` called with `'completed', 2`
8. Assert `mergeStepData({ approved: true, batchId: 'batch-123' })`
9. Click Approve again while first click is in-flight → assert `createBatch` called only once (button disabled)
10. Render with `stepData.approved = true` → assert Approve button is disabled

---

### Phase 6 — Playwright E2E (`tests/e2e/resize-image.spec.ts`)

Mock the AI pipeline at the network layer (intercept the `resizeImageForSize` Cloud Function call). Auth bypass is already wired.

```ts
test.describe('Resize Image — wizard flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() =>
      localStorage.setItem('selectedClient', JSON.stringify({ slug: 'ralph_lauren', name: 'Ralph Lauren' }))
    );
  });

  test('Tracer R1: dashboard card navigates to upload step', async ({ page }) => {
    await page.goto('/adlabs/ralph_lauren/');
    await page.getByTestId('app-card-resize-image').click();
    await expect(page).toHaveURL(/resize-image\/upload/);
    await expect(page.getByTestId('wizard-step-upload')).toBeVisible();
  });

  test('Tracer R2: upload step → sizes step', async ({ page }) => {
    await page.goto('/adlabs/ralph_lauren/resize-image/upload');
    // Simulate file upload via input
    await page.getByTestId('wizard-step-upload').locator('input[type="file"]').setInputFiles({
      name: 'test.png',
      mimeType: 'image/png',
      buffer: Buffer.from('fake-image'),
    });
    // Wait for upload to complete (storageService mock resolves immediately in test)
    await expect(page.getByTestId('wizard-continue-btn')).toBeEnabled({ timeout: 5000 });
    await page.getByTestId('wizard-continue-btn').click();
    await expect(page).toHaveURL(/resize-image\/sizes/);
    await expect(page.getByTestId('wizard-step-sizes')).toBeVisible();
  });

  test('Tracer R3: sizes step → preview step (AI mocked)', async ({ page }) => {
    // Mock the Cloud Function call at the network layer
    await page.route('**/resizeImageForSize**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ result: { outputUrl: 'https://storage.googleapis.com/fake-bucket/output.png' } }),
      });
    });

    await page.goto('/adlabs/ralph_lauren/resize-image/sizes');
    // Inject existing stepData with sourceImageUrl
    await page.evaluate(() => {
      localStorage.setItem('resize-image-stepData', JSON.stringify({
        sourceImageUrl: 'https://storage.googleapis.com/fake-source.png',
        sourceImageName: 'test.png',
      }));
    });
    await page.getByTestId('size-btn-1080x1080').click();
    await page.getByTestId('wizard-continue-btn').click();
    await expect(page).toHaveURL(/resize-image\/preview/);
    await page.getByTestId('wizard-continue-btn').click(); // triggers generation (mocked)
    await expect(page.getByTestId('wizard-step-preview')).toContainText('1080x1080', { timeout: 10000 });
  });

  test('Tracer R4: approve creates BatchRecord visible on dashboard', async ({ page }) => {
    // Inject fully-populated stepData with previewUrls already set
    await page.goto('/adlabs/ralph_lauren/resize-image/preview');
    await page.evaluate(() => {
      localStorage.setItem('resize-image-stepData', JSON.stringify({
        sourceImageUrl: 'https://fake.png',
        sourceImageName: 'test.png',
        selectedSizes: ['1080x1080'],
        previewUrls: { '1080x1080': 'https://storage.googleapis.com/fake-output.png' },
      }));
    });
    await page.getByTestId('wizard-continue-btn').click(); // idempotent skip
    await expect(page).toHaveURL(/resize-image\/approve/);
    await page.getByTestId('approve-btn').click();
    await expect(page.getByTestId('approve-success-msg')).toBeVisible({ timeout: 5000 });
    // Navigate to dashboard and verify BatchRecord card appears
    await page.goto('/adlabs/ralph_lauren/');
    await expect(page.getByTestId('active-batches-section')).toBeVisible();
  });

  test('Tracer R5: already-approved state persists on refresh', async ({ page }) => {
    await page.goto('/adlabs/ralph_lauren/resize-image/approve');
    await page.evaluate(() => {
      localStorage.setItem('resize-image-stepData', JSON.stringify({
        approved: true,
        batchId: 'batch-test-123',
        previewUrls: { '1080x1080': 'https://fake.png' },
        selectedSizes: ['1080x1080'],
      }));
    });
    await page.reload();
    await expect(page.getByTestId('approve-success-msg')).toBeVisible();
    await expect(page.getByTestId('approve-btn')).toBeDisabled();
  });
});
```

Add `data-testid` attributes to each step root div:
- `wizard-step-upload`, `wizard-step-sizes`, `wizard-step-preview`, `wizard-step-approve`
- `size-btn-{value}` for each size card (e.g. `size-btn-1080x1080`)
- `approve-btn`, `approve-success-msg`

---

### Phase 7 — CORS Config (`storage.cors.json`)

Firebase Storage requires an explicit CORS config for browser fetch/canvas operations.

**Create `storage.cors.json` at project root** (next to `firebase.json`):

```json
[
  {
    "origin": ["http://localhost:5173", "https://pmg-creative-studio.web.app"],
    "method": ["GET", "HEAD"],
    "maxAgeSeconds": 3600
  }
]
```

**Deploy once before QA:**
```bash
gsutil cors set storage.cors.json gs://automated-creative-e10d7.firebasestorage.app
```

This unblocks `<img src={downloadUrl}>` renders in PreviewStep and ApproveStep. Without it, images load as opaque (cross-origin) and any canvas operation fails. Note: download URLs in ApproveStep are now Firebase Storage signed URLs (not Replicate CDN URLs), so `<a download>` works correctly without additional configuration.

---

## Dependency Constraints (Clashes to Avoid)

| Rule | Why |
|---|---|
| Do NOT import from `src/apps/template-builder/_internal/` | Violates app module isolation. Lift shared logic to `src/utils/` or `src/services/` instead. |
| Do NOT change `_registry.ts` order | `tests/e2e/step1-dashboard.spec.ts:Tracer 1` asserts `cards.toHaveCount(3)` — reordering passes but adding/removing breaks this test. |
| Do NOT extend `AppId` union | Forces every `Record<AppId, ...>` map to add a key; coordinate with Diego first. |
| Do NOT mutate `AppManifest` type in `src/apps/types.ts` | Shared type, breaking change. |
| Do NOT store `File` or `Blob` in stepData | Not JSON-serializable; crashes localStorage persistence. |
| Size strings MUST be `{w}x{h}` format | Used as keys in `previewUrls` and `BatchResult.metadata.size`. Changing format breaks ApproveStep lookups. |
| Do NOT call Replicate directly from the browser | Exposes `REPLICATE_API_TOKEN` to the client. Always proxy through the Cloud Function. |
| Do NOT write to top-level Firestore collections | Default-deny rule blocks them. Always use `paths.app(slug, 'resize-image', ...)` helpers. |
| Do NOT add component-local state that survives navigation | Use `mergeStepData` instead; step components unmount on navigate. |
| ALWAYS use `assertAlliStudioUser(context)` in Cloud Functions | Bare `context.auth` check only verifies login, not the PMG allowlist. Non-PMG users could call Replicate at PMG cost. |

---

## Future-State Wiring (Phase 2, not now)

These are noted here so the current implementation doesn't accidentally block them:

| Future capability | What to avoid now |
|---|---|
| Pull sizes from asset house (brand-approved sizes per client) | `AD_SIZES` is a named export; replace with an async loader without changing callers |
| `requiresBrandStandards: true` once flow uses brand tokens | The flag is already in the manifest; flip it when any step reads from `clientAssetHouseService` |
| Parallel Replicate calls for faster multi-size generation | Keep the sequential loop now; `Promise.all` is a one-line upgrade |
| ZIP download for all sizes | Add a "Download All" button in ApproveStep that calls `jszip`; don't block the app on this |
| Per-creative Firestore record | `creativeService` is already in `src/services/creative.ts`; the storage path convention is already compatible |
| Orphaned Storage cleanup | Source images uploaded in UploadStep accumulate if the user abandons mid-flow. Add a cleanup Cloud Function (triggered on batch completion or TTL) in v2. |
| Regenerate button in PreviewStep | The idempotency guard (D13) skips generation on back-navigate. A "Regenerate" button that clears `previewUrls` before submitting is the v2 path. |

---

## Done Checklist

- [ ] `storage.ts` service created: `uploadForApp`, `sanitizeFilename`, used in UploadStep
- [ ] UploadStep: real drag-drop + file input, uploads to Storage, validates on `sourceImageUrl`
- [ ] SizesStep: 6-size grid (`AD_SIZES` named export), `{w}x{h}` format, validates at least one
- [ ] `_internal/handlers.ts` created with `runResizePipeline` (partial-failure safe, progress callback)
- [ ] `functions/src/resize.ts` Cloud Function: `assertAlliStudioUser`, 300s timeout, 80-attempt poll, output null check, re-upload to Firebase Storage
- [ ] `functions/src/resize.ts` exported from `functions/src/index.ts`
- [ ] `REPLICATE_API_TOKEN` set as Firebase secret (`firebase functions:secrets:set`)
- [ ] `functions/src/resize.test.ts`: 6 test cases passing
- [ ] `ResizeImageStepData` updated: `_progressMessage?`, `previewErrors?`
- [ ] PreviewStep: idempotency guard, progress message, partial-failure warning, submit wired
- [ ] ApproveStep: `isApproving` guard, early data guard, download grid (Firebase URLs), batchService chain
- [ ] All 4 step unit tests pass (`npm run test:run`)
- [ ] Playwright E2E spec R1–R5 exists and passes (`npm run test:e2e`)
- [ ] `npm run build` green, no TS errors
- [ ] CORS config deployed (`gsutil cors set ...`)
- [ ] Manual smoke: complete flow for one PMG client on dev, BatchRecord visible on dashboard

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Outside Voice | `/plan-eng-review` | Independent 2nd opinion | 1 | issues_found | 7 findings, 3 accepted |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 3 | CLEAR (PLAN) | 13 issues, 3 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**VERDICT:** ENG CLEARED — ready to implement.
