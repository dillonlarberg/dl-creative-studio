import WizardShell from '../../platform/wizard/WizardShell';
import manifest from './manifest';
import type { TemplateBuilderStepData } from './types';

/**
 * Mount point for the Dynamic Template Builder app. Routed under
 * `/:clientSlug/template-builder/*` (the route is wired in PR 3 Task 7).
 */
export default function TemplateBuilderAppRoot() {
  return <WizardShell<TemplateBuilderStepData> manifest={manifest} />;
}
