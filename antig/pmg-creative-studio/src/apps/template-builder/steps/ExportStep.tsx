import type { WizardStep } from '../../types';
import type { TemplateBuilderStepData } from '../types';

/**
 * Export step — Batch & Export.
 *
 * Lifted from UseCaseWizardPage.tsx lines 4141-4194. Triggers
 * `handleExecuteBatch` (monolith line 637) which calls batchService.
 */

export const exportStep: WizardStep<TemplateBuilderStepData> = {
  id: 'export',
  name: 'Batch & Export',

  validate: () => ({ ok: true }),

  render: () => {
    // TODO(PR3-Task6 follow-up): lift verbatim JSX from
    //   src/pages/use-cases/UseCaseWizardPage.tsx lines 4141-4194.
    // Wire the "Execute Batch Deployment" button to a port of
    // `handleExecuteBatch` (monolith line 637) which uses
    // `batchService.createBatch`.
    return null;
  },
};
