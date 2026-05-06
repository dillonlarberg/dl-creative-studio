/**
 * Step barrel for the Resize Image app. Mirrors the template-builder
 * pattern — one file per step component, exported through this barrel,
 * consumed by manifest.ts.
 */
export { uploadStep } from './steps/UploadStep';
export { sizesStep } from './steps/SizesStep';
export { previewStep } from './steps/PreviewStep';
export { approveStep } from './steps/ApproveStep';
