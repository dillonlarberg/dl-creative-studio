import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { ALLI_STUDIO_USERS } from '../../functions/src/_shared/allowlist';

const allowedEmail = ALLI_STUDIO_USERS.values().next().value!;
const deniedEmail = 'outsider@example.com';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-alli-studio-rules-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

describe('firestore.rules', () => {
  describe('clients/{slug}/** subtree', () => {
    it('allows read+write for an allowlisted user with verified email', async () => {
      const ctx = env.authenticatedContext('test-uid', { email: allowedEmail, email_verified: true });
      const ref = ctx.firestore().doc('clients/ralph_lauren/assets/brand_test');
      await expect(ref.set({ primaryColor: '#000' })).resolves.not.toThrow();
      await expect(ref.get()).resolves.toBeDefined();
    });

    it('denies read for an allowlisted user with UNVERIFIED email + non-OIDC provider', async () => {
      const ctx = env.authenticatedContext('test-uid', {
        email: allowedEmail,
        email_verified: false,
        firebase: { sign_in_provider: 'password' },
      });
      const ref = ctx.firestore().doc('clients/ralph_lauren/assets/brand_test');
      await expect(ref.get()).rejects.toThrow();
    });

    it('allows read for an oidc.alli user with allowlisted email (email_verified absent)', async () => {
      // Alli SSO doesn't propagate email_verified; sign_in_provider is the
      // proxy. Mirror of assertAlliStudioUser test (functions/src/_shared/).
      const ctx = env.authenticatedContext('test-uid', {
        email: allowedEmail,
        email_verified: false,
        firebase: { sign_in_provider: 'oidc.alli' },
      });
      const ref = ctx.firestore().doc('clients/ralph_lauren/assets/brand_test');
      await expect(ref.get()).resolves.toBeDefined();
    });

    it('denies oidc.alli sign-in for a non-allowlisted email', async () => {
      const ctx = env.authenticatedContext('test-uid', {
        email: deniedEmail,
        email_verified: false,
        firebase: { sign_in_provider: 'oidc.alli' },
      });
      const ref = ctx.firestore().doc('clients/ralph_lauren/assets/brand_test');
      await expect(ref.get()).rejects.toThrow();
    });

    it('denies a different OIDC provider even with allowlisted email', async () => {
      const ctx = env.authenticatedContext('test-uid', {
        email: allowedEmail,
        email_verified: false,
        firebase: { sign_in_provider: 'oidc.evil' },
      });
      const ref = ctx.firestore().doc('clients/ralph_lauren/assets/brand_test');
      await expect(ref.get()).rejects.toThrow();
    });

    it('denies read for a non-allowlisted user', async () => {
      const ctx = env.authenticatedContext('test-uid', { email: deniedEmail, email_verified: true });
      const ref = ctx.firestore().doc('clients/ralph_lauren/assets/brand_test');
      await expect(ref.get()).rejects.toThrow();
    });

    it('denies read for an unauthenticated request', async () => {
      const ctx = env.unauthenticatedContext();
      const ref = ctx.firestore().doc('clients/ralph_lauren/assets/brand_test');
      await expect(ref.get()).rejects.toThrow();
    });

    it('allows allowlisted user to write under apps/{appId}/creatives', async () => {
      const ctx = env.authenticatedContext('test-uid', { email: allowedEmail, email_verified: true });
      const ref = ctx.firestore().doc('clients/ralph_lauren/apps/edit-image/creatives/abc');
      await expect(ref.set({ status: 'draft', stepData: {} })).resolves.not.toThrow();
    });
  });

  describe('default-deny outside clients/', () => {
    it('denies read of legacy /creatives even for an allowlisted user', async () => {
      const ctx = env.authenticatedContext('test-uid', { email: allowedEmail, email_verified: true });
      const ref = ctx.firestore().doc('creatives/legacy-doc');
      await expect(ref.get()).rejects.toThrow();
    });

    it('allows read of legacy /clientAssetHouse for allowlisted users (HOTFIX carve-out)', async () => {
      const ctx = env.authenticatedContext('test-uid', { email: allowedEmail, email_verified: true });
      const ref = ctx.firestore().doc('clientAssetHouse/ralph_lauren');
      await expect(ref.get()).resolves.toBeDefined();
    });

    it('denies read of legacy /clientAssetHouse for non-allowlisted users', async () => {
      const ctx = env.authenticatedContext('test-uid', { email: deniedEmail, email_verified: true });
      const ref = ctx.firestore().doc('clientAssetHouse/ralph_lauren');
      await expect(ref.get()).rejects.toThrow();
    });
  });
});
