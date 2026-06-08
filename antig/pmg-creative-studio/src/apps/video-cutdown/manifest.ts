import type { AppManifest } from '../types';

const manifest: AppManifest = {
  id: 'video-cutdown',
  basePath: 'video-cutdown',
  title: 'Video Cutdown',
  description: 'Turn one long video into a sharp, beat-synced 9:16 cut — 3 AI versions, pick one.',
  status: 'live',
  requiresBrandStandards: false,
  steps: [],
  initialStepData: () => ({}),
};

export default manifest;
