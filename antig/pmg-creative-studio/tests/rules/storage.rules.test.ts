import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { ALLI_STUDIO_USERS } from '../../functions/src/_shared/allowlist';

const allowedEmail = ALLI_STUDIO_USERS.values().next().value!;
const deniedEmail = 'outsider@example.com';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-alli-studio-storage-rules-test',
    storage: {
      rules: readFileSync('storage.rules', 'utf8'),
      host: '127.0.0.1',
      port: 9199,
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

describe('storage.rules', () => {
  it('allows read+write under clients/{slug}/ for an allowlisted verified user', async () => {
    const ctx = env.authenticatedContext('test-uid', { email: allowedEmail, email_verified: true });
    const ref = ctx.storage().ref('clients/ralph_lauren/apps/edit-image/uploads/abc.png');
    await expect(ref.put(new Uint8Array([1, 2, 3]))).resolves.not.toThrow();
  });

  it('denies for an unverified-email user', async () => {
    const ctx = env.authenticatedContext('test-uid', { email: allowedEmail, email_verified: false });
    const ref = ctx.storage().ref('clients/ralph_lauren/apps/edit-image/uploads/abc.png');
    await expect(ref.put(new Uint8Array([1, 2, 3]))).rejects.toThrow();
  });

  it('denies for a non-allowlisted user', async () => {
    const ctx = env.authenticatedContext('test-uid', { email: deniedEmail, email_verified: true });
    const ref = ctx.storage().ref('clients/ralph_lauren/apps/edit-image/uploads/abc.png');
    await expect(ref.put(new Uint8Array([1, 2, 3]))).rejects.toThrow();
  });

  it('denies the previously-permissive /uploads/{slug}/** path for ALL callers', async () => {
    const ctx = env.authenticatedContext('test-uid', { email: allowedEmail, email_verified: true });
    const ref = ctx.storage().ref('uploads/ralph_lauren/abc.png');
    await expect(ref.put(new Uint8Array([1, 2, 3]))).rejects.toThrow();
  });

  it('denies anonymous uploads anywhere', async () => {
    const ctx = env.unauthenticatedContext();
    const ref = ctx.storage().ref('clients/ralph_lauren/apps/edit-image/uploads/abc.png');
    await expect(ref.put(new Uint8Array([1, 2, 3]))).rejects.toThrow();
  });
});
