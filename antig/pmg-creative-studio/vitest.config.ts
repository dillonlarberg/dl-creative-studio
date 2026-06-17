import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['@agencypmg/alli-design-system'],
  },
  build: {
    commonjsOptions: {
      include: [/alli-frontend-design-system/, /node_modules/],
      transformMixedEsModules: true,
      defaultIsModuleExports: 'auto',
      requireReturnsDefault: 'auto',
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test-setup.ts'],
    include: [
      'src/**/*.test.{ts,tsx}',
      'src/**/__tests__/**/*.test.{ts,tsx}',
      'functions/src/**/*.test.ts',
      'functions/src/**/__tests__/**/*.test.ts',
      'tests/compat/**/*.test.{ts,tsx}',
      // Pure transformer tests under scripts/. The emulator-using scripts
      // tests live in `scripts/__tests__/` and are picked up by the rules
      // config; this glob deliberately matches only the `_internal/` tree.
      'scripts/_internal/**/__tests__/**/*.test.ts',
    ],
    exclude: [
      'node_modules',
      'dist',
      '.firebase',
      'functions/node_modules',
      'functions/lib',
    ],
    server: {
      deps: {
        // Force the design system through Vite's transform pipeline so that
        // resolve.dedupe applies and all react requires resolve to the same
        // copy (prevents "React Element from older version" error in tests).
        inline: ['@agencypmg/alli-design-system'],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/**/__tests__/**',
        'src/test-setup.ts',
        'src/main.tsx',
      ],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
});
