import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { testEnv } from './test-env.js';

/**
 * Proof of concept of Row Level Security (ADR 0028), kept as a living test: it shows, with the
 * same Prisma client and driver adapter the API uses, the mechanism the business tables of
 * phase 3 will rely on. It builds its own demo table and role and removes them at the end.
 *
 * Two facts it relies on:
 * - superusers and roles with BYPASSRLS ignore every policy, so queries run as an unprivileged
 *   role (here through `SET LOCAL ROLE`, which lasts only until the end of the transaction);
 * - the active workspace travels in a transaction-local setting (`set_config(..., true)`).
 */
const APP_ROLE = 'financas_rls_demo';
const WORKSPACE_A = '01920000-0000-7000-8000-00000000000a';
const WORKSPACE_B = '01920000-0000-7000-8000-00000000000b';

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
type Entry = { workspace_id: string; description: string };

describe('Row Level Security (proof of concept)', () => {
  // A client of its own, with one connection: tests 4 and 5 need to reuse the same session.
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: testEnv.DATABASE_URL, max: 1 }),
  });

  /** What the API will do on every request inside a workspace (ADR 0028). */
  function withWorkspace<T>(workspaceId: string | null, run: (tx: Tx) => Promise<T>) {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${APP_ROLE}`);
      if (workspaceId) {
        await tx.$queryRaw`SELECT set_config('app.workspace_id', ${workspaceId}, true)`;
      }
      return run(tx);
    });
  }

  beforeAll(async () => {
    // Run as the owner (a superuser, like migrations): sets up the stage.
    await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS rls_demo CASCADE');
    await prisma.$executeRawUnsafe(`DROP ROLE IF EXISTS ${APP_ROLE}`);
    await prisma.$executeRawUnsafe(`CREATE ROLE ${APP_ROLE} NOLOGIN NOSUPERUSER NOBYPASSRLS`);
    await prisma.$executeRawUnsafe('CREATE SCHEMA rls_demo');
    await prisma.$executeRawUnsafe(
      'CREATE TABLE rls_demo.entries (workspace_id uuid NOT NULL, description text NOT NULL)',
    );
    await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA rls_demo TO ${APP_ROLE}`);
    await prisma.$executeRawUnsafe(`GRANT SELECT, INSERT ON rls_demo.entries TO ${APP_ROLE}`);
    await prisma.$executeRawUnsafe('ALTER TABLE rls_demo.entries ENABLE ROW LEVEL SECURITY');
    // NULLIF: after a transaction ends, the setting reads as '' in that session, and ''::uuid
    // would be an error. NULL instead matches no row: without a workspace, nothing is visible.
    await prisma.$executeRawUnsafe(`
      CREATE POLICY workspace_isolation ON rls_demo.entries
        USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
        WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
    `);
    await prisma.$executeRawUnsafe(`
      INSERT INTO rls_demo.entries (workspace_id, description) VALUES
        ('${WORKSPACE_A}', 'Mercado do espaço A'),
        ('${WORKSPACE_B}', 'Aluguel do espaço B')
    `);
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS rls_demo CASCADE');
    await prisma.$executeRawUnsafe(`DROP ROLE IF EXISTS ${APP_ROLE}`);
    await prisma.$disconnect();
  });

  it('1. a query WITHOUT a workspace filter only sees the active workspace', async () => {
    const rows = await withWorkspace(
      WORKSPACE_A,
      (tx) => tx.$queryRaw<Entry[]>`SELECT workspace_id::text, description FROM rls_demo.entries`,
    );

    expect(rows).toEqual([{ workspace_id: WORKSPACE_A, description: 'Mercado do espaço A' }]);
  });

  it('2. without a workspace in the context, nothing is visible (fails closed)', async () => {
    const rows = await withWorkspace(
      null,
      (tx) => tx.$queryRaw<Entry[]>`SELECT description FROM rls_demo.entries`,
    );

    expect(rows).toEqual([]);
  });

  it('3. writing into another workspace is refused by the database', async () => {
    const write = withWorkspace(
      WORKSPACE_A,
      (tx) =>
        tx.$executeRaw`INSERT INTO rls_demo.entries (workspace_id, description) VALUES (${WORKSPACE_B}::uuid, 'Intruso')`,
    );

    await expect(write).rejects.toThrow(/row-level security/);
  });

  it('4. the active workspace does not leak into the next transaction of the same connection', async () => {
    await withWorkspace(WORKSPACE_A, (tx) => tx.$queryRaw`SELECT 1`);

    const rows = await withWorkspace(
      null,
      (tx) => tx.$queryRaw<Entry[]>`SELECT description FROM rls_demo.entries`,
    );

    expect(rows).toEqual([]);
  });

  it('5. a superuser (the role used today) ignores the policy: the API needs its own role', async () => {
    const rows = await prisma.$queryRaw<Entry[]>`SELECT description FROM rls_demo.entries`;

    expect(rows).toHaveLength(2);
  });
});
