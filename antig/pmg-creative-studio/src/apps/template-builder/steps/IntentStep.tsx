import type { WizardStep } from '../../types';
import type { TemplateBuilderStepData } from '../types';

/**
 * Intent step — Synthesize Design Requirements.
 *
 * Lifted from UseCaseWizardPage.tsx lines 2539-2693.
 *
 * Auto-trigger: when a wireframe was already selected in `context`, the
 * monolith's effect at line 1013 fires `analyzeCreativeIntent()` on enter
 * if `requirements` is empty. We replicate that as `onEnter` below — note
 * the actual analyzeCreativeIntent helper is defined in the monolith at
 * line 521 and must be ported alongside the JSX in the follow-up commit.
 *
 * Validate gate (mirrors monolith line 4234):
 *   prompt + requirements.length > 0 + areRequirementsApproved
 */

export const intentStep: WizardStep<TemplateBuilderStepData> = {
  id: 'intent',
  name: 'Define Intent',

  validate: (data) => {
    if (!data.prompt?.trim()) return { ok: false, reason: 'Creative prompt required' };
    if (!data.requirements || data.requirements.length === 0) {
      return { ok: false, reason: 'Synthesize requirements before continuing' };
    }
    if (!data.areRequirementsApproved) {
      return { ok: false, reason: 'Requirements must be approved' };
    }
    return { ok: true };
  },

  // Auto-trigger requirement synthesis when entering the step with a
  // wireframe already selected and no requirements yet (monolith line 1013).
  onEnter: async ({ stepData, mergeStepData: _mergeStepData }) => {
    const hasWireframe = !!stepData.selectedWireframe;
    const empty = !stepData.requirements || stepData.requirements.length === 0;
    if (hasWireframe && empty) {
      // TODO(PR3-Task6 follow-up): port `analyzeCreativeIntent` from
      // UseCaseWizardPage.tsx line 521. Result should land via
      // mergeStepData({ requirements: [...] }).
    }
  },

  render: () => {
    // TODO(PR3-Task6 follow-up): lift verbatim JSX from
    //   src/pages/use-cases/UseCaseWizardPage.tsx lines 2539-2693.
    // Wire stepData.prompt, stepData.requirements, stepData.areRequirementsApproved.
    return null;
  },
};
