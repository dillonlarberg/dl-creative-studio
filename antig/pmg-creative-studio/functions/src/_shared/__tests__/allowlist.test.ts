import { describe, expect, it } from 'vitest';
import { ALLI_STUDIO_USERS, isAlliStudioUserEmail } from '../allowlist';

describe('ALLI_STUDIO_USERS', () => {
  it('is a non-empty Set of strings', () => {
    expect(ALLI_STUDIO_USERS.size).toBeGreaterThan(0);
    for (const email of ALLI_STUDIO_USERS) {
      expect(typeof email).toBe('string');
    }
  });

  it('contains only @pmg.com addresses', () => {
    for (const email of ALLI_STUDIO_USERS) {
      expect(email).toMatch(/@pmg\.com$/);
    }
  });

  it('contains only lowercase addresses (rules and TS comparisons are case-sensitive)', () => {
    for (const email of ALLI_STUDIO_USERS) {
      expect(email).toBe(email.toLowerCase());
    }
  });
});

describe('isAlliStudioUserEmail', () => {
  it('returns true for an allowlisted email', () => {
    const someAllowed = ALLI_STUDIO_USERS.values().next().value!;
    expect(isAlliStudioUserEmail(someAllowed)).toBe(true);
  });

  it('returns false for a non-allowlisted email', () => {
    expect(isAlliStudioUserEmail('random@example.com')).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isAlliStudioUserEmail(undefined)).toBe(false);
  });

  it('is case-sensitive (preventing case-mismatch bypasses)', () => {
    const someAllowed = ALLI_STUDIO_USERS.values().next().value!;
    expect(isAlliStudioUserEmail(someAllowed.toUpperCase())).toBe(false);
  });
});
