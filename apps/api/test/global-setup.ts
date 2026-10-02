import { execSync } from 'node:child_process';
import { ownerClient } from './db.js';
import { testEnv } from './test-env.js';

/**
 * Runs once before the API tests: brings the test database up to date with the migrations
 * (`migrate deploy` also creates the database when it does not exist yet), then lets the API
 * role log in with the test password. The migration creates the role without login (ADR 0028).
 */
export default async function setup() {
  execSync('pnpm exec prisma migrate deploy', {
    // apps/api, where prisma.config.ts lives (tests may be started from the repo root).
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, MIGRATION_DATABASE_URL: testEnv.MIGRATION_DATABASE_URL },
    // On failure the error carries Prisma's output (e.g. "Can't reach database server").
    stdio: 'pipe',
  });

  const owner = ownerClient();
  try {
    await owner.$executeRawUnsafe(`ALTER ROLE financas_app LOGIN PASSWORD 'financas_app'`);
  } finally {
    await owner.$disconnect();
  }
}
