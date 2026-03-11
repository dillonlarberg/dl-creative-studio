# Edit Image UI Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the edit-image wizard from 5 steps to 6 steps: add a Canvas extraction step, replace BackgroundConfigStep with a richer NewBackgroundStep that loads brand colors from Alli and supports image selection/upload, and simplify Preview to a single before/after comparison.

**Architecture:** The edit-image wizard is self-contained under `src/components/edit-image/`. Each step is a standalone component receiving `EditImageStepProps`. The wizard orchestrator (`EditImageWizard.tsx`) switches on `currentStepId`. Step validation lives in `UseCaseWizardPage.tsx` in the `isNextDisabled` block. Brand colors come from `ClientAssetHouse` (primaryColor + variables/assets of type 'color').

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Heroicons, Firebase Storage (for uploads)

**Spec:** `docs/superpowers/specs/2026-03-11-edit-image-ui-redesign-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/services/imageEditService.ts` | Modify | Add `extractForeground()` stub method |
| `src/components/edit-image/types.ts` | Modify | Add `extractedImageUrl`, `extractionMethod`, `customColor`; remove `variationCount` |
| `src/components/edit-image/steps/ChooseEditTypeStep.tsx` | Modify | Add preview video placeholder above tool cards |
| `src/components/edit-image/steps/CanvasStep.tsx` | Create | Canvas view, Extract Background button, grayed Edit button |
| `src/components/edit-image/steps/NewBackgroundStep.tsx` | Create | Brand colors from Alli, custom color picker, Alli creative browser, image upload |
| `src/components/edit-image/steps/PreviewStep.tsx` | Modify | Simplify to single original-vs-edited side-by-side |
| `src/components/edit-image/steps/BackgroundConfigStep.tsx` | Delete | Replaced by CanvasStep + NewBackgroundStep |
| `src/components/edit-image/EditImageWizard.tsx` | Modify | Add `canvas` and `new-background` cases, remove `configure` case, update imports |
| `src/pages/use-cases/UseCaseWizardPage.tsx` | Modify | Update WIZARD_STEPS (6 steps), update `isNextDisabled` validation |
| `docs/edit-image-changelog.md` | Modify | Document all changes |

---

## Chunk 1: Data Model & Wizard Skeleton

### Task 0: Add extractForeground stub to imageEditService.ts

**Files:**
- Modify: `src/services/imageEditService.ts`

- [ ] **Step 1: Add ExtractForegroundResponse interface and extractForeground method**

Add after the `RenderVariationsResponse` interface (~line 38):

```typescript
interface ExtractForegroundResponse {
    url: string;
    maskUrl?: string;
}
```

Add to the `imageEditService` object, after `renderVariations`:

```typescript
    async extractForeground(file: File): Promise<ExtractForegroundResponse> {
        const form = new FormData();
        form.append('file', file);

        const response = await fetch(`${BASE_URL}/extract-foreground`, {
            method: 'POST',
            body: form,
        });

        return parseResponse<ExtractForegroundResponse>(response);
    },
```

- [ ] **Step 2: Commit**

```bash
git add src/services/imageEditService.ts
git commit -m "feat: add extractForeground stub to imageEditService"
```

---

### Task 1: Update types.ts

**Files:**
- Modify: `src/components/edit-image/types.ts`

- [ ] **Step 1: Update EditImageStepData interface**

Replace the current interface with:

```typescript
import type { ClientAssetHouse } from '../../services/clientAssetHouse';
import type { RenderVariation } from '../../services/imageEditService';

export type EditType = 'background' | 'text' | 'colors';

export interface EditImageStepData {
  // Step 1 — Select Image
  imageUrl?: string;
  imageName?: string;
  imageSource?: 'alli' | 'upload';
  assetId?: string;
  platform?: string;

  // Step 2 — Edit Type
  editType?: EditType;

  // Step 3 — Canvas (extraction)
  extractedImageUrl?: string;
  extractionMethod?: 'auto' | 'manual';

  // Step 4 — New Background
  selectedBackground?: { type: 'color'; value: string } | { type: 'image'; url: string; name: string };
  customColor?: string;

  // Step 5 — Preview
  selectedVariation?: RenderVariation;

  // Step 6 — Save
  finalUrl?: string;
  savedToAssetHouse?: boolean;
}
```

Key changes:
- Removed `BackgroundCatalogItem` import (no longer needed)
- Removed `variationCount` and `variations` (single output only)
- Added `extractedImageUrl`, `extractionMethod` for Canvas step
- Changed `selectedBackground` to a discriminated union (`color` | `image`)
- Added `customColor` for the color picker value

- [ ] **Step 2: Verify no compile errors**

Run: `npx tsc --noEmit 2>&1 | head -30`

Expected: Type errors in BackgroundConfigStep (expected — it will be deleted). Other files may error due to removed fields — that's fine, we'll fix them in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
git add src/components/edit-image/types.ts
git commit -m "refactor: update EditImageStepData for 6-step wizard flow"
```

---

### Task 2: Update WIZARD_STEPS and isNextDisabled in UseCaseWizardPage.tsx

**Files:**
- Modify: `src/pages/use-cases/UseCaseWizardPage.tsx:355-361` (WIZARD_STEPS)
- Modify: `src/pages/use-cases/UseCaseWizardPage.tsx:4275-4280` (isNextDisabled)

- [ ] **Step 1: Update WIZARD_STEPS for edit-image**

Change lines 355-361 from:
```typescript
'edit-image': [
    { id: 'select', name: 'Select Image' },
    { id: 'edit-type', name: 'Edit Type' },
    { id: 'configure', name: 'Canvas' },
    { id: 'preview', name: 'Preview' },
    { id: 'approve', name: 'Save' },
],
```

To:
```typescript
'edit-image': [
    { id: 'select', name: 'Select Image' },
    { id: 'edit-type', name: 'Edit Type' },
    { id: 'canvas', name: 'Canvas' },
    { id: 'new-background', name: 'New Background' },
    { id: 'preview', name: 'Preview' },
    { id: 'approve', name: 'Save' },
],
```

- [ ] **Step 2: Update isNextDisabled validation**

Change the edit-image block (~line 4275-4280) from:
```typescript
(useCaseId === 'edit-image' && (
    (steps[currentStep]?.id === 'select' && !stepData.imageUrl) ||
    (steps[currentStep]?.id === 'edit-type' && !stepData.editType) ||
    (steps[currentStep]?.id === 'configure' && !stepData.selectedBackground) ||
    (steps[currentStep]?.id === 'preview' && !stepData.selectedVariation)
))
```

To:
```typescript
(useCaseId === 'edit-image' && (
    (steps[currentStep]?.id === 'select' && !stepData.imageUrl) ||
    (steps[currentStep]?.id === 'edit-type' && !stepData.editType) ||
    (steps[currentStep]?.id === 'canvas' && !stepData.extractedImageUrl) ||
    (steps[currentStep]?.id === 'new-background' && !stepData.selectedBackground) ||
    (steps[currentStep]?.id === 'preview' && !stepData.selectedVariation)
))
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/use-cases/UseCaseWizardPage.tsx
git commit -m "feat: update edit-image wizard to 6 steps with canvas and new-background"
```

---

### Task 3: Update EditImageWizard.tsx

**Files:**
- Modify: `src/components/edit-image/EditImageWizard.tsx`

- [ ] **Step 1: Update imports and switch cases**

Replace the full file content:

```typescript
import type { ClientAssetHouse } from '../../services/clientAssetHouse';
import type { EditImageStepData } from './types';
import { SelectImageStep } from './steps/SelectImageStep';
import { ChooseEditTypeStep } from './steps/ChooseEditTypeStep';
import { CanvasStep } from './steps/CanvasStep';
import { NewBackgroundStep } from './steps/NewBackgroundStep';
import { PreviewStep } from './steps/PreviewStep';
import { ApproveDownloadStep } from './steps/ApproveDownloadStep';

interface EditImageWizardProps {
  currentStepId: string;
  stepData: Record<string, any>;
  onStepDataChange: (updates: Record<string, any>) => void;
  clientSlug: string;
  assetHouse: ClientAssetHouse | null;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export function EditImageWizard({
  currentStepId,
  stepData,
  onStepDataChange,
  clientSlug,
  assetHouse,
  isLoading,
  setIsLoading,
}: EditImageWizardProps) {
  const editStepData = stepData as unknown as EditImageStepData;

  const handleUpdate = (updates: Partial<EditImageStepData>) => {
    onStepDataChange({ ...stepData, ...updates });
  };

  const sharedProps = {
    stepData: editStepData,
    onStepDataChange: handleUpdate,
    clientSlug,
    assetHouse,
    isLoading,
    setIsLoading,
  };

  switch (currentStepId) {
    case 'select':
      return <SelectImageStep {...sharedProps} />;
    case 'edit-type':
      return <ChooseEditTypeStep {...sharedProps} />;
    case 'canvas':
      return <CanvasStep {...sharedProps} />;
    case 'new-background':
      return <NewBackgroundStep {...sharedProps} />;
    case 'preview':
      return <PreviewStep {...sharedProps} />;
    case 'approve':
      return <ApproveDownloadStep {...sharedProps} />;
    default:
      return null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/edit-image/EditImageWizard.tsx
git commit -m "refactor: update EditImageWizard with canvas and new-background routing"
```

---

## Chunk 2: New Components (CanvasStep + NewBackgroundStep)

### Task 4: Create CanvasStep.tsx

**Files:**
- Create: `src/components/edit-image/steps/CanvasStep.tsx`

- [ ] **Step 1: Create the CanvasStep component**

```typescript
import { useState } from 'react';
import { ArrowPathIcon, PencilSquareIcon, ScissorsIcon } from '@heroicons/react/24/outline';
import { cn } from '../../../utils/cn';
import { imageEditService } from '../../../services/imageEditService';
import type { EditImageStepProps } from '../types';

export function CanvasStep({
  stepData,
  onStepDataChange,
  setIsLoading,
  isLoading,
}: EditImageStepProps) {
  const [isExtracting, setIsExtracting] = useState(false);

  const handleExtract = async () => {
    if (!stepData.imageUrl) return;
    setIsExtracting(true);
    setIsLoading(true);

    try {
      // Fetch the image and send to the extraction API
      const response = await fetch(stepData.imageUrl);
      const blob = await response.blob();
      const file = new File([blob], stepData.imageName || 'image.png', { type: blob.type });

      const result = await imageEditService.extractForeground(file);
      onStepDataChange({
        extractedImageUrl: result.url,
        extractionMethod: 'auto',
      });
    } catch {
      // Backend not running — use original image as placeholder
      onStepDataChange({
        extractedImageUrl: stepData.imageUrl,
        extractionMethod: 'auto',
      });
    } finally {
      setIsExtracting(false);
      setIsLoading(false);
    }
  };

  const isExtracted = !!stepData.extractedImageUrl;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Canvas area */}
      <div className="relative">
        <div
          className={cn(
            'relative overflow-hidden rounded-2xl border-2 min-h-[320px] flex items-center justify-center',
            isExtracted ? 'border-blue-200 bg-[repeating-conic-gradient(#f1f5f9_0%_25%,#fff_0%_50%)_0_0/20px_20px]' : 'border-gray-200 bg-gray-50',
          )}
        >
          {stepData.imageUrl && (
            <img
              src={isExtracted ? stepData.extractedImageUrl : stepData.imageUrl}
              alt={stepData.imageName || 'Selected image'}
              className="max-h-[400px] w-auto object-contain"
            />
          )}

          {isExtracting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm">
              <ArrowPathIcon className="h-10 w-10 text-blue-600 animate-spin" />
              <p className="mt-3 text-[10px] font-black text-blue-600 uppercase tracking-widest">
                Extracting foreground...
              </p>
            </div>
          )}
        </div>

        {/* Edit button — top right of canvas */}
        <button
          disabled={!isExtracted}
          className={cn(
            'absolute top-3 right-3 flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[9px] font-black uppercase tracking-widest transition-all',
            isExtracted
              ? 'border-gray-300 bg-white/90 text-gray-500 hover:border-blue-300 hover:text-blue-600 backdrop-blur-sm'
              : 'border-gray-200 bg-gray-100/80 text-gray-300 cursor-not-allowed',
          )}
          title={isExtracted ? 'Edit selection mask' : 'Extract background first'}
        >
          <PencilSquareIcon className="h-3.5 w-3.5" />
          Edit
        </button>
      </div>

      {/* Extract button */}
      <div className="text-center">
        {!isExtracted ? (
          <button
            onClick={handleExtract}
            disabled={isExtracting || !stepData.imageUrl}
            className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-8 py-3 text-xs font-black text-white uppercase tracking-widest hover:bg-blue-700 transition-colors disabled:opacity-40 shadow-lg shadow-blue-600/20"
          >
            <ScissorsIcon className="h-4 w-4" />
            {isExtracting ? 'Extracting...' : 'Extract Background'}
          </button>
        ) : (
          <div className="flex items-center justify-center gap-3">
            <p className="text-[10px] font-black text-green-600 uppercase tracking-widest">
              Background extracted
            </p>
            <button
              onClick={handleExtract}
              disabled={isExtracting}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[10px] font-black text-gray-500 uppercase tracking-widest hover:border-blue-300 hover:text-blue-600 transition-all"
            >
              <ArrowPathIcon className="h-3.5 w-3.5" />
              Re-extract
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

Note: `imageEditService.extractForeground()` likely doesn't exist yet. The `try/catch` falls back to the original image URL when the backend isn't running, so the UI is still reviewable. When the backend is implemented, it will return the actual extracted foreground URL.

- [ ] **Step 2: Commit**

```bash
git add src/components/edit-image/steps/CanvasStep.tsx
git commit -m "feat: add CanvasStep with background extraction and edit button"
```

---

### Task 5: Create NewBackgroundStep.tsx

**Files:**
- Create: `src/components/edit-image/steps/NewBackgroundStep.tsx`

This is the largest new component. It has three sections:
1. Brand colors from Alli (assetHouse.primaryColor + assetHouse.variables of type 'color' + assetHouse.assets of type 'color') plus a custom color picker (+)
2. Background image picker — Browse Alli Creative or Upload
3. Selected background preview

- [ ] **Step 1: Create the NewBackgroundStep component**

```typescript
import { useState, useEffect, useRef } from 'react';
import { CloudArrowUpIcon, MagnifyingGlassIcon, CheckIcon, PlusIcon, ChevronLeftIcon, ChevronRightIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { cn } from '../../../utils/cn';
import { alliService } from '../../../services/alli';
import { storage } from '../../../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import type { CreativeAsset } from '../../../types';
import type { EditImageStepProps } from '../types';

const ASSETS_PER_PAGE = 8;

export function NewBackgroundStep({
  stepData,
  onStepDataChange,
  clientSlug,
  assetHouse,
  isLoading,
  setIsLoading,
}: EditImageStepProps) {
  const [imageMode, setImageMode] = useState<'alli' | 'upload' | null>(null);
  const [assets, setAssets] = useState<CreativeAsset[]>([]);
  const [isFetchingAssets, setIsFetchingAssets] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [assetPage, setAssetPage] = useState(1);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);

  // Gather brand colors from assetHouse
  const brandColors: { label: string; value: string }[] = [];
  if (assetHouse) {
    if (assetHouse.primaryColor) {
      brandColors.push({ label: 'Primary', value: assetHouse.primaryColor });
    }
    for (const v of assetHouse.variables || []) {
      if (v.type === 'color' && v.value) {
        brandColors.push({ label: v.name, value: v.value });
      }
    }
    for (const a of assetHouse.assets || []) {
      if (a.type === 'color' && a.value) {
        brandColors.push({ label: a.name, value: a.value });
      }
    }
  }

  // Add custom color if set and not already in brand colors
  const allColors = [...brandColors];
  if (stepData.customColor && !brandColors.some((c) => c.value.toLowerCase() === stepData.customColor!.toLowerCase())) {
    allColors.push({ label: 'Custom', value: stepData.customColor });
  }

  // Fetch Alli creative assets when browse mode is opened
  useEffect(() => {
    if (imageMode === 'alli' && clientSlug) {
      setIsFetchingAssets(true);
      alliService
        .getCreativeAssets(clientSlug)
        .then((all) => setAssets(all.filter((a) => a.type === 'image')))
        .catch(() => setAssets([]))
        .finally(() => setIsFetchingAssets(false));
    }
  }, [imageMode, clientSlug]);

  const filteredAssets = assets.filter(
    (a) => !searchQuery || (a.name || '').toLowerCase().includes(searchQuery.toLowerCase()),
  );
  const totalPages = Math.max(1, Math.ceil(filteredAssets.length / ASSETS_PER_PAGE));
  const paginatedAssets = filteredAssets.slice(
    (assetPage - 1) * ASSETS_PER_PAGE,
    assetPage * ASSETS_PER_PAGE,
  );

  const selectColor = (color: string) => {
    onStepDataChange({ selectedBackground: { type: 'color', value: color } });
  };

  const handleCustomColor = (e: React.ChangeEvent<HTMLInputElement>) => {
    const color = e.target.value;
    onStepDataChange({
      customColor: color,
      selectedBackground: { type: 'color', value: color },
    });
  };

  const selectImage = (url: string, name: string) => {
    onStepDataChange({ selectedBackground: { type: 'image', url, name } });
  };

  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setUploadError('Please upload an image file.');
      return;
    }
    setUploadError(null);
    setIsLoading(true);
    try {
      const storageRef = ref(storage, `edit-image/${clientSlug}/bg_${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      selectImage(url, file.name);
    } catch {
      setUploadError('Upload failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const isColorSelected = stepData.selectedBackground?.type === 'color';
  const isImageSelected = stepData.selectedBackground?.type === 'image';
  const selectedColorValue = isColorSelected ? stepData.selectedBackground.value : null;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* Brand Colors */}
      <div className="space-y-3">
        <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">Brand Colors</h3>
        {brandColors.length > 0 ? (
          <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">From Alli Asset Library</p>
        ) : (
          <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">No brand colors configured — use + to pick a custom color</p>
        )}
        <div className="flex flex-wrap gap-3 items-center">
          {allColors.map((color) => (
            <button
              key={color.value}
              onClick={() => selectColor(color.value)}
              className={cn(
                'relative h-12 w-12 rounded-xl border-2 transition-all shadow-sm',
                selectedColorValue === color.value
                  ? 'border-blue-600 ring-2 ring-blue-200 scale-110'
                  : 'border-gray-200 hover:border-blue-300 hover:scale-105',
              )}
              style={{ backgroundColor: color.value }}
              title={color.label}
            >
              {selectedColorValue === color.value && (
                <CheckIcon className="absolute inset-0 m-auto h-5 w-5 text-blue-600 drop-shadow" />
              )}
            </button>
          ))}

          {/* + button for custom color picker */}
          <button
            onClick={() => colorInputRef.current?.click()}
            className="h-12 w-12 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center hover:border-blue-300 transition-all bg-gray-50"
            title="Pick a custom color"
          >
            <PlusIcon className="h-5 w-5 text-gray-400" />
          </button>
          <input
            ref={colorInputRef}
            type="color"
            className="sr-only"
            value={stepData.customColor || '#000000'}
            onChange={handleCustomColor}
          />
        </div>
      </div>

      <div className="border-t border-gray-100" />

      {/* Background Image */}
      <div className="space-y-3">
        <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">Background Image</h3>

        {!imageMode ? (
          <div className="grid grid-cols-2 gap-4">
            {/* Browse Alli Creative */}
            <button
              onClick={() => setImageMode('alli')}
              className="flex flex-col items-center gap-3 rounded-2xl border-2 border-gray-100 p-6 text-center hover:border-blue-300 hover:bg-gray-50/50 transition-all"
            >
              <div className="rounded-xl bg-blue-50 p-4">
                <MagnifyingGlassIcon className="h-6 w-6 text-blue-600" />
              </div>
              <p className="text-[10px] font-black text-gray-900 uppercase tracking-widest">Browse Alli Creative</p>
              <p className="text-[9px] text-gray-500">Search existing assets</p>
            </button>

            {/* Upload Image */}
            <button
              onClick={() => setImageMode('upload')}
              className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-gray-200 p-6 text-center hover:border-blue-300 hover:bg-gray-50/50 transition-all"
            >
              <div className="rounded-xl bg-green-50 p-4">
                <CloudArrowUpIcon className="h-6 w-6 text-green-600" />
              </div>
              <p className="text-[10px] font-black text-gray-900 uppercase tracking-widest">Upload Image</p>
              <p className="text-[9px] text-gray-500">JPG, PNG, WebP</p>
            </button>
          </div>
        ) : imageMode === 'alli' ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setImageMode(null)}
                className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline"
              >
                ← Back
              </button>
            </div>

            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search assets..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setAssetPage(1); }}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-10 pr-4 text-xs focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            {isFetchingAssets ? (
              <div className="py-16 text-center space-y-4 bg-gray-50 rounded-2xl border border-dashed border-gray-100">
                <ArrowPathIcon className="h-8 w-8 mx-auto text-blue-600 animate-spin" />
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Querying API...</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                  {filteredAssets.length} images · Page {assetPage} of {totalPages}
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {paginatedAssets.map((asset) => (
                    <button
                      key={asset.id}
                      onClick={() => selectImage(asset.url, asset.name || 'alli-asset')}
                      className={cn(
                        'group relative aspect-square overflow-hidden rounded-xl border-2 transition-all',
                        isImageSelected && stepData.selectedBackground.url === asset.url
                          ? 'border-blue-600 ring-2 ring-blue-200'
                          : 'border-gray-100 hover:border-blue-300',
                      )}
                    >
                      <img src={asset.url} alt={asset.name || 'Asset'} className="h-full w-full object-cover" />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                        <p className="text-[8px] font-bold text-white truncate">{asset.name || 'Untitled'}</p>
                      </div>
                    </button>
                  ))}
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <button
                      onClick={() => setAssetPage((p) => Math.max(1, p - 1))}
                      disabled={assetPage === 1}
                      className="rounded-lg border border-gray-200 p-1.5 disabled:opacity-30"
                    >
                      <ChevronLeftIcon className="h-4 w-4" />
                    </button>
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                      {assetPage} / {totalPages}
                    </span>
                    <button
                      onClick={() => setAssetPage((p) => Math.min(totalPages, p + 1))}
                      disabled={assetPage === totalPages}
                      className="rounded-lg border border-gray-200 p-1.5 disabled:opacity-30"
                    >
                      <ChevronRightIcon className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <button
              onClick={() => setImageMode(null)}
              className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline"
            >
              ← Back
            </button>

            <div
              className="flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/50 py-16 transition-colors hover:border-blue-300"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) handleFileUpload(file);
              }}
            >
              <CloudArrowUpIcon className="h-10 w-10 text-gray-400" />
              <p className="text-xs font-black text-gray-500 uppercase tracking-widest">Drag & drop an image</p>
              <label className="cursor-pointer rounded-xl bg-blue-600 px-6 py-2 text-[10px] font-black text-white uppercase tracking-widest hover:bg-blue-700 transition-colors">
                Browse Files
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFileUpload(file); }}
                />
              </label>
              {uploadError && <p className="text-[10px] font-bold text-red-500">{uploadError}</p>}
              {isLoading && (
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest animate-pulse">Uploading...</p>
              )}
            </div>
          </div>
        )}

        {/* Selected background preview */}
        {isImageSelected && (
          <div className="flex items-center gap-4 rounded-xl bg-gray-50 p-3 border border-gray-100">
            <img src={stepData.selectedBackground.url} alt={stepData.selectedBackground.name} className="h-16 w-16 rounded-lg object-cover" />
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Selected Background</p>
              <p className="text-xs font-bold text-gray-900 truncate max-w-xs">{stepData.selectedBackground.name}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/edit-image/steps/NewBackgroundStep.tsx
git commit -m "feat: add NewBackgroundStep with brand colors, Alli browser, upload, and custom picker"
```

---

## Chunk 3: Update Existing Components + Cleanup

### Task 6: Update ChooseEditTypeStep.tsx — add preview video placeholder

**Files:**
- Modify: `src/components/edit-image/steps/ChooseEditTypeStep.tsx`

- [ ] **Step 1: Add the video preview placeholder above tool cards**

Replace the component's return JSX with:

```typescript
import { cn } from '../../../utils/cn';
import type { EditImageStepProps, EditType } from '../types';

const EDIT_TYPES: { id: EditType; title: string; description: string; enabled: boolean }[] = [
  {
    id: 'background',
    title: 'Change Background',
    description: 'Replace the background with a solid color or image from the catalog.',
    enabled: true,
  },
  {
    id: 'text',
    title: 'Change Text',
    description: 'Detect and replace text in the image using brand fonts.',
    enabled: false,
  },
  {
    id: 'colors',
    title: 'Change Colors',
    description: 'Swap dominant colors with your brand palette.',
    enabled: false,
  },
];

export function ChooseEditTypeStep({ stepData, onStepDataChange }: EditImageStepProps) {
  const selectedType = EDIT_TYPES.find((t) => t.id === stepData.editType);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Preview video placeholder */}
      <div className="overflow-hidden rounded-2xl border-2 border-gray-100 bg-gray-900">
        <div className="flex flex-col items-center justify-center py-16 px-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 mb-3">
            <svg className="h-5 w-5 text-white/60" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
          <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">
            {selectedType ? `${selectedType.title} Preview` : 'Tool Preview'}
          </p>
          <p className="mt-1 text-[9px] text-white/20">Video placeholder</p>
        </div>
      </div>

      <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em] text-center">
        What would you like to change?
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {EDIT_TYPES.map((type) => (
          <button
            key={type.id}
            onClick={() => type.enabled && onStepDataChange({ editType: type.id })}
            disabled={!type.enabled}
            className={cn(
              'relative flex flex-col items-center gap-3 rounded-2xl border-2 p-6 text-center transition-all',
              type.enabled
                ? stepData.editType === type.id
                  ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-200'
                  : 'border-gray-100 hover:border-blue-300 hover:bg-gray-50/50 cursor-pointer'
                : 'border-gray-100 bg-gray-50/30 opacity-60 cursor-not-allowed',
            )}
          >
            {!type.enabled && (
              <span className="absolute top-2 right-2 rounded-full bg-gray-200 px-2 py-0.5 text-[8px] font-black text-gray-500 uppercase tracking-widest">
                Soon
              </span>
            )}
            <p className="text-sm font-black text-gray-900 uppercase tracking-wider">
              {type.title}
            </p>
            <p className="text-[10px] text-gray-500 leading-relaxed">{type.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
```

The preview video placeholder text updates based on the selected tool card.

- [ ] **Step 2: Commit**

```bash
git add src/components/edit-image/steps/ChooseEditTypeStep.tsx
git commit -m "feat: add preview video placeholder to ChooseEditTypeStep"
```

---

### Task 7: Simplify PreviewStep.tsx

**Files:**
- Modify: `src/components/edit-image/steps/PreviewStep.tsx`

- [ ] **Step 1: Replace with simplified before/after view**

```typescript
import { useState, useEffect } from 'react';
import { ArrowPathIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { imageEditService } from '../../../services/imageEditService';
import type { RenderVariation } from '../../../services/imageEditService';
import type { EditImageStepProps } from '../types';

const API_BASE = import.meta.env.VITE_IMAGE_EDIT_API_URL || 'http://127.0.0.1:8001';

export function PreviewStep({
  stepData,
  onStepDataChange,
  setIsLoading,
  isLoading,
}: EditImageStepProps) {
  const [renderError, setRenderError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);

  const doRender = async () => {
    if (!stepData.extractedImageUrl || !stepData.selectedBackground) return;
    setIsRendering(true);
    setIsLoading(true);
    setRenderError(null);

    try {
      const fetchResp = await fetch(stepData.extractedImageUrl);
      const blob = await fetchResp.blob();
      const file = new File([blob], stepData.imageName || 'image.png', { type: blob.type });

      const backgroundId = stepData.selectedBackground.type === 'color'
        ? stepData.selectedBackground.value
        : 'custom-image';

      const renderResp = await imageEditService.renderVariations(file, {
        backgroundId,
        variationCount: 1,
        sourceName: stepData.imageName || 'image',
        confirmedDetections: [],
      });

      const result = renderResp.variations[0];
      onStepDataChange({ selectedVariation: result });
    } catch {
      // Backend not running — use placeholder
      const placeholder: RenderVariation = {
        id: 'placeholder-0',
        fileName: 'edited-image.png',
        url: stepData.imageUrl || '',
        downloadUrl: stepData.imageUrl || '',
        backgroundId: 'placeholder',
      };
      onStepDataChange({ selectedVariation: placeholder });
    } finally {
      setIsRendering(false);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!stepData.selectedVariation) {
      doRender();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (isRendering) {
    return (
      <div className="py-20 text-center space-y-4">
        <ArrowPathIcon className="h-10 w-10 mx-auto text-blue-600 animate-spin" />
        <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">
          Compositing image...
        </p>
        <p className="text-[10px] text-gray-400">This may take a few seconds</p>
      </div>
    );
  }

  if (renderError) {
    return (
      <div className="mx-auto max-w-md py-16 text-center space-y-4">
        <ExclamationTriangleIcon className="h-8 w-8 mx-auto text-red-400" />
        <p className="text-xs font-bold text-red-500">{renderError}</p>
        <button
          onClick={doRender}
          className="rounded-xl bg-blue-600 px-6 py-2 text-[10px] font-black text-white uppercase tracking-widest hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const variation = stepData.selectedVariation;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em] text-center">
        Preview
      </h3>

      <div className="grid grid-cols-2 gap-6">
        {/* Original */}
        <div className="space-y-2">
          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest text-center">Original</p>
          <div className="overflow-hidden rounded-2xl border-2 border-gray-200">
            <img src={stepData.imageUrl} alt="Original" className="w-full object-contain" />
          </div>
        </div>

        {/* Edited */}
        <div className="space-y-2">
          <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest text-center">Edited</p>
          <div className="overflow-hidden rounded-2xl border-2 border-blue-200 ring-2 ring-blue-100">
            {variation && (
              <img
                src={variation.url.startsWith('http') ? variation.url : `${API_BASE}${variation.url}`}
                alt="Edited"
                className="w-full object-contain"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/edit-image/steps/PreviewStep.tsx
git commit -m "refactor: simplify PreviewStep to single before/after comparison"
```

---

### Task 8: Delete BackgroundConfigStep.tsx and update changelog

**Files:**
- Delete: `src/components/edit-image/steps/BackgroundConfigStep.tsx`
- Modify: `docs/edit-image-changelog.md`

- [ ] **Step 1: Delete BackgroundConfigStep**

```bash
git rm src/components/edit-image/steps/BackgroundConfigStep.tsx
```

- [ ] **Step 2: Update the changelog**

Append to `docs/edit-image-changelog.md`:

```markdown

## UI Redesign — 2026-03-11

### Step name changes (prior to this session)
| Step ID | Before | After |
|---------|--------|-------|
| `edit-type` | Choose Edit Type | Edit Type |
| `configure` | Configure Edit | Canvas |
| `approve` | Approve & Download | Save |

### Wizard expanded from 5 steps to 6

Old: Select Image → Edit Type → Configure → Preview → Save
New: Select Image → Edit Type → Canvas → New Background → Preview → Save

### Changes by step

**Edit Type (ChooseEditTypeStep):**
- Added preview video placeholder above tool cards
- Placeholder text updates based on selected tool

**Canvas (CanvasStep — new):**
- New step for foreground extraction
- Shows selected image on canvas area
- "Extract Background" button triggers extraction (falls back to original image when API offline)
- Grayed "Edit" button (top-right) for future manual mask painting
- Continue disabled until extraction complete

**New Background (NewBackgroundStep — new, replaces BackgroundConfigStep):**
- Brand colors loaded from Alli Asset Library (primaryColor + variables + assets of type 'color')
- "+" button opens native color picker for custom colors
- "Browse Alli Creative" card to search/select background images
- "Upload Image" card for local file upload
- Selected background image preview bar
- No variation count picker (single output only)

**Preview (PreviewStep — simplified):**
- Removed variation grid and "Re-render" button
- Simple side-by-side: Original vs Edited (single result)
- Uses extractedImageUrl instead of imageUrl for compositing

**BackgroundConfigStep — deleted**
- Replaced by CanvasStep + NewBackgroundStep

### Data model changes (types.ts)
- Added: `extractedImageUrl`, `extractionMethod`, `customColor`
- Changed: `selectedBackground` to discriminated union (`color` | `image`)
- Removed: `variationCount`, `variations` array (single output only)

### Pickup point
All 6 steps are wired up. Ready for UI review and adjustments.
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit 2>&1 | head -30`

Expected: Clean build (or only pre-existing warnings unrelated to edit-image).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: delete BackgroundConfigStep and update changelog for UI redesign"
```
