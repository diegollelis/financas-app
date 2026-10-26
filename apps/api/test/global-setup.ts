import { execSync } from 'node:child_process';
import { PrismaPg } from '@prisma/adapter-pg';
import type { TestProject } from 'vitest/node';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { ownerClient } from './db.js';
import { testEnv } from './test-env.js';

/**
 * Runs once before the API tests: brings the test database up to date with the migrations
 * (`migrate deploy` also creates the database when it does not exist yet), lets the API role log
 * in with the test password (the migration creates the role without login, ADR 0028), then copies
 * the database once per worker (test/test-env.ts picks the copy).
 */
export default async function setup(project: TestProject) {
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

  // A copy from a template is a file copy, much faster than migrating each one. The template must
  // have no connections, so this runs from the maintenance database.
  const server = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: testEnv.MIGRATION_DATABASE_URL.replace(/\/financas_test$/, '/postgres'),
    }),
  });
  try {
    // The worker number may count every project's workers when all of them run together.
    const workers = Math.max(project.config.maxWorkers, project.globalConfig.maxWorkers);
    for (let worker = 1; worker <= workers; worker++) {
      await server.$executeRawUnsafe(
        `DROP DATABASE IF EXISTS financas_test_${worker} WITH (FORCE)`,
      );
      await server.$executeRawUnsafe(
        `CREATE DATABASE financas_test_${worker} TEMPLATE financas_test`,
      );
    }
  } finally {
    await server.$disconnect();
  }
}
