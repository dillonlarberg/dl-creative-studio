import { describe, it, expect } from 'vitest';
import { newId } from '../ids';

describe('newId', () => {
  it('returns a non-empty string', () => {
    expect(typeof newId()).toBe('string');
    expect(newId().length).toBeGreaterThan(0);
  });

  it('returns unique values on successive calls', () => {
    const a = newId();
    const b = newId();
    expect(a).not.toBe(b);
  });
});
