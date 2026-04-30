# Edit Image Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AI-powered creative recommendations to the edit-image wizard using real Alli platform data, guiding users toward better creative decisions.

**Architecture:** Merge Select Image + Edit Type into a single "Select & Analyze" step. On image selection, fetch `image_vision_analysis` from Alli's Data Explorer, parse it, and generate deterministic recommendations from the structured data + brand standards. No LLM dependency. Enhanced New Background step with AI-recommended color swatches.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS 4, existing AlliService + ClientAssetHouse services

**Spec:** `docs/superpowers/specs/2026-03-24-edit-image-revamp-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/components/edit-image/types.ts` | Modify | Add `ImageAnalysis`, `CreativeRecommendation`, `ScorecardData` types + new `EditImageStepData` fields |
| `src/components/edit-image/utils/parseAlliAnalysis.ts` | Create | Parse `image_vision_analysis` JSON string + scorecard string coercion |
| `src/components/edit-image/utils/buildRecommendations.ts` | Create | Deterministic recommendation builder from analysis + brand data |
| `src/components/edit-image/utils/extractBrandColors.ts` | Create | Extract brand color hex strings from ClientAssetHouse (shared utility) |
| `src/components/edit-image/utils/__tests__/parseAlliAnalysis.test.ts` | Create | Unit tests for parsing utilities |
| `src/components/edit-image/utils/__tests__/buildRecommendations.test.ts` | Create | Unit tests for recommendation builder |
| `src/components/edit-image/steps/SelectAnalyzeStep.tsx` | Create | Merged step: image grid + selected preview + recommendations + edit type cards |
| `src/components/edit-image/EditImageWizard.tsx` | Modify | Add `onAdvance` prop + `select-analyze` routing case |
| `src/components/edit-image/steps/NewBackgroundStep.tsx` | Modify | Add "Recommended for You" color swatches section at top |
| `src/pages/use-cases/UseCaseWizardPage.tsx` | Modify | Update `WIZARD_STEPS`, validation, and pass `onAdvance` callback |

---

### Task 1: Add Types

**Files:**
- Modify: `src/components/edit-image/types.ts`

- [ ] **Step 1: Add new interfaces and extend EditImageStepData**

```typescript
// Add after the existing EditType export

export interface ImageAnalysis {
  colors: { hexColor: string; imagePercentage: number }[];
  labels: string[];
  objects: string[];
  text: string[];
  faces: { joyLikelihood: string; angerLikelihood: string; sorrowLikelihood: string; surpriseLikelihood: string }[];
  links: string[];
}

export interface ScorecardData {
  brandVisuals: boolean;
  callToActionText: boolean;
  fatigueStatus: string | null;
  ctr: number | null;
  cpm: number | null;
}

export interface CreativeRecommendation {
  category: 'hero-text' | 'visuals-background' | 'brand-alignment';
  title: string;
  description: string;
  confidence: 'high' | 'medium' | 'low';
  dataChips: string[];
  actionType: 'background' | 'text' | 'colors';
  isTopRecommendation: boolean;
}
```

Add these fields to `EditImageStepData`:

```typescript
  // Select & Analyze step (new)
  imageAnalysis?: ImageAnalysis;
  recommendations?: CreativeRecommendation[];
  scorecardData?: ScorecardData;
```

Also add `onAdvance` to `EditImageStepProps`:

```typescript
export interface EditImageStepProps {
  stepData: EditImageStepData;
  onStepDataChange: (updates: Partial<EditImageStepData>) => void;
  clientSlug: string;
  assetHouse: ClientAssetHouse | null;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  onAdvance?: () => void;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/edit-image/types.ts
git commit -m "feat: add ImageAnalysis, CreativeRecommendation, ScorecardData types"
```

---

### Task 2: parseAlliAnalysis Utility (TDD)

**Files:**
- Create: `src/components/edit-image/utils/parseAlliAnalysis.ts`
- Create: `src/components/edit-image/utils/__tests__/parseAlliAnalysis.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/components/edit-image/utils/__tests__/parseAlliAnalysis.test.ts
import { describe, it, expect } from 'vitest';
import { parseImageAnalysis, parseScorecard } from '../parseAlliAnalysis';

describe('parseImageAnalysis', () => {
  it('parses valid JSON string into ImageAnalysis', () => {
    const raw = JSON.stringify({
      text: ['hello'],
      colors: [{ hexColor: '#fff', imagePercentage: 50 }],
      labels: ['Clothing'],
      objects: ['Person'],
      faces: [],
      links: [],
    });
    const result = parseImageAnalysis(raw);
    expect(result).not.toBeNull();
    expect(result!.colors[0].hexColor).toBe('#fff');
    expect(result!.labels).toEqual(['Clothing']);
  });

  it('returns null for invalid JSON', () => {
    expect(parseImageAnalysis('not json')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseImageAnalysis('')).toBeNull();
  });

  it('defaults missing arrays to empty', () => {
    const raw = JSON.stringify({ colors: [] });
    const result = parseImageAnalysis(raw);
    expect(result).not.toBeNull();
    expect(result!.labels).toEqual([]);
    expect(result!.text).toEqual([]);
    expect(result!.objects).toEqual([]);
  });
});

describe('parseScorecard', () => {
  it('converts string "false" to boolean false', () => {
    const result = parseScorecard({ brand_visuals: 'false', call_to_action_text: 'true', fatigue_status: 'null', ctr: 'null', cpm: 'null' });
    expect(result.brandVisuals).toBe(false);
    expect(result.callToActionText).toBe(true);
  });

  it('converts string "null" to null', () => {
    const result = parseScorecard({ brand_visuals: 'false', call_to_action_text: 'false', fatigue_status: 'null', ctr: 'null', cpm: 'null' });
    expect(result.fatigueStatus).toBeNull();
    expect(result.ctr).toBeNull();
    expect(result.cpm).toBeNull();
  });

  it('parses numeric strings to numbers', () => {
    const result = parseScorecard({ brand_visuals: 'true', call_to_action_text: 'false', fatigue_status: 'active', ctr: '1.03', cpm: '4.68' });
    expect(result.ctr).toBe(1.03);
    expect(result.cpm).toBe(4.68);
    expect(result.fatigueStatus).toBe('active');
  });
});
```

- [ ] **Step 2: Run tests — verify FAIL**

```bash
npm test -- src/components/edit-image/utils/__tests__/parseAlliAnalysis.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement parseAlliAnalysis.ts**

```typescript
// src/components/edit-image/utils/parseAlliAnalysis.ts
import type { ImageAnalysis, ScorecardData } from '../types';

export function parseImageAnalysis(raw: string): ImageAnalysis | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return {
      colors: Array.isArray(parsed.colors) ? parsed.colors : [],
      labels: Array.isArray(parsed.labels) ? parsed.labels : [],
      objects: Array.isArray(parsed.objects) ? parsed.objects : [],
      text: Array.isArray(parsed.text) ? parsed.text : [],
      faces: Array.isArray(parsed.faces) ? parsed.faces : [],
      links: Array.isArray(parsed.links) ? parsed.links : [],
    };
  } catch {
    return null;
  }
}

export function parseScorecard(row: Record<string, string>): ScorecardData {
  return {
    brandVisuals: row.brand_visuals === 'true',
    callToActionText: row.call_to_action_text === 'true',
    fatigueStatus: row.fatigue_status === 'null' ? null : row.fatigue_status,
    ctr: row.ctr === 'null' ? null : parseFloat(row.ctr),
    cpm: row.cpm === 'null' ? null : parseFloat(row.cpm),
  };
}
```

- [ ] **Step 4: Run tests — verify PASS**

```bash
npm test -- src/components/edit-image/utils/__tests__/parseAlliAnalysis.test.ts
```

Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/edit-image/utils/parseAlliAnalysis.ts src/components/edit-image/utils/__tests__/parseAlliAnalysis.test.ts
git commit -m "feat: add parseAlliAnalysis and parseScorecard utilities with tests"
```

---

### Task 3: buildRecommendations Utility (TDD)

**Files:**
- Create: `src/components/edit-image/utils/buildRecommendations.ts`
- Create: `src/components/edit-image/utils/__tests__/buildRecommendations.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/components/edit-image/utils/__tests__/buildRecommendations.test.ts
import { describe, it, expect } from 'vitest';
import { buildRecommendations } from '../buildRecommendations';
import type { ImageAnalysis, ScorecardData } from '../../types';

const mockAnalysis: ImageAnalysis = {
  colors: [
    { hexColor: '#ddc1a4', imagePercentage: 22.7 },
    { hexColor: '#faf9f8', imagePercentage: 35.9 },
    { hexColor: '#3e2e1a', imagePercentage: 8.4 },
  ],
  labels: ['Fashion', 'Jacket', 'Denim'],
  objects: ['Person', 'Outerwear'],
  text: ['ralphlauren', 'Shop now'],
  faces: [],
  links: [],
};

const mockScorecard: ScorecardData = {
  brandVisuals: false,
  callToActionText: false,
  fatigueStatus: null,
  ctr: null,
  cpm: null,
};

describe('buildRecommendations', () => {
  it('returns exactly 3 recommendations', () => {
    const recs = buildRecommendations(mockAnalysis, mockScorecard, ['#0C69EA']);
    expect(recs).toHaveLength(3);
  });

  it('sets isTopRecommendation on exactly one rec', () => {
    const recs = buildRecommendations(mockAnalysis, mockScorecard, ['#0C69EA']);
    const top = recs.filter(r => r.isTopRecommendation);
    expect(top).toHaveLength(1);
    expect(top[0].category).toBe('visuals-background');
  });

  it('includes dominant colors as data chips on background rec', () => {
    const recs = buildRecommendations(mockAnalysis, mockScorecard, ['#0C69EA']);
    const bgRec = recs.find(r => r.category === 'visuals-background')!;
    expect(bgRec.dataChips).toContain('#ddc1a4');
  });

  it('handles empty brand colors gracefully', () => {
    const recs = buildRecommendations(mockAnalysis, mockScorecard, []);
    const bgRec = recs.find(r => r.category === 'visuals-background')!;
    expect(bgRec.description).not.toContain('undefined');
  });

  it('changes hero-text title when CTA is detected', () => {
    const withCta = { ...mockScorecard, callToActionText: true };
    const recs = buildRecommendations(mockAnalysis, withCta, []);
    const heroRec = recs.find(r => r.category === 'hero-text')!;
    expect(heroRec.title).toBe('CTA Detected');
  });

  it('changes brand-alignment title when brand visuals present', () => {
    const withBrand = { ...mockScorecard, brandVisuals: true };
    const recs = buildRecommendations(mockAnalysis, withBrand, []);
    const brandRec = recs.find(r => r.category === 'brand-alignment')!;
    expect(brandRec.title).toBe('Brand Visuals Present');
  });
});
```

- [ ] **Step 2: Run tests — verify FAIL**

```bash
npm test -- src/components/edit-image/utils/__tests__/buildRecommendations.test.ts
```

- [ ] **Step 3: Implement buildRecommendations.ts**

```typescript
// src/components/edit-image/utils/buildRecommendations.ts
import type { ImageAnalysis, ScorecardData, CreativeRecommendation } from '../types';

export function buildRecommendations(
  analysis: ImageAnalysis,
  scorecard: ScorecardData,
  brandColors: string[],
): CreativeRecommendation[] {
  const dominantColors = analysis.colors.slice(0, 2).map(c => c.hexColor);
  const brandSnippet = brandColors.length
    ? `Your brand palette includes ${brandColors.slice(0, 2).join(', ')} — consider aligning.`
    : '';

  return [
    {
      category: 'visuals-background',
      title: 'Background Opportunity',
      description: `Dominant colors are ${dominantColors.join(', ')}. ${brandSnippet}`.trim(),
      confidence: 'medium',
      dataChips: analysis.colors.slice(0, 3).map(c => c.hexColor),
      actionType: 'background',
      isTopRecommendation: true,
    },
    {
      category: 'hero-text',
      title: scorecard.callToActionText ? 'CTA Detected' : 'Missing Call-to-Action',
      description: scorecard.callToActionText
        ? `Your image includes text: "${analysis.text.slice(0, 5).join(', ')}". Consider whether it aligns with campaign goals.`
        : 'No call-to-action text detected. Adding a CTA could improve engagement.',
      confidence: 'medium',
      dataChips: analysis.text.slice(0, 3),
      actionType: 'text',
      isTopRecommendation: false,
    },
    {
      category: 'brand-alignment',
      title: scorecard.brandVisuals ? 'Brand Visuals Present' : 'Brand Visuals Missing',
      description: scorecard.brandVisuals
        ? 'Brand elements are detected in this creative. Maintaining consistency across campaigns.'
        : 'No brand visuals detected. Consider adding brand colors or logo to strengthen recognition.',
      confidence: 'medium',
      dataChips: scorecard.brandVisuals ? ['Brand detected'] : ['No brand elements'],
      actionType: 'colors',
      isTopRecommendation: false,
    },
  ];
}
```

- [ ] **Step 4: Run tests — verify PASS**

```bash
npm test -- src/components/edit-image/utils/__tests__/buildRecommendations.test.ts
```

Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/edit-image/utils/buildRecommendations.ts src/components/edit-image/utils/__tests__/buildRecommendations.test.ts
git commit -m "feat: add buildRecommendations utility with tests"
```

---

### Task 3b: extractBrandColors Utility

**Files:**
- Create: `src/components/edit-image/utils/extractBrandColors.ts`

This utility extracts brand color hex strings from `ClientAssetHouse`. Needed by both `SelectAnalyzeStep` (to pass to `buildRecommendations`) and `NewBackgroundStep` (for the recommended swatches). Reuses the extraction pattern already in `NewBackgroundStep.tsx` lines 29-44.

- [ ] **Step 1: Create extractBrandColors.ts**

```typescript
// src/components/edit-image/utils/extractBrandColors.ts
import type { ClientAssetHouse } from '../../../services/clientAssetHouse';

/** Extract brand color hex strings from ClientAssetHouse. Returns empty array if no data. */
export function extractBrandColors(assetHouse: ClientAssetHouse | null): string[] {
  if (!assetHouse) return [];
  const colors: string[] = [];
  if (assetHouse.primaryColor) {
    colors.push(assetHouse.primaryColor);
  }
  for (const v of assetHouse.variables || []) {
    if (v.type === 'color' && v.value) {
      colors.push(v.value);
    }
  }
  for (const a of assetHouse.assets || []) {
    if (a.type === 'color' && a.value) {
      colors.push(a.value);
    }
  }
  return colors;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/edit-image/utils/extractBrandColors.ts
git commit -m "feat: add extractBrandColors shared utility"
```

---

### Task 4: SelectAnalyzeStep Component

**Files:**
- Create: `src/components/edit-image/steps/SelectAnalyzeStep.tsx`

This is the largest task — the new merged step component. It combines the image grid from `SelectImageStep` and edit type cards from `ChooseEditTypeStep`, adds the recommendation section.

- [ ] **Step 1: Create SelectAnalyzeStep.tsx**

Build the component with these sections:
1. Two-column layout: image grid (left 60%) + selected image panel (right 40%)
2. Image grid with Alli/Upload tabs, static image filtering, pagination (reuse patterns from `SelectImageStep.tsx`)
3. Selected image panel with empty state (dashed border, PhotoIcon, "Select an image to analyze")
4. On Alli image selection: call `alliService.executeQuery()` with `limit: 1`, parse with `parseImageAnalysis` + `parseScorecard`, generate recommendations with `buildRecommendations`
5. Upload path: skip recommendations, show edit type cards only
6. AI Recommendations section: stacked layout — featured card full-width, two info cards side-by-side
7. Edit type cards: de-emphasized secondary row (`h-16`, horizontal, BG active, Text/Colors disabled)
8. "Apply Background" click: sets `editType: 'background'` + calls `onAdvance()`
9. Debounce/disable on Apply click to prevent double navigation

Reference `SelectImageStep.tsx` for the asset grid patterns (fetching, filtering, pagination) and `ChooseEditTypeStep.tsx` for the card styles. Do NOT copy-paste — adapt and integrate.

Key implementation notes:
- Use `alliService.executeQuery()` for the analysis fetch (imported from `../../../services/alli`)
- Use `extractBrandColors(assetHouse)` to get `string[]` for `buildRecommendations`
- Guard the analysis fetch: only run if `imageSource === 'alli'` and `assetId` exists
- **Alli query + client-side match:** After `executeQuery()` returns, do `result.results?.find(r => r.ci_ad_id === selectedAssetId)`. If no match found, skip recommendations — show edit type cards only.
- Cache recommendations in `stepData` via `onStepDataChange` so navigating back preserves them
- Call `onStepDataChange` first to set `editType`, then call `onAdvance()` — React batches both updates
- **Static image filtering:** When filtering the asset grid, exclude assets where `url` includes `/thumbnail/` in addition to `a.type === 'image'`
- **Brand logo:** Display `assetHouse?.logoPrimary` below the image preview in the Selected Image Panel. If no `logoPrimary`, hide the logo area.
- **Entrance animation:** When recommendations load, wrap the recommendation section in a container with `transition-all duration-200 ease-out` and conditional opacity/translate (`opacity-0 translate-y-2` → `opacity-100 translate-y-0`)

**Loading skeleton layout (stacked, not 3-column):**
```tsx
{/* Show while analysis is loading */}
<div className="space-y-3 animate-pulse">
  <div className="h-[140px] bg-gray-100 rounded-xl" /> {/* Featured skeleton */}
  <div className="grid grid-cols-2 gap-3">
    <div className="h-[100px] bg-gray-100 rounded-xl" /> {/* Secondary skeleton 1 */}
    <div className="h-[100px] bg-gray-100 rounded-xl" /> {/* Secondary skeleton 2 */}
  </div>
</div>
```

**Error state:** Wrap the entire analysis fetch in try/catch. On any error, `console.error` and set recommendations to `undefined` — the UI shows edit type cards only. No toast, no crash.

- [ ] **Step 2: Verify the component renders without errors**

```bash
npm run build
```

Expected: no TypeScript errors related to SelectAnalyzeStep

- [ ] **Step 3: Commit**

```bash
git add src/components/edit-image/steps/SelectAnalyzeStep.tsx
git commit -m "feat: add SelectAnalyzeStep component with AI recommendations"
```

---

### Task 5: Wire Up the Wizard

**Files:**
- Modify: `src/components/edit-image/EditImageWizard.tsx`
- Modify: `src/pages/use-cases/UseCaseWizardPage.tsx`

- [ ] **Step 1: Update EditImageWizard**

Add `onAdvance` to props and the new `select-analyze` case:

```typescript
// Add to EditImageWizardProps:
onAdvance?: () => void;

// Add to sharedProps:
onAdvance,

// Add new case in switch (before 'canvas'):
case 'select-analyze':
  return <SelectAnalyzeStep {...sharedProps} />;

// Import at top:
import { SelectAnalyzeStep } from './steps/SelectAnalyzeStep';
```

Remove the imports for `SelectImageStep` and `ChooseEditTypeStep` (they're replaced by `SelectAnalyzeStep`). Keep the old `'select'` and `'edit-type'` cases temporarily as fallback, or remove them entirely since the step IDs are changing.

- [ ] **Step 2: Update UseCaseWizardPage — WIZARD_STEPS**

At line ~360, change:

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

To:

```typescript
'edit-image': [
    { id: 'select-analyze', name: 'Select & Analyze' },
    { id: 'canvas', name: 'Canvas' },
    { id: 'new-background', name: 'New Background' },
    { id: 'preview', name: 'Preview' },
    { id: 'approve', name: 'Save' },
],
```

- [ ] **Step 3: Update UseCaseWizardPage — validation logic**

At line ~4304, change the edit-image validation:

```typescript
(useCaseId === 'edit-image' && (
    (steps[currentStep]?.id === 'select-analyze' && (!stepData.imageUrl || !stepData.editType)) ||
    (steps[currentStep]?.id === 'canvas' && !stepData.extractedImageUrl) ||
    (steps[currentStep]?.id === 'new-background' && !stepData.selectedBackground) ||
    (steps[currentStep]?.id === 'preview' && !stepData.previewReady)
));
```

- [ ] **Step 4: Pass onAdvance callback to EditImageWizard**

Search for `useCaseId === 'edit-image' && (` near line ~4254 to find the `<EditImageWizard` JSX. Add the `onAdvance` prop that calls `handleNext()` — this ensures Firestore persistence, step data snapshotting, and all other wizard logic runs:

```typescript
<EditImageWizard
    currentStepId={steps[currentStep]?.id}
    stepData={stepData}
    onStepDataChange={(updates) => setStepData(updates)}
    clientSlug={client.slug}
    assetHouse={assetHouse}
    isLoading={isLoading}
    setIsLoading={setIsLoading}
    onAdvance={() => handleNext()}
/>
```

- [ ] **Step 5: Build check**

```bash
npm run build
```

Expected: compiles successfully

- [ ] **Step 6: Commit**

```bash
git add src/components/edit-image/EditImageWizard.tsx src/pages/use-cases/UseCaseWizardPage.tsx
git commit -m "feat: wire SelectAnalyzeStep into wizard with onAdvance callback"
```

---

### Task 6: Enhance NewBackgroundStep

**Files:**
- Modify: `src/components/edit-image/steps/NewBackgroundStep.tsx`

- [ ] **Step 1: Add "Recommended for You" section**

At the top of the NewBackgroundStep component, import `extractBrandColors` and use it to build the recommended swatches. Add the new section before the existing Brand Colors heading.

1. Import: `import { extractBrandColors } from '../utils/extractBrandColors';`
2. Compute recommended colors: cross-reference `stepData.imageAnalysis?.colors` (dominant image colors) with `extractBrandColors(assetHouse)` (brand hex strings)
3. Render color swatches (32px circles) with hex labels below
4. Only render if `imageAnalysis` has colors AND brand colors exist

```typescript
// At component top, compute brand color hexes:
const brandColorHexes = extractBrandColors(assetHouse);

// Inside the JSX, before the existing "BRAND COLORS" heading:
{stepData.imageAnalysis?.colors && brandColorHexes.length > 0 && (
  <div className="mb-8">
    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-gray-400 mb-3">
      Recommended for You
    </h3>
    <div className="flex gap-4 flex-wrap">
      {/* Show brand colors first, then top 3 dominant image colors, deduplicated */}
      {[...brandColorHexes.slice(0, 3), ...stepData.imageAnalysis.colors.slice(0, 3).map(c => c.hexColor)]
        .filter((v, i, a) => a.indexOf(v) === i)
        .slice(0, 6)
        .map((hex) => (
          <button
            key={hex}
            onClick={() => onStepDataChange({ selectedBackground: { type: 'color', value: hex } })}
            className={cn(
              'flex flex-col items-center gap-1 group',
              stepData.selectedBackground?.type === 'color' && stepData.selectedBackground.value === hex && 'ring-2 ring-blue-500 rounded-lg p-1'
            )}
          >
            <div className="w-8 h-8 rounded-full border border-gray-200 shadow-sm" style={{ backgroundColor: hex }} />
            <span className="text-[10px] text-gray-500 font-mono">{hex}</span>
          </button>
        ))
      }
    </div>
    <p className="text-xs text-gray-400 italic mt-2">Based on brand standards and creative analysis</p>
  </div>
)}
```

- [ ] **Step 2: Build check**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/edit-image/steps/NewBackgroundStep.tsx
git commit -m "feat: add AI-recommended color swatches to NewBackgroundStep"
```

---

### Task 7: Run All Tests + Manual Verify

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

```bash
npm test
```

Expected: all existing tests + 13 new tests pass

- [ ] **Step 2: Manual smoke test checklist**

Start the dev server (`npm run dev`) and test:

1. Navigate to Edit Existing Image
2. Select a client with Alli assets
3. Click an Alli image → skeleton cards appear → recommendations load
4. Verify featured card has purple border + "AI RECOMMENDS" badge
5. Verify text/colors cards show "Coming Soon" (no Apply button)
6. Click "Apply Background" → auto-advances to Canvas step
7. Complete the flow through to Preview
8. Test upload path: upload an image → no recommendations → click Background card → advances
9. Navigate back from Canvas → recommendations still visible (cached)

- [ ] **Step 3: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: cleanup after manual testing"
```
