# Template-Builder Migration: WizardShell → Self-Contained AppRoot Architecture

## GOAL

Migrate the template-builder app from the shared `WizardShell` platform component to a self-contained component tree. `WizardShell` owns: URL-to-step routing, `usePersistedStepData` lifecycle, validation UI, navigation chrome, and the `buildContext` / `advanceToIndex` / `goNext` machinery. All of it must be re-implemented inside template-builder's own files.

The migration preserves 100% functional and visual parity with `WizardShell.tsx` as audited: the exact step-by-step lifecycle (`onLeave` → `onEnter` → navigate), the same URL shape, the same `localStorage` key (`wiz_${slug}_template-builder`), the same `creativeId` threading, the same stepper chrome (CheckIcon for complete, blue dot for current, hollow circle for upcoming, animated connector lines), the same footer layout (requirements row, Previous / Save & Exit / Discard / dynamic Continue button inside the content card), and all `data-testid` attributes. Template-builder gains full ownership of its navigation and lifecycle without coupling to the platform wizard abstraction.

**Authoritative source for every visual and behavioral decision:** `src/platform/wizard/WizardShell.tsx`. When any detail in this plan appears to conflict with that file, the file wins.

---

## WHAT THE CODEBASE ACTUALLY LOOKS LIKE TODAY

Read these before touching any file:

- `src/apps/template-builder/AppRoot.tsx` — thin shell; mounts `<WizardShell manifest={resolvedManifest} />` inside providers; owns the `?from=` prefill fetch and `mapTemplateToStepData` helper.
- `src/platform/wizard/WizardShell.tsx` — owns all navigation chrome and step lifecycle; 549 lines. This is the single source of truth for every behavior this plan must replicate.
- `src/apps/template-builder/manifest.ts` — `export default` typed as `AppManifest<TemplateBuilderStepData>`; has `basePath`, `status`, `requiresBrandStandards`.
- `src/apps/template-builder/types.ts` — defines `TemplateBuilderStepData`, `ZoneStyle`, `RequirementField`, `AlliAction`, `Channel`, `LogoVariant`.
- `src/apps/types.ts` — defines the shared `WizardStep`, `AppManifest`, `StepContext`, `ValidationResult`, `ValidationRequirement`, `AppContext` types. All three step files import `WizardStep` and `StepRenderProps` from here.
- `src/apps/template-builder/steps/SetupStep.tsx` — exports `setupStep` typed as `WizardStep<TemplateBuilderStepData>` with `id: 'setup'`, `name: 'Setup'`, `description: '...'`.
- `src/apps/template-builder/steps/DesignStep.tsx` — exports `designStep`; `id: 'design'`, `name: 'Design & Map'`, `description: '...'`. Uses `useParams` for its own `clientSlug`.
- `src/apps/template-builder/steps/PublishStep.tsx` — exports `publishStep`; `id: 'publish'`, `name: 'Publish'`, `description: '...'`. Imports `WizardStep` and `StepRenderProps` from `../../types`.
- `src/apps/_registry.ts` — does `import templateBuilderManifest from './template-builder/manifest'` (default import) and calls `buildRegistry()` which calls `assertValidBasePath(manifest.id, manifest.basePath)` for every manifest. Removing `basePath` from the manifest throws at boot.
- `src/apps/template-builder/manifest.test.ts` — asserts `manifest.basePath === 'template-builder'`.
- `src/platform/wizard/usePersistedStepData.ts` — localStorage key: `wiz_${slug}_${manifest.id}`.

---

## NEW FILE STRUCTURE

```
src/apps/template-builder/
  AppRoot.tsx                              MODIFIED — full rewrite
  manifest.ts                             UNCHANGED — keep all fields, keep default export
  types.ts                                MODIFIED — add local TemplateBuilderStep type (additive)
  TemplateBuilderContext.tsx              UNCHANGED
  steps.ts                                UNCHANGED

  components/                             NEW DIRECTORY
    TemplateBuilderStepper.tsx            NEW — stepper nav matching WizardShell's <ol>
    TemplateBuilderFooter.tsx             NEW — footer chrome matching WizardShell's card footer

  hooks/                                  NEW DIRECTORY
    useStepNavigation.ts                  NEW — all step-advance, step-back, URL, lifecycle logic

  utils/                                  NEW DIRECTORY
    mapTemplateToStepData.ts              NEW — extracted from AppRoot.tsx (no logic change)

  steps/
    SetupStep.tsx                         MODIFIED — import path update only
    DesignStep.tsx                        MODIFIED — import path update only
    PublishStep.tsx                       MODIFIED — import path update only
```

**Files not modified:** `manifest.ts`, `TemplateBuilderContext.tsx`, `steps.ts`, `types.ts` (other than additive type), `usePersistedStepData.ts`, `_registry.ts`, `src/apps/types.ts`.

**ValidationChecklist is not a separate component.** The requirements row is inlined inside `TemplateBuilderFooter` to match WizardShell exactly (a single `div.flex.items-center.justify-end.gap-6` inside the card footer). Do not extract it.

---

## STEP-BY-STEP IMPLEMENTATION

### Task 1 — Add `TemplateBuilderStep` type to `types.ts`

**File:** `src/apps/template-builder/types.ts`

Add the following block at the top of the file, after the existing imports. Do not modify or remove any existing types. The new `TemplateBuilderStep` type mirrors `WizardStep` from `src/apps/types.ts` exactly — including the `name` and `description` fields — so that existing step exports (`name: 'Setup'`, etc.) require zero changes.

```typescript
import type { ReactNode } from 'react';
import type { ValidationResult, ValidationRequirement, StepContext } from '../types';
export type { ValidationResult, ValidationRequirement, StepContext };

// ─── Local alias — matches WizardStep<S> from src/apps/types.ts exactly ─────
// Using this local name severs the template-builder import from the platform
// types file without requiring any changes to the step definition objects.

export interface TemplateBuilderStep<
  S extends Record<string, unknown> = TemplateBuilderStepData
> {
  id: string;
  /** Shown in the stepper label and the card header (e.g. "Setup", "Design & Map"). */
  name: string;
  /** One-sentence description shown below the step title in the content card. */
  description?: string;
  render: (props: StepContext<S>) => ReactNode;
  validate: (data: S) => ValidationResult;
  onEnter?: (ctx: StepContext<S>) => void | Promise<void>;
  onLeave?: (ctx: StepContext<S>) => void | Promise<void>;
  next?: (ctx: StepContext<S>) => string | undefined;
  submit?: (ctx: StepContext<S>) => Promise<{ nextStepId?: string }>;
}
```

**Why `name` not `label`:** The three existing step exports use `name: 'Setup'`, `name: 'Design & Map'`, `name: 'Publish'`. Using `name` here means Tasks 8–10 (step file updates) are import-path changes only — no step object properties need to change.

**Why re-export from `src/apps/types.ts`:** `StepContext`, `ValidationResult`, and `ValidationRequirement` are already correct in the platform types file. Re-exporting them avoids duplication while keeping template-builder's import path local after the step files are updated.

---

### Task 2 — Create `useStepNavigation` hook

**File:** `src/apps/template-builder/hooks/useStepNavigation.ts`

This hook replicates every navigation behavior from `WizardShell.tsx` (lines 102–315) exactly.

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

  // Exact replica of WizardShell's basePathname derivation (lines 112-117).
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

  // Exact replica of WizardShell's findIndex (lines 139-146).
  // Returns 0 (not -1) for missing or unknown step IDs — no redirect effect needed.
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

  // Exact replica of WizardShell's validation memo (lines 229-232).
  // stepData is passed as a direct prop — same dep chain as WizardShell.
  const validation: ValidationResult = useMemo(
    () => (currentStep ? currentStep.validate(stepData) : { ok: true }),
    [currentStep, stepData]
  );

  const isNextDisabled = isLoading || !validation.ok;
  const isLastStep = currentStepIndex === steps.length - 1;

  // Exact replica of WizardShell's advanceToIndex (lines 185-207).
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

  // Exact replica of WizardShell's rewindToIndex (lines 217-224).
  // No onLeave/onEnter — free move, rewinds URL only.
  const rewindToIndex = useCallback(
    (nextIndex: number) => {
      const incoming = steps[nextIndex];
      if (!incoming) return;
      navigateToStep(incoming.id, true);
    },
    [steps, navigateToStep]
  );

  // Exact replica of WizardShell's goNext (lines 234-309).
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

  // Exact replica of WizardShell's goBack (lines 311-315).
  const goBack = useCallback(() => {
    setValidationError(null);
    if (currentStepIndex <= 0) return;
    rewindToIndex(currentStepIndex - 1);
  }, [currentStepIndex, rewindToIndex]);

  // jumpTo: stepper circle click. Uses < (not <=) to avoid self-navigation on active step.
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

---

### Task 3 — Create `TemplateBuilderStepper` component

**File:** `src/apps/template-builder/components/TemplateBuilderStepper.tsx`

Exact structural replica of WizardShell's stepper (lines 345–426). Every Tailwind class, `data-testid`, and icon matches WizardShell exactly.

```tsx
import React from 'react';
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
              {/* Connector lines */}
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

**Parity notes (verified against WizardShell.tsx):**
- `<nav aria-label="wizard-progress" data-testid="wizard-breadcrumb">` — line 345
- Left connector fill: `index === 0 ? transparent : index <= currentStepIndex ? blue : gray` — line 369
- Right connector fill: `index === steps.length - 1 ? transparent : index < currentStepIndex ? blue : gray` — line 376
- Single `<button>` for ALL states — line 387
- `CheckIcon className="h-5 w-5 text-white"` for complete — line 403
- Blue dot `h-2.5 w-2.5 rounded-full bg-blue-600` for current — line 407
- Transparent dot for upcoming — line 410
- Label: `text-xs font-medium`, `text-blue-600` for current, `text-blue-gray-500` for others — lines 413–419
- Color: `blue-600` throughout, not `indigo-600`

---

### Task 4 — Create `TemplateBuilderFooter` component

**File:** `src/apps/template-builder/components/TemplateBuilderFooter.tsx`

Renders the footer inside the content card — the `mt-12 pt-8 border-t border-gray-100 space-y-4` div from WizardShell lines 452–542. Does not render the card itself or the validation error paragraph (both in AppRoot).

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
      {/* Requirements checklist — horizontal right-aligned row */}
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

      {/* Button row */}
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

          {/* Not rendered on last step */}
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

**Parity notes (verified against WizardShell.tsx):**
- Requirements row: `flex items-center justify-end gap-6`, `data-testid="wizard-requirements"` — lines 455–456
- Each requirement: `text-[9px] font-black uppercase tracking-widest`, `data-testid`, `data-met` — lines 461–467
- Met circle: `bg-green-500 border-green-500` + `CheckIcon h-2.5 w-2.5` — lines 469–474
- Previous disabled: `cursor-not-allowed text-gray-200` — line 491
- Previous enabled: `text-blue-gray-400 border border-gray-100 hover:bg-gray-50` — line 493
- Discard confirm text exact: `'Discard this template? All unsaved work will be lost and cannot be recovered.'` — line 512
- Continue spinner: `ArrowPathIcon h-3 w-3 animate-spin` (h-3, not h-4) — line 534
- Continue disabled: `opacity-20 cursor-not-allowed grayscale bg-gray-400 shadow-none` — line 531
- Continue label: dynamic `Next: ${nextStepName ?? 'Continue'} →` — line 537

---

### Task 5 — Extract `mapTemplateToStepData` to utils

**File:** `src/apps/template-builder/utils/mapTemplateToStepData.ts` (new)

Cut the `mapTemplateToStepData` function from `AppRoot.tsx` (lines 19–65) and paste here as a named export. No logic changes. Adjust relative import paths for the new location (one level deeper):

- `'../../services/templateLibrary.types'` → `'../../../services/templateLibrary.types'`
- `'../../constants/useCases'` → `'../../../constants/useCases'`
- `'../types'` stays `'../types'`

---

### Task 6 — Rewrite `AppRoot.tsx`

**File:** `src/apps/template-builder/AppRoot.tsx`

Complete rewrite. Structural replica of WizardShell's render (lines 327–546) with providers wrapped around it, plus the `?from=` prefill logic the current AppRoot owns.

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
import type { TemplateLibraryRecord } from '../../services/templateLibrary.types';
import type { ClientSlug } from '../../platform/firebase/paths';
import manifest from './manifest';
import type { TemplateBuilderStepData } from './types';
import { mapTemplateToStepData } from './utils/mapTemplateToStepData';
import TemplateBuilderStepper from './components/TemplateBuilderStepper';
import TemplateBuilderFooter from './components/TemplateBuilderFooter';
import { useStepNavigation } from './hooks/useStepNavigation';

export default function TemplateBuilderAppRoot() {
  // URL / client resolution
  const { clientSlug: urlSlug } = useParams<{ clientSlug: string }>();
  const [searchParams] = useSearchParams();
  const navigateRouter = useNavigate();
  const { currentClient } = useCurrentClient();
  const slug = urlSlug ?? currentClient?.slug ?? '';

  const fromTemplateId = searchParams.get('from');
  const isCopy = searchParams.get('copy') === '1';
  const resumeId = searchParams.get('creative');

  usePageTitle(manifest.title);

  // Template prefill state (exact replica of existing AppRoot.tsx lines 82-122)
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

  // Manifest resolution — override initialStepData when prefill is set
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

  // Clear stale localStorage before usePersistedStepData hydrates when ?from= is set.
  // This render-phase side effect runs synchronously before the hydration effect fires.
  const prefillSessionCleared = useRef(false);
  if (fromTemplateId && slug && !prefillSessionCleared.current) {
    prefillSessionCleared.current = true;
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(`wiz_${slug}_template-builder`);
    }
  }

  // Persisted step data — same hook, same localStorage key as WizardShell
  const { stepData, mergeStepData, creativeId, discard } = usePersistedStepData<TemplateBuilderStepData>({
    manifest: resolvedManifest,
    clientSlug: slug,
    resumeId,
  });

  // Mount effect — replicates WizardShell's onMount (lines 151-162)
  const mountedRef = useRef(false);
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    if (resolvedManifest.onMount) {
      void resolvedManifest.onMount({ client: { slug: slug as ClientSlug }, creativeId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // buildContext — stable callback, wires into useStepNavigation
  const navigateToStepRef = useRef<(stepId: string, replace: boolean) => void>(
    () => { /* initialized after hook call below */ }
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

  // Step navigation
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

  // Wire navigateToStep into buildContext's navigate closure
  useEffect(() => {
    navigateToStepRef.current = navigateToStep;
  }, [navigateToStep]);

  // requirements — same derivation as WizardShell lines 317-325
  const requirements =
    !validation.ok &&
    Array.isArray((validation as { requirements?: unknown }).requirements) &&
    (validation as { requirements: { label: string; met: boolean }[] }).requirements.length > 0
      ? (validation as { requirements: { label: string; met: boolean }[] }).requirements
      : null;

  const renderProps = useMemo(() => buildContext(), [buildContext]);

  async function handleDiscard() {
    await discard();
    navigateRouter(`/adlabs/${slug}`);
  }

  // Blocking loading/error states (matches existing AppRoot.tsx lines 124-138)
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

              {/* Validation error — inside card, above footer */}
              {validationError && !requirements ? (
                <p
                  role="alert"
                  data-testid="wizard-validation-error"
                  className="mt-6 text-center text-sm text-red-600"
                >
                  {validationError}
                </p>
              ) : null}

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

**Critical structural notes:**
- `TemplateBuilderFooter` is rendered **inside** the content card — matches WizardShell where footer div is a child of the card div (line 452 inside the card starting at line 429).
- `data-testid="wizard-shell"` on the outer `<div className="space-y-8">` — WizardShell line 328.
- `data-testid={`step-body-${currentStep?.id}`}` on the step body wrapper — WizardShell line 435.
- Validation error paragraph inside the card, above the footer — WizardShell lines 440–449.
- `renderProps = useMemo(() => buildContext(), [buildContext])` — ensures stable props to step render functions, WizardShell line 317.
- `SOCIAL_WIREFRAMES` import removed from AppRoot — it moved to the utils file.

---

### Task 7 — Keep `manifest.ts` unchanged

**File:** `src/apps/template-builder/manifest.ts`

**Do not modify.** Must retain:
- `export default manifest`
- `basePath: 'template-builder'` — required by `_registry.ts`'s `assertValidBasePath`
- `status: 'live'` — required by dashboard tile renderer
- `requiresBrandStandards: true` — required by dashboard gate
- Type as `AppManifest<TemplateBuilderStepData>` from `'../types'`

Removing `basePath` throws at boot. `manifest.test.ts` line 9 asserts `manifest.basePath === 'template-builder'`.

---

### Task 8 — Update `SetupStep.tsx` import path

**File:** `src/apps/template-builder/steps/SetupStep.tsx`

Line 3: `import type { WizardStep, StepRenderProps } from '../../types'`
→ `import type { TemplateBuilderStep, StepContext } from '../types'`

Export block: `WizardStep<TemplateBuilderStepData>` → `TemplateBuilderStep<TemplateBuilderStepData>`

Type annotations on `validate` and `submit` internal consts: same substitution.

`StepRenderProps<TemplateBuilderStepData>` anywhere → `StepContext<TemplateBuilderStepData>`

No logic changes. No property renames.

---

### Task 9 — Update `DesignStep.tsx` import path

Same substitution as Task 8. `useParams` for `clientSlug` (line 310) remains unchanged — DesignStep reads its own slug from the URL directly. Do not remove it.

---

### Task 10 — Update `PublishStep.tsx` import path

Same substitution as Tasks 8–9.

---

### Task 11 — TypeScript and test verification

```bash
npx tsc --noEmit
npx vitest run src/apps/template-builder/manifest.test.ts
npx vitest run src/apps/__tests__/WizardShell.preview.test.tsx
npx vitest run src/apps/_registry.test.ts
```

All must pass before any task is considered complete.

---

## EXECUTION ORDER

Dependencies listed — execute in this sequence:

1. **Task 5** — Extract `mapTemplateToStepData` (no deps, establishes utils dir)
2. **Task 1** — Add `TemplateBuilderStep` to `types.ts` (no deps, needed by all new files)
3. **Task 2** — `useStepNavigation` hook (depends on Task 1)
4. **Task 3** — `TemplateBuilderStepper` (depends on Task 1)
5. **Task 4** — `TemplateBuilderFooter` (depends on Task 1)
6. **Task 6** — Rewrite `AppRoot.tsx` (depends on Tasks 2, 3, 4, 5)
7. **Task 7** — Confirm `manifest.ts` unchanged (verification, no edits)
8. **Tasks 8–10** — Step file imports (depends on Task 1, can run in parallel)
9. **Task 11** — TypeScript and test verification

---

## CRITICAL PARITY CHECKLIST

### 1. `goNext()` lifecycle — exact sequence
`validate → submit (async) → onLeave → onEnter → navigate`. Every step, every condition, exact async order. `targetIndex === currentStepIndex` guard. `targetIndex >= steps.length` guard.

### 2. Validation reactivity
`validation` is a `useMemo` with `[currentStep, stepData]` as direct deps. Continue button enables the moment the last requirement is met without a click.

### 3. `usePageTitle`
Called in AppRoot as `usePageTitle(manifest.title)`. Import: `'../../hooks/usePageTitle'`.

### 4. `creativeId` threading
Passed via `buildContext()` to every step's `render`, `validate`, `submit`, `onEnter`, `onLeave`. Currently unused by steps but must be threaded correctly.

### 5. localStorage key format
`wiz_${clientSlug}_template-builder` — identical to WizardShell because same hook + same `manifest.id`. Existing sessions survive migration.

### 6. URL param format
Reads both `params.stepId` and `params['*']` (splat). `basePathname` uses `endsWith` after stripping trailing slashes. Same URL shape as WizardShell.

### 7. `findIndex` fallback to 0
Unknown/missing step IDs render step 0, no redirect, no blank flash.

### 8. Jump-back behavior
`rewindToIndex` is bare URL navigation — no `onLeave`, no `onEnter`. `jumpTo` uses `index < currentStepIndex` (not `<=`) to avoid self-navigation. stepData preserved on backward navigation.

### 9. Content card structure
Footer inside the card, separated from step body by `mt-12 pt-8 border-t border-gray-100 space-y-4`. Validation error inside the card above the footer.

### 10. `data-testid` attributes

| Attribute | WizardShell line | Owner |
|---|---|---|
| `data-testid="wizard-shell"` | 328 | AppRoot outer div |
| `data-testid="wizard-breadcrumb"` | 345 | Stepper nav |
| `data-testid={`breadcrumb-${step.id}`}` | 359 | Each li in stepper |
| `data-active={...}` | 360 | Each li in stepper |
| `data-testid={`step-body-${currentStep.id}`}` | 435 | Step body wrapper |
| `data-testid="wizard-validation-error"` | 444 | Error paragraph |
| `data-testid="wizard-requirements"` | 456 | Requirements row |
| `data-testid={`wizard-requirement-${label}`}` | 465 | Each requirement item |
| `data-met={...}` | 466 | Each requirement item |
| `data-testid="wizard-save-exit"` | 503 | Save & Exit button |
| `data-testid="wizard-discard"` | 516 | Discard button |

### 11. StepContext fields used per step

| Field | SetupStep body | SetupStep submit | DesignStep | PublishStep |
|---|---|---|---|---|
| `stepData` | yes | yes | yes | yes |
| `mergeStepData` | yes | yes | yes | yes |
| `client.slug` | no | yes | no (useParams) | yes |
| `creativeId` | no | no | no | no |
| `navigate` | no | no | no | no |

All fields must exist in `buildContext()` even if not currently used.

---

## RISKS AND MITIGATIONS

### Risk 1: Validation stale when stepData changes
`stepData` must be a direct dep of the `validation` useMemo, not derived through `buildContext`. **Mitigation:** `useStepNavigation` takes `stepData` as a direct prop.

### Risk 2: `usePersistedStepData` re-hydration wipes user data
`urlSlug` from `useParams` is synchronous and always non-null in production routes. Use it as primary slug source. **Mitigation:** Handled by existing `hydratedKeyRef` guard in `usePersistedStepData`.

### Risk 3: `?from=` prefill overridden by stale localStorage
`localStorage.removeItem` in `.then()` fires after the hydration effect. **Mitigation:** Render-phase `prefillSessionCleared` ref removes the stale entry synchronously before `usePersistedStepData` mounts.

### Risk 4: Registry boot throws if `basePath` removed
**Mitigation:** Task 7 explicitly preserves `manifest.ts` unchanged.

### Risk 5: `onLeave` throws after submit surfaces as validation error
Faithful replication of WizardShell behavior. Currently no step defines `onLeave`. Documented with a code comment in `useStepNavigation.goNext()`.

### Risk 6: `window.confirm` blocks automated tests
**Mitigation:** Tests must stub `window.confirm`. Add `// TODO: replace with design-system confirm dialog` comment. `data-testid="wizard-discard"` enables targeting.

### Risk 7: DesignStep's direct `useParams` call must not change
DesignStep bypasses `client.slug` from StepContext intentionally. Do not touch this during migration.

---

## PRE-MERGE QA CHECKLIST

Run all items on localhost before merging.

### Functional

1. Navigate to `/pmg/template-builder` with no step segment — SetupStep renders immediately, no redirect flash, no blank
2. SetupStep validates correctly — Continue disabled until all 4 requirements met; enables immediately on last field
3. Continue button label is dynamic — "Next: Design & Map →" on step 1, "Next: Publish →" on step 2
4. Submit lifecycle — spinner + "Loading..." on Continue, URL changes after async completes
5. DesignStep → PublishStep advance works, no console errors
6. PublishStep — no Continue button present
7. Back button from DesignStep navigates to SetupStep with data intact
8. Stepper click backward — navigates to SetupStep with data intact
9. Stepper click on current step — nothing happens
10. Stepper click on future step — nothing happens
11. Stepper clicks disabled during loading — all circles non-navigable while spinner is visible
12. URL deep link to `.../design` renders DesignStep with hydrated stepData
13. Unknown step ID in URL renders SetupStep (findIndex returns 0, no error)
14. Save & Exit — navigates to `/adlabs/pmg`, localStorage key preserved, resumes correctly on return
15. Discard OK — navigates away, localStorage key gone, fresh session on return
16. Discard Cancel — stays on current step, data unchanged

### Data persistence

17. Session resume via localStorage — close tab, reopen, data intact
18. `?from=<id>` prefill — spinner, then prefilled SetupStep; localStorage key absent until first interaction
19. `?copy=1&from=<id>` — same as above but name prefixed "Copy of"
20. `?creative=<id>` — resumes from Firestore document
21. Stale localStorage + `?from=<id>` — prefill wins, stale entry removed

### Visual

22. Stepper visual states — CheckIcon (complete), blue dot (current), hollow (upcoming); all connector lines fill with animation
23. Connector animation — `transition-all duration-500` visible color change
24. Content card — `rounded-xl border border-gray-200 bg-white p-8 shadow-card` wraps step title, body, and footer
25. Footer inside card — separated from step body by `border-t border-gray-100` with `mt-12 pt-8` spacing
26. Requirements checklist — horizontal right-aligned row; `text-[9px] font-black uppercase tracking-widest`; met = green, unmet = gray
27. Validation error fallback — centered, inside card, above button row, `role="alert"`
28. Back link — `ArrowLeftIcon` + "Back to workflows", href `/`
29. Page title — `document.title === 'Template Builder'` on all three steps
30. Loading spinner — `h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900` in `h-64` centered container

### TypeScript and tests

31. `npx tsc --noEmit` exits with 0 errors
32. `npx vitest run src/apps/template-builder/manifest.test.ts` — all assertions pass
33. `npx vitest run src/apps/_registry.test.ts` — passes
34. `npx vitest run src/apps/__tests__/WizardShell.preview.test.tsx` — passes
