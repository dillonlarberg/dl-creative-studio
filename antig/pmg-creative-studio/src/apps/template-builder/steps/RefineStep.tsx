import type { WizardStep, StepRenderProps } from '../../types';
import type { TemplateBuilderStepData } from '../types';

/**
 * Refine step — Refine Design.
 *
 * PLACEHOLDER: full JSX is monolith UseCaseWizardPage.tsx lines 3805-4140.
 * Heavy: stress-test toggle, logo scale, logo variant, headline/price
 * sizing, side-by-side FilledTemplatePreview, plus the gnarliest closure
 * dependency in the file (live re-renders against feedSampleData +
 * stressMap).
 */

function RefineStepBody(_props: StepRenderProps<TemplateBuilderStepData>) {
  return (
    <div className="p-8 text-gray-500">
      <p className="text-sm font-bold mb-2">
        Refine step — placeholder pending JSX lift
      </p>
      <p className="text-xs text-gray-400">
        Verbatim JSX lives in UseCaseWizardPage.tsx lines 3805-4140.
      </p>
    </div>
  );
}

export const refineStep: WizardStep<TemplateBuilderStepData> = {
  id: 'refine',
  name: 'Refine Design',

  validate: () => ({ ok: true }),

  render: (props) => <RefineStepBody {...props} />,
};
