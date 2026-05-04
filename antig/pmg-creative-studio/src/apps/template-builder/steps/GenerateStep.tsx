import type { WizardStep, StepRenderProps } from '../../types';
import type { TemplateBuilderStepData } from '../types';
import { generateCandidates } from '../_internal/handlers';

/**
 * Generate step — Generate Candidates.
 *
 * PLACEHOLDER: full JSX is monolith UseCaseWizardPage.tsx lines 3568-3804.
 * Closure-coupled (`isGeneratingCandidates`, `candidates`,
 * `selectedCandidateIndex`, `assetHouse`).
 *
 * The candidate-generation handler IS ported (see _internal/handlers.ts
 * `generateCandidates`) and wired through onEnter below — only the UI
 * presentation is deferred.
 */

function GenerateStepBody({ stepData }: StepRenderProps<TemplateBuilderStepData>) {
  const cands = stepData.candidates ?? [];
  return (
    <div className="p-8 text-gray-500">
      <p className="text-sm font-bold mb-2">
        Generate step — placeholder pending JSX lift
      </p>
      <p className="text-xs text-gray-400">
        Verbatim JSX lives in UseCaseWizardPage.tsx lines 3568-3804.
        Candidates ready: {cands.length}
      </p>
    </div>
  );
}

export const generateStep: WizardStep<TemplateBuilderStepData> = {
  id: 'generate',
  name: 'Generate Candidates',

  validate: (data) => {
    if (!data.candidates || data.candidates.length === 0) {
      return { ok: false, reason: 'Wait for candidate generation to finish' };
    }
    if (
      data.selectedCandidateIndex === undefined ||
      data.selectedCandidateIndex === null
    ) {
      return { ok: false, reason: 'Select a candidate to continue' };
    }
    return { ok: true };
  },

  // Mirrors monolith line 1249 — only fire if NO wireframe was selected.
  // The asset-house lookup is deferred (would require platform-level
  // context); for now we pass `null` so the handler still produces brand
  // defaults.
  onEnter: async ({ stepData, mergeStepData }) => {
    if (stepData.selectedWireframe) return;
    if (stepData.candidates && stepData.candidates.length > 0) return;
    const { candidates, selectedIndex } = await generateCandidates({
      selectedWireframe: stepData.selectedWireframe,
      requirements: stepData.requirements ?? [],
      assetHouse: null,
    });
    mergeStepData({ candidates, selectedCandidateIndex: selectedIndex });
  },

  render: (props) => <GenerateStepBody {...props} />,
};
