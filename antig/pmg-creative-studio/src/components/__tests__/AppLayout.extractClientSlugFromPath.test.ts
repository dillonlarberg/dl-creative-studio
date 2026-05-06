import { describe, it, expect } from 'vitest';
import { extractClientSlugFromPath } from '../AppLayout';

/**
 * Step 0 of AdLabs v1 plan — slug extractor unit tests.
 * Gates the route-reconcile half of the completeness tracer.
 */
describe('extractClientSlugFromPath', () => {
  it('returns null for reserved top-level paths', () => {
    expect(extractClientSlugFromPath('/')).toBeNull();
    expect(extractClientSlugFromPath('/login')).toBeNull();
    expect(extractClientSlugFromPath('/select-client')).toBeNull();
    expect(extractClientSlugFromPath('/create')).toBeNull();
    expect(extractClientSlugFromPath('/create/new-image')).toBeNull();
    expect(extractClientSlugFromPath('/client-asset-house')).toBeNull();
  });

  it('extracts clientSlug from /adlabs/:clientSlug/...', () => {
    expect(extractClientSlugFromPath('/adlabs/ralph_lauren')).toBe('ralph_lauren');
    expect(extractClientSlugFromPath('/adlabs/ralph_lauren/')).toBe('ralph_lauren');
    expect(extractClientSlugFromPath('/adlabs/ralph_lauren/template-builder')).toBe(
      'ralph_lauren'
    );
    expect(
      extractClientSlugFromPath('/adlabs/ralph_lauren/template-builder/configure')
    ).toBe('ralph_lauren');
  });

  it('extracts clientSlug from legacy /:clientSlug/template-builder/... mount', () => {
    expect(extractClientSlugFromPath('/ralph_lauren/template-builder')).toBe(
      'ralph_lauren'
    );
    expect(
      extractClientSlugFromPath('/ralph_lauren/template-builder/configure')
    ).toBe('ralph_lauren');
  });

  it('does not treat reserved second-level segments as slugs', () => {
    expect(extractClientSlugFromPath('/adlabs')).toBeNull();
    expect(extractClientSlugFromPath('/adlabs/')).toBeNull();
  });

  it('rejects unknown app basePaths under /:clientSlug/<unknown>', () => {
    expect(extractClientSlugFromPath('/ralph_lauren/some-future-app')).toBeNull();
    expect(extractClientSlugFromPath('/ralph_lauren/random')).toBeNull();
  });
});
