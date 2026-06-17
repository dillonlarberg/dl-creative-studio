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
import type { TemplateBuilderStepData, TemplateBuilderStep } from './types';
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
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!fromTemplateId) {
      setLoading(false);
      setLoadError(null);
      return;
    }
    if (!slug) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    templateLibraryService
      .getTemplate(slug as ClientSlug, fromTemplateId)
      .then((template) => {
        if (cancelled) return;
        const data = mapTemplateToStepData(template);
        if (isCopy) {
          data.templateName = `Copy of ${template.name}`;
        }
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(`wiz_${slug}_template-builder`);
        }
        setFromData(data);
      })
      .catch((err: Error) => { if (!cancelled) setLoadError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fromTemplateId, slug, isCopy, retryCount]);

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
  const { stepData, mergeStepData, creativeId, isLoading: isResumeLoading, discard } = usePersistedStepData<TemplateBuilderStepData>({
    manifest: resolvedManifest,
    clientSlug: slug,
    resumeId,
  });

  // Push prefill values into stepData after the ?from= fetch resolves.
  // resolvedManifest.initialStepData() is called before fromData is set (async
  // ordering), so the initialStepData override is dead on this path. Calling
  // mergeStepData here is the correct way to seed the wizard with prefill values.
  useEffect(() => {
    if (!fromData) return;
    mergeStepData(fromData as Partial<TemplateBuilderStepData>);
    // mergeStepData is stable (useCallback); fromData is the only real dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromData]);

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
    steps: resolvedManifest.steps as TemplateBuilderStep<TemplateBuilderStepData>[],
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
    Array.isArray(validation.requirements) &&
    validation.requirements.length > 0
      ? validation.requirements
      : null;

  // Stable render props — exact replica of WizardShell line 317.
  const renderProps = useMemo(() => buildContext(), [buildContext]);

  async function handleDiscard() {
    await discard();
    navigateRouter(`/adlabs/${slug}`);
  }

  // Blocking loading/error states
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
        <p className="text-sm text-blue-gray-500">Loading template…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-sm text-red-600">Failed to load template: {loadError}</p>
        <button
          type="button"
          onClick={() => setRetryCount((c) => c + 1)}
          className="text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          Try again
        </button>
      </div>
    );
  }

  // Only gate on isResumeLoading when actually resuming — the hook always starts
  // isLoading=true even for fresh sessions, so without the resumeId guard every
  // new wizard would briefly flash "Resuming your draft…".
  if (isResumeLoading && resumeId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
        <p className="text-sm text-blue-gray-500">Resuming your draft…</p>
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
              steps={resolvedManifest.steps as TemplateBuilderStep<TemplateBuilderStepData>[]}
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
