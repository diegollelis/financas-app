import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ownerClient } from './db.js';
import { testEnv } from './test-env.js';

/**
 * The API side of Row Level Security (ADR 0028): the real PrismaService, connected as the
 * financas_app role, against a demo table with the standard policy. The business tables
 * (categories onwards) get the same policy and their own tests through the HTTP routes.
 */
const WORKSPACE_A = '01920000-0000-7000-8000-00000000000a';
const WORKSPACE_B = '01920000-0000-7000-8000-00000000000b';

type Entry = { description: string };

describe('PrismaService.forWorkspace (RLS)', () => {
  const owner = ownerClient();
  const prisma = new PrismaService(new ConfigService({ DATABASE_URL: testEnv.DATABASE_URL }));

  beforeAll(async () => {
    await owner.$executeRawUnsafe('DROP SCHEMA IF EXISTS rls_app_demo CASCADE');
    await owner.$executeRawUnsafe('CREATE SCHEMA rls_app_demo');
    await owner.$executeRawUnsafe(
      'CREATE TABLE rls_app_demo.entries (workspace_id uuid NOT NULL, description text NOT NULL)',
    );
    await owner.$executeRawUnsafe('GRANT USAGE ON SCHEMA rls_app_demo TO financas_app');
    await owner.$executeRawUnsafe('GRANT SELECT, INSERT ON rls_app_demo.entries TO financas_app');
    await owner.$executeRawUnsafe('ALTER TABLE rls_app_demo.entries ENABLE ROW LEVEL SECURITY');
    await owner.$executeRawUnsafe(`
      CREATE POLICY workspace_isolation ON rls_app_demo.entries
        USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
        WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
    `);
    await owner.$executeRawUnsafe(`
      INSERT INTO rls_app_demo.entries (workspace_id, description) VALUES
        ('${WORKSPACE_A}', 'Mercado do espaço A'),
        ('${WORKSPACE_B}', 'Aluguel do espaço B')
    `);
  });

  afterAll(async () => {
    await owner.$executeRawUnsafe('DROP SCHEMA IF EXISTS rls_app_demo CASCADE');
    await owner.$disconnect();
    await prisma.$disconnect();
  });

  it('connects as a role that is neither superuser nor allowed to bypass RLS', async () => {
    const [role] = await prisma.$queryRaw<
      { rolname: string; rolsuper: boolean; rolbypassrls: boolean }[]
    >`
      SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;

    expect(role).toEqual({ rolname: 'financas_app', rolsuper: false, rolbypassrls: false });
  });

  it('a query WITHOUT a workspace filter only sees the workspace it is bound to', async () => {
    const rows = await prisma.forWorkspace(WORKSPACE_A).$queryRaw<
      Entry[]
    >`SELECT description FROM rls_app_demo.entries`;

    expect(rows).toEqual([{ description: 'Mercado do espaço A' }]);
  });

  it('the plain client, outside any workspace, sees nothing (fails closed)', async () => {
    const rows = await prisma.$queryRaw<Entry[]>`SELECT description FROM rls_app_demo.entries`;

    expect(rows).toEqual([]);
  });

  it('writing into another workspace is refused by the database', async () => {
    const write = prisma.forWorkspace(WORKSPACE_A)
      .$executeRaw`INSERT INTO rls_app_demo.entries (workspace_id, description) VALUES (${WORKSPACE_B}::uuid, 'Intruso')`;

    await expect(write).rejects.toThrow(/row-level security/);
  });

  it('model operations go through the bound client too', async () => {
    await expect(prisma.forWorkspace(WORKSPACE_A).workspace.count()).resolves.toBeTypeOf('number');
  });

  it('cannot change the schema nor empty tables', async () => {
    await expect(prisma.$executeRawUnsafe('TRUNCATE TABLE workspaces')).rejects.toThrow(
      /permission denied/,
    );
    await expect(prisma.$executeRawUnsafe('CREATE TABLE public.intruder (id int)')).rejects.toThrow(
      /permission denied/,
    );
  });
});
