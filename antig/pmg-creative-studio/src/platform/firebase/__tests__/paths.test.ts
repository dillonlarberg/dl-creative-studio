import { describe, expect, it } from 'vitest';
import { paths, type AppId } from '../paths';

describe('paths', () => {
  describe('client', () => {
    it('returns the client root path', () => {
      expect(paths.client('ralph_lauren')).toBe('clients/ralph_lauren');
    });
  });

  describe('profile', () => {
    it('returns the brand profile path', () => {
      expect(paths.profile('ralph_lauren')).toBe('clients/ralph_lauren/profile');
    });
  });

  describe('assets', () => {
    it('returns the assets collection path', () => {
      expect(paths.assets('ralph_lauren')).toBe('clients/ralph_lauren/assets');
    });

    it('returns a single asset doc path when given an id', () => {
      expect(paths.asset('ralph_lauren', 'logo_primary')).toBe(
        'clients/ralph_lauren/assets/logo_primary'
      );
    });
  });

  describe('app subtree', () => {
    it('returns the app root path', () => {
      const appId: AppId = 'edit-image';
      expect(paths.app('ralph_lauren', appId)).toBe(
        'clients/ralph_lauren/apps/edit-image'
      );
    });

    it('returns the creatives collection path', () => {
      expect(paths.creatives('ralph_lauren', 'edit-image')).toBe(
        'clients/ralph_lauren/apps/edit-image/creatives'
      );
    });

    it('returns a single creative doc path when given an id', () => {
      expect(paths.creative('ralph_lauren', 'edit-image', 'abc123')).toBe(
        'clients/ralph_lauren/apps/edit-image/creatives/abc123'
      );
    });
  });

  describe('storage paths', () => {
    it('returns a client-scoped storage prefix', () => {
      expect(paths.storage.client('ralph_lauren')).toBe('clients/ralph_lauren');
    });

    it('returns a typed app-scoped storage path with arbitrary suffix', () => {
      expect(paths.storage.app('ralph_lauren', 'edit-image', 'uploads/abc.png')).toBe(
        'clients/ralph_lauren/apps/edit-image/uploads/abc.png'
      );
    });
  });

  describe('compile-time invariants (these would be TS errors if regressed)', () => {
    it('app() refuses an unknown AppId at compile time', () => {
      // @ts-expect-error — 'not-an-app' is not a valid AppId
      paths.app('ralph_lauren', 'not-an-app');
      // The runtime call still produces a string; the test passes if the @ts-expect-error
      // directive matches a real type error. If AppId becomes string this test fails to compile.
      expect(true).toBe(true);
    });
  });
});
