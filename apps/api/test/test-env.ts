/**
 * Fixed, fake configuration for the API tests: they never read apps/api/.env. The database is a
 * separate one (financas_test) in the local Docker Postgres, or the Postgres service in CI.
 */
export const testEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://financas:financas@localhost:5434/financas_test',
  BETTER_AUTH_SECRET: 'test-secret-only-for-automated-tests-000',
  BETTER_AUTH_URL: 'http://localhost:3333',
  WEB_ORIGIN: 'http://localhost:5173',
  // Fake credentials: tests answer for Google themselves (test/fake-google.ts).
  GOOGLE_CLIENT_ID: 'test-client-id.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'test-client-secret',
} as const;
