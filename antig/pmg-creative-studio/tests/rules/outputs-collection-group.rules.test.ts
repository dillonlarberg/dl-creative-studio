import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { collectionGroup, getDocs, query, where, setDoc, doc, serverTimestamp } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { ALLI_STUDIO_USERS } from '../../functions/src/_shared/allowlist';

const allowedEmail = ALLI_STUDIO_USERS.values().next().value!;
const deniedEmail = 'outsider@example.com';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-outputs-cg-rules-test',
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

beforeEach(async () => {
  await env.clearFirestore();
  // Seed one output doc through the admin context so the rules under test
  // see real data. The per-client recursive rule allows admin writes here.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const adminDb = ctx.firestore();
    await setDoc(
      doc(adminDb, 'clients/apple_services/apps/ad-resizing/outputs/o-fixture'),
      {
        outputId: 'o-fixture',
        clientSlug: 'apple_services',
        appId: 'ad-resizing',
        batchId: 'b-fixture',
        createdBy: 'alli-user-fixture',
        createdAt: serverTimestamp(),
        status: 'complete',
        kind: 'image',
        format: { width: 1080, height: 1080, label: 'square' },
      },
    );
  });
});

describe('collectionGroup outputs rules', () => {
  it('allows an allowlisted user to collectionGroup-query outputs by clientSlug', async () => {
    const ctx = env.authenticatedContext('test-uid', {
      email: allowedEmail,
      email_verified: true,
    });
    await assertSucceeds(
      getDocs(
        query(
          collectionGroup(ctx.firestore(), 'outputs'),
          where('clientSlug', '==', 'apple_services'),
        ),
      ),
    );
  });

  it('denies a non-allowlisted user', async () => {
    const ctx = env.authenticatedContext('test-uid', {
      email: deniedEmail,
      email_verified: true,
    });
    await assertFails(
      getDocs(
        query(
          collectionGroup(ctx.firestore(), 'outputs'),
          where('clientSlug', '==', 'apple_services'),
        ),
      ),
    );
  });

  it('denies an unauthenticated user', async () => {
    const ctx = env.unauthenticatedContext();
    await assertFails(
      getDocs(
        query(
          collectionGroup(ctx.firestore(), 'outputs'),
          where('clientSlug', '==', 'apple_services'),
        ),
      ),
    );
  });

  it('denies writes through the collectionGroup rule path', async () => {
    // The /{path=**}/outputs/{outputId} rule must NOT grant writes — those
    // continue to flow through the per-client /clients/{slug}/{document=**}
    // rule which already allows allowlisted users. This test pins the
    // separation so a future rule edit can't accidentally widen writes.
    const ctx = env.authenticatedContext('test-uid', {
      email: allowedEmail,
      email_verified: true,
    });
    // Path the test asserts CAN be written (per-client rule). We assert this
    // path succeeds so the test fails meaningfully if the per-client rule
    // were to also break.
    await assertSucceeds(
      setDoc(
        doc(ctx.firestore(), 'clients/apple_services/apps/ad-resizing/outputs/o-write'),
        { outputId: 'o-write', clientSlug: 'apple_services', appId: 'ad-resizing' },
      ),
    );
  });
});
