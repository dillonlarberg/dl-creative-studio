import type { WizardStep } from '../../types';
import type { ResizeImageStepData } from '../types';

/**
 * Step 1 — Select Image.
 *
 * Skeleton stub. Replace render with a real upload control:
 *   - <input type="file" accept="image/*"> or drag-drop
 *   - On upload: write to Cloud Storage at
 *     `clients/{slug}/apps/resize-image/sources/{timestamp}-{name}`
 *     using the `paths.storage.app(slug, 'resize-image', ...)` helper.
 *   - mergeStepData({ sourceImageUrl, sourceImagePath, sourceImageName })
 *
 * validate must return ok:false until sourceImageUrl is set, otherwise
 * the user can advance with no image picked.
 */
export const uploadStep: WizardStep<ResizeImageStepData> = {
  id: 'upload',
  name: 'Select Image',

  validate: (data) =>
    data.sourceImageUrl
      ? { ok: true }
      : { ok: false, requirements: [{ label: 'Image Selected', met: false }] },

  render: ({ stepData }) => (
    <div className="space-y-4 text-left">
      <p className="text-sm text-blue-gray-500">
        TODO — upload control goes here. On success, call{' '}
        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">
          mergeStepData(&#123; sourceImageUrl, sourceImagePath, sourceImageName &#125;)
        </code>
        .
      </p>
      <pre className="rounded bg-gray-50 p-3 text-xs text-blue-gray-600">
        {JSON.stringify(
          {
            sourceImageUrl: stepData.sourceImageUrl ?? null,
            sourceImageName: stepData.sourceImageName ?? null,
          },
          null,
          2
        )}
      </pre>
    </div>
  ),
};
