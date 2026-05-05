import type { AppManifest, StepData, WizardStep } from '../types';

/**
 * Video Cutdown — Step 2 stub manifest.
 *
 * The full lift from src/pages/use-cases/UseCaseWizardPage.tsx is parked as
 * its own multi-PR effort (see plan Step 2 — 8 branch points, async-submit
 * orchestration, FFmpeg + Gemini integration, regression test backfill).
 *
 * For now: a preview-status stub so the dashboard can render a clickable
 * card (when VITE_FEATURE_VIDEO_CUTDOWN_LIFT=true) that lands on a
 * "Lift in progress" panel — proves the registry path is reserved without
 * shipping a half-built wizard.
 */

interface VideoCutdownStubData extends StepData {}

const stubStep: WizardStep<VideoCutdownStubData> = {
  id: 'preview',
  name: 'Preview',
  validate: () => ({ ok: false, reason: 'Lift in progress' }),
  render: () => null,
};

const manifest: AppManifest<VideoCutdownStubData> = {
  id: 'video-cutdown',
  basePath: 'video-cutdown',
  title: 'Video Cutdown',
  description:
    'AI-driven cutdown of long-form video into 6/15/30s variants. Lift in progress.',
  status: 'preview',
  // Once lifted, this should require brand standards (matches the legacy
  // UseCase.requiresBrandStandards = true on new-video).
  requiresBrandStandards: false,
  steps: [stubStep],
  initialStepData: () => ({}),
};

export default manifest;
