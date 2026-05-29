import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import type {
  AppManifest,
  StepContext,
  StepData,
  ValidationRequirement,
  ValidationResult,
  WizardStep,
} from '../../apps/types';
import { useCurrentClient } from '../client/useCurrentClient';
import { usePersistedStepData } from './usePersistedStepData';
import { cn } from '../../utils/cn';

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
 *   - Visual chrome: back link, title+description header, progress stepper,
 *     content card, validation checklist footer, Previous Step / Continue
 *     Upstream buttons. Lifted from UseCaseWizardPage.tsx (lines 1440-1560,
 *     4280-4310) so per-app modules render visually identical to the
 *     legacy monolith route.
 */
/**
 * Preview-status stub view. Step 0.75 of the AdLabs v1 plan: lets the dashboard
 * register and route to apps that aren't fully lifted yet (e.g. Video Stitch
 * in v1) without forcing them to satisfy the live wizard contract. No Continue
 * button, no checklist, no persistence — just a "Coming soon" panel.
 */
function WizardShellPreviewStub({ title }: { title: string }) {
  return (
    <div className="space-y-8" data-testid="wizard-shell-preview">
      <div>
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm font-medium text-blue-gray-500 hover:text-blue-600"
          data-testid="wizard-preview-back"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to workflows
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-gray-900">{title}</h1>
      </div>

      <div
        className="rounded-xl border border-gray-200 bg-white p-12 shadow-card text-center"
        data-testid="wizard-preview-coming-soon"
      >
        <p className="text-xs font-black uppercase tracking-[0.3em] text-blue-600">
          Coming soon
        </p>
        <h2 className="mt-4 text-lg font-semibold text-gray-900">
          {title} is on the way
        </h2>
        <p className="mt-2 text-sm text-blue-gray-500">
          This app is registered and routable — the full experience is being built.
          Check back shortly.
        </p>
      </div>
    </div>
  );
}

export function WizardShell<S extends StepData = StepData>({
  manifest,
}: WizardShellProps<S>) {
  // Preview-status apps render a stub view and bypass the wizard runtime
  // entirely. Hooks below this line ARE allowed to skip because the early
  // return is keyed on a stable manifest field — React's hook rules require
  // identical hook order across renders, not across instances.
  if (manifest.status === 'preview') {
    return <WizardShellPreviewStub title={manifest.title} />;
  }

  // The shell can be mounted in either of two route shapes:
  //   - Parent splat: <Route path="/:clientSlug/template-builder/*" />
  //     React Router exposes the trailing segment via params['*'].
  //   - Nested :stepId: <Route path="/wizard/:stepId" /> (used in tests).
  // Read both and take whichever is populated. The splat is what App.tsx uses
  // so a single-line route mount works for any number of step ids without
  // having to pre-declare them.
  const params = useParams<{ stepId?: string; '*'?: string }>();
  const splatPath = params['*']?.split('/')[0] ?? '';
  const urlStepId = params.stepId ?? (splatPath || undefined);

  const [searchParams] = useSearchParams();
  const resumeId = searchParams.get('creative');
  const navigateRouter = useNavigate();
  const location = useLocation();

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
  const clientSlug = currentClient?.slug ?? 'test-client';

  const { stepData, mergeStepData, creativeId, reset } = usePersistedStepData<S>({
    manifest,
    clientSlug,
    resumeId,
  });

  const [validationError, setValidationError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
    [stepData, mergeStepData, navigateToStep, clientSlug, creativeId]
  );

  /**
   * Forward step transition. Fires onLeave (outgoing) + onEnter (incoming).
   * If either throws, the navigation is aborted and the user stays put —
   * matches prod behavior where a failed onEnter (e.g. analyzeCreativeIntent
   * server error) keeps the user on the current step so they can retry.
   */
  const advanceToIndex = useCallback(
    async (nextIndex: number) => {
      const outgoing = manifest.steps[currentStepIndex];
      const incoming = manifest.steps[nextIndex];
      if (!incoming) return;

      setIsLoading(true);
      try {
        const ctx = buildContext();
        if (outgoing?.onLeave) await outgoing.onLeave(ctx);
        if (incoming.onEnter) await incoming.onEnter(ctx);
        navigateToStep(incoming.id, true);
      } catch (err) {
        console.warn(
          `WizardShell: advance from "${outgoing?.id}" to "${incoming.id}" aborted —`,
          err
        );
      } finally {
        setIsLoading(false);
      }
    },
    [manifest.steps, currentStepIndex, buildContext, navigateToStep]
  );

  /**
   * Backward / jump-to-completed-step transition. Skips onLeave + onEnter
   * to mirror the monolith's Previous Step button (UseCaseWizardPage.tsx
   * lines 4280-4296), which is a free move that just rewinds the URL +
   * step state without re-running side effects. Without this, a failing
   * onEnter on the destination step (e.g. an Alli API call) would silently
   * block the user from going back.
   */
  const rewindToIndex = useCallback(
    (nextIndex: number) => {
      const incoming = manifest.steps[nextIndex];
      if (!incoming) return;
      navigateToStep(incoming.id, true);
    },
    [manifest.steps, navigateToStep]
  );

  // Live validation result drives both the disabled state of Continue and
  // the checklist rendering. We re-evaluate every render so the checklist
  // ticks fill in real time as the user fills the form.
  const validation: ValidationResult = useMemo(
    () => currentStep.validate(stepData),
    [currentStep, stepData]
  );

  const goNext = useCallback(async () => {
    setValidationError(null);
    if (!validation.ok) {
      if (validation.reason) setValidationError(validation.reason);
      return;
    }

    // Async submit takes precedence over sync next. If submit rejects, we
    // stay on the current step and surface the error — no navigation, no
    // state mutation. Pending state is shown via isLoading throughout.
    if (currentStep.submit) {
      setIsLoading(true);
      try {
        const result = await currentStep.submit(buildContext());
        let targetIndex = currentStepIndex + 1;
        if (result?.nextStepId) {
          const idx = manifest.steps.findIndex((s) => s.id === result.nextStepId);
          if (idx >= 0) {
            targetIndex = idx;
          } else {
            console.warn(
              `WizardShell: step "${currentStep.id}".submit() returned unknown nextStepId "${result.nextStepId}" — falling back to advance-by-index.`
            );
          }
        }
        if (targetIndex === currentStepIndex) {
          // Step explicitly chose to stay (e.g. "no cuts selected" guard).
          return;
        }
        if (targetIndex >= manifest.steps.length) return;
        // Use a guarded advance that doesn't double-set isLoading.
        const incoming = manifest.steps[targetIndex];
        if (!incoming) return;
        const ctx = buildContext();
        if (currentStep.onLeave) await currentStep.onLeave(ctx);
        if (incoming.onEnter) await incoming.onEnter(ctx);
        navigateToStep(incoming.id, true);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Submit failed';
        setValidationError(message);
        console.warn(
          `WizardShell: step "${currentStep.id}".submit() rejected —`,
          err
        );
      } finally {
        setIsLoading(false);
      }
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
    await advanceToIndex(targetIndex);
  }, [
    currentStep,
    validation,
    currentStepIndex,
    buildContext,
    manifest.steps,
    advanceToIndex,
    navigateToStep,
  ]);

  const goBack = useCallback(() => {
    setValidationError(null);
    if (currentStepIndex <= 0) return;
    rewindToIndex(currentStepIndex - 1);
  }, [currentStepIndex, rewindToIndex]);

  const renderProps = useMemo(() => buildContext(), [buildContext]);

  const requirements: ValidationRequirement[] | null =
    !validation.ok && Array.isArray(validation.requirements) && validation.requirements.length > 0
      ? validation.requirements
      : null;

  const isLastStep = currentStepIndex === manifest.steps.length - 1;
  const isNextDisabled = isLoading || !validation.ok;

  return (
    <div className="space-y-8" data-testid="wizard-shell">
      {import.meta.env.DEV && (
        <div
          data-testid="wizard-debug-pill"
          className="flex flex-wrap items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-[10px] font-mono text-red-900"
        >
          <span className="font-black uppercase tracking-widest">dev</span>
          <span>step={currentStep.id}</span>
          <span>
            wireframe=
            <strong>
              {(stepData as Record<string, unknown>).selectedWireframe
                ? String((stepData as Record<string, unknown>).selectedWireframe)
                : '(none)'}
            </strong>
          </span>
          <span>
            reqs=
            {Array.isArray((stepData as Record<string, unknown>).requirements)
              ? ((stepData as Record<string, unknown>).requirements as unknown[]).length
              : 0}
          </span>
          <span>creativeId={creativeId ?? '(none)'}</span>
          <span>slug={clientSlug}</span>
        </div>
      )}
      {/* Back link + title + description */}
      <div>
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm font-medium text-blue-gray-500 hover:text-blue-600"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to workflows
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-gray-900">{manifest.title}</h1>
        {manifest.description && (
          <p className="mt-1 text-sm text-blue-gray-600">{manifest.description}</p>
        )}
      </div>

      {/* Progress stepper */}
      <nav aria-label="wizard-progress" data-testid="wizard-breadcrumb">
        <ol className="flex w-full items-center">
          {manifest.steps.map((step, index) => {
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
                {/* Connector line */}
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
                      index === manifest.steps.length - 1
                        ? 'bg-transparent'
                        : index < currentStepIndex
                        ? 'bg-blue-600'
                        : 'bg-gray-300'
                    )}
                  />
                </div>

                {/* Step circle */}
                <button
                  type="button"
                  onClick={() => {
                    if (index <= currentStepIndex && !isLoading) {
                      rewindToIndex(index);
                    }
                  }}
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

                {/* Step name */}
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

      {/* Content card */}
      <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-card">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-900">{currentStep.name}</h2>
          <div className="mt-8" data-testid={`step-body-${currentStep.id}`}>
            {currentStep.render(renderProps)}
          </div>
        </div>

        {/* Validation error fallback (shown only when no structured requirements) */}
        {validationError && !requirements ? (
          <p
            role="alert"
            data-testid="wizard-validation-error"
            className="mt-6 text-center text-sm text-red-600"
          >
            {validationError}
          </p>
        ) : null}

        {/* Footer: validation checklist + Previous / Continue */}
        <div className="mt-12 pt-8 border-t border-gray-100 space-y-4">
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

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={goBack}
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
                onClick={reset}
                data-testid="wizard-reset"
                className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-300 hover:text-gray-500"
              >
                Reset
              </button>

              {!isLastStep && (
                <button
                  type="button"
                  onClick={() => void goNext()}
                  disabled={isNextDisabled}
                  className={cn(
                    'rounded-xl bg-blue-600 px-8 py-3 text-[10px] font-black text-white uppercase tracking-[0.2em] shadow-xl transition-all active:scale-95 flex items-center gap-2',
                    isNextDisabled
                      ? 'opacity-20 cursor-not-allowed grayscale bg-gray-400 shadow-none'
                      : 'hover:bg-blue-700 hover:shadow-blue-200'
                  )}
                >
                  {isLoading && <ArrowPathIcon className="h-3 w-3 animate-spin" />}
                  {isLoading ? 'Synchronizing...' : 'Continue Upstream →'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default WizardShell;
