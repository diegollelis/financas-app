import {
  analysisSchema,
  categoryListResponseSchema,
  currentPeriod,
  recurrenceListResponseSchema,
  recurrenceSchema,
  shiftPeriod,
  transactionListResponseSchema,
  workspaceSchema,
  type CreateRecurrenceInput,
  type TransactionType,
} from '@financas/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './app.js';
import { resetDatabase } from './db.js';
import { expectHiddenFromOutsiders, type WorkspaceRoute } from './isolation.js';

// Recorrências (ADR 0038). The months are relative to this month, as the rules are ("pending
// from this month on"). All data here is fictitious (ADR 0019).
const maria = { name: 'Maria Exemplo', email: 'maria@example.com', password: 'senha-de-teste-123' };
const joao = { name: 'João Exemplo', email: 'joao@example.com', password: 'senha-de-teste-456' };

const thisMonth = currentPeriod();
const month = (offset: number) => shiftPeriod(thisMonth, offset);

const recurrenceRoutes: WorkspaceRoute[] = [
  { method: 'get', path: (id) => `/api/workspaces/${id}/recurrences` },
  { method: 'post', path: (id) => `/api/workspaces/${id}/recurrences`, body: {} },
  {
    method: 'patch',
    path: (id) => `/api/workspaces/${id}/recurrences/01920000-0000-7000-8000-000000000999`,
    body: { amountCents: 100 },
  },
  {
    method: 'delete',
    path: (id) => `/api/workspaces/${id}/recurrences/01920000-0000-7000-8000-000000000999`,
  },
];

describe('recurrences', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await t.app.close();
  });

  type Browser = ReturnType<typeof t.http>;

  async function categoryIds(browser: Browser, workspaceId: string) {
    const response = await browser.get(`/api/workspaces/${workspaceId}/categories`).expect(200);
    const categories = categoryListResponseSchema.parse(response.body);
    return (name: string, type: TransactionType) => {
      const found = categories.find((category) => category.name === name && category.type === type);
      if (!found) throw new Error(`No category ${name} (${type})`);
      return found.id;
    };
  }

  async function setUp() {
    const user = await t.signUp(maria);
    const categoryId = await categoryIds(user.browser, user.personalWorkspaceId);
    const base = `/api/workspaces/${user.personalWorkspaceId}`;
    const energy = (overrides: Partial<CreateRecurrenceInput> = {}): CreateRecurrenceInput => ({
      type: 'DEBIT',
      description: 'Conta de luz',
      categoryId: categoryId('Energia', 'DEBIT'),
      amountCents: 18_000,
      dueDay: 10,
      startPeriod: thisMonth,
      ...overrides,
    });
    const create = async (input: CreateRecurrenceInput) => {
      const response = await user.browser.post(`${base}/recurrences`).send(input).expect(201);
      return recurrenceSchema.parse(response.body);
    };
    const transactionsOf = async (period: string) => {
      const response = await user.browser.get(`${base}/transactions?period=${period}`).expect(200);
      return transactionListResponseSchema.parse(response.body);
    };
    return { ...user, base, categoryId, energy, create, transactionsOf };
  }

  it('creates its transaction in the first month right away, pending and estimated', async () => {
    const { create, energy, transactionsOf, base, browser } = await setUp();

    const recurrence = await create(energy());

    const transactions = await transactionsOf(thisMonth);
    expect(transactions).toEqual([
      expect.objectContaining({
        description: 'Conta de luz',
        amountCents: 18_000,
        period: thisMonth,
        dueDate: `${thisMonth}-10`,
        settledAt: null,
        recurrenceId: recurrence.id,
      }),
    ]);
    const list = await browser.get(`${base}/recurrences`).expect(200);
    expect(recurrenceListResponseSchema.parse(list.body)).toEqual([
      expect.objectContaining({ id: recurrence.id, startPeriod: thisMonth, endPeriod: null }),
    ]);
  });

  it('generates each later month once, when it is opened, and never before the start', async () => {
    const { create, energy, transactionsOf } = await setUp();
    await create(energy());

    // Opened twice, and twice at the same time: still one transaction.
    await transactionsOf(month(2));
    await Promise.all([transactionsOf(month(2)), transactionsOf(month(2))]);

    expect(await transactionsOf(month(2))).toHaveLength(1);
    expect(await transactionsOf(month(-1))).toEqual([]);
  });

  it('does not bring back a generated transaction that was deleted', async () => {
    const { create, energy, transactionsOf, base, browser } = await setUp();
    await create(energy());
    const [generated] = await transactionsOf(thisMonth);

    await browser.delete(`${base}/transactions/${generated?.id}`).expect(204);

    expect(await transactionsOf(thisMonth)).toEqual([]);
  });

  it('changes only the pending transactions from this month on', async () => {
    const { create, energy, transactionsOf, base, browser } = await setUp();
    const recurrence = await create(energy({ startPeriod: month(-1) }));
    const [lastMonth] = await transactionsOf(month(-1));
    const [settledNow] = await transactionsOf(thisMonth);
    await transactionsOf(month(1));
    await browser
      .patch(`${base}/transactions/${settledNow?.id}`)
      .send({ settledAt: `${thisMonth}-05` })
      .expect(200);

    await browser
      .patch(`${base}/recurrences/${recurrence.id}`)
      .send({ amountCents: 21_000, dueDay: 31 })
      .expect(200);

    // History stays: last month (even pending) and what was already settled.
    expect((await transactionsOf(month(-1)))[0]).toMatchObject({
      id: lastMonth?.id,
      amountCents: 18_000,
    });
    expect((await transactionsOf(thisMonth))[0]).toMatchObject({ amountCents: 18_000 });
    const [next] = await transactionsOf(month(1));
    expect(next?.amountCents).toBe(21_000);
    // Day 31 in a shorter month falls on its last day.
    expect(next?.dueDate?.slice(8)).toBe(
      String(new Date(Date.UTC(...nextMonthParts(month(1)), 0)).getUTCDate()),
    );
  });

  it('ends it: pending transactions from this month on go, history stays', async () => {
    const { create, energy, transactionsOf, base, browser } = await setUp();
    const recurrence = await create(energy({ startPeriod: month(-1) }));
    await transactionsOf(month(-1));
    await transactionsOf(month(1));

    await browser.delete(`${base}/recurrences/${recurrence.id}`).expect(204);

    expect(await transactionsOf(month(-1))).toHaveLength(1);
    expect(await transactionsOf(thisMonth)).toEqual([]);
    expect(await transactionsOf(month(1))).toEqual([]);
    expect(await transactionsOf(month(3))).toEqual([]);
    const list = recurrenceListResponseSchema.parse(
      (await browser.get(`${base}/recurrences`).expect(200)).body,
    );
    expect(list).toEqual([expect.objectContaining({ id: recurrence.id, endPeriod: month(-1) })]);
    // Ending twice changes nothing.
    await browser.delete(`${base}/recurrences/${recurrence.id}`).expect(204);
  });

  it('deletes one that never reached this month, keeping what was already settled', async () => {
    const { create, energy, transactionsOf, base, browser } = await setUp();
    const recurrence = await create(energy({ startPeriod: month(1) }));
    const [first] = await transactionsOf(month(1));
    await browser
      .patch(`${base}/transactions/${first?.id}`)
      .send({ settledAt: `${thisMonth}-05` })
      .expect(200);

    await browser.delete(`${base}/recurrences/${recurrence.id}`).expect(204);

    expect((await browser.get(`${base}/recurrences`).expect(200)).body).toEqual([]);
    expect(await transactionsOf(month(1))).toEqual([
      expect.objectContaining({ id: first?.id, recurrenceId: null }),
    ]);
  });

  it('counts in the analysis of a range, as if each month had been opened', async () => {
    const { create, energy, base, browser } = await setUp();
    await create(energy());

    const response = await browser
      .get(`${base}/analysis?from=${thisMonth}&to=${month(2)}`)
      .expect(200);

    expect(analysisSchema.parse(response.body).rows).toHaveLength(3);
  });

  it('refuses an invalid category or day', async () => {
    const { energy, categoryId, base, browser } = await setUp();

    const wrongType = await browser
      .post(`${base}/recurrences`)
      .send(energy({ categoryId: categoryId('Salário', 'CREDIT') }))
      .expect(400);
    expect(wrongType.body).toMatchObject({ code: 'INVALID_CATEGORY' });
    const badDay = await browser
      .post(`${base}/recurrences`)
      .send(energy({ dueDay: 32 }))
      .expect(400);
    expect(badDay.body).toMatchObject({
      code: 'INVALID_INPUT',
      message: 'Use um dia entre 1 e 31.',
    });
  });

  it('keeps a category in use by a recurrence from being deleted', async () => {
    const { create, energy, categoryId, base, browser } = await setUp();
    await create(energy());
    const energia = categoryId('Energia', 'DEBIT');
    // Its generated transaction is deleted, so only the recurrence still uses the category.
    const [generated] = (await browser.get(`${base}/transactions?period=${thisMonth}`)).body as {
      id: string;
    }[];
    await browser.delete(`${base}/transactions/${generated?.id}`).expect(204);
    await browser.patch(`${base}/categories/${energia}`).send({ archived: true }).expect(200);

    const response = await browser.delete(`${base}/categories/${energia}`).expect(409);

    expect(response.body).toMatchObject({ code: 'CATEGORY_IN_USE' });
  });

  it('a VIEWER sees them but does not change them', async () => {
    const owner = await t.signUp(maria);
    const created = await owner.browser.post('/api/workspaces').send({ name: 'Casa' }).expect(201);
    const workspaceId = workspaceSchema.parse(created.body).id;
    const viewer = await t.signUp(joao);
    await t.prisma.member.create({ data: { workspaceId, userId: viewer.userId, role: 'VIEWER' } });

    await viewer.browser.get(`/api/workspaces/${workspaceId}/recurrences`).expect(200);
    await viewer.browser.post(`/api/workspaces/${workspaceId}/recurrences`).send({}).expect(403);
  });

  describe('variable amount (energy, water)', () => {
    it('starts each month from the average of the last settled, as an estimate', async () => {
      const { create, energy, transactionsOf, base, browser } = await setUp();
      const settle = async (period: string, amountCents: number) => {
        const [transaction] = await transactionsOf(period);
        const response = await browser
          .patch(`${base}/transactions/${transaction?.id}`)
          .send({ amountCents, settledAt: `${period}-05` })
          .expect(200);
        return response.body as { amountEstimated: boolean };
      };
      await create(energy({ variableAmount: true, startPeriod: month(-2) }));

      // No history yet: the amount typed, as an estimate.
      expect((await transactionsOf(month(-2)))[0]).toMatchObject({
        amountCents: 18_000,
        amountEstimated: true,
      });
      expect(await settle(month(-2), 20_000)).toMatchObject({ amountEstimated: false });
      expect((await transactionsOf(month(-1)))[0]).toMatchObject({
        amountCents: 20_000,
        amountEstimated: true,
      });
      await settle(month(-1), 22_000);

      // The average of the settled months before each one.
      expect((await transactionsOf(thisMonth))[0]).toMatchObject({ amountCents: 21_000 });
      expect((await transactionsOf(month(1)))[0]).toMatchObject({ amountCents: 21_000 });
    });

    it('confirms the amount when it is given or settled, and never goes back to estimate', async () => {
      const { create, energy, transactionsOf, base, browser } = await setUp();
      await create(energy({ variableAmount: true }));
      const [now] = await transactionsOf(thisMonth);
      const [next] = await transactionsOf(month(1));

      const settled = await browser
        .patch(`${base}/transactions/${now?.id}`)
        .send({ settledAt: `${thisMonth}-05` })
        .expect(200);
      expect(settled.body).toMatchObject({ amountEstimated: false });
      const undone = await browser
        .patch(`${base}/transactions/${now?.id}`)
        .send({ settledAt: null })
        .expect(200);
      expect(undone.body).toMatchObject({ amountEstimated: false });
      const typed = await browser
        .patch(`${base}/transactions/${next?.id}`)
        .send({ amountCents: 19_500 })
        .expect(200);
      expect(typed.body).toMatchObject({ amountCents: 19_500, amountEstimated: false });
    });

    it('a new amount reaches only the months still estimated', async () => {
      const { create, energy, transactionsOf, base, browser } = await setUp();
      const recurrence = await create(energy({ variableAmount: true }));
      const [now] = await transactionsOf(thisMonth);
      await transactionsOf(month(1));
      await browser
        .patch(`${base}/transactions/${now?.id}`)
        .send({ amountCents: 19_500 })
        .expect(200);

      await browser
        .patch(`${base}/recurrences/${recurrence.id}`)
        .send({ amountCents: 25_000 })
        .expect(200);

      expect((await transactionsOf(thisMonth))[0]).toMatchObject({ amountCents: 19_500 });
      expect((await transactionsOf(month(1)))[0]).toMatchObject({
        amountCents: 25_000,
        amountEstimated: true,
      });
    });

    it('tells the dashboard how much is an estimate; a fixed one never is', async () => {
      const { create, energy, categoryId, transactionsOf, base, browser } = await setUp();
      await create(energy({ variableAmount: true }));
      await create(
        energy({ description: 'Internet', categoryId: categoryId('Internet', 'DEBIT') }),
      );

      const transactions = await transactionsOf(thisMonth);
      expect(transactions.find((t) => t.description === 'Internet')).toMatchObject({
        amountEstimated: false,
      });
      const summary = await browser.get(`${base}/summary/${thisMonth}`).expect(200);
      expect(summary.body).toMatchObject({ estimatedCents: 18_000 });
    });
  });

  describe('isolation', () => {
    it('hides the routes from non-members', async () => {
      const { personalWorkspaceId } = await t.signUp(maria);

      await expectHiddenFromOutsiders(t, personalWorkspaceId, recurrenceRoutes);
    });

    it("never generates another workspace's recurrences", async () => {
      const { create, energy } = await setUp();
      await create(energy());
      const joaoUser = await t.signUp(joao);

      const response = await joaoUser.browser
        .get(`/api/workspaces/${joaoUser.personalWorkspaceId}/transactions?period=${thisMonth}`)
        .expect(200);

      expect(response.body).toEqual([]);
    });
  });
});

/** [year, month] of a competência, for Date.UTC(year, month, 0): that month's last day. */
function nextMonthParts(period: string): [number, number] {
  const [year, monthNumber] = period.split('-').map(Number);
  return [year ?? 0, monthNumber ?? 1];
}
