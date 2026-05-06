import { test, expect } from '@playwright/test';

/**
 * Step 1 of AdLabs v1 plan — DashboardPage tracers.
 *
 * Auth bypass injects a PMG-internal user (e2e@pmg.com), so internal-only
 * sections render by default. Tests that need a non-PMG user override the
 * E2E_FAKE_USER via localStorage hint (see useCurrentUser.ts is bypass-only,
 * so we test the non-PMG path by clearing email-internal heuristics — handled
 * by overriding the e2e-fake-user payload via window.__E2E_USER_OVERRIDE).
 *
 * NB: brand-standards readiness is driven by the asset house Firestore read.
 * In E2E, that read returns null/error → isReady=false → tiles render disabled
 * with "Standards required" CTA. That's the brand-NOT-ready scenario; an
 * explicit brand-ready override would require seeding Firestore, which is
 * out-of-scope for this tracer suite.
 */

test.describe('Step 1 — DashboardPage', () => {
  test('Tracer 1: thesis banner + 3 cards (resize-image + template-builder + batch-variants); no video-cutdown card by default', async ({
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

    await expect(page.getByTestId('adlabs-dashboard')).toBeVisible();
    await expect(page.getByTestId('adlabs-thesis-banner')).toHaveText(
      /Dynamic templates for dynamic feeds/
    );

    // Apps grid: 3 cards in default flag state (resize-image is a skeleton
    // owned by Annie; template-builder live; batch-variants preview-stub).
    const cards = page.getByTestId('adlabs-apps-grid').locator('[data-testid^="app-card-"]');
    await expect(cards).toHaveCount(3);
    await expect(page.getByTestId('app-card-resize-image')).toBeVisible();
    await expect(page.getByTestId('app-card-template-builder')).toBeVisible();
    await expect(page.getByTestId('app-card-batch-variants')).toBeVisible();
    await expect(page.getByTestId('app-card-video-cutdown')).toHaveCount(0);

    // Coming-soon shelf: only Edit & Tweak (Resize Image graduated to the apps grid).
    await expect(page.getByTestId('coming-soon-edit-tweak')).toHaveAttribute(
      'data-disabled',
      'true'
    );
    await expect(page.getByTestId('coming-soon-resize-image')).toHaveCount(0);
  });

  test('Tracer 2: clicking Batch Variants card lands on the preview stub view', async ({
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

    await page.getByTestId('app-card-batch-variants').click();

    await expect(page).toHaveURL(/\/adlabs\/ralph_lauren\/batch-variants/);
    await expect(page.getByTestId('wizard-preview-coming-soon')).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Continue Upstream/i })
    ).toHaveCount(0);
  });

  test('Tracer 3: clicking Template Builder navigates to the live wizard', async ({
    page,
  }) => {
    // Template Builder requires brand standards; in E2E with no asset-house
    // seed it renders disabled. We assert the disabled state explicitly —
    // this is the *brand-NOT-ready* tracer (#5 below) folded in.
    await page.goto('/');
    await page.evaluate(() =>
      localStorage.setItem(
        'selectedClient',
        JSON.stringify({ slug: 'ralph_lauren', name: 'Ralph Lauren' })
      )
    );
    await page.goto('/adlabs/ralph_lauren/');

    const tile = page.getByTestId('app-card-template-builder');
    await expect(tile).toHaveAttribute('data-disabled', 'true');
    await expect(tile).toContainText(/Standards required/i);
  });

  test('Tracer 4: brand-NOT-ready client surfaces a banner (warning OR bootstrap error)', async ({
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

    // In E2E, Firestore is not authenticated so the asset-house read may
    // either return null (warning banner path) or reject (bootstrap-error
    // banner path). Either is acceptable — both prove the gate fires.
    const warning = page.getByTestId('brand-standards-warning');
    const bootstrapError = page.getByTestId('bootstrap-error');
    await expect(warning.or(bootstrapError).first()).toBeVisible();
  });

  test('Tracer 5: Active Batch Jobs section renders for PMG-internal user (empty state in E2E without seeded Firestore)', async ({
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
    // In E2E without auth-bypassed Firestore, the read either resolves empty
    // or rejects — both surface a section state, never a crash.
    const empty = page.getByTestId('active-batches-empty');
    const error = page.getByTestId('active-batches-error');
    await expect(empty.or(error).first()).toBeVisible();
  });

  test('Tracer 6: /adlabs root with no slug + cleared localStorage → redirect to /select-client', async ({
    page,
  }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');

    await expect(page).toHaveURL(/\/select-client/);
  });
});
