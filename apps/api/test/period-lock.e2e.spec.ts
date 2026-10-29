import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './app.js';
import { ownerClient, resetDatabase } from './db.js';

// The period lock trigger (ADR 0063): the database's own refusal of a write into a closed
// competência, behind the services' check. These tests write around the services on purpose.
// All data here is fictitious (ADR 0019).
const maria = { name: 'Maria Exemplo', email: 'maria@example.com', password: 'senha-de-teste-123' };

const CLOSED = '2026-09';
const OPEN = '2026-10';

describe('period lock trigger', () => {
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

  /** Maria's workspace with a debit category, and a way to write rows as the owner. */
  async function ready() {
    const { browser, personalWorkspaceId: workspaceId, userId } = await t.signUp(maria);
    const category = await owner.category.findFirstOrThrow({
      where: { workspaceId, type: 'DEBIT', name: 'Mercado' },
    });
    const debit = (fields: { period: string; dueDate?: Date | null; settledAt?: Date | null }) =>
      owner.transaction.create({
        data: {
          workspaceId,
          type: 'DEBIT',
          description: 'Compra de teste',
          categoryId: category.id,
          amountCents: 10_000,
          dueDate: null,
          settledAt: null,
          ...fields,
        },
      });
    const close = (period: string) =>
      owner.periodClosing.create({ data: { workspaceId, period, closedById: userId } });
    // The API's role, subject to RLS and to the trigger.
    const db = t.prisma.forWorkspace(workspaceId);
    return { browser, workspaceId, userId, debit, close, db };
  }

  const refused = (period: string) => ({
    meta: expect.objectContaining({
      driverAdapterError: expect.objectContaining({
        cause: expect.objectContaining({ code: 'FC001', detail: period }) as unknown,
      }) as unknown,
    }) as unknown,
  });

  it('answers a write the trigger refused with 409 PERIOD_CLOSED', async () => {
    const { browser, workspaceId, debit, close } = await ready();
    const settled = await debit({ period: CLOSED, settledAt: new Date('2026-09-05') });
    await close(CLOSED);

    const response = await browser
      .patch(`/api/workspaces/${workspaceId}/transactions/${settled.id}`)
      .send({ description: 'Outra descrição' })
      .expect(409);

    expect(response.body).toMatchObject({
      code: 'PERIOD_CLOSED',
      period: CLOSED,
      message: 'O mês de setembro de 2026 está fechado: reabra o mês para mudar algo nele.',
    });
  });

  it('refuses inserting, changing, moving and deleting in a closed competência', async () => {
    const { debit, close, db, workspaceId } = await ready();
    const inClosed = await debit({ period: CLOSED, settledAt: new Date('2026-09-05') });
    const inOpen = await debit({ period: OPEN });
    await close(CLOSED);

    await expect(
      db.transaction.create({
        data: {
          workspaceId,
          type: 'DEBIT',
          description: 'Compra nova',
          categoryId: inOpen.categoryId,
          amountCents: 100,
          period: CLOSED,
        },
      }),
    ).rejects.toMatchObject(refused(CLOSED));
    await expect(
      db.transaction.update({ where: { id: inClosed.id }, data: { amountCents: 1 } }),
    ).rejects.toMatchObject(refused(CLOSED));
    await expect(
      db.transaction.update({ where: { id: inOpen.id }, data: { period: CLOSED } }),
    ).rejects.toMatchObject(refused(CLOSED));
    await expect(db.transaction.delete({ where: { id: inClosed.id } })).rejects.toMatchObject(
      refused(CLOSED),
    );

    // The open competência is untouched by the lock.
    await db.transaction.update({ where: { id: inOpen.id }, data: { amountCents: 2 } });
    expect(await owner.transaction.count({ where: { workspaceId } })).toBe(2);
  });

  it('lets a loan with no due date be settled in part, and nothing else', async () => {
    const { debit, close, db } = await ready();
    const loan = await debit({ period: CLOSED });
    const anotherLoan = await debit({ period: CLOSED });
    await close(CLOSED);

    await db.transaction.update({ where: { id: loan.id }, data: { amountCents: 4_000 } });
    await db.transaction.delete({ where: { id: anotherLoan.id } });

    await expect(
      db.transaction.update({ where: { id: loan.id }, data: { description: 'Outra' } }),
    ).rejects.toMatchObject(refused(CLOSED));
    await expect(
      db.transaction.update({
        where: { id: loan.id },
        data: { settledAt: new Date('2026-10-01') },
      }),
    ).rejects.toMatchObject(refused(CLOSED));
  });

  it('lets links that change no amount go, such as a share left without its split one', async () => {
    const { debit, close, db } = await ready();
    const split = await debit({ period: CLOSED, settledAt: new Date('2026-09-05') });
    const share = await debit({ period: CLOSED, settledAt: new Date('2026-09-05') });
    await owner.transaction.update({ where: { id: share.id }, data: { splitOfId: split.id } });
    await close(CLOSED);

    await db.transaction.update({ where: { id: share.id }, data: { splitOfId: null } });
  });

  it('frees the competência once the closing is reopened', async () => {
    const { debit, close, db, userId } = await ready();
    const settled = await debit({ period: CLOSED, settledAt: new Date('2026-09-05') });
    const closing = await close(CLOSED);
    await owner.periodClosing.update({
      where: { id: closing.id },
      data: { reopenedAt: new Date(), reopenedById: userId, reopenReason: 'Correção' },
    });

    await db.transaction.update({ where: { id: settled.id }, data: { amountCents: 1 } });
  });

  it("refuses changing a closed competência's budget and its shares", async () => {
    const { workspaceId, close, db } = await ready();
    const expenses = await owner.budgetDestination.findFirstOrThrow({
      where: { workspaceId, kind: 'EXPENSES' },
    });
    const config = await owner.budgetConfig.create({
      data: { workspaceId, period: CLOSED, netIncomeCents: 500_000 },
    });
    await close(CLOSED);

    await expect(
      db.budgetConfig.update({ where: { id: config.id }, data: { netIncomeCents: 1 } }),
    ).rejects.toMatchObject(refused(CLOSED));
    await expect(
      db.budgetShare.create({
        data: {
          workspaceId,
          budgetConfigId: config.id,
          destinationId: expenses.id,
          basisPoints: 6_000,
        },
      }),
    ).rejects.toMatchObject(refused(CLOSED));
    await expect(
      db.budgetConfig.create({ data: { workspaceId, period: OPEN, netIncomeCents: 1 } }),
    ).resolves.toBeDefined();
  });

  it('lets a workspace with closed competências be deleted', async () => {
    const { workspaceId, debit, close } = await ready();
    const expenses = await owner.budgetDestination.findFirstOrThrow({
      where: { workspaceId, kind: 'EXPENSES' },
    });
    await debit({ period: CLOSED, settledAt: new Date('2026-09-05') });
    await owner.budgetConfig.create({
      data: {
        workspaceId,
        period: CLOSED,
        netIncomeCents: 500_000,
        shares: { create: { workspaceId, destinationId: expenses.id, basisPoints: 6_000 } },
      },
    });
    await close(CLOSED);

    await t.prisma.workspace.delete({ where: { id: workspaceId } });

    expect(await owner.transaction.count({ where: { workspaceId } })).toBe(0);
  });
});
