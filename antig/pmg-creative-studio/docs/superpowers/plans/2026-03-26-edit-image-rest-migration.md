# Edit Image REST Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Data Explorer proxy calls in the edit-image wizard with direct Creative Insights REST endpoints (`adfeed_all`, `addetails_view`), enriching the asset grid and deriving scorecard data heuristically.

**Architecture:** Add `getAdFeed()` and `getAdDetails()` methods to `AlliService` that call Creative Insights REST endpoints directly (no proxy). Thread `client.id` (UUID) from `getClients()` through to `SelectAnalyzeStep`. Replace `getCreativeAssets()` + `executeQuery()` calls with `getAdFeed()` + `getAdDetails()`. Derive `brand_visuals` and `call_to_action_text` heuristically via a new `deriveScorecard()` utility since `addetails_view` doesn't return those fields.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS 4, existing AlliService + ClientAssetHouse services

**Spec:** `docs/superpowers/specs/2026-03-25-edit-image-rest-migration-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/types/index.ts` | Modify | Add `id: string` to `Client`; enrich `CreativeAsset` with `adStatus`, `adName`, `metrics`, `fatigue` |
| `src/services/alli.ts` | Modify | Add `getAdFeed()`, `getAdDetails()` methods; update `getClients()` to include UUID; add ad detail cache |
| `src/components/edit-image/utils/parseAlliAnalysis.ts` | Modify | Add `parseMLResults()` for pre-parsed object input (no `JSON.parse`) |
| `src/components/edit-image/utils/__tests__/parseAlliAnalysis.test.ts` | Modify | Add tests for `parseMLResults()` |
| `src/components/edit-image/utils/deriveScorecard.ts` | Create | Heuristic scorecard: CTA keyword detection + color proximity matching |
| `src/components/edit-image/utils/__tests__/deriveScorecard.test.ts` | Create | Tests for CTA detection and color proximity |
| `src/components/edit-image/types.ts` | Modify | Add `clientUuid` to `EditImageStepProps` |
| `src/components/edit-image/EditImageWizard.tsx` | Modify | Accept and pass `clientUuid` prop |
| `src/components/edit-image/steps/SelectAnalyzeStep.tsx` | Modify | Switch from `getCreativeAssets()`+`executeQuery()` to `getAdFeed()`+`getAdDetails()`; enriched grid cards; paginated loading |
| `src/pages/use-cases/UseCaseWizardPage.tsx` | Modify | Thread `client.id` as `clientUuid` to `EditImageWizard` |

---

### Task 1: Enrich Types

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add `id` to `Client` and enrich `CreativeAsset`**

In `src/types/index.ts`, update the `Client` interface to include `id`:

```typescript
export interface Client {
    slug: string;
    name: string;
    id: string; // UUID from Alli Central
}
```

Update the `CreativeAsset` interface to include new fields from `adfeed_all`:

```typescript
export interface CreativeAsset {
    id: string;
    url: string;
    type: 'image' | 'video';
    name?: string;
    platform?: string;
    // New fields from adfeed_all
    adStatus?: 'ACTIVE' | 'INACTIVE';
    adName?: string;
    metrics?: { ctr: string | null; cpm: string | null; cost: string };
    fatigue?: { fatigue_level: string };
}
```

- [ ] **Step 2: Build check**

```bash
npm run build
```

Expected: compiles — the new `id` field is already being set in `alli.ts` line 77 (`id: c.id || c.slug || 'unknown'`), so existing code already conforms.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add Client.id UUID and enrich CreativeAsset with adfeed fields"
```

---

### Task 2: Add `getAdFeed()` and `getAdDetails()` to AlliService

**Files:**
- Modify: `src/services/alli.ts`

- [ ] **Step 1: Add the CI API base URL constant and ad detail cache**

At the top of `alli.ts`, after the `PROXY_BASE` constant (line 9), add:

```typescript
const CI_API_BASE = import.meta.env.VITE_ALLI_CI_API_URL || 'https://ci-api.alli-data.com';
```

In the `AlliService` class, after the `clientCacheTime` field (line 15), add a new cache field:

```typescript
private adDetailCache: Record<string, unknown> = {};
```

- [ ] **Step 2: Add `getAdFeed()` method**

Add this method after the `getCreativeAssets()` method (after line 163):

```typescript
/**
 * Fetches creative assets from the Creative Insights adfeed_all REST endpoint.
 * Returns paginated results with enriched metadata (status, metrics, fatigue).
 */
async getAdFeed(
  clientUuid: string,
  page = 1,
): Promise<{ items: CreativeAsset[]; total: number; pageSize: number }> {
  const cacheKey = `${clientUuid}:${page}`;
  if (this.assetCache[cacheKey]) {
    return {
      items: this.assetCache[cacheKey],
      total: this.assetCache[cacheKey].length,
      pageSize: 50,
    };
  }

  const token = await authService.getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const url = `${CI_API_BASE}/api/v1/clients/${clientUuid}/adfeed?startDate=${startDate}&endDate=${endDate}&page=${page}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AdFeed Error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const ads = data.aggregated_ads || data.results || [];
  const total = data.total || ads.length;
  const pageSize = data.page_size || 50;

  const derivePlatform = (creativeUrl: string): string | undefined => {
    if (creativeUrl.includes('/meta/')) return 'Meta';
    if (creativeUrl.includes('/pinterest/')) return 'Pinterest';
    if (creativeUrl.includes('/tiktok/')) return 'TikTok';
    if (creativeUrl.includes('/snapchat/')) return 'Snapchat';
    if (creativeUrl.includes('/dv360/')) return 'DV360';
    return undefined;
  };

  const items: CreativeAsset[] = ads
    .filter((item: any) => item.creative_url)
    .map((item: any) => ({
      id: String(item.id),
      url: item.creative_url,
      type: (item.creative_type === 'video' ? 'video' : 'image') as 'image' | 'video',
      name: Array.isArray(item.ad_name) ? item.ad_name[0] : item.ad_name,
      platform: derivePlatform(item.creative_url || ''),
      adStatus: item.ad_status as 'ACTIVE' | 'INACTIVE' | undefined,
      adName: Array.isArray(item.ad_name) ? item.ad_name[0] : item.ad_name,
      metrics: item.metrics,
      fatigue: item.fatigue,
    }));

  this.assetCache[cacheKey] = items;
  return { items, total, pageSize };
}
```

- [ ] **Step 3: Add `getAdDetails()` method**

Add this method after `getAdFeed()`:

```typescript
/**
 * Fetches detailed creative data from the Creative Insights addetails_view REST endpoint.
 * Returns ml_results, metrics, and fatigue for a specific ad.
 * Cached per clientUuid:adId key.
 */
async getAdDetails(clientUuid: string, adId: string): Promise<any> {
  const cacheKey = `${clientUuid}:${adId}`;
  if (this.adDetailCache[cacheKey]) {
    return this.adDetailCache[cacheKey];
  }

  const token = await authService.getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const url = `${CI_API_BASE}/api/v1/clients/${clientUuid}/ads/${adId}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AdDetails Error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  this.adDetailCache[cacheKey] = data;
  return data;
}
```

- [ ] **Step 4: Build check**

```bash
npm run build
```

Expected: compiles successfully. The new methods aren't called yet, so no integration issues.

- [ ] **Step 5: Commit**

```bash
git add src/services/alli.ts
git commit -m "feat: add getAdFeed and getAdDetails methods to AlliService"
```

---

### Task 3: `parseMLResults` Utility (TDD)

**Files:**
- Modify: `src/components/edit-image/utils/parseAlliAnalysis.ts`
- Modify: `src/components/edit-image/utils/__tests__/parseAlliAnalysis.test.ts`

- [ ] **Step 1: Write failing tests**

Add these tests to the bottom of `src/components/edit-image/utils/__tests__/parseAlliAnalysis.test.ts`:

```typescript
import { parseImageAnalysis, parseMLResults, parseScorecard } from '../parseAlliAnalysis';

// ... (existing tests stay unchanged) ...

describe('parseMLResults', () => {
  it('parses a pre-parsed object with all fields', () => {
    const mlResults = {
      colors: [{ hexColor: '#ddc1a4', imagePercentage: 22.7 }],
      labels: ['Fashion', 'Jacket'],
      objects: ['Person'],
      text: ['Shop now'],
      faces: [{ joyLikelihood: 'LIKELY', angerLikelihood: 'VERY_UNLIKELY', sorrowLikelihood: 'VERY_UNLIKELY', surpriseLikelihood: 'VERY_UNLIKELY' }],
      links: [],
    };

    const result = parseMLResults(mlResults);

    expect(result.colors).toHaveLength(1);
    expect(result.colors[0].hexColor).toBe('#ddc1a4');
    expect(result.labels).toEqual(['Fashion', 'Jacket']);
    expect(result.text).toEqual(['Shop now']);
    expect(result.faces).toHaveLength(1);
  });

  it('handles missing fields gracefully', () => {
    const result = parseMLResults({ colors: [] });

    expect(result.labels).toEqual([]);
    expect(result.text).toEqual([]);
    expect(result.objects).toEqual([]);
    expect(result.faces).toEqual([]);
    expect(result.links).toEqual([]);
  });

  it('handles null input by returning empty arrays', () => {
    const result = parseMLResults(null);

    expect(result.colors).toEqual([]);
    expect(result.labels).toEqual([]);
  });

  it('filters out invalid color entries', () => {
    const mlResults = {
      colors: [
        { hexColor: '#abc', imagePercentage: 10 },
        { hexColor: '', imagePercentage: 5 },
        'not-an-object',
      ],
    };

    const result = parseMLResults(mlResults);

    expect(result.colors).toHaveLength(1);
    expect(result.colors[0].hexColor).toBe('#abc');
  });
});
```

- [ ] **Step 2: Run tests — verify FAIL**

```bash
npm test -- src/components/edit-image/utils/__tests__/parseAlliAnalysis.test.ts
```

Expected: FAIL — `parseMLResults` is not exported from `../parseAlliAnalysis`

- [ ] **Step 3: Implement `parseMLResults`**

Add this function at the bottom of `src/components/edit-image/utils/parseAlliAnalysis.ts`:

```typescript
/**
 * Parses ml_results from addetails_view — same shape as ImageAnalysis
 * but arrives as a pre-parsed object (no JSON.parse needed).
 */
export function parseMLResults(mlResults: unknown): ImageAnalysis {
  if (!mlResults || typeof mlResults !== 'object') {
    return { colors: [], labels: [], objects: [], text: [], faces: [], links: [] };
  }

  const obj = mlResults as Record<string, unknown>;

  return {
    colors: toColorArray(obj.colors),
    labels: toStringArray(obj.labels),
    objects: toStringArray(obj.objects),
    text: toStringArray(obj.text),
    faces: toFaceArray(obj.faces),
    links: toStringArray(obj.links),
  };
}
```

- [ ] **Step 4: Run tests — verify PASS**

```bash
npm test -- src/components/edit-image/utils/__tests__/parseAlliAnalysis.test.ts
```

Expected: All existing tests + 4 new tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/edit-image/utils/parseAlliAnalysis.ts src/components/edit-image/utils/__tests__/parseAlliAnalysis.test.ts
git commit -m "feat: add parseMLResults for pre-parsed addetails_view ml_results"
```

---

### Task 4: `deriveScorecard` Utility (TDD)

**Files:**
- Create: `src/components/edit-image/utils/deriveScorecard.ts`
- Create: `src/components/edit-image/utils/__tests__/deriveScorecard.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/components/edit-image/utils/__tests__/deriveScorecard.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { deriveScorecard } from '../deriveScorecard';
import type { ImageAnalysis } from '../../types';

const baseAnalysis: ImageAnalysis = {
  colors: [
    { hexColor: '#ddc1a4', imagePercentage: 22.7 },
    { hexColor: '#faf9f8', imagePercentage: 35.9 },
  ],
  labels: ['Fashion'],
  objects: ['Person'],
  text: ['ralphlauren'],
  faces: [],
  links: [],
};

describe('deriveScorecard', () => {
  it('detects CTA when text contains "Shop now"', () => {
    const analysis: ImageAnalysis = {
      ...baseAnalysis,
      text: ['Shop now', 'ralphlauren'],
    };

    const result = deriveScorecard(analysis, { ctr: null, cpm: null }, 'not_available', []);

    expect(result.callToActionText).toBe(true);
  });

  it('does not detect CTA with generic text like "ralphlauren"', () => {
    const result = deriveScorecard(baseAnalysis, { ctr: null, cpm: null }, 'not_available', []);

    expect(result.callToActionText).toBe(false);
  });

  it('detects brand visuals when image color is close to brand color', () => {
    const result = deriveScorecard(baseAnalysis, { ctr: null, cpm: null }, 'not_available', ['#ddc0a3']);

    expect(result.brandVisuals).toBe(true);
  });

  it('does not detect brand visuals when colors are far apart', () => {
    const result = deriveScorecard(baseAnalysis, { ctr: null, cpm: null }, 'not_available', ['#0000FF']);

    expect(result.brandVisuals).toBe(false);
  });

  it('does not detect brand visuals when no brand colors provided', () => {
    const result = deriveScorecard(baseAnalysis, { ctr: null, cpm: null }, 'not_available', []);

    expect(result.brandVisuals).toBe(false);
  });

  it('parses metrics correctly from string values', () => {
    const result = deriveScorecard(baseAnalysis, { ctr: '1.03', cpm: '4.68' }, 'active', []);

    expect(result.ctr).toBe(1.03);
    expect(result.cpm).toBe(4.68);
    expect(result.fatigueStatus).toBe('active');
  });

  it('maps fatigue "not_available" to null', () => {
    const result = deriveScorecard(baseAnalysis, { ctr: null, cpm: null }, 'not_available', []);

    expect(result.fatigueStatus).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — verify FAIL**

```bash
npm test -- src/components/edit-image/utils/__tests__/deriveScorecard.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement `deriveScorecard.ts`**

Create `src/components/edit-image/utils/deriveScorecard.ts`:

```typescript
import type { ImageAnalysis, ScorecardData } from '../types';

const CTA_KEYWORDS = [
  'shop', 'buy', 'order', 'learn more', 'sign up', 'get started',
  'discover', 'explore', 'try', 'subscribe', 'download', 'save', 'book',
  'get', 'click', 'tap', 'swipe', 'join', 'start', 'apply', 'claim',
];

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const fullHex = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean;

  return {
    r: parseInt(fullHex.slice(0, 2), 16),
    g: parseInt(fullHex.slice(2, 4), 16),
    b: parseInt(fullHex.slice(4, 6), 16),
  };
}

function colorDistance(
  c1: { r: number; g: number; b: number },
  c2: { r: number; g: number; b: number },
): number {
  return Math.sqrt(
    (c1.r - c2.r) ** 2 + (c1.g - c2.g) ** 2 + (c1.b - c2.b) ** 2,
  );
}

function parseNullableFloat(value: string | null): number | null {
  if (value === null || value === 'null' || value === '') return null;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function deriveScorecard(
  analysis: ImageAnalysis,
  metrics: { ctr: string | null; cpm: string | null },
  fatigueLevel: string,
  brandColors: string[],
): ScorecardData {
  const callToActionText = analysis.text.some((t) =>
    CTA_KEYWORDS.some((kw) => t.toLowerCase().includes(kw)),
  );

  const brandVisuals =
    brandColors.length > 0 &&
    analysis.colors.some((imgColor) =>
      brandColors.some((brandHex) =>
        colorDistance(hexToRgb(imgColor.hexColor), hexToRgb(brandHex)) <= 80,
      ),
    );

  return {
    callToActionText,
    brandVisuals,
    fatigueStatus: fatigueLevel === 'not_available' ? null : fatigueLevel,
    ctr: parseNullableFloat(metrics.ctr),
    cpm: parseNullableFloat(metrics.cpm),
  };
}
```

- [ ] **Step 4: Run tests — verify PASS**

```bash
npm test -- src/components/edit-image/utils/__tests__/deriveScorecard.test.ts
```

Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/edit-image/utils/deriveScorecard.ts src/components/edit-image/utils/__tests__/deriveScorecard.test.ts
git commit -m "feat: add deriveScorecard heuristic utility with tests"
```

---

### Task 5: Thread `clientUuid` Through the Wizard

**Files:**
- Modify: `src/components/edit-image/types.ts`
- Modify: `src/components/edit-image/EditImageWizard.tsx`
- Modify: `src/pages/use-cases/UseCaseWizardPage.tsx`

- [ ] **Step 1: Add `clientUuid` to `EditImageStepProps`**

In `src/components/edit-image/types.ts`, add `clientUuid` to the `EditImageStepProps` interface:

```typescript
export interface EditImageStepProps {
  stepData: EditImageStepData;
  onStepDataChange: (updates: Partial<EditImageStepData>) => void;
  clientSlug: string;
  clientUuid: string;
  assetHouse: ClientAssetHouse | null;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  onAdvance?: () => void;
}
```

- [ ] **Step 2: Add `clientUuid` to `EditImageWizardProps` and pass it through**

In `src/components/edit-image/EditImageWizard.tsx`, add `clientUuid` to the props interface:

```typescript
interface EditImageWizardProps {
  currentStepId: string;
  stepData: EditImageStepData;
  onStepDataChange: (updates: Partial<EditImageStepData>) => void;
  clientSlug: string;
  clientUuid: string;
  assetHouse: ClientAssetHouse | null;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  onAdvance?: () => void;
}
```

Destructure `clientUuid` in the function signature and add it to `sharedProps`:

```typescript
export function EditImageWizard({
  currentStepId,
  stepData,
  onStepDataChange,
  clientSlug,
  clientUuid,
  assetHouse,
  isLoading,
  setIsLoading,
  onAdvance,
}: EditImageWizardProps) {
  const sharedProps = {
    stepData,
    onStepDataChange,
    clientSlug,
    clientUuid,
    assetHouse,
    isLoading,
    setIsLoading,
    onAdvance,
  };
```

- [ ] **Step 3: Pass `clientUuid` in UseCaseWizardPage**

In `src/pages/use-cases/UseCaseWizardPage.tsx`, at line ~4260, add the `clientUuid` prop to the `<EditImageWizard>` JSX:

```typescript
<EditImageWizard
    currentStepId={steps[currentStep]?.id}
    stepData={stepData}
    onStepDataChange={(updates) => {
        setStepData((prev) => {
            const next = { ...prev, ...updates };
            stepDataRef.current = next;
            return next;
        });
    }}
    clientSlug={client.slug}
    clientUuid={client.id || ''}
    assetHouse={assetHouse}
    isLoading={isLoading}
    setIsLoading={setIsLoading}
    onAdvance={() => handleNext()}
/>
```

- [ ] **Step 4: Build check**

```bash
npm run build
```

Expected: compiles. Every step component that destructures `EditImageStepProps` will now receive `clientUuid` — TypeScript may warn about unused vars in other step components. If so, add `clientUuid` to the destructured-but-unused pattern in those components (e.g., prefix with `_` or add to a rest arg).

- [ ] **Step 5: Commit**

```bash
git add src/components/edit-image/types.ts src/components/edit-image/EditImageWizard.tsx src/pages/use-cases/UseCaseWizardPage.tsx
git commit -m "feat: thread clientUuid through EditImageWizard to step components"
```

---

### Task 6: Update SelectAnalyzeStep to Use REST Endpoints

**Files:**
- Modify: `src/components/edit-image/steps/SelectAnalyzeStep.tsx`

This is the largest task — switching from `getCreativeAssets()` + `executeQuery()` to `getAdFeed()` + `getAdDetails()`.

- [ ] **Step 1: Update imports**

Replace the `parseScorecard` import with `deriveScorecard` and add `parseMLResults`:

```typescript
import { parseMLResults } from '../utils/parseAlliAnalysis';
import { deriveScorecard } from '../utils/deriveScorecard';
```

Remove the unused `parseImageAnalysis` and `parseScorecard` imports. The updated import block should be:

```typescript
import { useEffect, useRef, useState } from 'react';
import {
  ArrowPathIcon,
  ChatBubbleLeftRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloudArrowUpIcon,
  MagnifyingGlassIcon,
  PaintBrushIcon,
  PhotoIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../../../firebase';
import { alliService } from '../../../services/alli';
import type { CreativeAsset } from '../../../types';
import { cn } from '../../../utils/cn';
import type { CreativeRecommendation, EditImageStepProps, EditType } from '../types';
import { buildRecommendations } from '../utils/buildRecommendations';
import { deriveScorecard } from '../utils/deriveScorecard';
import { extractBrandColors } from '../utils/extractBrandColors';
import { parseMLResults } from '../utils/parseAlliAnalysis';
```

- [ ] **Step 2: Add `clientUuid` to destructured props and update state**

Destructure `clientUuid` from props:

```typescript
export function SelectAnalyzeStep({
  stepData,
  onStepDataChange,
  clientSlug,
  clientUuid,
  assetHouse,
  isLoading,
  setIsLoading,
  onAdvance,
}: EditImageStepProps) {
```

Add new state variables for paginated loading:

```typescript
const [isLoadingMore, setIsLoadingMore] = useState(false);
const [totalAssets, setTotalAssets] = useState(0);
```

- [ ] **Step 3: Replace asset fetching with `getAdFeed()`**

Replace the existing `useEffect` that calls `alliService.getCreativeAssets()` (lines 82-95) with:

```typescript
// Fetch first page of ad feed
useEffect(() => {
  if (clientUuid && imageSource === 'alli') {
    setIsFetchingAssets(true);
    alliService
      .getAdFeed(clientUuid, 1)
      .then(({ items, total, pageSize }) => {
        const images = items.filter(
          (asset) => asset.type === 'image' && !asset.url.includes('/thumbnail/'),
        );
        setAssets(images);
        setTotalAssets(total);
        // Fetch remaining pages in background if there are more
        if (total > pageSize) {
          setIsLoadingMore(true);
          void fetchRemainingPages(clientUuid, total, pageSize, images);
        }
      })
      .catch(() => setAssets([]))
      .finally(() => setIsFetchingAssets(false));
  }
}, [clientUuid, imageSource]);
```

Add the background page fetcher function inside the component:

```typescript
const fetchRemainingPages = async (
  uuid: string,
  total: number,
  pageSize: number,
  firstPageItems: CreativeAsset[],
) => {
  const totalPages = Math.ceil(total / pageSize);
  let accumulated = [...firstPageItems];

  for (let page = 2; page <= totalPages; page++) {
    try {
      const { items } = await alliService.getAdFeed(uuid, page);
      const images = items.filter(
        (asset) => asset.type === 'image' && !asset.url.includes('/thumbnail/'),
      );
      accumulated = [...accumulated, ...images];
      setAssets(accumulated);
    } catch {
      break;
    }
  }

  setIsLoadingMore(false);
};
```

- [ ] **Step 4: Replace analysis fetch with `getAdDetails()`**

Replace the `fetchAnalysisForAsset` function (lines 128-203) with:

```typescript
const fetchAnalysisForAsset = async (asset: CreativeAsset) => {
  if (!clientUuid) return;

  const requestId = Date.now();
  analysisRequestIdRef.current = requestId;
  setIsAnalyzing(true);

  try {
    const data = await alliService.getAdDetails(clientUuid, asset.id);

    if (analysisRequestIdRef.current !== requestId) return;

    const imageAnalysis = parseMLResults(data.ml_results);
    if (imageAnalysis.colors.length === 0 && imageAnalysis.labels.length === 0) {
      onStepDataChange({
        imageAnalysis: undefined,
        recommendations: undefined,
        scorecardData: undefined,
      });
      return;
    }

    const brandColorHexes = extractBrandColors(assetHouse);
    const scorecardData = deriveScorecard(
      imageAnalysis,
      {
        ctr: data.metrics?.ctr ?? null,
        cpm: data.metrics?.cpm ?? null,
      },
      data.fatigue?.fatigue_level ?? 'not_available',
      brandColorHexes,
    );

    onStepDataChange({
      imageAnalysis,
      scorecardData,
      recommendations: buildRecommendations(imageAnalysis, scorecardData, brandColorHexes),
    });
  } catch (error) {
    if (analysisRequestIdRef.current !== requestId) return;

    console.error('Failed to fetch ad details', error);
    onStepDataChange({
      imageAnalysis: undefined,
      recommendations: undefined,
      scorecardData: undefined,
    });
  } finally {
    if (analysisRequestIdRef.current === requestId) {
      setIsAnalyzing(false);
    }
  }
};
```

- [ ] **Step 5: Enrich grid card rendering**

Update the grid card JSX inside the `paginatedAssets.map()` to show enriched metadata. Replace the existing card button (lines 352-373) with:

```tsx
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
  <img
    src={asset.url}
    alt={asset.name || 'Asset'}
    className="h-full w-full object-cover"
  />
  {asset.adStatus && (
    <span
      className={cn(
        'absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[7px] font-black uppercase',
        asset.adStatus === 'ACTIVE'
          ? 'bg-green-500/90 text-white'
          : 'bg-gray-400/90 text-white',
      )}
    >
      {asset.adStatus}
    </span>
  )}
  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
    <p className="truncate text-[8px] font-bold text-white">
      {asset.adName || asset.name || 'Untitled'}
    </p>
    {asset.metrics?.ctr && (
      <p className="text-[7px] font-mono text-white/80">
        CTR {parseFloat(asset.metrics.ctr).toFixed(2)}%
      </p>
    )}
  </div>
</button>
```

- [ ] **Step 6: Add "loading more" indicator**

After the pagination controls (after the `totalPages > 1` block), add:

```tsx
{isLoadingMore && (
  <p className="text-center text-[9px] font-black uppercase tracking-widest text-blue-500 animate-pulse">
    Loading more assets...
  </p>
)}
```

- [ ] **Step 7: Build check**

```bash
npm run build
```

Expected: compiles successfully

- [ ] **Step 8: Commit**

```bash
git add src/components/edit-image/steps/SelectAnalyzeStep.tsx
git commit -m "feat: switch SelectAnalyzeStep to REST endpoints (getAdFeed + getAdDetails)"
```

---

### Task 7: Run All Tests + Build Verification

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

```bash
npm test
```

Expected: all existing tests + new `parseMLResults` tests (4) + new `deriveScorecard` tests (7) pass. Total new tests: 11.

- [ ] **Step 2: Run build**

```bash
npm run build
```

Expected: clean build, no TypeScript errors.

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: no new lint errors.

- [ ] **Step 4: Manual smoke test checklist**

Start the dev server (`npm run dev`) and test:

1. Navigate to Edit Existing Image
2. Select a client → grid should load from `adfeed_all` (check Network tab for `adfeed` URL pattern)
3. Verify grid cards show status pill (ACTIVE/INACTIVE) and CTR if available
4. Verify ad name shows in card overlay
5. Click an Alli image → skeleton cards appear → recommendations load (check Network tab for `ads/{adId}` URL pattern)
6. Verify featured recommendation card renders with colors from `ml_results`
7. Click "Apply Background" → auto-advances to Canvas step
8. Test upload path: upload an image → no recommendations → click Background card → advances
9. Navigate back from Canvas → recommendations still visible (cached)
10. Switch clients → grid refreshes with new client's assets

- [ ] **Step 5: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: cleanup after REST migration testing"
```
