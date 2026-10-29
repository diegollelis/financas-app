import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './app.js';
import { ownerClient, resetDatabase } from './db.js';

// The conversion of ADR 0064: a goal that was a share of what was left after the spending limit
// becomes a share of the net income, closed months included. The migration already ran on the
// test database (empty then), so its SQL runs again here over budgets in the old meaning.
// All data here is fictitious (ADR 0019).
const maria = { name: 'Maria Exemplo', email: 'maria@example.com', password: 'senha-de-teste-123' };

const migration = readFileSync(
  fileURLToPath(
    new URL(
      '../prisma/migrations/20261029194248_goals_share_of_income/migration.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);
/** Its statements, without the comments, one at a time (Prisma runs one per call). */
const statements = migration
  .replace(/^--.*$/gm, '')
  .split(';')
  .map((statement) => statement.trim())
  .filter(Boolean);

describe('goals as a share of the net income (ADR 0064 migration)', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  const owner = ownerClient();

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await owner.$disconnect();
    await t.app.close();
  });

  it('turns a share of the leftover into a share of the income, in a closed month too', async () => {
    const { browser, personalWorkspaceId: workspaceId } = await t.signUp(maria);
    const destinations = await owner.budgetDestination.findMany({
      where: { workspaceId },
      orderBy: { position: 'asc' },
    });
    const expenses = destinations.find((destination) => destination.kind === 'EXPENSES')!;
    const [first, second] = destinations.filter((d) => d.kind === 'SAVINGS');
    // Budgets saved the old way: 60% of the income, then 50/30 of the leftover; one with an odd
    // share; and one
    // with no limit, whose goals stay.
    const config = (period: string, shares: [string, number][]) =>
      owner.budgetConfig.create({
        data: {
          workspaceId,
          period,
          netIncomeCents: 700_000,
          shares: {
            create: shares.map(([destinationId, basisPoints]) => ({
              workspaceId,
              destinationId,
              basisPoints,
            })),
          },
        },
      });
    await config('2026-08', [
      [expenses.id, 6_000],
      [first!.id, 5_000],
      [second!.id, 3_000],
    ]);
    await config('2026-09', [
      [expenses.id, 6_500],
      [first!.id, 3_333],
    ]);
    await config('2026-10', [[first!.id, 4_000]]);
    await browser.post(`/api/workspaces/${workspaceId}/periods/2026-08/close`).expect(200);

    for (const statement of statements) await owner.$executeRawUnsafe(statement);

    const shares = await owner.budgetShare.findMany({
      where: { workspaceId },
      include: { budgetConfig: true },
    });
    const of = (period: string, destinationId: string) =>
      shares.find(
        (share) => share.budgetConfig.period === period && share.destinationId === destinationId,
      )?.basisPoints;
    expect([of('2026-08', expenses.id), of('2026-08', first!.id)]).toEqual([6_000, 2_000]);
    expect(of('2026-08', second!.id)).toBe(1_200);
    // 33,33% of 35%: 11,6655%, the rest of the rounding goes to "Sem meta".
    expect(of('2026-09', first!.id)).toBe(1_166);
    expect(of('2026-10', first!.id)).toBe(4_000);
    // The lock is back on: the closed month refuses a write again.
    await expect(
      owner.budgetShare.updateMany({
        where: { workspaceId, budgetConfig: { period: '2026-08' } },
        data: { basisPoints: 0 },
      }),
    ).rejects.toThrow();
  });
});
