import { describe, expect, it } from 'vitest';
import {
  assertNoBasePathCollisions,
  assertValidBasePath,
  buildRegistry,
} from './_registry';
import type { AppManifest } from './types';

function fakeManifest(overrides: Partial<AppManifest> = {}): AppManifest {
  return {
    id: 'edit-image',
    basePath: 'edit-image',
    title: 'Edit Image',
    steps: [],
    initialStepData: () => ({}),
    ...overrides,
  };
}

describe('app registry', () => {
  describe('assertValidBasePath', () => {
    it('accepts a simple slug', () => {
      expect(() => assertValidBasePath('edit-image', 'edit-image')).not.toThrow();
    });

    it('rejects basePath containing a slash', () => {
      expect(() => assertValidBasePath('edit-image', 'edit/image')).toThrow(
        /basePath/i
      );
    });

    it('rejects basePath containing whitespace', () => {
      expect(() => assertValidBasePath('edit-image', 'edit image')).toThrow(
        /basePath/i
      );
    });

    it('rejects an empty basePath', () => {
      expect(() => assertValidBasePath('edit-image', '')).toThrow(/basePath/i);
    });
  });

  describe('assertNoBasePathCollisions', () => {
    it('passes when all basePaths are unique', () => {
      const manifests = [
        fakeManifest({ id: 'edit-image', basePath: 'edit-image' }),
        fakeManifest({ id: 'new-image', basePath: 'new-image' }),
      ];
      expect(() => assertNoBasePathCollisions(manifests)).not.toThrow();
    });

    it('throws with a clearly-formatted message on collision', () => {
      const manifests = [
        fakeManifest({ id: 'edit-image', basePath: 'shared' }),
        fakeManifest({ id: 'new-image', basePath: 'shared' }),
      ];
      expect(() => assertNoBasePathCollisions(manifests)).toThrow(
        /collision.*"edit-image".*"new-image".*"shared"/i
      );
    });
  });

  describe('buildRegistry', () => {
    it('returns a frozen list', () => {
      const registry = buildRegistry([fakeManifest()]);
      expect(Object.isFrozen(registry)).toBe(true);
    });

    it('runs collision + basePath validation', () => {
      expect(() =>
        buildRegistry([
          fakeManifest({ id: 'edit-image', basePath: 'oops/bad' }),
        ])
      ).toThrow(/basePath/i);
    });
  });

  describe('compile-time invariant', () => {
    it('manifest id is constrained to AppId', () => {
      // @ts-expect-error — 'not-an-app' is not in the AppId union
      fakeManifest({ id: 'not-an-app' });
      expect(true).toBe(true);
    });
  });
});
