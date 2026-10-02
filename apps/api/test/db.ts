import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { testEnv } from './test-env.js';

/** A client connected as the owner of the tables, which the API role (financas_app) is not. */
export function ownerClient() {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: testEnv.MIGRATION_DATABASE_URL }),
  });
}

/**
 * Empties the tables between tests, so each test starts from a clean database. Runs as the
 * owner: the API role has no TRUNCATE privilege, and RLS would hide rows from it.
 */
export async function resetDatabase() {
  const owner = ownerClient();
  try {
    await owner.$executeRaw`TRUNCATE TABLE transactions, categories, users, sessions, accounts, verifications, rate_limits, invitations, members, workspaces CASCADE`;
  } finally {
    await owner.$disconnect();
  }
}
