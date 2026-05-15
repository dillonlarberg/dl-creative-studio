// COMPAT TEST — keep until: Task 17 (compat framework setup) is verified, then delete
// Pins: vitest picks up tests/compat/**/*.test.ts via vitest.config.ts include glob.

import { describe, it, expect } from 'vitest';

describe('compat framework smoke', () => {
  it('vitest picks up tests/compat', () => {
    expect(true).toBe(true);
  });
});
