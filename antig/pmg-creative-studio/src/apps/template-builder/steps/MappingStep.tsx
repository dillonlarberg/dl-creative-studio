import type { WizardStep } from '../../types';
import type { TemplateBuilderStepData } from '../types';

/**
 * Mapping step — Map Fields.
 *
 * Lifted from UseCaseWizardPage.tsx lines 2953-3567.
 *
 * Validate gate (monolith line 4236): every Dynamic-category requirement
 * must have a feed-mapping entry.
 *
 * Critical contract feature: this step's `next()` override mirrors monolith
 * lines 1245-1250, the gnarliest skip-ahead in the whole monolith:
 *
 *   - If `selectedWireframe` is set: jump to `refine` (skip `generate`).
 *     The wireframe is already a finalized template — no candidate
 *     generation needed.
 *   - Else (no wireframe — pure-AI flow): advance by index to `generate`,
 *     and the original code synchronously kicks off `generateCandidates()`
 *     as a side effect. We move the kickoff into `generate.onEnter` so the
 *     contract stays clean (`next()` returns; `onEnter` does the work).
 */

export const mappingStep: WizardStep<TemplateBuilderStepData> = {
  id: 'mapping',
  name: 'Map Fields',

  validate: (data) => {
    const reqs = data.requirements ?? [];
    const dynamic = reqs.filter((r) => r.category === 'Dynamic');
    const mappings = data.feedMappings ?? {};
    const unmapped = dynamic.find((r) => !mappings[r.id]);
    if (unmapped) {
      return { ok: false, reason: `Map a feed field to "${unmapped.label}"` };
    }
    return { ok: true };
  },

  /**
   * Mirrors monolith lines 1245 + 1248.
   *
   *   line 1245: wireframe path → return 'refine' (skip generate).
   *   line 1248: no-wireframe path → advance by index (returns undefined),
   *              and `generate.onEnter` triggers candidate generation.
   */
  next: ({ stepData }) => {
    if (stepData.selectedWireframe) {
      return 'refine';
    }
    return undefined;
  },

  render: () => {
    // TODO(PR3-Task6 follow-up): lift verbatim JSX from
    //   src/pages/use-cases/UseCaseWizardPage.tsx lines 2953-3567.
    return null;
  },
};
