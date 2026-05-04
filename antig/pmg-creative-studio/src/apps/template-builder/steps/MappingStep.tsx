import type { WizardStep, StepRenderProps } from '../../types';
import type { TemplateBuilderStepData } from '../types';

/**
 * Mapping step — Map Fields.
 *
 * PLACEHOLDER: full JSX is monolith UseCaseWizardPage.tsx lines 2953-3567.
 * Heavy reliance on closure state (`feedSampleData`, `feedMetadata`,
 * `feedMappings`, `requirements`, `currentFeedIndex`, `textStressTest`)
 * plus the FilledTemplatePreview side-by-side preview.
 *
 * Deferred to a follow-up; the next() override is preserved so the
 * skip-to-`refine` wireframe path still works once the JSX lands.
 */

function MappingStepBody({ stepData }: StepRenderProps<TemplateBuilderStepData>) {
  const reqCount = stepData.requirements?.length ?? 0;
  const mapCount = Object.keys(stepData.feedMappings ?? {}).length;
  return (
    <div className="p-8 text-gray-500">
      <p className="text-sm font-bold mb-2">
        Mapping step — placeholder pending JSX lift
      </p>
      <p className="text-xs text-gray-400">
        Verbatim JSX lives in UseCaseWizardPage.tsx lines 2953-3567.
        Requirements: {reqCount}, mappings recorded: {mapCount}
      </p>
    </div>
  );
}

export const mappingStep: WizardStep<TemplateBuilderStepData> = {
  id: 'mapping',
  name: 'Map Fields',

  validate: (data) => {
    const reqs = data.requirements ?? [];
    const dynamic = reqs.filter((r) => r.category === 'Dynamic');
    const mappings = data.feedMappings ?? {};
    const unmapped = dynamic.find((r) => !mappings[r.id]);
    if (unmapped) {
      return { ok: false, reason: `Map a feed field to "${unmapped.label}"` };
    }
    return { ok: true };
  },

  next: ({ stepData }) => {
    if (stepData.selectedWireframe) {
      return 'refine';
    }
    return undefined;
  },

  render: (props) => <MappingStepBody {...props} />,
};
