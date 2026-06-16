import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// @testing-library/react auto-cleanup checks for a global `afterEach`.
// Because this project uses globals: false, the global is absent and
// cleanup never fires — causing DOM leakage between tests. Register it
// explicitly here so all test suites get automatic cleanup.
afterEach(() => {
  cleanup();
});
