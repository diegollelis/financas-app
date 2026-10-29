import {
  budgetDestinationListResponseSchema,
  budgetSchema,
  categoryListResponseSchema,
  categorySchema,
  currentPeriod,
  settlePartResponseSchema,
  shiftPeriod,
  transactionListResponseSchema,
  transactionSchema,
  unlinkedCardTransactionsSchema,
  type CreateTransactionInput,
  type TransactionType,
} from '@financas/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './app.js';
import { ownerClient, resetDatabase } from './db.js';

// Every path that writes into a competência refuses a closed one (ADR 0063), or leaves it alone
// when it runs on its own (generating recurrences, linking cards). All data is fictitious.
const maria = { name: 'Maria Exemplo', email: 'maria@example.com', password: 'senha-de-teste-123' };

const CLOSED = '2026-09';
const OPEN = '2026-10';

describe('a closed competência (ADR 0063)', () => {
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

  async function ready() {
    const user = await t.signUp(maria);
    const { browser, personalWorkspaceId: workspaceId } = user;
    const base = `/api/workspaces/${workspaceId}`;
    const categories = categoryListResponseSchema.parse(
      (await browser.get(`${base}/categories`).expect(200)).body,
    );
    const categoryId = (name: string, type: TransactionType) =>
      categories.find((category) => category.name === name && category.type === type)!.id;
    const create = async (input: Partial<CreateTransactionInput> & { period: string }) =>
      transactionSchema.parse(
        (
          await browser
            .post(`${base}/transactions`)
            .send({
              type: 'DEBIT',
              description: 'Mercado do mês',
              categoryId: categoryId('Mercado', 'DEBIT'),
              amountCents: 30_000,
              ...input,
            })
            .expect(201)
        ).body,
      );
    const close = (period = CLOSED) => browser.post(`${base}/periods/${period}/close`).expect(200);
    const reopen = (period = CLOSED) =>
      browser.post(`${base}/periods/${period}/reopen`).send({ reason: 'Correção' }).expect(200);
    const listOf = async (period: string) =>
      transactionListResponseSchema.parse(
        (await browser.get(`${base}/transactions?period=${period}`).expect(200)).body,
      );
    const marked = async (name: string, type: TransactionType) => {
      const created = categorySchema.parse(
        (await browser.post(`${base}/categories`).send({ name, type }).expect(201)).body,
      );
      await browser.patch(`${base}/categories/${created.id}`).send({ neutral: true }).expect(200);
      return created.id;
    };
    return { ...user, workspaceId, base, categoryId, create, close, reopen, listOf, marked };
  }

  const closedBody = { code: 'PERIOD_CLOSED', period: CLOSED };

  describe('transactions', () => {
    it('refuses creating, changing, moving into and deleting', async () => {
      const { browser, base, create, close } = await ready();
      const settled = await create({ period: CLOSED, settledAt: '2026-09-05' });
      const open = await create({ period: OPEN });
      await close();

      const refused = [
        await browser.post(`${base}/transactions`).send({
          type: 'DEBIT',
          description: 'Outra compra',
          categoryId: open.categoryId,
          amountCents: 1_000,
          period: CLOSED,
        }),
        await browser.patch(`${base}/transactions/${settled.id}`).send({ notes: 'Nota' }),
        await browser.patch(`${base}/transactions/${open.id}`).send({ period: CLOSED }),
        await browser.delete(`${base}/transactions/${settled.id}`),
      ];

      for (const response of refused) {
        expect(response.status).toBe(409);
        expect(response.body).toMatchObject(closedBody);
      }
    });

    it('takes a part of a loan with no due date into an open month, and nothing else of it', async () => {
      const { browser, base, create, close, marked } = await ready();
      const loan = await create({
        type: 'CREDIT',
        description: 'Ana me deve',
        categoryId: await marked('Empréstimo feito', 'CREDIT'),
        amountCents: 50_000,
        period: CLOSED,
      });
      await close();

      await browser
        .patch(`${base}/transactions/${loan.id}`)
        .send({ amountCents: 1_000 })
        .expect(409);
      await browser
        .post(`${base}/transactions/${loan.id}/settle-part`)
        .send({ amountCents: 10_000, settledAt: '2026-09-20' })
        .expect(409);
      const part = settlePartResponseSchema.parse(
        (
          await browser
            .post(`${base}/transactions/${loan.id}/settle-part`)
            .send({ amountCents: 10_000, settledAt: '2026-10-02' })
            .expect(201)
        ).body,
      );

      expect(part.settled).toMatchObject({ period: OPEN, amountCents: 10_000 });
      expect(part.remaining).toMatchObject({ period: CLOSED, amountCents: 40_000 });
    });
  });

  describe('recurrences', () => {
    const internet = (categoryId: string, startPeriod: string) => ({
      type: 'DEBIT',
      description: 'Internet',
      categoryId,
      amountCents: 10_000,
      dueDay: 15,
      startPeriod,
    });

    it('generates nothing in a closed month, and the month once it is reopened', async () => {
      const { browser, base, categoryId, close, reopen, listOf } = await ready();
      await close();
      await browser
        .post(`${base}/recurrences`)
        .send(internet(categoryId('Moradia', 'DEBIT'), '2026-08'))
        .expect(201);

      expect(await listOf(CLOSED)).toEqual([]);
      await browser.get(`${base}/summary/${CLOSED}`).expect(200);

      await reopen();
      expect((await listOf(CLOSED)).map((row) => row.description)).toEqual(['Internet']);
    });

    it('refuses one starting in a closed month', async () => {
      const { browser, base, categoryId, close } = await ready();
      await close();

      const response = await browser
        .post(`${base}/recurrences`)
        .send(internet(categoryId('Moradia', 'DEBIT'), CLOSED))
        .expect(409);

      expect(response.body).toMatchObject(closedBody);
    });
  });

  it('refuses an installment plan with an installment in a closed month, creating nothing', async () => {
    const { browser, base, categoryId, close, listOf } = await ready();
    await close();

    const response = await browser
      .post(`${base}/installments`)
      .send({
        type: 'DEBIT',
        description: 'Geladeira',
        categoryId: categoryId('Compras', 'DEBIT'),
        installments: 3,
        amountCents: 90_000,
        amountIs: 'TOTAL',
        firstPeriod: '2026-08',
        dueDay: 15,
      })
      .expect(409);

    expect(response.body).toMatchObject(closedBody);
    expect(await listOf('2026-08')).toEqual([]);
  });

  it('refuses an import with a line in a closed month, writing nothing', async () => {
    const { browser, base, categoryId, close, listOf } = await ready();
    await close();
    const line = (period: string) => ({
      type: 'DEBIT',
      description: 'Padaria',
      categoryId: categoryId('Mercado', 'DEBIT'),
      amountCents: 2_000,
      period,
      merchantName: 'Padaria Exemplo',
    });

    const response = await browser
      .post(`${base}/imports`)
      .send({ transactions: [line(OPEN), line(CLOSED)] })
      .expect(409);

    expect(response.body).toMatchObject(closedBody);
    expect(await listOf(OPEN)).toEqual([]);
  });

  it('leaves the transactions of a closed month out of linking a card', async () => {
    const { browser, base, workspaceId, categoryId, close } = await ready();
    const unlinked = (period: string) =>
      owner.transaction.create({
        data: {
          workspaceId,
          type: 'DEBIT',
          description: 'Compra no débito',
          categoryId: categoryId('Mercado', 'DEBIT'),
          amountCents: 5_000,
          period,
          settledAt: new Date(`${period}-05`),
          paymentMethod: 'DEBIT_CARD',
        },
      });
    const inClosed = await unlinked(CLOSED);
    await unlinked(OPEN);
    await close();
    const card = (
      await browser
        .post(`${base}/cards`)
        .send({ name: 'Cartão Exemplo', functions: ['DEBIT'] })
        .expect(201)
    ).body as { id: string };

    expect(
      unlinkedCardTransactionsSchema.parse(
        (await browser.get(`${base}/cards/unlinked`).expect(200)).body,
      ),
    ).toEqual({ credit: 0, debit: 1 });
    const linked = await browser
      .post(`${base}/cards/${card.id}/link`)
      .send({ functions: ['DEBIT'] })
      .expect(200);

    expect(linked.body).toEqual({ linked: 1 });
    expect(await owner.transaction.findUnique({ where: { id: inClosed.id } })).toMatchObject({
      cardId: null,
    });
  });

  it('refuses choosing where a loan comes back when that moves a share of a closed month', async () => {
    const { browser, base, create, close, marked, workspaceId } = await ready();
    const lent = await marked('Empréstimo feito', 'DEBIT');
    const back = await marked('Empréstimo recebido', 'CREDIT');
    const bruno = (await browser.post(`${base}/people`).send({ name: 'Bruno Exemplo' }).expect(201))
      .body as { id: string };
    await create({
      description: 'Empréstimo ao Bruno',
      categoryId: lent,
      amountCents: 20_000,
      period: CLOSED,
      settledAt: '2026-09-10',
      split: [{ personId: bruno.id, amountCents: 20_000 }],
    });
    // The share received, so nothing is pending in the month.
    await owner.transaction.updateMany({
      where: { workspaceId, splitOfId: { not: null } },
      data: { settledAt: new Date('2026-09-20') },
    });
    await close();

    const response = await browser
      .patch(`${base}/categories/${lent}`)
      .send({ returnCategoryId: back })
      .expect(409);

    expect(response.body).toMatchObject(closedBody);
    const after = categoryListResponseSchema.parse(
      (await browser.get(`${base}/categories`).expect(200)).body,
    );
    expect(after.find((category) => category.id === lent)?.returnCategoryId).toBeNull();
  });

  describe('budget', () => {
    async function shares(browser: ReturnType<typeof t.http>, base: string) {
      const destinations = budgetDestinationListResponseSchema.parse(
        (await browser.get(`${base}/budget-destinations`).expect(200)).body,
      );
      return destinations.map((destination) => ({
        destinationId: destination.id,
        basisPoints: destination.kind === 'EXPENSES' ? 6_000 : 2_000,
      }));
    }

    it("refuses saving a closed month's budget", async () => {
      const { browser, base, close } = await ready();
      await close();
      const budget = { netIncomeCents: 100_000, shares: await shares(browser, base) };

      const response = await browser.put(`${base}/budget/${CLOSED}`).send(budget).expect(409);

      expect(response.body).toMatchObject(closedBody);
    });

    it('archives a goal from the first open month on when this one is closed', async () => {
      const { browser, base, close } = await ready();
      const thisMonth = currentPeriod();
      const budget = { netIncomeCents: 500_000, shares: await shares(browser, base) };
      await browser
        .put(`${base}/budget/${shiftPeriod(thisMonth, -1)}`)
        .send(budget)
        .expect(200);
      await close(thisMonth);
      const goal = budget.shares[1]!.destinationId;

      await browser
        .patch(`${base}/budget-destinations/${goal}`)
        .send({ archived: true })
        .expect(200);

      const read = async (period: string) =>
        budgetSchema.parse((await browser.get(`${base}/budget/${period}`).expect(200)).body);
      const share = (of: Awaited<ReturnType<typeof read>>) =>
        of.shares.find((item) => item.destinationId === goal)?.basisPoints ?? 0;
      expect(share(await read(thisMonth))).toBe(2_000);
      expect(share(await read(shiftPeriod(thisMonth, 1)))).toBe(0);
    });
  });

  it('refuses closing a month that has not started', async () => {
    const { browser, base } = await ready();

    const response = await browser
      .post(`${base}/periods/${shiftPeriod(currentPeriod(), 1)}/close`)
      .expect(400);

    expect(response.body).toMatchObject({ code: 'INVALID_INPUT' });
  });
});
