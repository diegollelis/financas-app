import { afterAll, describe, expect, it } from 'vitest';
import { ownerClient } from './db.js';

/**
 * Row Level Security is added by hand in each migration (ADR 0028): Prisma does not manage
 * policies, so a new business table could easily ship without one. This guard fails when any
 * table with a `workspace_id` column lacks RLS or its policy.
 */
describe('Row Level Security coverage', () => {
  const owner = ownerClient();

  afterAll(async () => {
    await owner.$disconnect();
  });

  it('every table with a workspace_id has RLS on and a policy', async () => {
    const tables = await owner.$queryRaw<{ table: string; rls: boolean; policies: bigint }[]>`
      SELECT c.relname AS "table",
             c.relrowsecurity AS rls,
             (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND EXISTS (
          SELECT 1 FROM pg_attribute a
          WHERE a.attrelid = c.oid AND a.attname = 'workspace_id' AND NOT a.attisdropped
        )
      ORDER BY c.relname
    `;

    // Tables of the workspace membership itself are read before a workspace is in context,
    // and are protected by WorkspaceMemberGuard instead (ADR 0025).
    const exempt = new Set(['members', 'invitations']);
    const business = tables.filter(({ table }) => !exempt.has(table));
    expect(business.map(({ table }) => table)).toEqual(
      expect.arrayContaining(['recurrences', 'recurrence_occurrences', 'transactions']),
    );
    for (const { table, rls, policies } of business) {
      expect({ table, rls, hasPolicy: policies > 0n }).toEqual({
        table,
        rls: true,
        hasPolicy: true,
      });
    }
  });
});
