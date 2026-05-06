import type { WizardStep } from '../../types';
import type { ResizeImageStepData } from '../types';

/**
 * Step 4 — Approve & Download.
 *
 * Skeleton stub. Final step — terminal in the WizardShell sense (the shell
 * hides the Continue button on the last step; render an explicit Approve
 * + Download button inside the step body).
 *
 * On approve:
 *   1. Call batchService.createBatch('resize-image', { ... }) — see
 *      template-builder/_internal/handlers.ts for the established pattern.
 *      The path-scoped writer puts the doc at
 *      clients/{slug}/apps/resize-image/batches/{batchId}.
 *   2. Add one BatchResult per generated size via batchService.addResult().
 *   3. Mark the batch 'completed' via batchService.updateBatchStatus().
 *   4. mergeStepData({ approved: true, batchId }) so a refresh restores it.
 *   5. Surface download links (one per size).
 */
export const approveStep: WizardStep<ResizeImageStepData> = {
  id: 'approve',
  name: 'Approve & Download',

  validate: () => ({ ok: true }),

  render: ({ stepData }) => (
    <div className="space-y-4 text-left">
      <p className="text-sm text-blue-gray-500">
        TODO — Approve button + download grid. Sizes to deliver:
      </p>
      <pre className="rounded bg-gray-50 p-3 text-xs text-blue-gray-600">
        {JSON.stringify(stepData.selectedSizes ?? [], null, 2)}
      </pre>
      {stepData.approved && stepData.batchId && (
        <p className="text-xs text-green-700">
          Approved · batch {stepData.batchId}
        </p>
      )}
    </div>
  ),
};
