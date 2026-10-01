import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Prisma 7 no longer reads .env by itself; Node does it natively. In CI/production the
// variables come from the environment and there is no .env file.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // `prisma generate` does not connect, so it must work without the variable (e.g. in CI).
    url: process.env.DATABASE_URL ?? '',
  },
});
