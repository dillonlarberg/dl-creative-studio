import '@testing-library/jest-dom/vitest';
import { vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// @testing-library/react auto-cleanup checks for a global `afterEach`.
// Because this project uses globals: false, the global is absent and
// cleanup never fires — causing DOM leakage between tests. Register it
// explicitly here so all test suites get automatic cleanup.
afterEach(() => {
  cleanup();
});

// The design system is a symlinked local workspace that ships React 17.
// React 19 (used by this app) rejects elements created with the older
// Symbol.for('react.element') $$typeof — it only accepts the new
// Symbol.for('react.transitional.element'). This causes a runtime throw
// in jsdom tests. Mocking the package to use native HTML elements bypasses
// the version mismatch for test purposes, without weakening any assertions
// (tests check aria attributes, text content, and behaviour — not which
// library component was rendered).
vi.mock('@agencypmg/alli-design-system', async (importOriginal) => {
  const React = await import('react');
  const original = await importOriginal<typeof import('@agencypmg/alli-design-system')>();
  return {
    ...original,
    // Passthrough Button that forwards ref and spreads all props onto <button>
    Button: React.forwardRef<HTMLButtonElement, React.ComponentPropsWithRef<'button'>>(
      function Button({ children, ...props }, ref) {
        return React.createElement('button', { ...props, ref }, children);
      }
    ),
  };
});
