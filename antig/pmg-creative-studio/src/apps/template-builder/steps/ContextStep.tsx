import type { WizardStep } from '../../types';
import type { TemplateBuilderStepData } from '../types';
import { SOCIAL_WIREFRAMES } from '../../../constants/useCases';

/**
 * Context step — Define Context.
 *
 * Lifted from UseCaseWizardPage.tsx lines 2221-2538 (the
 * `steps[currentStep].id === 'context'` block inside the
 * `useCaseId === 'template-builder'` branch).
 *
 * Critical contract feature: the step's `next()` override mirrors monolith
 * line 1219 — when a wireframe is selected, skip the `intent` step and jump
 * straight to `source`, AND auto-populate requirements from the wireframe's
 * minRequirements list. The auto-populate effect is fired through
 * `mergeStepData` so it persists immediately.
 */

export const contextStep: WizardStep<TemplateBuilderStepData> = {
  id: 'context',
  name: 'Define Context',

  validate: (data) => {
    const hasTitle = !!data.jobTitle?.trim();
    const hasChannel = !!data.channel;
    const hasSizes = (data.ratios?.length ?? 0) > 0;
    if (!hasTitle) return { ok: false, reason: 'Project title required' };
    if (!hasChannel) return { ok: false, reason: 'Channel required' };
    if (!hasSizes) return { ok: false, reason: 'At least one size required' };
    return { ok: true };
  },

  /**
   * Mirrors monolith line 1219.
   *
   * When the user has selected a wireframe in this step, two things happen:
   *   1. Auto-build a requirements list from the wireframe's minRequirements
   *      so the `intent` step's manual synthesis is unnecessary.
   *   2. Skip `intent` entirely — return 'source' so the WizardShell jumps
   *      ahead instead of advancing by index.
   *
   * When no wireframe is selected, return undefined so the shell falls back
   * to advance-by-index (→ `intent`).
   */
  next: ({ stepData, mergeStepData }) => {
    if (!stepData.selectedWireframe) return undefined;

    const wireframeDef = SOCIAL_WIREFRAMES.find(
      (w) => w.id === stepData.selectedWireframe
    );
    if (wireframeDef?.minRequirements) {
      const autoReqs = wireframeDef.minRequirements.map((req: string) => {
        const lower = req.toLowerCase();
        const isImage = lower.includes('image') || lower.includes('background');
        const isCurrency = lower.includes('price') || lower.includes('cost');
        const isBrand = lower.includes('logo');
        return {
          id: req.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase(),
          label: req,
          category: (isBrand ? 'Brand' : 'Dynamic') as 'Brand' | 'Dynamic',
          source: isBrand ? 'Creative House' : 'Feed',
          type: (isImage ? 'image' : isCurrency ? 'currency' : 'text') as
            | 'image'
            | 'currency'
            | 'text',
        };
      });
      mergeStepData({
        requirements: autoReqs,
        areRequirementsApproved: true,
      });
    }
    return 'source';
  },

  render: () => {
    // TODO(PR3-Task6 follow-up): lift verbatim JSX from
    //   src/pages/use-cases/UseCaseWizardPage.tsx lines 2221-2538.
    // The render must wire `stepData.jobTitle`, `stepData.channel`,
    // `stepData.ratios`, `stepData.selectedWireframe`, `stepData.wireframeFile`
    // through `mergeStepData(...)` instead of the monolith's local setters.
    // BASELINE_ASSETS spread happens on wireframe selection — see lines 2278-2287.
    return null;
  },
};
