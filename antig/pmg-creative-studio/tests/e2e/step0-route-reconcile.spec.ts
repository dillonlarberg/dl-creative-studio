import { test, expect } from '@playwright/test';

/**
 * Step 0 of AdLabs v1 plan — Tracer 1 (E2E):
 *
 * Hard refresh on a deep AdLabs URL must NOT bounce the user to /select-client.
 * The route reconcile in AppLayout.tsx (extractClientSlugFromPath + URL-wins
 * write-back) is what makes this work.
 *
 * Auth is bypassed via VITE_E2E_AUTH_BYPASS=true (set in playwright.config.ts
 * webServer command). Bypass is gated on import.meta.env.DEV so it cannot
 * activate in production builds.
 */

test.describe('Step 0 — route reconcile', () => {
  test('hard refresh on /adlabs/:clientSlug/template-builder/ stays on the route', async ({
    page,
  }) => {
    // Start with empty localStorage — the URL alone should resolve the client.
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());

    // Direct navigation to a deep AdLabs route.
    await page.goto('/adlabs/ralph_lauren/template-builder/');

    // Tracer assertion: URL is NOT /select-client and still contains the slug.
    await expect(page).toHaveURL(/\/adlabs\/ralph_lauren\/template-builder/);
    await expect(page).not.toHaveURL(/\/select-client/);

    // localStorage write-back: the reconcile useEffect should have written
    // selectedClient with the URL slug.
    const stored = await page.evaluate(() =>
      localStorage.getItem('selectedClient')
    );
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored ?? '{}');
    expect(parsed.slug).toBe('ralph_lauren');
  });

  test('hard refresh on legacy /:clientSlug/template-builder/ also resolves', async ({
    page,
  }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());

    await page.goto('/ralph_lauren/template-builder/');

    await expect(page).toHaveURL(/\/ralph_lauren\/template-builder/);
    await expect(page).not.toHaveURL(/\/select-client/);

    const stored = await page.evaluate(() =>
      localStorage.getItem('selectedClient')
    );
    expect(stored).not.toBeNull();
  });

  test('navigating to a non-slug route with no localStorage redirects to /select-client', async ({
    page,
  }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());

    await page.goto('/');

    // Without a URL slug AND without localStorage, the guard MUST redirect.
    await expect(page).toHaveURL(/\/select-client/);
  });
});
