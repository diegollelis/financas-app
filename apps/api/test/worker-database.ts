import { testEnv } from './test-env.js';

// The `env` of vitest.config.ts is read once, before any worker exists, so it names
// financas_test. Here, inside the worker, the API and the Prisma CLI get this worker's copy.
process.env.DATABASE_URL = testEnv.DATABASE_URL;
process.env.MIGRATION_DATABASE_URL = testEnv.MIGRATION_DATABASE_URL;
