/**
 * The database of this process. Each test worker has its own copy (financas_test_1, _2, …), made
 * from financas_test by test/global-setup.ts, so test files run in parallel without cleaning each
 * other's data. Outside a worker (the global setup itself), financas_test.
 */
export const TEST_DATABASE = process.env.VITEST_POOL_ID
  ? `financas_test_${process.env.VITEST_POOL_ID}`
  : 'financas_test';

/**
 * Fixed, fake configuration for the API tests: they never read apps/api/.env. The databases are
 * separate ones in the local Docker Postgres, or the Postgres service in CI.
 */
export const testEnv = {
  NODE_ENV: 'test',
  // The API connects as financas_app, as in production: RLS applies to it (ADR 0028).
  DATABASE_URL: `postgresql://financas_app:financas_app@localhost:5434/${TEST_DATABASE}`,
  // Owner of the tables: migrations and test setup (resetDatabase).
  MIGRATION_DATABASE_URL: `postgresql://financas:financas@localhost:5434/${TEST_DATABASE}`,
  BETTER_AUTH_SECRET: 'test-secret-only-for-automated-tests-000',
  BETTER_AUTH_URL: 'http://localhost:3333',
  WEB_ORIGIN: 'http://localhost:5173',
  // Fake credentials: tests answer for Google themselves (test/fake-google.ts).
  GOOGLE_CLIENT_ID: 'test-client-id.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'test-client-secret',
  // What the web app's proxy sends with the client IP (ADR 0033).
  PROXY_SECRET: 'test-proxy-secret-only-for-automated-tests',
} as const;
