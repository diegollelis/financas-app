import { defineConfig } from 'vitest/config';

// Runs every package's tests from the root (`pnpm test`). Each package has its own
// vitest.config.ts with the environment it needs.
export default defineConfig({
  test: {
    projects: ['apps/*', 'packages/*'],
    coverage: { provider: 'v8', exclude: ['**/src/generated/**', '**/*.config.ts'] },
  },
});
