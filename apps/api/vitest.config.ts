import { defineProject } from 'vitest/config';
import { testEnv } from './test/test-env.js';

export default defineProject({
  test: {
    name: 'api',
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    // Applies the migrations to the test database. Requires Postgres running (`pnpm db:up`).
    globalSetup: ['test/global-setup.ts'],
    // Tests never read apps/api/.env: they get a fixed, fake configuration.
    env: { ...testEnv },
    // HTTP test files share one database: run them one at a time so they do not clean
    // each other's data.
    fileParallelism: false,
  },
});
