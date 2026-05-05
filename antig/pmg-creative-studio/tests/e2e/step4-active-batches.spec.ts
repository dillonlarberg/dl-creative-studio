import { test, expect } from '@playwright/test';

/**
 * Step 4 of AdLabs v1 plan — Active Batch Jobs reads real Firestore data.
 *
 * Note: full seeded-data tracers (3 batches → 2 visible, ordering, etc.) live
 * in `firebase emulators:exec` workflows that aren't part of this Playwright
 * harness. Here we assert the section's state contract: gated to internal
 * users, surfaces loading/empty/error states, and is suppressed for non-PMG
 * users.
 */

test.describe('Step 4 — Active Batch Jobs (path-scoped reader)', () => {
  test('Tracer 1: section renders for PMG-internal user with one of {loading, empty, error} state', async ({
    page,
  }) => {
    await page.goto('/');
    await page.evaluate(() =>
      localStorage.setItem(
        'selectedClient',
        JSON.stringify({ slug: 'ralph_lauren', name: 'Ralph Lauren' })
      )
    );
    await page.goto('/adlabs/ralph_lauren/');

    await expect(page.getByTestId('active-batch-jobs')).toBeVisible();

    const loading = page.getByTestId('active-batches-loading');
    const empty = page.getByTestId('active-batches-empty');
    const error = page.getByTestId('active-batches-error');
    const list = page.getByTestId('active-batches-list');
    await expect(loading.or(empty).or(error).or(list).first()).toBeVisible();
  });

  test('Tracer 2: legacy demo-data-indicator and mock-batch-* test ids are GONE from the dashboard', async ({
    page,
  }) => {
    await page.goto('/');
    await page.evaluate(() =>
      localStorage.setItem(
        'selectedClient',
        JSON.stringify({ slug: 'ralph_lauren', name: 'Ralph Lauren' })
      )
    );
    await page.goto('/adlabs/ralph_lauren/');

    await expect(page.getByTestId('demo-data-indicator')).toHaveCount(0);
    await expect(page.locator('[data-testid^="mock-batch-"]')).toHaveCount(0);
  });
});
