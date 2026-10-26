import { defineProject } from 'vitest/config';
import { testEnv } from './test/test-env.js';

export default defineProject({
  test: {
    name: 'api',
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    // Applies the migrations to the test database and copies it once per worker. Requires
    // Postgres running (`pnpm db:up`).
    globalSetup: ['test/global-setup.ts'],
    // Points each worker at its own copy of the database.
    setupFiles: ['test/worker-database.ts'],
    // Tests never read apps/api/.env: they get a fixed, fake configuration.
    env: { ...testEnv },
    // Each worker holds a pool of 10 connections: six stay under Postgres's 100.
    maxWorkers: 6,
    // A worker keeps the modules of one file for the next (the Nest app, the Prisma client):
    // importing them again for each file took half the time. Each test cleans the database.
    isolate: false,
    // Runs after the other projects: Vitest needs its own group for a project with its own
    // maxWorkers, and it then does not compete with the web tests for the processor.
    sequence: { groupOrder: 1 },
  },
});
