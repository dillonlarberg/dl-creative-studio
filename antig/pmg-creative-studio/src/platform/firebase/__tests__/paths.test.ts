import { describe, expect, it } from 'vitest';
import { paths, isAppId, type AppId } from '../paths';

describe('paths', () => {
  describe('client', () => {
    it('returns the client doc path — profile fields live on this doc', () => {
      // The clients/{slug} doc itself holds profile fields (name, brand colors,
      // fonts, etc). assets/ and apps/ hang off it as subcollections.
      expect(paths.client('ralph_lauren')).toBe('clients/ralph_lauren');
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

  describe('template paths', () => {
    it('returns the templates collection path (hardcoded to template-builder)', () => {
      expect(paths.templates('ralph_lauren')).toBe(
        'clients/ralph_lauren/apps/template-builder/templates'
      );
    });

    it('returns a single template doc path', () => {
      expect(paths.template('ralph_lauren', 't1')).toBe(
        'clients/ralph_lauren/apps/template-builder/templates/t1'
      );
    });
  });

  describe('batch paths', () => {
    it('returns the batches collection path', () => {
      expect(paths.batches('ralph_lauren', 'feed-processing')).toBe(
        'clients/ralph_lauren/apps/feed-processing/batches'
      );
    });

    it('returns a single batch doc path', () => {
      expect(paths.batch('ralph_lauren', 'feed-processing', 'b1')).toBe(
        'clients/ralph_lauren/apps/feed-processing/batches/b1'
      );
    });

  });

  describe('isAppId', () => {
    const validIds: AppId[] = [
      'resize-image', 'edit-image', 'new-image', 'edit-video', 'new-video',
      'video-cutdown', 'static-creative', 'template-builder', 'feed-processing',
    ];

    it.each(validIds)('returns true for valid AppId "%s"', (id: AppId) => {
      expect(isAppId(id)).toBe(true);
    });

    it('returns false for the pre-Track1 renamed value "image-resize"', () => {
      expect(isAppId('image-resize')).toBe(false);
    });

    it('returns false for an arbitrary unknown string', () => {
      expect(isAppId('not-an-app')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isAppId('')).toBe(false);
    });

    it('returns false for null', () => {
      expect(isAppId(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isAppId(undefined)).toBe(false);
    });

    it('returns false for a number', () => {
      expect(isAppId(42)).toBe(false);
    });

    it('returns false for an object', () => {
      expect(isAppId({})).toBe(false);
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
