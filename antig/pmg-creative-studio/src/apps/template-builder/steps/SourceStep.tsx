import type { WizardStep, StepRenderProps } from '../../types';
import type { TemplateBuilderStepData } from '../types';

/**
 * Source step — Connect Data.
 *
 * PLACEHOLDER: full JSX is monolith UseCaseWizardPage.tsx lines 2695-2952
 * and depends on closure state (`isFetchingFeeds`, `dataSources`,
 * `feedListError`, `selectedFeed`, `feedSampleData`, `feedMetadata`,
 * `currentFeedIndex`, `isLoading`) plus three async handlers
 * (`fetchDataSources`, `fetchFeedSample`) that read/write that state.
 *
 * The lift requires either:
 *   1. Hoisting all those into local `useState` + porting `fetchFeedSample`
 *      (~150 lines) into _internal/handlers.ts, or
 *   2. Building a TemplateBuilderContext to share fetched data sources
 *      across mapping/generate/refine — which is the cleaner long-term
 *      shape.
 *
 * Deferred to a follow-up; the placeholder still routes Next correctly
 * because validate() reads `selectedFeed` from stepData.
 */

function SourceStepBody({ stepData }: StepRenderProps<TemplateBuilderStepData>) {
  return (
    <div className="p-8 text-gray-500">
      <p className="text-sm font-bold mb-2">
        Source step — placeholder pending JSX lift
      </p>
      <p className="text-xs text-gray-400">
        Verbatim JSX lives in UseCaseWizardPage.tsx lines 2695-2952.
        selectedFeed in step data: {stepData.selectedFeed ? 'set' : 'not set'}
      </p>
    </div>
  );
}

export const sourceStep: WizardStep<TemplateBuilderStepData> = {
  id: 'source',
  name: 'Connect Data',

  validate: (data) => {
    if (!data.selectedFeed) return { ok: false, reason: 'Select a data source' };
    return { ok: true };
  },

  render: (props) => <SourceStepBody {...props} />,
};
