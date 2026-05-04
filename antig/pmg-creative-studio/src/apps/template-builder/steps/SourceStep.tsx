import type { WizardStep } from '../../types';
import type { TemplateBuilderStepData } from '../types';

/**
 * Source step — Connect Data.
 *
 * Lifted from UseCaseWizardPage.tsx lines 2695-2952.
 *
 * Validate gate (mirrors monolith line 4235): selectedFeed must be set.
 *
 * Side effects: the monolith's effect at line 713 ensures dataSources are
 * fetched on entering this step. That fetch (`fetchDataSources` line ~660)
 * lives in the alliService — port it via `onEnter` in the follow-up.
 */

export const sourceStep: WizardStep<TemplateBuilderStepData> = {
  id: 'source',
  name: 'Connect Data',

  validate: (data) => {
    if (!data.selectedFeed) return { ok: false, reason: 'Select a data source' };
    return { ok: true };
  },

  onEnter: async () => {
    // TODO(PR3-Task6 follow-up): port the data-source fetch effect from
    // UseCaseWizardPage.tsx line 713. Persist results via mergeStepData
    // or local state inside the rendered component.
  },

  render: () => {
    // TODO(PR3-Task6 follow-up): lift verbatim JSX from
    //   src/pages/use-cases/UseCaseWizardPage.tsx lines 2695-2952.
    return null;
  },
};
