import type { AppManifest, StepData } from '../types';

/**
 * Video Stitch — LIVE (Slice 1 Lane B). A "lifted" app: AppRoot owns all UI
 * (mounted directly in App.tsx, not via WizardShell), so `steps` is empty.
 */
const manifest: AppManifest<StepData> = {
  id: 'video-stitch',
  basePath: 'video-stitch',
  title: 'Video Stitch',
  description: 'Stitch curated clips from your library into a beat-synced 15s social reel.',
  status: 'live',
  requiresBrandStandards: false,
  steps: [],
  initialStepData: () => ({}),
};

export default manifest;
