# Change Background Feature — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Change Background wizard flow for the edit-image use case — let users pick an image (Alli or upload), choose "Change Background", select a catalog/solid background, preview GrabCut-composited variations, and download or save to Asset House (future).

**Architecture:** Extract the edit-image wizard into a dedicated component (`EditImageWizard.tsx`) to avoid bloating the 4200-line `UseCaseWizardPage.tsx` further. The new component consumes existing services (`imageEditService`, `alliService`, `creativeService`) and mirrors the video-cutdown Alli picker pattern. Backend is already complete — no Python changes needed.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Headless UI, existing FastAPI backend (GrabCut + background catalog)

**Build order:** All frontend UI first (Tasks 1-7), then wiring/integration (Task 8). This lets the user verify the UI before connecting to backend services.

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| **Create** | `src/components/edit-image/types.ts` | Shared types for edit-image step data and props |
| **Create** | `src/components/edit-image/EditImageWizard.tsx` | Top-level edit-image wizard orchestrator — renders the correct step component based on `currentStep` |
| **Create** | `src/components/edit-image/steps/SelectImageStep.tsx` | Step 1: Alli asset picker + local upload (mirrors video-cutdown pattern) |
| **Create** | `src/components/edit-image/steps/ChooseEditTypeStep.tsx` | Step 2: Three cards — Change Text, Change Background, Change Colors (only Background active) |
| **Create** | `src/components/edit-image/steps/BackgroundConfigStep.tsx` | Step 3: Background catalog grid (solids + images), selection, variation count |
| **Create** | `src/components/edit-image/steps/PreviewStep.tsx` | Step 4: Render variations via `imageEditService.renderVariations()`, show grid with selection |
| **Create** | `src/components/edit-image/steps/ApproveDownloadStep.tsx` | Step 5: Before/after, download button, grayed-out "Add to Asset House" |
| **Modify** | `src/pages/use-cases/UseCaseWizardPage.tsx:345-351` | Update step definitions, replace placeholder with `<EditImageWizard />` |

---

## Chunk 1: Types, Scaffolding & Wizard Shell (Frontend Only)

### Task 1: Create shared types for edit-image

**Files:**
- Create: `src/components/edit-image/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/components/edit-image/types.ts
import type { ClientAssetHouse } from '../../services/clientAssetHouse';
import type { BackgroundCatalogItem, RenderVariation } from '../../types';

export type EditType = 'background' | 'text' | 'colors';

export interface EditImageStepData {
  // Step 1 — Select Image
  imageUrl?: string;
  imageName?: string;
  imageSource?: 'alli' | 'upload';
  imageFile?: File;
  assetId?: string;
  platform?: string;

  // Step 2 — Edit Type
  editType?: EditType;

  // Step 3 — Background Config
  selectedBackground?: BackgroundCatalogItem;
  variationCount?: number;

  // Step 4 — Preview
  variations?: RenderVariation[];
  selectedVariation?: RenderVariation;

  // Step 5 — Save
  finalUrl?: string;
  savedToAssetHouse?: boolean;
}

export interface EditImageStepProps {
  stepData: EditImageStepData;
  onStepDataChange: (updates: Partial<EditImageStepData>) => void;
  clientSlug: string;
  assetHouse: ClientAssetHouse | null;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/edit-image/types.ts
git commit -m "feat(edit-image): add shared types for edit-image wizard steps"
```

---

### Task 2: Create EditImageWizard shell and wire into UseCaseWizardPage

**Files:**
- Create: `src/components/edit-image/EditImageWizard.tsx`
- Modify: `src/pages/use-cases/UseCaseWizardPage.tsx:345-351` (step defs)
- Modify: `src/pages/use-cases/UseCaseWizardPage.tsx:4201-4212` (replace placeholder)

- [ ] **Step 1: Update WIZARD_STEPS for edit-image**

In `UseCaseWizardPage.tsx`, replace lines 345-351:

```typescript
// OLD
'edit-image': [
    { id: 'select', name: 'Select Image' },
    { id: 'describe', name: 'Describe Edit' },
    { id: 'model', name: 'Choose AI Model' },
    { id: 'review', name: 'Review Variations' },
    { id: 'approve', name: 'Approve & Download' },
],

// NEW
'edit-image': [
    { id: 'select', name: 'Select Image' },
    { id: 'edit-type', name: 'Choose Edit Type' },
    { id: 'configure', name: 'Configure Edit' },
    { id: 'preview', name: 'Preview & Adjust' },
    { id: 'approve', name: 'Save' },
],
```

- [ ] **Step 2: Create EditImageWizard shell**

```typescript
// src/components/edit-image/EditImageWizard.tsx
import type { ClientAssetHouse } from '../../services/clientAssetHouse';
import type { EditImageStepData } from './types';
import { SelectImageStep } from './steps/SelectImageStep';
import { ChooseEditTypeStep } from './steps/ChooseEditTypeStep';
import { BackgroundConfigStep } from './steps/BackgroundConfigStep';
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
    case 'configure':
      return <BackgroundConfigStep {...sharedProps} />;
    case 'preview':
      return <PreviewStep {...sharedProps} />;
    case 'approve':
      return <ApproveDownloadStep {...sharedProps} />;
    default:
      return null;
  }
}
```

- [ ] **Step 3: Wire into UseCaseWizardPage**

1. Add import at top of `UseCaseWizardPage.tsx`:
```typescript
import { EditImageWizard } from '../../components/edit-image/EditImageWizard';
```

2. Insert new block **before** the fallback condition (before line 4201):
```typescript
{useCaseId === 'edit-image' && (
    <EditImageWizard
        currentStepId={steps[currentStep]?.id}
        stepData={stepData}
        onStepDataChange={(updates) => setStepData(updates)}
        clientSlug={client.slug}
        assetHouse={assetHouse}
        isLoading={isLoading}
        setIsLoading={setIsLoading}
    />
)}
```

3. Update the fallback condition to also exclude `edit-image`:
```typescript
{useCaseId !== 'new-image' && useCaseId !== 'video-cutdown' && useCaseId !== 'template-builder' && useCaseId !== 'edit-image' && (
```

- [ ] **Step 4: Add validation for edit-image steps in isNextDisabled**

In `UseCaseWizardPage.tsx`, in the `isNextDisabled` block (around lines 4227-4237), add:

```typescript
(useCaseId === 'edit-image' && (
    (steps[currentStep]?.id === 'select' && !stepData.imageUrl) ||
    (steps[currentStep]?.id === 'edit-type' && !stepData.editType) ||
    (steps[currentStep]?.id === 'configure' && !stepData.selectedBackground) ||
    (steps[currentStep]?.id === 'preview' && !stepData.selectedVariation)
));
```

- [ ] **Step 5: Commit**

```bash
git add src/components/edit-image/EditImageWizard.tsx src/pages/use-cases/UseCaseWizardPage.tsx
git commit -m "feat(edit-image): wire EditImageWizard into wizard page with updated step definitions"
```

---

## Chunk 2: All Step Components (Frontend UI Only)

All step components built here with UI only. Backend service calls are stubbed or use static data so the full flow can be verified visually before connecting.

### Task 3: Build SelectImageStep — Alli picker + upload

**Files:**
- Create: `src/components/edit-image/steps/SelectImageStep.tsx`

- [ ] **Step 1: Create SelectImageStep**

Mirrors the video-cutdown upload step pattern (lines 1641-1900 of UseCaseWizardPage.tsx). Filters to image assets only, stores to `imageUrl`/`imageName`/`imageSource`.

```typescript
// src/components/edit-image/steps/SelectImageStep.tsx
import { useState, useEffect } from 'react';
import { ArrowPathIcon, CloudArrowUpIcon, MagnifyingGlassIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { cn } from '../../../utils/cn';
import { alliService } from '../../../services/alli';
import { storage } from '../../../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import type { CreativeAsset } from '../../../types';
import type { EditImageStepProps } from '../types';

const ASSETS_PER_PAGE = 12;

export function SelectImageStep({
  stepData,
  onStepDataChange,
  clientSlug,
  isLoading,
  setIsLoading,
}: EditImageStepProps) {
  const [imageSource, setImageSource] = useState<'alli' | 'upload'>(stepData.imageSource || 'alli');
  const [assets, setAssets] = useState<CreativeAsset[]>([]);
  const [isFetchingAssets, setIsFetchingAssets] = useState(false);
  const [platformFilter, setPlatformFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [assetPage, setAssetPage] = useState(1);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (clientSlug && imageSource === 'alli') {
      setIsFetchingAssets(true);
      alliService
        .getCreativeAssets(clientSlug)
        .then((all) => setAssets(all.filter((a) => a.type === 'image')))
        .catch(() => setAssets([]))
        .finally(() => setIsFetchingAssets(false));
    }
  }, [clientSlug, imageSource]);

  const platforms = [...new Set(assets.map((a) => a.platform).filter(Boolean))] as string[];

  const filteredAssets = assets.filter((a) => {
    const matchesPlatform = platformFilter === 'all' || a.platform === platformFilter;
    const matchesSearch =
      !searchQuery || (a.name || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesPlatform && matchesSearch;
  });

  const totalPages = Math.max(1, Math.ceil(filteredAssets.length / ASSETS_PER_PAGE));
  const paginatedAssets = filteredAssets.slice(
    (assetPage - 1) * ASSETS_PER_PAGE,
    assetPage * ASSETS_PER_PAGE,
  );

  const selectAlliAsset = (asset: CreativeAsset) => {
    onStepDataChange({
      imageUrl: asset.url,
      imageName: asset.name || 'alli-asset',
      imageSource: 'alli',
      assetId: asset.id,
      platform: asset.platform,
      imageFile: undefined,
    });
  };

  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setUploadError('Please upload an image file.');
      return;
    }
    setUploadError(null);
    setIsLoading(true);
    try {
      const storageRef = ref(storage, `edit-image/${clientSlug}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      onStepDataChange({
        imageUrl: url,
        imageName: file.name,
        imageSource: 'upload',
        imageFile: file,
        assetId: undefined,
        platform: undefined,
      });
    } catch {
      setUploadError('Upload failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* LEFT: Asset picker */}
      <div className="lg:col-span-8 space-y-6">
        {/* Source toggle */}
        <div className="flex items-center justify-between">
          <div className="flex p-1 bg-gray-100 rounded-2xl w-fit">
            {(['alli', 'upload'] as const).map((src) => (
              <button
                key={src}
                onClick={() => setImageSource(src)}
                className={cn(
                  'px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all',
                  imageSource === src
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700',
                )}
              >
                {src === 'alli' ? 'Alli Central' : 'Local Upload'}
              </button>
            ))}
          </div>
        </div>

        {imageSource === 'alli' ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">
                Select Image from Alli
              </h3>
              {platforms.length > 0 && (
                <div className="flex gap-1">
                  {['all', ...platforms].map((p) => (
                    <button
                      key={p}
                      onClick={() => { setPlatformFilter(p); setAssetPage(1); }}
                      className={cn(
                        'px-2 py-1 rounded text-[8px] font-black uppercase tracking-tighter border transition-all',
                        platformFilter === p
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-500 border-gray-100',
                      )}
                    >
                      {p === 'all' ? 'All' : p}
                    </button>
                  ))}
                </div>
              )}
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
              <div className="py-20 text-center space-y-4 bg-gray-50 rounded-2xl border border-dashed border-gray-100">
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
                      onClick={() => selectAlliAsset(asset)}
                      className={cn(
                        'group relative aspect-square overflow-hidden rounded-xl border-2 transition-all',
                        stepData.assetId === asset.id
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
        )}
      </div>

      {/* RIGHT: Selected image preview */}
      <div className="lg:col-span-4">
        {stepData.imageUrl ? (
          <div className="space-y-3">
            <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">Selected Image</h3>
            <div className="overflow-hidden rounded-2xl border border-gray-100 shadow-sm">
              <img src={stepData.imageUrl} alt={stepData.imageName || 'Selected'} className="w-full object-contain" />
            </div>
            <p className="text-[10px] font-bold text-gray-500 truncate">{stepData.imageName}</p>
          </div>
        ) : (
          <div className="flex h-64 items-center justify-center rounded-2xl border-2 border-dashed border-gray-100 bg-gray-50/30">
            <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">No image selected</p>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/edit-image/steps/SelectImageStep.tsx
git commit -m "feat(edit-image): add SelectImageStep with Alli picker and local upload"
```

---

### Task 4: Build ChooseEditTypeStep

**Files:**
- Create: `src/components/edit-image/steps/ChooseEditTypeStep.tsx`

- [ ] **Step 1: Create the three-card edit type selector**

Only "Change Background" is functional. "Change Text" and "Change Colors" show "Coming Soon" badges.

```typescript
// src/components/edit-image/steps/ChooseEditTypeStep.tsx
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
  return (
    <div className="mx-auto max-w-2xl space-y-6">
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

- [ ] **Step 2: Commit**

```bash
git add src/components/edit-image/steps/ChooseEditTypeStep.tsx
git commit -m "feat(edit-image): add ChooseEditTypeStep with 3 edit type cards"
```

---

### Task 5: Build BackgroundConfigStep

**Files:**
- Create: `src/components/edit-image/steps/BackgroundConfigStep.tsx`

- [ ] **Step 1: Create background config with catalog grid**

Fetches background catalog from `imageEditService.getBackgroundCatalog()`. Shows solid colors as swatches and image backgrounds as thumbnails.

```typescript
// src/components/edit-image/steps/BackgroundConfigStep.tsx
import { useState, useEffect } from 'react';
import { ArrowPathIcon, CheckIcon } from '@heroicons/react/24/outline';
import { cn } from '../../../utils/cn';
import { imageEditService } from '../../../services/imageEditService';
import type { BackgroundCatalogItem } from '../../../types';
import type { EditImageStepProps } from '../types';

const API_BASE = import.meta.env.VITE_IMAGE_EDIT_API_URL || 'http://127.0.0.1:8001';

export function BackgroundConfigStep({
  stepData,
  onStepDataChange,
}: EditImageStepProps) {
  const [catalog, setCatalog] = useState<BackgroundCatalogItem[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    setIsFetching(true);
    setFetchError(null);
    imageEditService
      .getBackgroundCatalog()
      .then(setCatalog)
      .catch(() => setFetchError('Could not load backgrounds. Is the local API running?'))
      .finally(() => setIsFetching(false));
  }, []);

  const solids = catalog.filter((b) => b.type === 'solid');
  const images = catalog.filter((b) => b.type === 'image');
  const selected = stepData.selectedBackground;

  const selectBackground = (bg: BackgroundCatalogItem) => {
    onStepDataChange({ selectedBackground: bg, variationCount: stepData.variationCount || 3 });
  };

  if (isFetching) {
    return (
      <div className="py-20 text-center space-y-4">
        <ArrowPathIcon className="h-8 w-8 mx-auto text-blue-600 animate-spin" />
        <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Loading backgrounds...</p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="mx-auto max-w-md py-16 text-center space-y-3">
        <p className="text-xs font-bold text-red-500">{fetchError}</p>
        <p className="text-[10px] text-gray-400">
          Run: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-[10px]">cd local-services/image-edit-api && uvicorn main:app --reload --host 127.0.0.1 --port 8001</code>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* Selected image preview (small) */}
      {stepData.imageUrl && (
        <div className="flex items-center gap-4 rounded-xl bg-gray-50 p-3 border border-gray-100">
          <img src={stepData.imageUrl} alt={stepData.imageName || ''} className="h-16 w-16 rounded-lg object-cover" />
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Editing</p>
            <p className="text-xs font-bold text-gray-900 truncate max-w-xs">{stepData.imageName}</p>
          </div>
        </div>
      )}

      {/* Solid Backgrounds */}
      {solids.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">Solid Colors</h3>
          <div className="flex flex-wrap gap-3">
            {solids.map((bg) => (
              <button
                key={bg.id}
                onClick={() => selectBackground(bg)}
                className={cn(
                  'relative h-14 w-14 rounded-xl border-2 transition-all shadow-sm',
                  selected?.id === bg.id
                    ? 'border-blue-600 ring-2 ring-blue-200 scale-110'
                    : 'border-gray-200 hover:border-blue-300 hover:scale-105',
                )}
                style={{ backgroundColor: bg.value }}
                title={bg.name}
              >
                {selected?.id === bg.id && (
                  <CheckIcon className="absolute inset-0 m-auto h-5 w-5 text-blue-600 drop-shadow" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Image Backgrounds */}
      {images.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">Image Backgrounds</h3>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
            {images.map((bg) => (
              <button
                key={bg.id}
                onClick={() => selectBackground(bg)}
                className={cn(
                  'relative aspect-square overflow-hidden rounded-xl border-2 transition-all',
                  selected?.id === bg.id
                    ? 'border-blue-600 ring-2 ring-blue-200 scale-105'
                    : 'border-gray-100 hover:border-blue-300',
                )}
              >
                <img
                  src={bg.previewUrl || `${API_BASE}/background-files/${bg.value}`}
                  alt={bg.name}
                  className="h-full w-full object-cover"
                />
                {selected?.id === bg.id && (
                  <div className="absolute inset-0 flex items-center justify-center bg-blue-600/20">
                    <CheckIcon className="h-6 w-6 text-white drop-shadow-lg" />
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent p-1.5">
                  <p className="text-[7px] font-bold text-white truncate">{bg.name}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Variation Count */}
      <div className="flex items-center gap-4">
        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Variations:</label>
        <div className="flex gap-2">
          {[3, 4].map((count) => (
            <button
              key={count}
              onClick={() => onStepDataChange({ variationCount: count })}
              className={cn(
                'px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all',
                (stepData.variationCount || 3) === count
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300',
              )}
            >
              {count}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/edit-image/steps/BackgroundConfigStep.tsx
git commit -m "feat(edit-image): add BackgroundConfigStep with catalog grid and variation selector"
```

---

### Task 6: Build PreviewStep

**Files:**
- Create: `src/components/edit-image/steps/PreviewStep.tsx`

- [ ] **Step 1: Create PreviewStep that calls renderVariations on mount**

Calls `imageEditService.renderVariations()` with the selected background. Displays original + variation grid. User clicks to select.

```typescript
// src/components/edit-image/steps/PreviewStep.tsx
import { useState, useEffect } from 'react';
import { ArrowPathIcon, CheckIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { cn } from '../../../utils/cn';
import { imageEditService } from '../../../services/imageEditService';
import type { RenderVariation } from '../../../types';
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
    if (!stepData.imageUrl || !stepData.selectedBackground) return;
    setIsRendering(true);
    setIsLoading(true);
    setRenderError(null);

    try {
      const response = await fetch(stepData.imageUrl);
      const blob = await response.blob();
      const file = new File([blob], stepData.imageName || 'image.png', { type: blob.type });

      const result = await imageEditService.renderVariations(file, {
        backgroundId: stepData.selectedBackground.id,
        variationCount: stepData.variationCount || 3,
        sourceName: stepData.imageName || 'image',
        confirmedDetections: [],
      });

      onStepDataChange({ variations: result, selectedVariation: result[0] });
    } catch (err: any) {
      setRenderError(err?.message || 'Rendering failed. Is the local API running?');
    } finally {
      setIsRendering(false);
      setIsLoading(false);
    }
  };

  // Render on first mount if no variations yet
  useEffect(() => {
    if (!stepData.variations || stepData.variations.length === 0) {
      doRender();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectVariation = (variation: RenderVariation) => {
    onStepDataChange({ selectedVariation: variation });
  };

  const handleRerender = () => {
    onStepDataChange({ variations: undefined, selectedVariation: undefined });
    doRender();
  };

  if (isRendering) {
    return (
      <div className="py-20 text-center space-y-4">
        <ArrowPathIcon className="h-10 w-10 mx-auto text-blue-600 animate-spin" />
        <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">
          Extracting foreground & compositing...
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
          onClick={handleRerender}
          className="rounded-xl bg-blue-600 px-6 py-2 text-[10px] font-black text-white uppercase tracking-widest hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const variations = stepData.variations || [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">Select a Variation</h3>
        <button
          onClick={handleRerender}
          disabled={isLoading}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[10px] font-black text-gray-500 uppercase tracking-widest hover:border-blue-300 hover:text-blue-600 transition-all disabled:opacity-40"
        >
          <ArrowPathIcon className="h-3.5 w-3.5" />
          Re-render
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Original */}
        <div className="space-y-2">
          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Original</p>
          <div className="aspect-square overflow-hidden rounded-xl border-2 border-gray-200">
            <img src={stepData.imageUrl} alt="Original" className="h-full w-full object-cover" />
          </div>
        </div>

        {/* Variations */}
        {variations.map((v: RenderVariation, i: number) => (
          <button key={v.id} onClick={() => selectVariation(v)} className="space-y-2 text-left">
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
              Variation {i + 1}
            </p>
            <div
              className={cn(
                'relative aspect-square overflow-hidden rounded-xl border-2 transition-all',
                stepData.selectedVariation?.id === v.id
                  ? 'border-blue-600 ring-2 ring-blue-200'
                  : 'border-gray-100 hover:border-blue-300',
              )}
            >
              <img src={`${API_BASE}${v.url}`} alt={`Variation ${i + 1}`} className="h-full w-full object-cover" />
              {stepData.selectedVariation?.id === v.id && (
                <div className="absolute top-2 right-2 rounded-full bg-blue-600 p-1">
                  <CheckIcon className="h-3 w-3 text-white" />
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/edit-image/steps/PreviewStep.tsx
git commit -m "feat(edit-image): add PreviewStep with GrabCut render and variation selection"
```

---

### Task 7: Build ApproveDownloadStep with grayed-out Asset House option

**Files:**
- Create: `src/components/edit-image/steps/ApproveDownloadStep.tsx`

- [ ] **Step 1: Create the save step with download + grayed-out Asset House**

Before/after side-by-side. Two action buttons: Download (active) and "Add to Asset House" (grayed out, disabled, with "Coming Soon" tooltip).

```typescript
// src/components/edit-image/steps/ApproveDownloadStep.tsx
import { useState } from 'react';
import { ArrowDownTrayIcon, CheckCircleIcon, CircleStackIcon } from '@heroicons/react/24/outline';
import type { EditImageStepProps } from '../types';

const API_BASE = import.meta.env.VITE_IMAGE_EDIT_API_URL || 'http://127.0.0.1:8001';

export function ApproveDownloadStep({ stepData, onStepDataChange }: EditImageStepProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const variation = stepData.selectedVariation;

  const handleDownload = async () => {
    if (!variation) return;
    setIsDownloading(true);
    try {
      const response = await fetch(`${API_BASE}${variation.downloadUrl}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = variation.fileName || 'edited-image.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onStepDataChange({ finalUrl: `${API_BASE}${variation.url}` });
    } catch {
      // User can retry
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="text-center space-y-2">
        <CheckCircleIcon className="h-10 w-10 mx-auto text-green-500" />
        <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">
          Your edited image is ready
        </h3>
      </div>

      {/* Before / After */}
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-2">
          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest text-center">Before</p>
          <div className="overflow-hidden rounded-2xl border border-gray-200 shadow-sm">
            <img src={stepData.imageUrl} alt="Original" className="w-full object-contain" />
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest text-center">After</p>
          <div className="overflow-hidden rounded-2xl border-2 border-blue-200 shadow-sm ring-2 ring-blue-100">
            {variation && (
              <img src={`${API_BASE}${variation.url}`} alt="Edited" className="w-full object-contain" />
            )}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-center gap-4">
        {/* Download — active */}
        <button
          onClick={handleDownload}
          disabled={isDownloading || !variation}
          className="flex items-center gap-2 rounded-2xl bg-blue-600 px-8 py-3 text-xs font-black text-white uppercase tracking-widest hover:bg-blue-700 transition-colors disabled:opacity-40 shadow-lg shadow-blue-600/20"
        >
          <ArrowDownTrayIcon className="h-4 w-4" />
          {isDownloading ? 'Downloading...' : 'Download Image'}
        </button>

        {/* Add to Asset House — grayed out */}
        <div className="relative group">
          <button
            disabled
            className="flex items-center gap-2 rounded-2xl border-2 border-gray-200 bg-gray-50 px-8 py-3 text-xs font-black text-gray-300 uppercase tracking-widest cursor-not-allowed"
          >
            <CircleStackIcon className="h-4 w-4" />
            Add to Asset House
          </button>
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 rounded-lg bg-gray-900 px-3 py-1 text-[9px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            Coming Soon
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the full app compiles**

Run: `npm run build`
Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add src/components/edit-image/steps/ApproveDownloadStep.tsx
git commit -m "feat(edit-image): add ApproveDownloadStep with download and grayed-out Asset House"
```

---

## Chunk 3: Integration & Smoke Test

### Task 8: Wire creative record persistence and smoke test

**Files:**
- Modify: `src/pages/use-cases/UseCaseWizardPage.tsx` (handleNext function)

- [ ] **Step 1: Create creative record on first step transition**

In `handleNext`, when advancing from `select` → `edit-type` for edit-image:

```typescript
if (useCaseId === 'edit-image' && steps[currentStep]?.id === 'select' && !creativeId) {
  const id = await creativeService.createCreative(client.slug, 'edit-image');
  setCreativeId(id);
}
```

- [ ] **Step 2: Persist stepData on configure → preview transition**

```typescript
if (useCaseId === 'edit-image' && steps[currentStep]?.id === 'configure') {
  if (creativeId) {
    await creativeService.updateCreative(creativeId, { stepData, currentStep: currentStep + 1 });
  }
}
```

- [ ] **Step 3: Mark completed on final step**

```typescript
if (useCaseId === 'edit-image' && steps[currentStep]?.id === 'approve') {
  if (creativeId) {
    await creativeService.updateCreative(creativeId, {
      stepData,
      status: 'completed',
      resultUrls: stepData.finalUrl ? [stepData.finalUrl] : [],
    });
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/use-cases/UseCaseWizardPage.tsx
git commit -m "feat(edit-image): wire creative record persistence and step transitions"
```

- [ ] **Step 5: Manual smoke test**

1. Start dev server: `npm run dev`
2. Start FastAPI: `cd local-services/image-edit-api && uvicorn main:app --reload --host 127.0.0.1 --port 8001`
3. Navigate to Edit Existing Image use case
4. **Step 1:** Select an image from Alli or upload → verify preview shows on right
5. **Step 2:** Choose "Change Background" → verify Text/Colors show "Soon" badge
6. **Step 3:** Pick a solid color → verify selection highlight, variation count toggle
7. **Step 4:** Wait for variations → select one → verify blue ring
8. **Step 5:** Verify before/after, download works, "Add to Asset House" is grayed out with tooltip

---

## Summary

| Task | Component | Files | Chunk |
|------|-----------|-------|-------|
| 1 | Shared types | `types.ts` | 1 — Scaffolding |
| 2 | Wizard wiring | `EditImageWizard.tsx` + `UseCaseWizardPage.tsx` | 1 — Scaffolding |
| 3 | Select Image | `SelectImageStep.tsx` | 2 — Frontend UI |
| 4 | Choose Edit Type | `ChooseEditTypeStep.tsx` | 2 — Frontend UI |
| 5 | Background Config | `BackgroundConfigStep.tsx` | 2 — Frontend UI |
| 6 | Preview | `PreviewStep.tsx` | 2 — Frontend UI |
| 7 | Save | `ApproveDownloadStep.tsx` | 2 — Frontend UI |
| 8 | Integration | `UseCaseWizardPage.tsx` | 3 — Integration |

**Backend changes:** None
**New files:** 7 (all under `src/components/edit-image/`)
**Modified files:** 1 (`UseCaseWizardPage.tsx`)
