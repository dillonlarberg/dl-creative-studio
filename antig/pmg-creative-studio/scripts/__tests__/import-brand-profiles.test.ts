import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { importBrandProfiles } from '../import-brand-profiles';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-import-test',
    firestore: {
      // Permissive rules for the import test — this isolates the script's
      // logic from access control.
      rules: 'rules_version = "2"; service cloud.firestore { match /databases/{db}/documents { match /{document=**} { allow read, write: if true; } } }',
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
});

describe('importBrandProfiles', () => {
  it('copies clientAssetHouse/{slug} docs to clients/{slug}/profile/data', async () => {
    const ctx = env.authenticatedContext('admin', {});
    const db = ctx.firestore();

    await db.doc('clientAssetHouse/ralph_lauren').set({
      clientSlug: 'ralph_lauren',
      primaryColor: '#000',
      fontPrimary: 'Inter',
    });
    await db.doc('clientAssetHouse/sharkninja').set({
      clientSlug: 'sharkninja',
      primaryColor: '#FF0',
      fontPrimary: 'Helvetica',
    });

    const result = await importBrandProfiles(db, { dryRun: false });

    expect(result.imported.sort()).toEqual(['ralph_lauren', 'sharkninja']);
    expect(result.skipped).toEqual([]);

    const rl = await db.doc('clients/ralph_lauren/profile/data').get();
    expect(rl.exists).toBe(true);
    expect(rl.data()?.primaryColor).toBe('#000');
  });

  it('excludes the pmg artifact document', async () => {
    const ctx = env.authenticatedContext('admin', {});
    const db = ctx.firestore();

    await db.doc('clientAssetHouse/ralph_lauren').set({ primaryColor: '#000' });
    await db.doc('clientAssetHouse/pmg').set({ primaryColor: '#FFF' });

    const result = await importBrandProfiles(db, { dryRun: false });

    expect(result.imported).toEqual(['ralph_lauren']);
    expect(result.excluded).toEqual(['pmg']);

    const pmgProfile = await db.doc('clients/pmg/profile/data').get();
    expect(pmgProfile.exists).toBe(false);
  });

  it('is idempotent — running twice produces the same end state', async () => {
    const ctx = env.authenticatedContext('admin', {});
    const db = ctx.firestore();

    await db.doc('clientAssetHouse/ralph_lauren').set({ primaryColor: '#000' });

    const first = await importBrandProfiles(db, { dryRun: false });
    expect(first.imported).toEqual(['ralph_lauren']);
    expect(first.skipped).toEqual([]);

    const second = await importBrandProfiles(db, { dryRun: false });
    expect(second.imported).toEqual([]);
    expect(second.skipped).toEqual(['ralph_lauren']); // already up to date

    const profile = await db.doc('clients/ralph_lauren/profile/data').get();
    expect(profile.data()?.primaryColor).toBe('#000');
  });

  it('--dry-run produces no writes', async () => {
    const ctx = env.authenticatedContext('admin', {});
    const db = ctx.firestore();

    await db.doc('clientAssetHouse/ralph_lauren').set({ primaryColor: '#000' });

    const result = await importBrandProfiles(db, { dryRun: true });

    expect(result.imported).toEqual([]);
    expect(result.planned).toEqual(['ralph_lauren']);

    const profile = await db.doc('clients/ralph_lauren/profile/data').get();
    expect(profile.exists).toBe(false);
  });
});
