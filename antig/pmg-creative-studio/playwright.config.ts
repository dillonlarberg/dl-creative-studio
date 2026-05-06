import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for AdLabs v1 tracer tests.
 *
 * The dev server runs with VITE_E2E_AUTH_BYPASS=true so tests don't need to
 * navigate Firebase login. The bypass is gated on import.meta.env.DEV in
 * App.tsx, so it can only activate during local dev runs — never prod.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: 'http://localhost:5179',
    trace: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Use a dedicated E2E port (5179) so we never reuse a developer's dev server
  // that was started without VITE_E2E_AUTH_BYPASS. reuseExistingServer:false
  // forces a fresh boot every run with the bypass env in place.
  webServer: {
    command: 'VITE_E2E_AUTH_BYPASS=true npm run dev -- --port=5179 --strictPort',
    url: 'http://localhost:5179',
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
