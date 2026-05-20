// HISTORICAL COMPAT TEST — the outpaintOutputs aliases were deleted in
// #thegreatmigration no. 11. This test is retained only to pin the
// canonical paths.outputs / paths.output shape so a future rename can't
// silently break collectionGroup queries elsewhere in the codebase.

import { describe, it, expect } from 'vitest';
import { paths } from '../../src/platform/firebase/paths';

describe('paths: canonical outputs collection shape', () => {
  const slug = 'apple_services';
  const appId = 'ad-resizing';
  const outputId = 'o-deadbeef';

  it('canonical paths.outputs returns the documented per-app collection', () => {
    expect(paths.outputs(slug, appId)).toBe(
      `clients/${slug}/apps/${appId}/outputs`,
    );
  });

  it('canonical paths.output returns the documented per-app doc path', () => {
    expect(paths.output(slug, appId, outputId)).toBe(
      `clients/${slug}/apps/${appId}/outputs/${outputId}`,
    );
  });
});
