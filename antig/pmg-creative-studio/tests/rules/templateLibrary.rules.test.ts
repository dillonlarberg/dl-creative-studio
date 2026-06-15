import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, setDoc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { ALLI_STUDIO_USERS } from '../../functions/src/_shared/allowlist';

const allowedEmail = ALLI_STUDIO_USERS.values().next().value!;
const otherAllowedEmail = [...ALLI_STUDIO_USERS][1]!;

let testEnv: RulesTestEnvironment;

const SLUG = 'test_client';

function alliCtx(uid: string, email = allowedEmail) {
  return testEnv.authenticatedContext(uid, { email, email_verified: true });
}

function draftPayload(uid: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'tmpl_001',
    name: 'Test Template',
    status: 'draft',
    version: 1,
    channel: 'social',
    adSizes: [{ width: 1080, height: 1080 }],
    scaffoldId: 'social:grid_2x2',
    scaffoldSnapshot: { expectedFields: ['headline'], contentHash: 'abc', capturedAt: new Date() },
    datasourceId: 'feed_01',
    datasourceName: 'Test Feed',
    feedSnapshot: { columns: ['title', 'price'], capturedAt: new Date() },
    fieldMappings: { headline: { source: 'feed', column: 'title' } },
    brandOverrides: {},
    createdBy: 'alli_user_1',
    createdByUid: uid,
    createdAt: new Date(),
    updatedBy: 'alli_user_1',
    updatedByUid: uid,
    updatedAt: new Date(),
    publishedAt: null,
    publishedBy: null,
    publishedByUid: null,
    ...overrides,
  };
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-alli-studio-rules-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

// ─────────────────────────────────────────────────────────────────────────────
// CREATE
// ─────────────────────────────────────────────────────────────────────────────

describe('templateLibrary — create', () => {
  it('allows an allowlisted user to create a draft owned by themselves', async () => {
    const ref = doc(alliCtx('uid_annie').firestore(), `clients/${SLUG}/templateLibrary/tmpl_001`);
    await assertSucceeds(setDoc(ref, draftPayload('uid_annie')));
  });

  it('denies create when createdByUid does not match auth.uid', async () => {
    const ref = doc(alliCtx('uid_annie').firestore(), `clients/${SLUG}/templateLibrary/tmpl_001`);
    await assertFails(setDoc(ref, draftPayload('uid_someone_else')));
  });

  it('denies create with status published', async () => {
    const ref = doc(alliCtx('uid_annie').firestore(), `clients/${SLUG}/templateLibrary/tmpl_001`);
    await assertFails(setDoc(ref, draftPayload('uid_annie', { status: 'published' })));
  });

  it('denies create with version != 1', async () => {
    const ref = doc(alliCtx('uid_annie').firestore(), `clients/${SLUG}/templateLibrary/tmpl_001`);
    await assertFails(setDoc(ref, draftPayload('uid_annie', { version: 0 })));
  });

  it('denies create when doc id in payload does not match the Firestore document id', async () => {
    const ref = doc(alliCtx('uid_annie').firestore(), `clients/${SLUG}/templateLibrary/tmpl_001`);
    await assertFails(setDoc(ref, draftPayload('uid_annie', { id: 'wrong_id' })));
  });

  it('denies create for unauthenticated user', async () => {
    const ref = doc(
      testEnv.unauthenticatedContext().firestore(),
      `clients/${SLUG}/templateLibrary/tmpl_001`
    );
    await assertFails(setDoc(ref, draftPayload('uid_annie')));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// READ
// ─────────────────────────────────────────────────────────────────────────────

describe('templateLibrary — read', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `clients/${SLUG}/templateLibrary/draft_001`),
        draftPayload('uid_annie')
      );
      await setDoc(
        doc(ctx.firestore(), `clients/${SLUG}/templateLibrary/pub_001`),
        draftPayload('uid_chris', { id: 'pub_001', status: 'published', version: 2 })
      );
    });
  });

  it('allows creator to read their own draft', async () => {
    const ref = doc(alliCtx('uid_annie').firestore(), `clients/${SLUG}/templateLibrary/draft_001`);
    await assertSucceeds(getDoc(ref));
  });

  it('denies non-creator from reading a draft', async () => {
    const ref = doc(
      alliCtx('uid_chris', otherAllowedEmail).firestore(),
      `clients/${SLUG}/templateLibrary/draft_001`
    );
    await assertFails(getDoc(ref));
  });

  it('allows any allowlisted user to read a published template', async () => {
    const ref = doc(alliCtx('uid_annie').firestore(), `clients/${SLUG}/templateLibrary/pub_001`);
    await assertSucceeds(getDoc(ref));
  });

  it('denies unauthenticated read of a published template', async () => {
    const ref = doc(
      testEnv.unauthenticatedContext().firestore(),
      `clients/${SLUG}/templateLibrary/pub_001`
    );
    await assertFails(getDoc(ref));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE — draft
// ─────────────────────────────────────────────────────────────────────────────

describe('templateLibrary — update draft', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `clients/${SLUG}/templateLibrary/draft_001`),
        draftPayload('uid_annie')
      );
    });
  });

  it('allows creator to update their own draft', async () => {
    const ref = doc(alliCtx('uid_annie').firestore(), `clients/${SLUG}/templateLibrary/draft_001`);
    await assertSucceeds(updateDoc(ref, { name: 'Updated Name' }));
  });

  it('denies non-creator from updating a draft', async () => {
    const ref = doc(
      alliCtx('uid_chris', otherAllowedEmail).firestore(),
      `clients/${SLUG}/templateLibrary/draft_001`
    );
    await assertFails(updateDoc(ref, { name: 'Hacked' }));
  });

  it('denies update that mutates createdByUid', async () => {
    const ref = doc(alliCtx('uid_annie').firestore(), `clients/${SLUG}/templateLibrary/draft_001`);
    await assertFails(updateDoc(ref, { createdByUid: 'uid_hacker' }));
  });


});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLISH TRANSITION (draft → published)
// ─────────────────────────────────────────────────────────────────────────────

describe('templateLibrary — publish transition', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `clients/${SLUG}/templateLibrary/draft_001`),
        draftPayload('uid_annie')
      );
    });
  });

  it('allows creator to publish with full publish metadata set', async () => {
    const ref = doc(alliCtx('uid_annie').firestore(), `clients/${SLUG}/templateLibrary/draft_001`);
    await assertSucceeds(
      updateDoc(ref, {
        status: 'published',
        version: 2,
        publishedByUid: 'uid_annie',
        publishedBy: 'alli_user_1',
        publishedAt: new Date(),
      })
    );
  });

  it('denies publish when publishedByUid does not match auth.uid', async () => {
    const ref = doc(alliCtx('uid_annie').firestore(), `clients/${SLUG}/templateLibrary/draft_001`);
    await assertFails(
      updateDoc(ref, {
        status: 'published',
        version: 2,
        publishedByUid: 'uid_someone_else',
        publishedBy: 'other_user',
        publishedAt: new Date(),
      })
    );
  });

  it('denies bare status flip without publish metadata', async () => {
    const ref = doc(alliCtx('uid_annie').firestore(), `clients/${SLUG}/templateLibrary/draft_001`);
    await assertFails(updateDoc(ref, { status: 'published' }));
  });

  it('denies non-creator from publishing', async () => {
    const ref = doc(
      alliCtx('uid_chris', otherAllowedEmail).firestore(),
      `clients/${SLUG}/templateLibrary/draft_001`
    );
    await assertFails(
      updateDoc(ref, {
        status: 'published',
        version: 2,
        publishedByUid: 'uid_chris',
        publishedBy: 'chris_user',
        publishedAt: new Date(),
      })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE — published
// ─────────────────────────────────────────────────────────────────────────────

describe('templateLibrary — update published', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `clients/${SLUG}/templateLibrary/pub_001`),
        draftPayload('uid_annie', { id: 'pub_001', status: 'published', version: 2 })
      );
    });
  });

  it('allows any allowlisted user to update a published template', async () => {
    const ref = doc(
      alliCtx('uid_chris', otherAllowedEmail).firestore(),
      `clients/${SLUG}/templateLibrary/pub_001`
    );
    await assertSucceeds(updateDoc(ref, { name: 'Edited by Chris' }));
  });

  it('denies update that changes status from published to draft', async () => {
    const ref = doc(alliCtx('uid_annie').firestore(), `clients/${SLUG}/templateLibrary/pub_001`);
    await assertFails(updateDoc(ref, { status: 'draft' }));
  });

  it('denies update that changes createdByUid on a published template', async () => {
    const ref = doc(alliCtx('uid_annie').firestore(), `clients/${SLUG}/templateLibrary/pub_001`);
    await assertFails(updateDoc(ref, { createdByUid: 'uid_hacker' }));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE
// ─────────────────────────────────────────────────────────────────────────────

describe('templateLibrary — delete', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `clients/${SLUG}/templateLibrary/draft_001`),
        draftPayload('uid_annie')
      );
    });
  });

  it('allows creator to delete their template', async () => {
    const ref = doc(alliCtx('uid_annie').firestore(), `clients/${SLUG}/templateLibrary/draft_001`);
    await assertSucceeds(deleteDoc(ref));
  });

  it('denies non-creator from deleting', async () => {
    const ref = doc(
      alliCtx('uid_chris', otherAllowedEmail).firestore(),
      `clients/${SLUG}/templateLibrary/draft_001`
    );
    await assertFails(deleteDoc(ref));
  });

  it('denies unauthenticated delete', async () => {
    const ref = doc(
      testEnv.unauthenticatedContext().firestore(),
      `clients/${SLUG}/templateLibrary/draft_001`
    );
    await assertFails(deleteDoc(ref));
  });
});
