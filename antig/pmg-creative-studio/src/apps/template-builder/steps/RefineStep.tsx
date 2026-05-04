import type { WizardStep } from '../../types';
import type { TemplateBuilderStepData } from '../types';

/**
 * Refine step — Refine Design.
 *
 * Lifted from UseCaseWizardPage.tsx lines 3805-4140. Includes stress-test
 * toggle (normal/shortest/longest), logo scale + variant, headline/price
 * sizing.
 */

export const refineStep: WizardStep<TemplateBuilderStepData> = {
  id: 'refine',
  name: 'Refine Design',

  validate: () => ({ ok: true }), // monolith has no hard gate here

  render: () => {
    // TODO(PR3-Task6 follow-up): lift verbatim JSX from
    //   src/pages/use-cases/UseCaseWizardPage.tsx lines 3805-4140.
    return null;
  },
};
