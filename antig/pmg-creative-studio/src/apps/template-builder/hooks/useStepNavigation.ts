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
