import type { AppManifest, StepData, WizardStep } from '../types';

/**
 * Video Stitch — preview-status stub manifest.
 *
 * Registered to demonstrate the multi-app shell on the dashboard before the
 * full lift work ships. WizardShell renders the preview view (no Continue,
 * no checklist, no persistence) when status === 'preview'. The single stub
 * step exists only to satisfy the AppManifest contract — it is never
 * rendered.
 */

type VideoStitchStubData = StepData;

const stubStep: WizardStep<VideoStitchStubData> = {
  id: 'preview',
  name: 'Preview',
  validate: () => ({ ok: false, reason: 'Not yet available' }),
  render: () => null,
};

const manifest: AppManifest<VideoStitchStubData> = {
  id: 'video-stitch',
  basePath: 'video-stitch',
  title: 'Video Stitch',
  description: 'Stitch multiple clips into one sequenced cut with transitions and timing controls.',
  status: 'preview',
  // Preview-status apps are not gated — they only show a "Coming soon" view,
  // so the brand-standards check would block users from a harmless surface.
  requiresBrandStandards: false,
  steps: [stubStep],
  initialStepData: () => ({}),
};

export default manifest;
