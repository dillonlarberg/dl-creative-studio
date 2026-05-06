import type { AppManifest } from '../types';
import type { ResizeImageStepData } from './types';
import { uploadStep, sizesStep, previewStep, approveStep } from './steps';

/**
 * Resize Image — skeleton manifest.
 *
 * STATUS: 'live' so the dashboard card is clickable and Annie can dev
 * against the real wizard chrome from day one. Each step renders a TODO
 * placeholder; validators are permissive (Continue is always enabled
 * except where a real requirement is listed).
 *
 * BEFORE FLIPPING TO PRODUCTION:
 *   1. Wire upload → Cloud Storage in UploadStep.
 *   2. Replace SizesStep render with a real picker.
 *   3. Wire PreviewStep.submit to the AI-resize pipeline (Replicate or
 *      a Cloud Function). Reject on failure so the shell holds the user.
 *   4. Wire ApproveStep to batchService.createBatch('resize-image', ...).
 *   5. Set requiresBrandStandards: true once the flow consumes brand
 *      tokens (color, font) from the asset house.
 *   6. Add unit + Playwright tracers (see kickoff doc).
 */
const manifest: AppManifest<ResizeImageStepData> = {
  id: 'resize-image',
  basePath: 'resize-image',
  title: 'Resize Image',
  description:
    'Lift an approved creative into Brand Asset House and AI-expand it for new dimensions.',
  status: 'live',
  // Flip to true once UploadStep / PreviewStep depend on brand tokens.
  requiresBrandStandards: false,
  steps: [uploadStep, sizesStep, previewStep, approveStep],
  initialStepData: () => ({}),
};

export default manifest;
