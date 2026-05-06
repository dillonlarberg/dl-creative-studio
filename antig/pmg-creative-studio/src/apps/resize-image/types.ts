import type { StepData } from '../types';

/**
 * Step data shape for the Resize Image app.
 *
 * Owns ALL state that needs to persist across steps + survive a page
 * refresh. WizardShell + usePersistedStepData write this to localStorage
 * keyed by manifest.id, so types here are also the persistence schema —
 * keep fields JSON-serializable (no Blob, no FileList, no Date instances —
 * use ISO strings instead).
 *
 * Uploaded image files are NOT stored here; persist their Cloud Storage
 * download URL after upload completes (see _internal/handlers.ts pattern
 * in template-builder).
 */
export interface ResizeImageStepData extends StepData {
  /** Upload step output. Cloud Storage download URL of the source image. */
  sourceImageUrl?: string;
  /** Cloud Storage path the source was written to (for retry/cleanup). */
  sourceImagePath?: string;
  /** Free-form display name to show in subsequent steps. */
  sourceImageName?: string;

  /** Sizes step output. Each picked dimension as `{w}x{h}`. */
  selectedSizes?: string[];

  /** Preview step output. URLs of generated previews keyed by size. */
  previewUrls?: Record<string, string>;

  /** Approve step output. Whether user approved the batch (gates download). */
  approved?: boolean;
  /** ID of the BatchRecord written when the user approves. */
  batchId?: string;
}
