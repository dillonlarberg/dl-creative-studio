import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/rules/**/*.test.ts', 'scripts/__tests__/**/*.test.ts'],
    testTimeout: 30000,
  },
});
