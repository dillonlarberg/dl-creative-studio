import type { AppManifest } from '../types';

const manifest: AppManifest = {
  id: 'video-cutdown',
  basePath: 'video-cutdown',
  title: 'Video Cutdown',
  description: 'Turn one long video into a sharp, beat-synced 9:16 cut — 3 AI versions, pick one.',
  overview: {
    blurb: 'Cut a long video into a punchy social reel.',
    before: '/app-overviews/video-cutdown/before.webp',
    after: [
      '/app-overviews/video-cutdown/after-1.webp',
      '/app-overviews/video-cutdown/after-2.webp',
    ],
  },
  status: 'live',
  requiresBrandStandards: false,
  steps: [],
  initialStepData: () => ({}),
};

export default manifest;
