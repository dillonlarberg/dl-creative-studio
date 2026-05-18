// COMPAT TEST — keep until: the deprecated outpaintOutputs aliases are deleted
//                          (follow-up cleanup after Task 11, per plan P2#8).
// Pins: paths.outputs / paths.output must resolve to the same Firestore paths
// as the legacy paths.outpaintOutputs / paths.outpaintOutput aliases during
// the migration window. If they ever diverge, dual-writers + readers split.

import { describe, it, expect } from 'vitest';
import { paths } from '../../src/platform/firebase/paths';

describe('paths: outputs ⇄ outpaintOutputs alias parity', () => {
  const slug = 'apple_services';
  const appId = 'ad-resizing';
  const outputId = 'o-deadbeef';

  it('paths.outputs equals paths.outpaintOutputs (collection path)', () => {
    expect(paths.outputs(slug, appId)).toBe(paths.outpaintOutputs(slug, appId));
  });

  it('paths.output equals paths.outpaintOutput (document path)', () => {
    expect(paths.output(slug, appId, outputId)).toBe(
      paths.outpaintOutput(slug, appId, outputId)
    );
  });

  it('canonical path is the documented one', () => {
    expect(paths.outputs(slug, appId)).toBe(
      `clients/${slug}/apps/${appId}/outputs`
    );
    expect(paths.output(slug, appId, outputId)).toBe(
      `clients/${slug}/apps/${appId}/outputs/${outputId}`
    );
  });
});
