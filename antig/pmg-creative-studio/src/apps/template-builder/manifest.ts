import type { AppManifest } from '../types';
import type { TemplateBuilderStepData } from './types';
import {
  contextStep,
  intentStep,
  sourceStep,
  mappingStep,
  generateStep,
  refineStep,
  exportStep,
} from './steps';

/**
 * Manifest for the Dynamic Template Builder app.
 *
 * Lifted from UseCaseWizardPage.tsx — the per-step list at line 387 plus
 * the conditional next-step logic at lines 1219, 1245, 1248. The 7 steps
 * map 1:1 with WIZARD_STEPS['template-builder'].
 *
 * onMount fires the data-source / template / asset-house preload that the
 * monolith ran in its mount effect (line 476). The actual fetch helpers
 * live in services/templates.ts, services/alli.ts, and
 * services/clientAssetHouse.ts and are unchanged.
 */

const manifest: AppManifest<TemplateBuilderStepData> = {
  id: 'template-builder',
  basePath: 'template-builder',
  title: 'Dynamic Template Builder',
  description: 'Create or edit HTML templates for dynamic product ads — connect to product feeds and preview.',
  steps: [
    contextStep,
    intentStep,
    sourceStep,
    mappingStep,
    generateStep,
    refineStep,
    exportStep,
  ],

  onMount: async () => {
    // TODO(PR3-Task6 follow-up): port the mount-effect side effects from
    // UseCaseWizardPage.tsx line 476:
    //   - templateService.getTemplates(client.slug)
    //   - alliService.getDataSources(client.slug)
    //   - clientAssetHouseService.getAssetHouse(client.slug)
    // Results should be exposed to step renders via React context, NOT
    // crammed into stepData (they're shared, read-only fixtures).
  },

  initialStepData: () => ({}),
};

export default manifest;
