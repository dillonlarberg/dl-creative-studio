import { describe, it, expect } from 'vitest';
import manifest from './manifest';
import { getRegistry } from '../_registry';

/**
 * Manifest contract guard — mirrors the template-builder/manifest.test.ts
 * pattern. Asserts the resize-image manifest is well-formed and is the
 * one the registry returns.
 *
 * Annie: keep these green as you flesh out the app. The step list grows /
 * shrinks here and the registry collision guard at
 * src/apps/_registry.test.ts also covers the cross-app uniqueness check.
 */
describe('resize-image manifest', () => {
  it('declares the expected identity fields', () => {
    expect(manifest.id).toBe('resize-image');
    expect(manifest.basePath).toBe('resize-image');
    expect(manifest.title.length).toBeGreaterThan(0);
  });

  it('exposes a non-empty step list with unique step ids', () => {
    expect(manifest.steps.length).toBeGreaterThan(0);
    const ids = manifest.steps.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every step has render + validate', () => {
    for (const step of manifest.steps) {
      expect(typeof step.render).toBe('function');
      expect(typeof step.validate).toBe('function');
    }
  });

  it('initialStepData returns a fresh object each call', () => {
    const a = manifest.initialStepData();
    const b = manifest.initialStepData();
    expect(a).not.toBe(b);
  });

  it('is registered in the app registry', () => {
    const found = getRegistry().find((m) => m.id === 'resize-image');
    expect(found).toBeDefined();
    expect(found?.basePath).toBe('resize-image');
  });
});
