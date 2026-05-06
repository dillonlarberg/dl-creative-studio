import type { WizardStep } from '../../types';
import type { ResizeImageStepData } from '../types';

/**
 * Step 2 — Choose Sizes.
 *
 * Skeleton stub. Replace render with a multi-select of common ad sizes
 * (1080x1080, 1080x1350, 1080x1920, 728x90, etc.) and any client-specific
 * sizes pulled from the asset house. On selection change call
 * mergeStepData({ selectedSizes }).
 *
 * validate gates Continue until at least one size is picked.
 */
export const sizesStep: WizardStep<ResizeImageStepData> = {
  id: 'sizes',
  name: 'Choose Sizes',

  validate: (data) =>
    data.selectedSizes && data.selectedSizes.length > 0
      ? { ok: true }
      : { ok: false, requirements: [{ label: 'At Least One Size', met: false }] },

  render: ({ stepData }) => (
    <div className="space-y-4 text-left">
      <p className="text-sm text-blue-gray-500">
        TODO — size picker. Source:{' '}
        <strong>{stepData.sourceImageName ?? '(no image yet)'}</strong>
      </p>
      <p className="text-xs text-blue-gray-400">
        Selected: {stepData.selectedSizes?.join(', ') ?? '(none)'}
      </p>
    </div>
  ),
};
