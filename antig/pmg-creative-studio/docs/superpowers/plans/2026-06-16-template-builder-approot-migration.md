# Template-Builder AppRoot Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate template-builder from the shared `WizardShell` platform component to a self-contained `AppRoot` with owned chrome components — matching the ad-resizing architecture — while preserving 100% functional and visual parity.

**Architecture:** `AppRoot.tsx` becomes the state orchestrator (step data, routing, lifecycle). Chrome is split into `components/TemplateBuilderStepper.tsx` and `components/TemplateBuilderFooter.tsx`. All step routing and lifecycle logic lives in `hooks/useStepNavigation.ts`. `manifest.ts` and step components are untouched (modulo import path swaps).

**Tech Stack:** React 18, TypeScript, Vitest, @testing-library/react, React Router v6, Tailwind CSS, @heroicons/react

**Spec:** `docs/superpowers/specs/2026-06-16-template-builder-approot-migration-design.md`

---

## File Structure

```
src/apps/template-builder/
  AppRoot.tsx                           REWRITE — full orchestrator, no WizardShell
  manifest.ts                           UNCHANGED
  types.ts                              ADD — TemplateBuilderStep interface (additive)
  TemplateBuilderContext.tsx            UNCHANGED

  components/                           NEW
    TemplateBuilderStepper.tsx          NEW — stepper chrome
    TemplateBuilderStepper.test.tsx     NEW
    TemplateBuilderFooter.tsx           NEW — footer chrome
    TemplateBuilderFooter.test.tsx      NEW

  hooks/                                NEW
    useStepNavigation.ts                NEW — routing + lifecycle hook
    useStepNavigation.test.tsx          NEW

  utils/                                NEW
    mapTemplateToStepData.ts            NEW — extracted from AppRoot.tsx
    mapTemplateToStepData.test.ts       NEW

  steps/
    SetupStep.tsx                       MODIFY — import path swap only
    DesignStep.tsx                      MODIFY — import path swap only
    PublishStep.tsx                     MODIFY — import path swap only
```

**Files not modified:** `manifest.ts`, `TemplateBuilderContext.tsx`, `steps.ts`, `src/apps/types.ts`, `src/platform/wizard/usePersistedStepData.ts`, `src/apps/_registry.ts`

---

## Task 1: Extract `mapTemplateToStepData` to utils

The function lives at lines 19–65 of `AppRoot.tsx`. Move it to `utils/mapTemplateToStepData.ts` with no logic changes — only import path adjustments.

**Files:**
- Create: `src/apps/template-builder/utils/mapTemplateToStepData.ts`
- Create: `src/apps/template-builder/utils/mapTemplateToStepData.test.ts`
- Modify: `src/apps/template-builder/AppRoot.tsx` (remove function, add import — done in Task 6)

- [ ] **Step 1: Write the failing test**

Create `src/apps/template-builder/utils/mapTemplateToStepData.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { mapTemplateToStepData } from './mapTemplateToStepData';
import type { TemplateLibraryRecord } from '../../../services/templateLibrary.types';

vi.mock('../../../constants/useCases', () => ({
  SOCIAL_WIREFRAMES: [{ id: 'wireframe-1', file: 'wireframe-1.html' }],
}));

const minimalRecord: TemplateLibraryRecord = {
  id: 'tmpl-1',
  name: 'Test Template',
  status: 'published',
  version: 1,
  channel: 'social',
  adSizes: [
    { width: 1200, height: 628, label: '1200:628' },
    { width: 1080, height: 1080 },
  ],
  scaffoldId: 'wireframe-1',
  scaffoldSnapshot: {
    expectedFields: [],
    contentHash: 'abc',
    capturedAt: { seconds: 0, nanoseconds: 0 } as never,
  },
  datasourceId: 'feed-1',
  datasourceName: 'Product Feed',
  feedSnapshot: {
    columns: ['title', 'price'],
    capturedAt: { seconds: 0, nanoseconds: 0 } as never,
  },
  fieldMappings: {
    headline: { source: 'feed', column: 'title' },
    logo: { source: 'upload', assetPath: 'gs://bucket/logo.png' },
  },
  brandOverrides: { primaryColor: '#ff0000', accentColor: '#0000ff' },
  logoVariant: 'inverse',
};

describe('mapTemplateToStepData', () => {
  it('maps templateName from record name', () => {
    const result = mapTemplateToStepData(minimalRecord);
    expect(result.templateName).toBe('Test Template');
  });

  it('maps channel: social → Social', () => {
    const result = mapTemplateToStepData(minimalRecord);
    expect(result.channel).toBe('Social');
  });

  it('maps adSizes using label when present, falling back to WxH', () => {
    const result = mapTemplateToStepData(minimalRecord);
    expect(result.ratios).toEqual(['1200:628', '1080:1080']);
  });

  it('maps datasourceId and datasourceName', () => {
    const result = mapTemplateToStepData(minimalRecord);
    expect(result.selectedFeedId).toBe('feed-1');
    expect(result.selectedFeedName).toBe('Product Feed');
  });

  it('separates feed mappings and upload values', () => {
    const result = mapTemplateToStepData(minimalRecord);
    expect(result.feedMappings).toEqual({ headline: 'title' });
    expect(result.uploadValues).toEqual({ logo: 'gs://bucket/logo.png' });
  });

  it('sets selectedWireframeId from scaffoldId', () => {
    const result = mapTemplateToStepData(minimalRecord);
    expect(result.selectedWireframeId).toBe('wireframe-1');
  });

  it('sets wireframeFile when scaffoldId matches a known wireframe', () => {
    const result = mapTemplateToStepData(minimalRecord);
    expect(result.wireframeFile).toBe('wireframe-1.html');
  });

  it('maps brandOverrides to backgroundColor and accentColor', () => {
    const result = mapTemplateToStepData(minimalRecord);
    expect(result.backgroundColor).toBe('#ff0000');
    expect(result.accentColor).toBe('#0000ff');
  });

  it('maps logoVariant', () => {
    const result = mapTemplateToStepData(minimalRecord);
    expect(result.logoVariant).toBe('inverse');
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd antig/pmg-creative-studio
npx vitest run src/apps/template-builder/utils/mapTemplateToStepData.test.ts
```

Expected: `FAIL` — `Cannot find module './mapTemplateToStepData'`

- [ ] **Step 3: Create `utils/mapTemplateToStepData.ts`**

Create `src/apps/template-builder/utils/mapTemplateToStepData.ts`. This is a direct copy of the function from `AppRoot.tsx` lines 19–65 with updated import paths:

```typescript
import type { TemplateBuilderStepData, Channel } from '../types';
import type { TemplateLibraryRecord } from '../../../services/templateLibrary.types';
import { SOCIAL_WIREFRAMES } from '../../../constants/useCases';

export function mapTemplateToStepData(t: TemplateLibraryRecord): Partial<TemplateBuilderStepData> {
  const channelMap: Record<string, Channel> = {
    social: 'Social',
    programmatic: 'Programmatic',
    print: 'Print',
    signage: 'Digital Signage',
  };

  const ratios = t.adSizes.map((s) => s.label ?? `${s.width}:${s.height}`);

  const feedMappings: Record<string, string> = {};
  const uploadValues: Record<string, string> = {};
  const slotMappings: Record<string, string> = {};

  for (const [fieldId, mapping] of Object.entries(t.fieldMappings)) {
    if (mapping.source === 'feed') {
      feedMappings[fieldId] = mapping.column;
      if (mapping.slotId) slotMappings[fieldId] = mapping.slotId;
    } else if (mapping.source === 'upload') {
      uploadValues[fieldId] = mapping.assetPath;
    }
  }

  const wireframe = SOCIAL_WIREFRAMES.find((w) => w.id === t.scaffoldId);

  return {
    templateName: t.name,
    channel: channelMap[t.channel] ?? 'Social',
    ratios,
    selectedFeedId: t.datasourceId,
    selectedFeedName: t.datasourceName,
    brief: t.aiRequirements?.intent ?? t.brief ?? '',
    feedMappings,
    ...(Object.keys(uploadValues).length > 0 ? { uploadValues } : {}),
    ...(Object.keys(slotMappings).length > 0 ? { slotMappings } : {}),
    fieldTransforms: t.fieldTransforms ?? {},
    zoneStyles: t.zoneStyles,
    staticValues: t.staticValues,
    fieldSourceMode: t.fieldSourceMode,
    aiSuggestedMappings: t.aiSuggestedMappings,
    selectedWireframeId: t.scaffoldId,
    ...(wireframe ? { wireframeFile: wireframe.file } : {}),
    ...(t.brandOverrides?.primaryColor ? { backgroundColor: t.brandOverrides.primaryColor } : {}),
    ...(t.brandOverrides?.accentColor ? { accentColor: t.brandOverrides.accentColor } : {}),
    ...(t.logoVariant ? { logoVariant: t.logoVariant } : {}),
  };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/apps/template-builder/utils/mapTemplateToStepData.test.ts
```

Expected: `PASS` — 9 tests

- [ ] **Step 5: Commit**

```bash
git add src/apps/template-builder/utils/
git commit -m "feat(template-builder): extract mapTemplateToStepData to utils/"
```

---

## Task 2: Add `TemplateBuilderStep` type to `types.ts`

This is an additive-only change. No existing types are modified. The new interface mirrors `WizardStep` exactly so that step files need only an import path change (not property renames).

**Files:**
- Modify: `src/apps/template-builder/types.ts`

- [ ] **Step 1: Add the new type block**

Open `src/apps/template-builder/types.ts`. Add the following at the **top of the file**, before the existing `import type { SelectedFeed }` line:

```typescript
import type { ReactNode } from 'react';
import type { ValidationResult, ValidationRequirement, StepContext } from '../types';

// Re-export platform types so step files can import from a single local path
// after the migration. No duplication — these are re-exports, not copies.
export type { ValidationResult, ValidationRequirement, StepContext };

// Local alias for WizardStep — structurally identical to src/apps/types.ts#WizardStep.
// Severs the template-builder's import of the platform wizard type without
// requiring any changes to step definition objects (name, description, etc.).
export interface TemplateBuilderStep<
  S extends Record<string, unknown> = TemplateBuilderStepData
> {
  id: string;
  name: string;
  description?: string;
  render: (props: StepContext<S>) => ReactNode;
  validate: (data: S) => ValidationResult;
  onEnter?: (ctx: StepContext<S>) => void | Promise<void>;
  onLeave?: (ctx: StepContext<S>) => void | Promise<void>;
  next?: (ctx: StepContext<S>) => string | undefined;
  submit?: (ctx: StepContext<S>) => Promise<{ nextStepId?: string }>;
}
```

Note: `TemplateBuilderStepData` is defined later in the same file — TypeScript resolves forward references in interfaces, so this order is fine.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors. If there's a circular import error, move the `TemplateBuilderStep` block to *after* the `TemplateBuilderStepData` interface definition.

- [ ] **Step 3: Commit**

```bash
git add src/apps/template-builder/types.ts
git commit -m "feat(template-builder): add TemplateBuilderStep type to local types.ts"
```

---

## Task 3: Create `useStepNavigation` hook

This hook replicates every navigation behavior from `WizardShell.tsx`. It owns URL↔step routing, the `goNext`/`goBack`/`jumpTo` lifecycle, validation state, and loading state.

**Files:**
- Create: `src/apps/template-builder/hooks/useStepNavigation.ts`
- Create: `src/apps/template-builder/hooks/useStepNavigation.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/apps/template-builder/hooks/useStepNavigation.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import React from 'react';
import { useStepNavigation } from './useStepNavigation';
import type { TemplateBuilderStep } from '../types';
import type { StepContext } from '../../types';
import type { TemplateBuilderStepData } from '../types';

// Track the current URL for navigation assertions
function LocationTracker({ onPathname }: { onPathname: (p: string) => void }) {
  const loc = useLocation();
  React.useEffect(() => { onPathname(loc.pathname); }, [loc.pathname, onPathname]);
  return null;
}

// Helper: render the hook inside a route with /:stepId param
function renderWithRouter(
  initialPath: string,
  stepId: string,
  hookArgs: Parameters<typeof useStepNavigation>[0],
  onPathname?: (p: string) => void
) {
  let result: ReturnType<typeof useStepNavigation> | undefined;

  function Harness() {
    result = useStepNavigation(hookArgs);
    return null;
  }

  render(
    <MemoryRouter initialEntries={[initialPath]}>
      {onPathname && <LocationTracker onPathname={onPathname} />}
      <Routes>
        <Route path={`/app/:stepId`} element={<Harness />} />
        <Route path={`/app`} element={<Harness />} />
      </Routes>
    </MemoryRouter>
  );

  return () => result!;
}

// Minimal step factory
function makeStep(
  id: string,
  name: string,
  validate: TemplateBuilderStep['validate'] = () => ({ ok: true }),
  overrides: Partial<TemplateBuilderStep> = {}
): TemplateBuilderStep {
  return {
    id,
    name,
    render: () => null,
    validate,
    ...overrides,
  };
}

const emptyStepData: TemplateBuilderStepData = {};

function makeBuildContext(stepData = emptyStepData): () => StepContext<TemplateBuilderStepData> {
  return () => ({
    stepData,
    mergeStepData: vi.fn(),
    navigate: vi.fn(),
    client: { slug: 'acme' as never },
    creativeId: null,
  });
}

describe('useStepNavigation', () => {
  describe('findIndex', () => {
    it('returns step 0 when URL step ID is unknown', () => {
      const steps = [makeStep('setup', 'Setup'), makeStep('design', 'Design')];
      const getResult = renderWithRouter(
        '/app/nonexistent',
        'nonexistent',
        { steps, buildContext: makeBuildContext(), stepData: emptyStepData }
      );
      expect(getResult().currentStepIndex).toBe(0);
    });

    it('returns step 0 when no step ID in URL', () => {
      const steps = [makeStep('setup', 'Setup'), makeStep('design', 'Design')];
      const getResult = renderWithRouter(
        '/app',
        '',
        { steps, buildContext: makeBuildContext(), stepData: emptyStepData }
      );
      expect(getResult().currentStepIndex).toBe(0);
    });

    it('returns correct index for known step ID', () => {
      const steps = [makeStep('setup', 'Setup'), makeStep('design', 'Design')];
      const getResult = renderWithRouter(
        '/app/design',
        'design',
        { steps, buildContext: makeBuildContext(), stepData: emptyStepData }
      );
      expect(getResult().currentStepIndex).toBe(1);
    });
  });

  describe('validation reactivity', () => {
    it('validation.ok is false when validate returns ok:false', () => {
      const validate = vi.fn(() => ({ ok: false as const, reason: 'missing field' }));
      const steps = [makeStep('setup', 'Setup', validate)];
      const getResult = renderWithRouter(
        '/app/setup',
        'setup',
        { steps, buildContext: makeBuildContext(), stepData: emptyStepData }
      );
      expect(getResult().validation.ok).toBe(false);
    });

    it('validation.ok is true when validate returns ok:true', () => {
      const validate = vi.fn(() => ({ ok: true as const }));
      const steps = [makeStep('setup', 'Setup', validate)];
      const getResult = renderWithRouter(
        '/app/setup',
        'setup',
        { steps, buildContext: makeBuildContext(), stepData: emptyStepData }
      );
      expect(getResult().validation.ok).toBe(true);
    });

    it('isNextDisabled is true when validation fails', () => {
      const steps = [makeStep('setup', 'Setup', () => ({ ok: false as const }))];
      const getResult = renderWithRouter(
        '/app/setup',
        'setup',
        { steps, buildContext: makeBuildContext(), stepData: emptyStepData }
      );
      expect(getResult().isNextDisabled).toBe(true);
    });
  });

  describe('isLastStep', () => {
    it('returns true on the final step', () => {
      const steps = [makeStep('setup', 'Setup'), makeStep('publish', 'Publish')];
      const getResult = renderWithRouter(
        '/app/publish',
        'publish',
        { steps, buildContext: makeBuildContext(), stepData: emptyStepData }
      );
      expect(getResult().isLastStep).toBe(true);
    });

    it('returns false on non-final steps', () => {
      const steps = [makeStep('setup', 'Setup'), makeStep('publish', 'Publish')];
      const getResult = renderWithRouter(
        '/app/setup',
        'setup',
        { steps, buildContext: makeBuildContext(), stepData: emptyStepData }
      );
      expect(getResult().isLastStep).toBe(false);
    });
  });

  describe('goNext', () => {
    it('does not navigate when validation fails', async () => {
      const steps = [makeStep('setup', 'Setup', () => ({ ok: false as const })), makeStep('design', 'Design')];
      const pathHistory: string[] = [];
      const getResult = renderWithRouter(
        '/app/setup',
        'setup',
        { steps, buildContext: makeBuildContext(), stepData: emptyStepData },
        (p) => pathHistory.push(p)
      );
      await act(async () => { await getResult().goNext(); });
      // Only the initial /app/setup should be in history — no navigation
      expect(pathHistory.filter(p => p !== '/app/setup')).toHaveLength(0);
    });

    it('fires onLeave then onEnter in order before navigating', async () => {
      const order: string[] = [];
      const onLeave = vi.fn(async () => { order.push('onLeave'); });
      const onEnter = vi.fn(async () => { order.push('onEnter'); });
      const steps = [
        makeStep('setup', 'Setup', () => ({ ok: true as const }), { onLeave }),
        makeStep('design', 'Design', () => ({ ok: true as const }), { onEnter }),
      ];
      const pathHistory: string[] = [];
      const getResult = renderWithRouter(
        '/app/setup',
        'setup',
        { steps, buildContext: makeBuildContext(), stepData: emptyStepData },
        (p) => pathHistory.push(p)
      );
      await act(async () => { await getResult().goNext(); });
      expect(order).toEqual(['onLeave', 'onEnter']);
      await waitFor(() => {
        expect(pathHistory).toContain('/app/design');
      });
    });

    it('sets validationError from validation.reason when validation fails', async () => {
      const steps = [makeStep('setup', 'Setup', () => ({ ok: false as const, reason: 'fill in name' }))];
      const getResult = renderWithRouter(
        '/app/setup',
        'setup',
        { steps, buildContext: makeBuildContext(), stepData: emptyStepData }
      );
      await act(async () => { await getResult().goNext(); });
      expect(getResult().validationError).toBe('fill in name');
    });

    it('sets isLoading during async submit and clears it after', async () => {
      let resolveSubmit!: () => void;
      const submitPromise = new Promise<{ nextStepId?: string }>((res) => { resolveSubmit = () => res({}); });
      const submit = vi.fn(() => submitPromise);
      const steps = [
        makeStep('setup', 'Setup', () => ({ ok: true as const }), { submit }),
        makeStep('design', 'Design'),
      ];
      const getResult = renderWithRouter(
        '/app/setup',
        'setup',
        { steps, buildContext: makeBuildContext(), stepData: emptyStepData }
      );
      // Start goNext without awaiting
      act(() => { void getResult().goNext(); });
      // isLoading should be true while submit is pending
      await waitFor(() => expect(getResult().isLoading).toBe(true));
      // Resolve the submit
      await act(async () => { resolveSubmit(); });
      // isLoading should clear
      await waitFor(() => expect(getResult().isLoading).toBe(false));
    });
  });

  describe('goBack', () => {
    it('does not fire onLeave or onEnter — free move', async () => {
      const onLeave = vi.fn();
      const onEnter = vi.fn();
      const steps = [
        makeStep('setup', 'Setup', () => ({ ok: true as const }), { onLeave }),
        makeStep('design', 'Design', () => ({ ok: true as const }), { onEnter }),
      ];
      const pathHistory: string[] = [];
      const getResult = renderWithRouter(
        '/app/design',
        'design',
        { steps, buildContext: makeBuildContext(), stepData: emptyStepData },
        (p) => pathHistory.push(p)
      );
      act(() => { getResult().goBack(); });
      await waitFor(() => {
        expect(pathHistory).toContain('/app/setup');
      });
      expect(onLeave).not.toHaveBeenCalled();
      expect(onEnter).not.toHaveBeenCalled();
    });

    it('does nothing on step 0', () => {
      const steps = [makeStep('setup', 'Setup'), makeStep('design', 'Design')];
      const pathHistory: string[] = [];
      const getResult = renderWithRouter(
        '/app/setup',
        'setup',
        { steps, buildContext: makeBuildContext(), stepData: emptyStepData },
        (p) => pathHistory.push(p)
      );
      act(() => { getResult().goBack(); });
      expect(pathHistory.filter(p => p !== '/app/setup')).toHaveLength(0);
    });
  });

  describe('jumpTo', () => {
    it('navigates backward (index < currentStepIndex)', async () => {
      const steps = [makeStep('setup', 'Setup'), makeStep('design', 'Design'), makeStep('publish', 'Publish')];
      const pathHistory: string[] = [];
      const getResult = renderWithRouter(
        '/app/design',
        'design',
        { steps, buildContext: makeBuildContext(), stepData: emptyStepData },
        (p) => pathHistory.push(p)
      );
      act(() => { getResult().jumpTo(0); });
      await waitFor(() => {
        expect(pathHistory).toContain('/app/setup');
      });
    });

    it('does NOT navigate to the current step (index === currentStepIndex)', () => {
      const steps = [makeStep('setup', 'Setup'), makeStep('design', 'Design')];
      const pathHistory: string[] = [];
      const getResult = renderWithRouter(
        '/app/design',
        'design',
        { steps, buildContext: makeBuildContext(), stepData: emptyStepData },
        (p) => pathHistory.push(p)
      );
      act(() => { getResult().jumpTo(1); }); // index 1 === currentStepIndex 1
      expect(pathHistory.filter(p => p !== '/app/design')).toHaveLength(0);
    });

    it('does NOT navigate forward (index > currentStepIndex)', () => {
      const steps = [makeStep('setup', 'Setup'), makeStep('design', 'Design'), makeStep('publish', 'Publish')];
      const pathHistory: string[] = [];
      const getResult = renderWithRouter(
        '/app/setup',
        'setup',
        { steps, buildContext: makeBuildContext(), stepData: emptyStepData },
        (p) => pathHistory.push(p)
      );
      act(() => { getResult().jumpTo(2); }); // forward jump — should be blocked
      expect(pathHistory.filter(p => p !== '/app/setup')).toHaveLength(0);
    });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/apps/template-builder/hooks/useStepNavigation.test.tsx
```

Expected: `FAIL` — `Cannot find module './useStepNavigation'`

- [ ] **Step 3: Create `hooks/useStepNavigation.ts`**

Create `src/apps/template-builder/hooks/useStepNavigation.ts`:

```typescript
import { useCallback, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { TemplateBuilderStep } from '../types';
import type { StepContext, ValidationResult } from '../../types';
import type { TemplateBuilderStepData } from '../types';

interface UseStepNavigationOptions {
  steps: TemplateBuilderStep<TemplateBuilderStepData>[];
  buildContext: () => StepContext<TemplateBuilderStepData>;
  stepData: TemplateBuilderStepData;
}

interface UseStepNavigationReturn {
  currentStepIndex: number;
  currentStep: TemplateBuilderStep<TemplateBuilderStepData> | undefined;
  isLoading: boolean;
  validationError: string | null;
  setValidationError: (e: string | null) => void;
  validation: ValidationResult;
  isNextDisabled: boolean;
  isLastStep: boolean;
  goNext: () => Promise<void>;
  goBack: () => void;
  jumpTo: (index: number) => void;
  navigateToStep: (stepId: string, replace: boolean) => void;
}

export function useStepNavigation({
  steps,
  buildContext,
  stepData,
}: UseStepNavigationOptions): UseStepNavigationReturn {
  const params = useParams<{ stepId?: string; '*'?: string }>();
  const splatPath = params['*']?.split('/')[0] ?? '';
  const urlStepId = params.stepId ?? (splatPath || undefined);

  const navigateRouter = useNavigate();
  const location = useLocation();

  const [validationError, setValidationError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Exact replica of WizardShell lines 112-117.
  const basePathname = useMemo(() => {
    const path = location.pathname.replace(/\/+$/, '');
    if (!urlStepId) return path;
    const suffix = `/${urlStepId}`;
    return path.endsWith(suffix) ? path.slice(0, -suffix.length) : path;
  }, [location.pathname, urlStepId]);

  const navigateToStep = useCallback(
    (stepId: string, replace: boolean) => {
      navigateRouter(`${basePathname}/${stepId}`, { replace });
    },
    [basePathname, navigateRouter]
  );

  // Returns 0 for missing or unknown step IDs — exact replica of WizardShell lines 139-146.
  // No redirect useEffect needed: step 0 renders immediately.
  const findIndex = useCallback(
    (id: string | undefined): number => {
      if (!id) return 0;
      const idx = steps.findIndex((s) => s.id === id);
      return idx >= 0 ? idx : 0;
    },
    [steps]
  );

  const currentStepIndex = findIndex(urlStepId);
  const currentStep = steps[currentStepIndex];

  // stepData is a direct dep — same dep chain as WizardShell line 231.
  // Ensures the checklist updates immediately as the user fills the form.
  const validation: ValidationResult = useMemo(
    () => (currentStep ? currentStep.validate(stepData) : { ok: true }),
    [currentStep, stepData]
  );

  const isNextDisabled = isLoading || !validation.ok;
  const isLastStep = currentStepIndex === steps.length - 1;

  // Forward advance with onLeave → onEnter — exact replica of WizardShell lines 185-207.
  const advanceToIndex = useCallback(
    async (nextIndex: number) => {
      const outgoing = steps[currentStepIndex];
      const incoming = steps[nextIndex];
      if (!incoming) return;

      setIsLoading(true);
      try {
        const ctx = buildContext();
        if (outgoing?.onLeave) await outgoing.onLeave(ctx);
        if (incoming.onEnter) await incoming.onEnter(ctx);
        navigateToStep(incoming.id, true);
      } catch (err) {
        console.warn(
          `[template-builder] advance from "${outgoing?.id}" to "${incoming.id}" aborted —`,
          err
        );
      } finally {
        setIsLoading(false);
      }
    },
    [steps, currentStepIndex, buildContext, navigateToStep]
  );

  // Free backward move — no hooks fired. Exact replica of WizardShell lines 217-224.
  const rewindToIndex = useCallback(
    (nextIndex: number) => {
      const incoming = steps[nextIndex];
      if (!incoming) return;
      navigateToStep(incoming.id, true);
    },
    [steps, navigateToStep]
  );

  // Exact replica of WizardShell lines 234-309.
  const goNext = useCallback(async () => {
    setValidationError(null);

    if (!validation.ok) {
      if ('reason' in validation && validation.reason) {
        setValidationError(validation.reason);
      }
      return;
    }

    if (currentStep?.submit) {
      setIsLoading(true);
      try {
        const result = await currentStep.submit(buildContext());
        let targetIndex = currentStepIndex + 1;

        if (result?.nextStepId) {
          const idx = steps.findIndex((s) => s.id === result.nextStepId);
          if (idx >= 0) {
            targetIndex = idx;
          } else {
            console.warn(
              `[template-builder] step "${currentStep.id}".submit() returned unknown nextStepId "${result.nextStepId}" — falling back to advance-by-index.`
            );
          }
        }

        if (targetIndex === currentStepIndex) return;
        if (targetIndex >= steps.length) return;

        const incoming = steps[targetIndex];
        if (!incoming) return;

        const ctx = buildContext();
        if (currentStep.onLeave) await currentStep.onLeave(ctx);
        if (incoming.onEnter) await incoming.onEnter(ctx);
        navigateToStep(incoming.id, true);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Submit failed';
        setValidationError(message);
        console.warn(
          `[template-builder] step "${currentStep.id}".submit() rejected —`,
          err
        );
      } finally {
        setIsLoading(false);
      }
      return;
    }

    let targetIndex = currentStepIndex + 1;
    if (currentStep?.next) {
      const proposed = currentStep.next(buildContext());
      if (typeof proposed === 'string') {
        const idx = steps.findIndex((s) => s.id === proposed);
        if (idx >= 0) {
          targetIndex = idx;
        } else {
          console.warn(
            `[template-builder] step "${currentStep.id}".next() returned unknown id "${proposed}" — falling back to advance-by-index.`
          );
        }
      }
    }

    if (targetIndex >= steps.length) return;
    await advanceToIndex(targetIndex);
  }, [
    validation,
    currentStep,
    currentStepIndex,
    steps,
    buildContext,
    navigateToStep,
    advanceToIndex,
  ]);

  // Exact replica of WizardShell lines 311-315.
  const goBack = useCallback(() => {
    setValidationError(null);
    if (currentStepIndex <= 0) return;
    rewindToIndex(currentStepIndex - 1);
  }, [currentStepIndex, rewindToIndex]);

  // Uses < (not <=) to avoid self-navigation on the active step.
  const jumpTo = useCallback(
    (index: number) => {
      if (index < currentStepIndex && !isLoading) {
        rewindToIndex(index);
      }
    },
    [currentStepIndex, isLoading, rewindToIndex]
  );

  return {
    currentStepIndex,
    currentStep,
    isLoading,
    validationError,
    setValidationError,
    validation,
    isNextDisabled,
    isLastStep,
    goNext,
    goBack,
    jumpTo,
    navigateToStep,
  };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/apps/template-builder/hooks/useStepNavigation.test.tsx
```

Expected: `PASS` — all tests green

- [ ] **Step 5: Commit**

```bash
git add src/apps/template-builder/hooks/
git commit -m "feat(template-builder): add useStepNavigation hook with tests"
```

---

## Task 4: Create `TemplateBuilderStepper` component

Exact visual replica of WizardShell's `<nav>` stepper (lines 345–426). Every Tailwind class, `data-testid`, and icon is sourced directly from `WizardShell.tsx`.

**Files:**
- Create: `src/apps/template-builder/components/TemplateBuilderStepper.tsx`
- Create: `src/apps/template-builder/components/TemplateBuilderStepper.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/apps/template-builder/components/TemplateBuilderStepper.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TemplateBuilderStepper from './TemplateBuilderStepper';
import type { TemplateBuilderStep } from '../types';

const steps: TemplateBuilderStep[] = [
  { id: 'setup', name: 'Setup', render: () => null, validate: () => ({ ok: true }) },
  { id: 'design', name: 'Design & Map', render: () => null, validate: () => ({ ok: true }) },
  { id: 'publish', name: 'Publish', render: () => null, validate: () => ({ ok: true }) },
];

describe('TemplateBuilderStepper', () => {
  it('renders data-testid="wizard-breadcrumb"', () => {
    render(
      <TemplateBuilderStepper steps={steps} currentStepIndex={0} isLoading={false} onStepClick={vi.fn()} />
    );
    expect(screen.getByTestId('wizard-breadcrumb')).toBeDefined();
  });

  it('renders data-testid for each step', () => {
    render(
      <TemplateBuilderStepper steps={steps} currentStepIndex={0} isLoading={false} onStepClick={vi.fn()} />
    );
    expect(screen.getByTestId('breadcrumb-setup')).toBeDefined();
    expect(screen.getByTestId('breadcrumb-design')).toBeDefined();
    expect(screen.getByTestId('breadcrumb-publish')).toBeDefined();
  });

  it('sets data-active="true" only on the current step', () => {
    render(
      <TemplateBuilderStepper steps={steps} currentStepIndex={1} isLoading={false} onStepClick={vi.fn()} />
    );
    expect(screen.getByTestId('breadcrumb-setup').getAttribute('data-active')).toBe('false');
    expect(screen.getByTestId('breadcrumb-design').getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('breadcrumb-publish').getAttribute('data-active')).toBe('false');
  });

  it('renders step names as text labels', () => {
    render(
      <TemplateBuilderStepper steps={steps} currentStepIndex={0} isLoading={false} onStepClick={vi.fn()} />
    );
    expect(screen.getByText('Setup')).toBeDefined();
    expect(screen.getByText('Design & Map')).toBeDefined();
    expect(screen.getByText('Publish')).toBeDefined();
  });

  it('calls onStepClick with the clicked index', async () => {
    const user = userEvent.setup();
    const onStepClick = vi.fn();
    render(
      <TemplateBuilderStepper steps={steps} currentStepIndex={2} isLoading={false} onStepClick={onStepClick} />
    );
    const buttons = screen.getAllByRole('button');
    await user.click(buttons[0]); // click Setup circle
    expect(onStepClick).toHaveBeenCalledWith(0);
  });

  it('marks aria-current="step" on the current step circle', () => {
    render(
      <TemplateBuilderStepper steps={steps} currentStepIndex={1} isLoading={false} onStepClick={vi.fn()} />
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons[0].getAttribute('aria-current')).toBeNull();
    expect(buttons[1].getAttribute('aria-current')).toBe('step');
    expect(buttons[2].getAttribute('aria-current')).toBeNull();
  });

  it('complete step circle has bg-blue-600 class', () => {
    render(
      <TemplateBuilderStepper steps={steps} currentStepIndex={2} isLoading={false} onStepClick={vi.fn()} />
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons[0].className).toContain('bg-blue-600');
    expect(buttons[1].className).toContain('bg-blue-600');
  });

  it('current step circle has border-blue-600 class', () => {
    render(
      <TemplateBuilderStepper steps={steps} currentStepIndex={1} isLoading={false} onStepClick={vi.fn()} />
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons[1].className).toContain('border-blue-600');
  });

  it('upcoming step circle has border-gray-300 class', () => {
    render(
      <TemplateBuilderStepper steps={steps} currentStepIndex={0} isLoading={false} onStepClick={vi.fn()} />
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons[2].className).toContain('border-gray-300');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/apps/template-builder/components/TemplateBuilderStepper.test.tsx
```

Expected: `FAIL` — `Cannot find module './TemplateBuilderStepper'`

- [ ] **Step 3: Create `components/TemplateBuilderStepper.tsx`**

Create `src/apps/template-builder/components/TemplateBuilderStepper.tsx`:

```tsx
import { CheckIcon } from '@heroicons/react/24/outline';
import { cn } from '../../../utils/cn';
import type { TemplateBuilderStep } from '../types';
import type { TemplateBuilderStepData } from '../types';

interface TemplateBuilderStepperProps {
  steps: TemplateBuilderStep<TemplateBuilderStepData>[];
  currentStepIndex: number;
  isLoading: boolean;
  onStepClick: (index: number) => void;
}

export default function TemplateBuilderStepper({
  steps,
  currentStepIndex,
  isLoading,
  onStepClick,
}: TemplateBuilderStepperProps) {
  return (
    <nav aria-label="wizard-progress" data-testid="wizard-breadcrumb">
      <ol className="flex w-full items-center">
        {steps.map((step, index) => {
          const status =
            index < currentStepIndex
              ? 'complete'
              : index === currentStepIndex
              ? 'current'
              : 'upcoming';

          return (
            <li
              key={step.id}
              className="relative flex w-full flex-1 flex-col items-center text-center"
              data-testid={`breadcrumb-${step.id}`}
              data-active={index === currentStepIndex ? 'true' : 'false'}
            >
              {/* Connector lines — exact replica of WizardShell lines 363-384 */}
              <div className="absolute inset-x-0 top-4 flex h-[2px] items-center">
                <div
                  className={cn(
                    'h-full w-1/2 transition-all duration-500',
                    index === 0
                      ? 'bg-transparent'
                      : index <= currentStepIndex
                      ? 'bg-blue-600'
                      : 'bg-gray-300'
                  )}
                />
                <div
                  className={cn(
                    'h-full w-1/2 transition-all duration-500',
                    index === steps.length - 1
                      ? 'bg-transparent'
                      : index < currentStepIndex
                      ? 'bg-blue-600'
                      : 'bg-gray-300'
                  )}
                />
              </div>

              <button
                type="button"
                onClick={() => onStepClick(index)}
                className={cn(
                  'relative z-10 flex h-8 w-8 items-center justify-center rounded-full',
                  status === 'complete' && 'bg-blue-600 hover:bg-blue-700',
                  status === 'current' && 'border-2 border-blue-600 bg-white',
                  status === 'upcoming' && 'border-2 border-gray-300 bg-white'
                )}
                aria-current={status === 'current' ? 'step' : undefined}
              >
                {status === 'complete' && (
                  <CheckIcon className="h-5 w-5 text-white" />
                )}
                {status === 'current' && (
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                )}
                {status === 'upcoming' && (
                  <span className="h-2.5 w-2.5 rounded-full bg-transparent" />
                )}
              </button>

              <span
                className={cn(
                  'mt-2 whitespace-nowrap text-xs font-medium',
                  status === 'current' ? 'text-blue-600' : 'text-blue-gray-500'
                )}
              >
                {step.name}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/apps/template-builder/components/TemplateBuilderStepper.test.tsx
```

Expected: `PASS` — all tests green

- [ ] **Step 5: Commit**

```bash
git add src/apps/template-builder/components/TemplateBuilderStepper.tsx src/apps/template-builder/components/TemplateBuilderStepper.test.tsx
git commit -m "feat(template-builder): add TemplateBuilderStepper component with tests"
```

---

## Task 5: Create `TemplateBuilderFooter` component

Renders the footer section inside the content card — `mt-12 pt-8 border-t` — exactly as WizardShell lines 452–542. Does not own the card itself (that's AppRoot). Does not own the validation error paragraph (also AppRoot, above the footer).

**Files:**
- Create: `src/apps/template-builder/components/TemplateBuilderFooter.tsx`
- Create: `src/apps/template-builder/components/TemplateBuilderFooter.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/apps/template-builder/components/TemplateBuilderFooter.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import TemplateBuilderFooter from './TemplateBuilderFooter';

const defaultProps = {
  currentStepIndex: 0,
  isLoading: false,
  isLastStep: false,
  isNextDisabled: false,
  requirements: null,
  clientSlug: 'acme',
  nextStepName: 'Design & Map',
  onNext: vi.fn(),
  onBack: vi.fn(),
  onDiscard: vi.fn(),
};

// Footer uses useNavigate — must be wrapped in MemoryRouter
function renderFooter(props = {}) {
  return render(
    <MemoryRouter>
      <TemplateBuilderFooter {...defaultProps} {...props} />
    </MemoryRouter>
  );
}

describe('TemplateBuilderFooter', () => {
  it('renders data-testid="wizard-save-exit"', () => {
    renderFooter();
    expect(screen.getByTestId('wizard-save-exit')).toBeDefined();
  });

  it('renders data-testid="wizard-discard"', () => {
    renderFooter();
    expect(screen.getByTestId('wizard-discard')).toBeDefined();
  });

  it('renders Continue button with dynamic next step label', () => {
    renderFooter({ isLastStep: false, nextStepName: 'Design & Map' });
    expect(screen.getByRole('button', { name: /Next: Design & Map →/ })).toBeDefined();
  });

  it('does NOT render Continue button on the last step', () => {
    renderFooter({ isLastStep: true });
    expect(screen.queryByRole('button', { name: /Next:/ })).toBeNull();
  });

  it('renders "← Previous Step" button', () => {
    renderFooter();
    expect(screen.getByRole('button', { name: /← Previous Step/ })).toBeDefined();
  });

  it('Previous Step button is disabled on step 0', () => {
    renderFooter({ currentStepIndex: 0 });
    const btn = screen.getByRole('button', { name: /← Previous Step/ });
    expect(btn.hasAttribute('disabled')).toBe(true);
  });

  it('Previous Step button is enabled on step > 0', () => {
    renderFooter({ currentStepIndex: 1 });
    const btn = screen.getByRole('button', { name: /← Previous Step/ });
    expect(btn.hasAttribute('disabled')).toBe(false);
  });

  it('Continue button shows "Loading..." when isLoading is true', () => {
    renderFooter({ isLoading: true, isLastStep: false });
    expect(screen.getByRole('button', { name: /Loading.../ })).toBeDefined();
  });

  it('Continue button is disabled when isNextDisabled', () => {
    renderFooter({ isNextDisabled: true, isLastStep: false });
    const btn = screen.getByRole('button', { name: /Next:/ });
    expect(btn.hasAttribute('disabled')).toBe(true);
  });

  it('renders requirements checklist when requirements provided', () => {
    renderFooter({
      requirements: [
        { label: 'Template name', met: true },
        { label: 'Channel', met: false },
      ],
    });
    expect(screen.getByTestId('wizard-requirements')).toBeDefined();
    expect(screen.getByTestId('wizard-requirement-Template name')).toBeDefined();
    expect(screen.getByTestId('wizard-requirement-Channel')).toBeDefined();
  });

  it('sets data-met="true" for met requirements', () => {
    renderFooter({
      requirements: [{ label: 'Template name', met: true }],
    });
    expect(screen.getByTestId('wizard-requirement-Template name').getAttribute('data-met')).toBe('true');
  });

  it('sets data-met="false" for unmet requirements', () => {
    renderFooter({
      requirements: [{ label: 'Channel', met: false }],
    });
    expect(screen.getByTestId('wizard-requirement-Channel').getAttribute('data-met')).toBe('false');
  });

  it('does NOT render requirements section when requirements is null', () => {
    renderFooter({ requirements: null });
    expect(screen.queryByTestId('wizard-requirements')).toBeNull();
  });

  it('calls onNext when Continue is clicked', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    renderFooter({ onNext });
    await user.click(screen.getByRole('button', { name: /Next:/ }));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('calls onBack when Previous Step is clicked (step > 0)', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    renderFooter({ currentStepIndex: 1, onBack });
    await user.click(screen.getByRole('button', { name: /← Previous Step/ }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('shows discard confirm with exact text and calls onDiscard on OK', async () => {
    const user = userEvent.setup();
    const onDiscard = vi.fn();
    vi.stubGlobal('confirm', () => true);
    renderFooter({ onDiscard });
    await user.click(screen.getByTestId('wizard-discard'));
    expect(window.confirm).toHaveBeenCalledWith(
      'Discard this template? All unsaved work will be lost and cannot be recovered.'
    );
    expect(onDiscard).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('does NOT call onDiscard when confirm is cancelled', async () => {
    const user = userEvent.setup();
    const onDiscard = vi.fn();
    vi.stubGlobal('confirm', () => false);
    renderFooter({ onDiscard });
    await user.click(screen.getByTestId('wizard-discard'));
    expect(onDiscard).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/apps/template-builder/components/TemplateBuilderFooter.test.tsx
```

Expected: `FAIL` — `Cannot find module './TemplateBuilderFooter'`

- [ ] **Step 3: Create `components/TemplateBuilderFooter.tsx`**

Create `src/apps/template-builder/components/TemplateBuilderFooter.tsx`:

```tsx
import { CheckIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../../utils/cn';
import type { ValidationRequirement } from '../../types';

interface TemplateBuilderFooterProps {
  currentStepIndex: number;
  isLoading: boolean;
  isLastStep: boolean;
  isNextDisabled: boolean;
  requirements: ValidationRequirement[] | null;
  clientSlug: string;
  nextStepName: string | undefined;
  onNext: () => void;
  onBack: () => void;
  onDiscard: () => void;
}

export default function TemplateBuilderFooter({
  currentStepIndex,
  isLoading,
  isLastStep,
  isNextDisabled,
  requirements,
  clientSlug,
  nextStepName,
  onNext,
  onBack,
  onDiscard,
}: TemplateBuilderFooterProps) {
  const navigateRouter = useNavigate();

  return (
    <div className="mt-12 pt-8 border-t border-gray-100 space-y-4">
      {/* Requirements checklist — exact replica of WizardShell lines 453-480 */}
      {requirements ? (
        <div
          className="flex items-center justify-end gap-6"
          data-testid="wizard-requirements"
        >
          {requirements.map(({ label, met }) => (
            <div
              key={label}
              className={cn(
                'flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest transition-colors',
                met ? 'text-green-600' : 'text-gray-300'
              )}
              data-testid={`wizard-requirement-${label}`}
              data-met={met ? 'true' : 'false'}
            >
              <div
                className={cn(
                  'h-4 w-4 rounded-full flex items-center justify-center border transition-all',
                  met ? 'bg-green-500 border-green-500' : 'border-gray-200 bg-white'
                )}
              >
                {met && <CheckIcon className="h-2.5 w-2.5 text-white" />}
              </div>
              {label}
            </div>
          ))}
        </div>
      ) : null}

      {/* Button row — exact replica of WizardShell lines 482-541 */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          disabled={currentStepIndex === 0 || isLoading}
          className={cn(
            'rounded-xl px-5 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] transition-all',
            currentStepIndex === 0 || isLoading
              ? 'cursor-not-allowed text-gray-200'
              : 'text-blue-gray-400 border border-gray-100 hover:bg-gray-50'
          )}
        >
          ← Previous Step
        </button>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigateRouter(`/adlabs/${clientSlug}`)}
            data-testid="wizard-save-exit"
            className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 border border-gray-200 rounded-xl px-4 py-2 hover:bg-gray-50"
          >
            Save &amp; Exit
          </button>

          <button
            type="button"
            onClick={() => {
              if (
                !window.confirm(
                  'Discard this template? All unsaved work will be lost and cannot be recovered.'
                )
              )
                return;
              onDiscard();
            }}
            data-testid="wizard-discard"
            className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 hover:text-red-500"
          >
            Discard
          </button>

          {/* Not rendered on last step — exact replica of WizardShell line 522 */}
          {!isLastStep && (
            <button
              type="button"
              onClick={() => void onNext()}
              disabled={isNextDisabled}
              className={cn(
                'rounded-xl bg-blue-600 px-8 py-3 text-[10px] font-black text-white uppercase tracking-[0.2em] shadow-xl transition-all active:scale-95 flex items-center gap-2',
                isNextDisabled
                  ? 'opacity-20 cursor-not-allowed grayscale bg-gray-400 shadow-none'
                  : 'hover:bg-blue-700 hover:shadow-blue-200'
              )}
            >
              {isLoading && <ArrowPathIcon className="h-3 w-3 animate-spin" />}
              {isLoading
                ? 'Loading...'
                : `Next: ${nextStepName ?? 'Continue'} →`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/apps/template-builder/components/TemplateBuilderFooter.test.tsx
```

Expected: `PASS` — all tests green

- [ ] **Step 5: Commit**

```bash
git add src/apps/template-builder/components/TemplateBuilderFooter.tsx src/apps/template-builder/components/TemplateBuilderFooter.test.tsx
git commit -m "feat(template-builder): add TemplateBuilderFooter component with tests"
```

---

## Task 6: Rewrite `AppRoot.tsx`

Replace the thin `WizardShell` wrapper with a full orchestrator that owns step data, routing, lifecycle, and rendering. All providers stay. Template prefill logic stays. The visual structure replicates WizardShell lines 327–546 exactly.

**Files:**
- Modify: `src/apps/template-builder/AppRoot.tsx` (full rewrite)

- [ ] **Step 1: Read the current `AppRoot.tsx` one more time**

Confirm you understand what the current file does (lines 1–149):
- Lines 1–14: imports
- Lines 19–65: `mapTemplateToStepData` function (to be removed — now in utils/)
- Lines 71–149: `TemplateBuilderAppRoot` component

- [ ] **Step 2: Overwrite `AppRoot.tsx` with the new implementation**

Replace the entire file content with:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { usePageTitle } from '../../hooks/usePageTitle';
import { useCurrentClient } from '../../platform/client/useCurrentClient';
import { usePersistedStepData } from '../../platform/wizard/usePersistedStepData';
import { SharedDataProvider } from '../../platform/wizard/SharedDataContext';
import { AssetHouseProvider } from '../../platform/assetHouse/AssetHouseContext';
import { TemplateBuilderProvider } from './TemplateBuilderContext';
import { templateLibraryService } from '../../services/templateLibrary';
import type { ClientSlug } from '../../platform/firebase/paths';
import manifest from './manifest';
import type { TemplateBuilderStepData } from './types';
import { mapTemplateToStepData } from './utils/mapTemplateToStepData';
import TemplateBuilderStepper from './components/TemplateBuilderStepper';
import TemplateBuilderFooter from './components/TemplateBuilderFooter';
import { useStepNavigation } from './hooks/useStepNavigation';

export default function TemplateBuilderAppRoot() {
  // urlSlug is synchronous — always non-null in production routes /:clientSlug/...
  // useCurrentClient resolves asynchronously; fall back only for tests.
  const { clientSlug: urlSlug } = useParams<{ clientSlug: string }>();
  const [searchParams] = useSearchParams();
  const navigateRouter = useNavigate();
  const { currentClient } = useCurrentClient();
  const slug = urlSlug ?? currentClient?.slug ?? '';

  const fromTemplateId = searchParams.get('from');
  const isCopy = searchParams.get('copy') === '1';
  const resumeId = searchParams.get('creative');

  usePageTitle(manifest.title);

  // Template prefill state — exact replica of existing AppRoot.tsx lines 82-122
  const [fromData, setFromData] = useState<Partial<TemplateBuilderStepData> | null>(null);
  const [loading, setLoading] = useState(!!fromTemplateId);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!fromTemplateId) {
      setLoading(false);
      return;
    }
    if (!slug) return;
    templateLibraryService
      .getTemplate(slug as ClientSlug, fromTemplateId)
      .then((template) => {
        const data = mapTemplateToStepData(template);
        if (isCopy) {
          data.templateName = `Copy of ${template.name}`;
        }
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(`wiz_${slug}_template-builder`);
        }
        setFromData(data);
      })
      .catch((err: Error) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, [fromTemplateId, slug, isCopy]);

  // Override initialStepData when prefill is set so usePersistedStepData hydrates
  // with the template values.
  const resolvedManifest = useMemo(() => {
    if (!fromData) return manifest;
    const prefilledData = fromData;
    return {
      ...manifest,
      initialStepData: (): TemplateBuilderStepData => ({
        ...manifest.initialStepData(),
        ...prefilledData,
      }),
    };
  }, [fromData]);

  // Clear stale localStorage synchronously before usePersistedStepData mounts
  // when ?from= is set. This prevents the hydration effect from reading the
  // stale session before the async fetch clears it in .then().
  const prefillSessionCleared = useRef(false);
  if (fromTemplateId && slug && !prefillSessionCleared.current) {
    prefillSessionCleared.current = true;
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(`wiz_${slug}_template-builder`);
    }
  }

  // localStorage key: wiz_${slug}_template-builder — identical to WizardShell
  // because same hook + same manifest.id = 'template-builder'.
  const { stepData, mergeStepData, creativeId, discard } = usePersistedStepData<TemplateBuilderStepData>({
    manifest: resolvedManifest,
    clientSlug: slug,
    resumeId,
  });

  // Mount effect — replicates WizardShell lines 151-162.
  // manifest.ts does not define onMount today; this is forward-compat.
  const mountedRef = useRef(false);
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    if (resolvedManifest.onMount) {
      void resolvedManifest.onMount({ client: { slug: slug as ClientSlug }, creativeId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // navigateToStepRef lets buildContext.navigate call navigateToStep from useStepNavigation
  // without creating a circular hook dependency.
  const navigateToStepRef = useRef<(stepId: string, replace: boolean) => void>(
    () => { /* populated after useStepNavigation runs below */ }
  );

  const buildContext = useCallback(
    () => ({
      stepData,
      mergeStepData,
      navigate: ({ stepId, replace = true }: { stepId?: string; replace?: boolean }) => {
        if (stepId) navigateToStepRef.current(stepId, replace);
      },
      client: { slug: slug as ClientSlug },
      creativeId,
    }),
    [stepData, mergeStepData, slug, creativeId]
  );

  const {
    currentStepIndex,
    currentStep,
    isLoading,
    validationError,
    validation,
    isNextDisabled,
    isLastStep,
    goNext,
    goBack,
    jumpTo,
    navigateToStep,
  } = useStepNavigation({
    steps: resolvedManifest.steps,
    buildContext,
    stepData,
  });

  // Keep the ref in sync so buildContext.navigate is always current.
  useEffect(() => {
    navigateToStepRef.current = navigateToStep;
  }, [navigateToStep]);

  // Exact replica of WizardShell lines 319-322.
  const requirements =
    !validation.ok &&
    Array.isArray((validation as { requirements?: unknown }).requirements) &&
    (validation as { requirements: { label: string; met: boolean }[] }).requirements.length > 0
      ? (validation as { requirements: { label: string; met: boolean }[] }).requirements
      : null;

  // Stable render props — exact replica of WizardShell line 317.
  const renderProps = useMemo(() => buildContext(), [buildContext]);

  async function handleDiscard() {
    await discard();
    navigateRouter(`/adlabs/${slug}`);
  }

  // Blocking loading/error states — exact replica of existing AppRoot.tsx lines 124-138
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-red-600">Failed to load template: {loadError}</p>
      </div>
    );
  }

  // Happy path — exact structural replica of WizardShell lines 327-546
  return (
    <SharedDataProvider clientSlug={slug}>
      <AssetHouseProvider clientSlug={slug}>
        <TemplateBuilderProvider>
          <div className="space-y-8" data-testid="wizard-shell">

            {/* Back link + title + description — WizardShell lines 329-342 */}
            <div>
              <Link
                to="/"
                className="inline-flex items-center gap-1 text-sm font-medium text-blue-gray-500 hover:text-blue-600"
              >
                <ArrowLeftIcon className="h-4 w-4" />
                Back to workflows
              </Link>
              <h1 className="mt-3 text-2xl font-semibold text-gray-900">
                {resolvedManifest.title}
              </h1>
              {resolvedManifest.description && (
                <p className="mt-1 text-sm text-blue-gray-600">
                  {resolvedManifest.description}
                </p>
              )}
            </div>

            {/* Progress stepper */}
            <TemplateBuilderStepper
              steps={resolvedManifest.steps}
              currentStepIndex={currentStepIndex}
              isLoading={isLoading}
              onStepClick={jumpTo}
            />

            {/* Content card — WizardShell lines 429-543 */}
            <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-card">
              <div className="text-center">
                <h2 className="text-lg font-semibold text-gray-900">
                  {currentStep?.name}
                </h2>
                {currentStep?.description && (
                  <p className="mt-1 text-sm text-blue-gray-500">
                    {currentStep.description}
                  </p>
                )}
                <div
                  className="mt-8"
                  data-testid={`step-body-${currentStep?.id}`}
                >
                  {currentStep?.render(renderProps)}
                </div>
              </div>

              {/* Validation error — inside card, above footer — WizardShell lines 440-449 */}
              {validationError && !requirements ? (
                <p
                  role="alert"
                  data-testid="wizard-validation-error"
                  className="mt-6 text-center text-sm text-red-600"
                >
                  {validationError}
                </p>
              ) : null}

              {/* Footer is inside the card — WizardShell line 452 is inside the card that starts at line 429 */}
              <TemplateBuilderFooter
                currentStepIndex={currentStepIndex}
                isLoading={isLoading}
                isLastStep={isLastStep}
                isNextDisabled={isNextDisabled}
                requirements={requirements}
                clientSlug={slug}
                nextStepName={resolvedManifest.steps[currentStepIndex + 1]?.name}
                onNext={goNext}
                onBack={goBack}
                onDiscard={handleDiscard}
              />
            </div>

          </div>
        </TemplateBuilderProvider>
      </AssetHouseProvider>
    </SharedDataProvider>
  );
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors. Common errors and fixes:
- `Cannot find module '../../hooks/usePageTitle'` — check the exact path in WizardShell.tsx line 2; it's `'../../hooks/usePageTitle'`
- `Property 'onMount' does not exist` — add `?` optional chain: `resolvedManifest.onMount?.()`
- `Type 'S' is not assignable` — the manifest.steps array is typed as `WizardStep<TemplateBuilderStepData>[]` from `src/apps/types.ts`, while `useStepNavigation` expects `TemplateBuilderStep[]`. Since `TemplateBuilderStep` mirrors `WizardStep` structurally, TypeScript should accept it. If not, cast: `resolvedManifest.steps as TemplateBuilderStep<TemplateBuilderStepData>[]`

- [ ] **Step 4: Run existing tests to confirm nothing broke**

```bash
npx vitest run src/apps/template-builder/manifest.test.ts
npx vitest run src/apps/_registry.test.ts
npx vitest run src/platform/wizard/WizardShell.test.tsx
```

All three must pass. These tests do not import AppRoot, so they should be unaffected.

- [ ] **Step 5: Commit**

```bash
git add src/apps/template-builder/AppRoot.tsx
git commit -m "feat(template-builder): rewrite AppRoot as self-contained orchestrator (no WizardShell)"
```

---

## Task 7: Update step file import paths

All three step files import `WizardStep` and `StepRenderProps` from `'../../types'` (the platform types file). After the migration these should come from `'../types'` (the template-builder local types file). This is an import-path-only change — no logic, no property renames.

**Files:**
- Modify: `src/apps/template-builder/steps/SetupStep.tsx`
- Modify: `src/apps/template-builder/steps/DesignStep.tsx`
- Modify: `src/apps/template-builder/steps/PublishStep.tsx`

### SetupStep.tsx

- [ ] **Step 1: Update imports in SetupStep.tsx**

Find line 3 of `src/apps/template-builder/steps/SetupStep.tsx`:
```typescript
import type { WizardStep, StepRenderProps } from '../../types';
```
Replace with:
```typescript
import type { TemplateBuilderStep, StepContext } from '../types';
```

Find all occurrences of `WizardStep<TemplateBuilderStepData>` in the file (typically on the `export const setupStep` line and any internal type annotations). Replace each with `TemplateBuilderStep<TemplateBuilderStepData>`.

Find all occurrences of `StepRenderProps<TemplateBuilderStepData>` (or `StepRenderProps` used as a type). Replace with `StepContext<TemplateBuilderStepData>`.

- [ ] **Step 2: Run TypeScript check after SetupStep**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

### DesignStep.tsx

- [ ] **Step 3: Update imports in DesignStep.tsx**

Find line 4 of `src/apps/template-builder/steps/DesignStep.tsx`:
```typescript
import type { WizardStep, StepRenderProps } from '../../types';
```
Replace with:
```typescript
import type { TemplateBuilderStep, StepContext } from '../types';
```

Apply the same `WizardStep` → `TemplateBuilderStep` and `StepRenderProps` → `StepContext` substitutions.

**Do NOT touch the `useParams` call on line 310** — DesignStep reads `clientSlug` from the URL directly rather than from `StepContext.client.slug`. This is intentional.

- [ ] **Step 4: Run TypeScript check after DesignStep**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

### PublishStep.tsx

- [ ] **Step 5: Update imports in PublishStep.tsx**

Find line 4 (approximately) of `src/apps/template-builder/steps/PublishStep.tsx`:
```typescript
import type { WizardStep, StepRenderProps } from '../../types';
```
Replace with:
```typescript
import type { TemplateBuilderStep, StepContext } from '../types';
```

Apply the same substitutions.

- [ ] **Step 6: Run TypeScript check after PublishStep**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 7: Commit all three step changes**

```bash
git add src/apps/template-builder/steps/SetupStep.tsx src/apps/template-builder/steps/DesignStep.tsx src/apps/template-builder/steps/PublishStep.tsx
git commit -m "refactor(template-builder): update step imports from platform types to local types"
```

---

## Task 8: Final Verification

Run every automated check and work through the manual QA checklist against localhost.

**Files:** No code changes in this task — verification only.

- [ ] **Step 1: Full TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 2: Run all template-builder unit tests**

```bash
npx vitest run src/apps/template-builder/
```

Expected: All tests pass. This includes:
- `utils/mapTemplateToStepData.test.ts` (9 tests)
- `hooks/useStepNavigation.test.tsx` (13+ tests)
- `components/TemplateBuilderStepper.test.tsx` (9 tests)
- `components/TemplateBuilderFooter.test.tsx` (15+ tests)
- `manifest.test.ts` (existing — must still pass)

- [ ] **Step 3: Run registry and platform wizard tests**

```bash
npx vitest run src/apps/_registry.test.ts src/platform/wizard/WizardShell.test.tsx src/platform/wizard/usePersistedStepData.test.tsx
```

Expected: All pass. These tests don't touch AppRoot — they should be unaffected.

- [ ] **Step 4: Start the local dev server**

```bash
cd antig/pmg-creative-studio
npm run dev
```

Open `http://localhost:5173`.

- [ ] **Step 5: Manual QA — work through this checklist**

Navigate to a template-builder URL for a real client. For each item, note the actual observed behavior.

**Navigation:**
- [ ] `/pmg/template-builder` (no step) → SetupStep renders immediately, no blank flash
- [ ] `/pmg/template-builder/nonexistent` → SetupStep renders (findIndex returns 0)
- [ ] `/pmg/template-builder/design` → DesignStep renders with data intact

**SetupStep validation:**
- [ ] Continue disabled until all 4 requirements met; checklist updates live as fields are filled
- [ ] Continue button label reads "Next: Design & Map →"

**Submit lifecycle:**
- [ ] Click Continue on complete SetupStep → spinner appears on button, "Loading..." shown, URL changes to `.../design`

**Navigation chrome:**
- [ ] DesignStep → click "← Previous Step" → SetupStep with data intact
- [ ] DesignStep → click Setup stepper circle → SetupStep with data intact
- [ ] DesignStep → click Design stepper circle (current) → nothing happens
- [ ] SetupStep → click Publish stepper circle (future) → nothing happens

**PublishStep:**
- [ ] Navigate to `.../publish` → no Continue button

**Save & Exit:**
- [ ] Click "Save & Exit" → navigates to `/adlabs/pmg`
- [ ] Return to `/pmg/template-builder` → resumes with saved data

**Discard:**
- [ ] Click "Discard" → confirm dialog with exact text "Discard this template? All unsaved work will be lost and cannot be recovered."
- [ ] Click OK → navigates away; `localStorage['wiz_pmg_template-builder']` is gone
- [ ] Click Cancel → stays on step, data unchanged

**Prefill:**
- [ ] `/pmg/template-builder?from=<template-id>` → spinner → prefilled SetupStep
- [ ] Stale localStorage is NOT shown (prefill overrides it)

**Visual:**
- [ ] Completed step circles: `bg-blue-600`, CheckIcon
- [ ] Current step circle: `border-2 border-blue-600 bg-white`, blue dot
- [ ] Upcoming circles: `border-2 border-gray-300 bg-white`, transparent dot
- [ ] Connector lines fill with `transition-all duration-500` animation
- [ ] `document.title === 'Template Builder'` (check in DevTools console)

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "feat(template-builder): complete WizardShell → self-contained AppRoot migration

All unit tests pass. Manual QA verified: functional and visual parity with
WizardShell confirmed. localStorage key format preserved (wiz_${slug}_template-builder).
URL structure preserved. data-testid attributes preserved."
```
