import { describe, expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import { assertResourceClient } from '../assertResourceClient';

describe('assertResourceClient', () => {
  it('does not throw when the resource path is under the asserted client', () => {
    expect(() =>
      assertResourceClient('ralph_lauren', 'clients/ralph_lauren/apps/edit-image/uploads/abc.png')
    ).not.toThrow();
  });

  it('does not throw when the resource path is at the client root', () => {
    expect(() =>
      assertResourceClient('ralph_lauren', 'clients/ralph_lauren/profile')
    ).not.toThrow();
  });

  it('throws permission-denied when the resource path is under a different client', () => {
    expect(() =>
      assertResourceClient('ralph_lauren', 'clients/sharkninja/apps/edit-image/uploads/abc.png')
    ).toThrow(HttpsError);

    try {
      assertResourceClient('ralph_lauren', 'clients/sharkninja/apps/edit-image/uploads/abc.png');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpsError);
      expect((err as HttpsError).code).toBe('permission-denied');
    }
  });

  it('throws when the resource path does not start with clients/', () => {
    expect(() =>
      assertResourceClient('ralph_lauren', 'public/some-other-bucket/file.png')
    ).toThrow(HttpsError);
  });

  it('throws when the resource path is empty', () => {
    expect(() => assertResourceClient('ralph_lauren', '')).toThrow(HttpsError);
  });

  it('throws when the resource path attempts a traversal escape', () => {
    expect(() =>
      assertResourceClient('ralph_lauren', 'clients/ralph_lauren/../sharkninja/secret')
    ).toThrow(HttpsError);
  });

  it('rejects a path that LOOKS like the right prefix but is a different client (prefix attack)', () => {
    // 'ralph_lauren' is a prefix of 'ralph_lauren_evil'
    expect(() =>
      assertResourceClient('ralph_lauren', 'clients/ralph_lauren_evil/secret')
    ).toThrow(HttpsError);
  });
});
