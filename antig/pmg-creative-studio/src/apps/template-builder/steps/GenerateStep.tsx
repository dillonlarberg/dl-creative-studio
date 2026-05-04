import type { WizardStep } from '../../types';
import type { TemplateBuilderStepData } from '../types';

/**
 * Generate step — Generate Candidates.
 *
 * Lifted from UseCaseWizardPage.tsx lines 3568-3804.
 *
 * Side effect: the monolith fires `generateCandidates()` (line ~873) when
 * advancing INTO this step from `mapping` and there's no wireframe
 * (line 1249). The contract-clean equivalent is `onEnter` here — the shell
 * fires it after the navigation completes.
 */

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

  onEnter: async ({ stepData }) => {
    // Mirrors monolith line 1249 — only fire if NO wireframe was selected.
    if (!stepData.selectedWireframe) {
      // TODO(PR3-Task6 follow-up): port `generateCandidates` from
      // UseCaseWizardPage.tsx line 873. Result lands via mergeStepData
      // ({ candidates: [...] }).
    }
  },

  render: () => {
    // TODO(PR3-Task6 follow-up): lift verbatim JSX from
    //   src/pages/use-cases/UseCaseWizardPage.tsx lines 3568-3804.
    return null;
  },
};
