import type { PrismaClient } from '../src/generated/prisma/client.js';

/** Empties the tables between tests, so each test starts from a clean database. */
export async function resetDatabase(prisma: PrismaClient) {
  await prisma.$executeRaw`TRUNCATE TABLE users, sessions, accounts, verifications, rate_limits, members, workspaces CASCADE`;
}
