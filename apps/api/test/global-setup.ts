import { execSync } from 'node:child_process';
import { testEnv } from './test-env.js';

/**
 * Runs once before the API tests: brings the test database up to date with the migrations.
 * `migrate deploy` also creates the database when it does not exist yet.
 */
export default function setup() {
  execSync('pnpm exec prisma migrate deploy', {
    // apps/api, where prisma.config.ts lives (tests may be started from the repo root).
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, DATABASE_URL: testEnv.DATABASE_URL },
    // On failure the error carries Prisma's output (e.g. "Can't reach database server").
    stdio: 'pipe',
  });
}
