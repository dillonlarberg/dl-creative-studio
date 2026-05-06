import type { AppManifest, StepData, WizardStep } from '../types';

/**
 * Batch Variants — preview-status stub manifest (Step 1 of AdLabs v1 plan).
 *
 * Registered to demonstrate the multi-app shell on the dashboard before the
 * full lift work ships. WizardShell renders the preview view (no Continue,
 * no checklist, no persistence) when status === 'preview'. The single stub
 * step exists only to satisfy the AppManifest contract — it is never
 * rendered.
 */

interface BatchVariantsStubData extends StepData {}

const stubStep: WizardStep<BatchVariantsStubData> = {
  id: 'preview',
  name: 'Preview',
  validate: () => ({ ok: false, reason: 'Not yet available' }),
  render: () => null,
};

const manifest: AppManifest<BatchVariantsStubData> = {
  id: 'batch-variants',
  basePath: 'batch-variants',
  title: 'Batch Variants',
  description: 'Generate variants of an approved creative across sizes and copy.',
  status: 'preview',
  // Preview-status apps are not gated — they only show a "Coming soon" view,
  // so the brand-standards check would block users from a harmless surface.
  requiresBrandStandards: false,
  steps: [stubStep],
  initialStepData: () => ({}),
};

export default manifest;
