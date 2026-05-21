import { describe, expect, it } from 'vitest';
import {
  assertNoBasePathCollisions,
  assertValidBasePath,
  buildRegistry,
} from './_registry';
import type { AppManifest } from './types';

function fakeManifest(overrides: Partial<AppManifest> = {}): AppManifest {
  return {
    id: 'ad-resizing',
    basePath: 'ad-resizing',
    title: 'Edit Image',
    steps: [],
    initialStepData: () => ({}),
    ...overrides,
  };
}

describe('app registry', () => {
  describe('assertValidBasePath', () => {
    it('accepts a simple slug', () => {
      expect(() => assertValidBasePath('ad-resizing', 'ad-resizing')).not.toThrow();
    });

    it('rejects basePath containing a slash', () => {
      expect(() => assertValidBasePath('ad-resizing', 'edit/image')).toThrow(
        /basePath/i
      );
    });

    it('rejects basePath containing whitespace', () => {
      expect(() => assertValidBasePath('ad-resizing', 'edit image')).toThrow(
        /basePath/i
      );
    });

    it('rejects an empty basePath', () => {
      expect(() => assertValidBasePath('ad-resizing', '')).toThrow(/basePath/i);
    });
  });

  describe('assertNoBasePathCollisions', () => {
    it('passes when all basePaths are unique', () => {
      const manifests = [
        fakeManifest({ id: 'ad-resizing', basePath: 'ad-resizing' }),
        fakeManifest({ id: 'template-builder', basePath: 'template-builder' }),
      ];
      expect(() => assertNoBasePathCollisions(manifests)).not.toThrow();
    });

    it('throws with a clearly-formatted message on collision', () => {
      const manifests = [
        fakeManifest({ id: 'ad-resizing', basePath: 'shared' }),
        fakeManifest({ id: 'template-builder', basePath: 'shared' }),
      ];
      expect(() => assertNoBasePathCollisions(manifests)).toThrow(
        /collision.*"ad-resizing".*"template-builder".*"shared"/i
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
          fakeManifest({ id: 'ad-resizing', basePath: 'oops/bad' }),
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
