import WizardShell from '../../platform/wizard/WizardShell';
import manifest from './manifest';
import type { ResizeImageStepData } from './types';

/**
 * Mount point for the Resize Image app. Routed under
 * `/adlabs/:clientSlug/resize-image/*` (see src/App.tsx).
 *
 * Mirrors `src/apps/template-builder/AppRoot.tsx`. If you find yourself
 * adding logic here, that logic almost certainly belongs in a step
 * component or in `_internal/handlers.ts` instead — keep this file a
 * single-line mount.
 */
export default function ResizeImageAppRoot() {
  return <WizardShell<ResizeImageStepData> manifest={manifest} />;
}
