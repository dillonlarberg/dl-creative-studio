import type { AppManifest } from '../types';
import type { TemplateBuilderStepData } from './types';
import { setupStep } from './steps/SetupStep';
import { designStep } from './steps/DesignStep';
import { publishStep } from './steps/PublishStep';

const manifest: AppManifest<TemplateBuilderStepData> = {
  id: 'template-builder',
  basePath: 'template-builder',
  title: 'Template Builder',
  description: 'Build and publish dynamic ad templates for use across all channels.',
  status: 'live',
  requiresBrandStandards: true,
  steps: [setupStep, designStep, publishStep],
  initialStepData: () => ({
    templateName: `Untitled Template — ${new Date().toLocaleDateString()}`,
  }),
};

export default manifest;
