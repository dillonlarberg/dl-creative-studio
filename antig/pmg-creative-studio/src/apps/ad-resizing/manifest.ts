import type { AppManifest } from '../types';

const manifest: AppManifest = {
  id: 'ad-resizing',
  basePath: 'ad-resizing',
  title: 'Resize Image',
  description: 'Select a creative, choose target channels, and generate resized outputs for any placement.',
  overview: {
    blurb: 'One creative, resized for every placement.',
    before: '/app-overviews/ad-resizing/before.jpeg',
    after: [
      '/app-overviews/ad-resizing/after-1.png',
      '/app-overviews/ad-resizing/after-2.png',
    ],
  },
  status: 'live',
  requiresBrandStandards: false,
  steps: [],
  initialStepData: () => ({}),
};

export default manifest;
