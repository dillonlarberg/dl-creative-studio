import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { migrateAssetHouse } from '../migrate-asset-house-to-scoped-path';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-asset-house-migration',
    firestore: {
      rules:
        'rules_version = "2"; service cloud.firestore { match /databases/{db}/documents { match /{document=**} { allow read, write: if true; } } }',
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

describe('migrateAssetHouse', () => {
  it('merges clientAssetHouse/{slug} docs onto clients/{slug}', async () => {
    const db = env.authenticatedContext('admin', {}).firestore();

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

    const result = await migrateAssetHouse(db, { dryRun: false });

    expect(result.migrated.sort()).toEqual(['ralph_lauren', 'sharkninja']);
    expect(result.skipped).toEqual([]);

    const rl = await db.doc('clients/ralph_lauren').get();
    expect(rl.exists).toBe(true);
    expect(rl.data()?.primaryColor).toBe('#000');
    expect(rl.data()?.fontPrimary).toBe('Inter');
  });

  it('merges — preserves pre-existing fields on clients/{slug}', async () => {
    const db = env.authenticatedContext('admin', {}).firestore();

    await db.doc('clients/ralph_lauren').set({
      name: 'Ralph Lauren',
      createdAt: '2026-01-01',
    });
    await db.doc('clientAssetHouse/ralph_lauren').set({
      clientSlug: 'ralph_lauren',
      primaryColor: '#000',
    });

    await migrateAssetHouse(db, { dryRun: false });

    const merged = await db.doc('clients/ralph_lauren').get();
    expect(merged.data()?.name).toBe('Ralph Lauren');
    expect(merged.data()?.createdAt).toBe('2026-01-01');
    expect(merged.data()?.primaryColor).toBe('#000');
  });

  it('is idempotent — re-run is a no-op', async () => {
    const db = env.authenticatedContext('admin', {}).firestore();

    await db.doc('clientAssetHouse/ralph_lauren').set({
      clientSlug: 'ralph_lauren',
      primaryColor: '#000',
    });

    const first = await migrateAssetHouse(db, { dryRun: false });
    expect(first.migrated).toEqual(['ralph_lauren']);

    const second = await migrateAssetHouse(db, { dryRun: false });
    expect(second.migrated).toEqual([]);
    expect(second.skipped).toEqual(['ralph_lauren']);
  });

  it('--dry-run reports planned slugs without writing', async () => {
    const db = env.authenticatedContext('admin', {}).firestore();

    await db.doc('clientAssetHouse/ralph_lauren').set({ primaryColor: '#000' });

    const result = await migrateAssetHouse(db, { dryRun: true });

    expect(result.planned).toEqual(['ralph_lauren']);
    expect(result.migrated).toEqual([]);

    const target = await db.doc('clients/ralph_lauren').get();
    expect(target.exists).toBe(false);
  });

  it('re-migrates when source content changes', async () => {
    const db = env.authenticatedContext('admin', {}).firestore();

    await db.doc('clientAssetHouse/ralph_lauren').set({ primaryColor: '#000' });
    await migrateAssetHouse(db, { dryRun: false });

    await db.doc('clientAssetHouse/ralph_lauren').set({ primaryColor: '#111' });
    const second = await migrateAssetHouse(db, { dryRun: false });

    expect(second.migrated).toEqual(['ralph_lauren']);
    const target = await db.doc('clients/ralph_lauren').get();
    expect(target.data()?.primaryColor).toBe('#111');
  });
});
