import type { WizardStep } from '../../types';
import type { ResizeImageStepData } from '../types';

/**
 * Step 3 — Preview.
 *
 * Skeleton stub. Replace render with a grid of previews per selected size.
 *
 * Use `submit` (not `next`) for the AI-expand pipeline — it kicks off a
 * server call (Cloud Function or Replicate / similar) that generates one
 * resized variant per `selectedSizes` entry. The shell awaits and shows
 * its built-in loading state. On success call
 * mergeStepData({ previewUrls }) and submit returns { nextStepId: 'approve' }.
 * On failure throw — WizardShell will keep the user on this step and
 * surface the error in `wizard-validation-error`.
 *
 * Until the real pipeline lands, the stub `submit` resolves immediately.
 */
export const previewStep: WizardStep<ResizeImageStepData> = {
  id: 'preview',
  name: 'Preview',

  validate: () => ({ ok: true }),

  // submit: async (ctx) => {
  //   const urls = await runResizePipeline(ctx.client.slug, ctx.stepData);
  //   ctx.mergeStepData({ previewUrls: urls });
  //   return { nextStepId: 'approve' };
  // },

  render: ({ stepData }) => (
    <div className="space-y-4 text-left">
      <p className="text-sm text-blue-gray-500">
        TODO — render previews per size. Wire <code>submit</code> to the
        AI-resize pipeline before flipping the manifest to <code>live</code>.
      </p>
      <pre className="rounded bg-gray-50 p-3 text-xs text-blue-gray-600">
        {JSON.stringify(stepData.previewUrls ?? {}, null, 2)}
      </pre>
    </div>
  ),
};
