import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import type {
  AppManifest,
  StepContext,
  StepData,
  ValidationResult,
  WizardStep,
} from '../../apps/types';
import { useCurrentClient } from '../client/useCurrentClient';
import { usePersistedStepData } from './usePersistedStepData';

interface WizardShellProps<S extends StepData = StepData> {
  manifest: AppManifest<S>;
}

/**
 * Generic wizard runtime. Owns:
 *   - URL <-> step index sync via :stepId.
 *   - stepData persistence (delegated to usePersistedStepData).
 *   - manifest lifecycle: onMount once, validate / onLeave / onEnter on
 *     navigation, fall-through to advance-by-index when step.next() is
 *     undefined or returns an unknown id.
 *   - breadcrumb + Back/Next chrome around step.render().
 */
export function WizardShell<S extends StepData = StepData>({
  manifest,
}: WizardShellProps<S>) {
  const { stepId: urlStepId } = useParams<{ stepId?: string }>();
  const [searchParams] = useSearchParams();
  const resumeId = searchParams.get('creative');
  const navigateRouter = useNavigate();
  const location = useLocation();

  // Compute the wizard's base pathname (everything up to but not including
  // the current :stepId segment). Lets the shell emit absolute URLs without
  // having to know its mount point statically.
  const basePathname = useMemo(() => {
    const path = location.pathname.replace(/\/+$/, '');
    if (!urlStepId) return path;
    const suffix = `/${urlStepId}`;
    return path.endsWith(suffix) ? path.slice(0, -suffix.length) : path;
  }, [location.pathname, urlStepId]);

  const navigateToStep = useCallback(
    (stepId: string, replace: boolean) => {
      const target = `${basePathname}/${stepId}`;
      navigateRouter(target, { replace });
    },
    [basePathname, navigateRouter]
  );

  const { currentClient } = useCurrentClient();
  // The shell doesn't gate on currentClient (the route does); fall back to a
  // tests-friendly default so the contract tests can drive the shell without
  // a full ClientProvider tree.
  const clientSlug = currentClient?.slug ?? 'test-client';

  const { stepData, mergeStepData, creativeId, reset } = usePersistedStepData<S>({
    manifest,
    clientSlug,
    resumeId,
  });

  const [validationError, setValidationError] = useState<string | null>(null);

  const findIndex = useCallback(
    (id: string | undefined): number => {
      if (!id) return 0;
      const idx = manifest.steps.findIndex((s) => s.id === id);
      return idx >= 0 ? idx : 0;
    },
    [manifest.steps]
  );

  const currentStepIndex = findIndex(urlStepId);
  const currentStep: WizardStep<S> = manifest.steps[currentStepIndex];

  // Fire manifest.onMount once.
  const mountedRef = useRef(false);
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    if (manifest.onMount) {
      void manifest.onMount({
        client: { slug: clientSlug },
        creativeId,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildContext = useCallback(
    (): StepContext<S> => ({
      stepData,
      mergeStepData,
      navigate: ({ stepId, replace = true }) => {
        if (stepId) {
          navigateToStep(stepId, replace);
        }
      },
      client: { slug: clientSlug },
      creativeId,
    }),
    [stepData, mergeStepData, navigateRouter, clientSlug, creativeId]
  );

  const goToIndex = useCallback(
    async (nextIndex: number) => {
      const outgoing = manifest.steps[currentStepIndex];
      const incoming = manifest.steps[nextIndex];
      if (!incoming) return;

      const ctx = buildContext();
      if (outgoing?.onLeave) await outgoing.onLeave(ctx);
      if (incoming.onEnter) await incoming.onEnter(ctx);

      navigateToStep(incoming.id, true);
    },
    [manifest.steps, currentStepIndex, buildContext, navigateToStep]
  );

  const goNext = useCallback(async () => {
    setValidationError(null);
    const result: ValidationResult = currentStep.validate(stepData);
    if (!result.ok) {
      setValidationError(result.reason);
      return;
    }

    let targetIndex = currentStepIndex + 1;
    if (currentStep.next) {
      const proposed = currentStep.next(buildContext());
      if (typeof proposed === 'string') {
        const idx = manifest.steps.findIndex((s) => s.id === proposed);
        if (idx >= 0) {
          targetIndex = idx;
        } else {
          console.warn(
            `WizardShell: step "${currentStep.id}".next() returned unknown id "${proposed}" — falling back to advance-by-index.`
          );
        }
      }
    }

    if (targetIndex >= manifest.steps.length) return;
    await goToIndex(targetIndex);
  }, [
    currentStep,
    stepData,
    currentStepIndex,
    buildContext,
    manifest.steps,
    goToIndex,
  ]);

  const goBack = useCallback(async () => {
    setValidationError(null);
    if (currentStepIndex <= 0) return;
    await goToIndex(currentStepIndex - 1);
  }, [currentStepIndex, goToIndex]);

  const renderProps = useMemo(
    () => buildContext(),
    [buildContext]
  );

  return (
    <div data-testid="wizard-shell">
      <nav aria-label="wizard-breadcrumb" data-testid="wizard-breadcrumb">
        <ol style={{ display: 'flex', listStyle: 'none', gap: 8, padding: 0 }}>
          {manifest.steps.map((s, i) => (
            <li
              key={s.id}
              data-testid={`breadcrumb-${s.id}`}
              data-active={i === currentStepIndex ? 'true' : 'false'}
            >
              {s.name}
            </li>
          ))}
        </ol>
      </nav>

      <section data-testid={`step-body-${currentStep.id}`}>
        {currentStep.render(renderProps)}
      </section>

      {validationError ? (
        <p role="alert" data-testid="wizard-validation-error">
          {validationError}
        </p>
      ) : null}

      <footer style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button
          type="button"
          onClick={() => void goBack()}
          disabled={currentStepIndex === 0}
        >
          Back
        </button>
        <button type="button" onClick={() => void goNext()}>
          Next
        </button>
        <button type="button" onClick={reset} data-testid="wizard-reset">
          Reset
        </button>
      </footer>
    </div>
  );
}

export default WizardShell;
