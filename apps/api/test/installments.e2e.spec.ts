import {
  categoryListResponseSchema,
  currentPeriod,
  installmentPlanListResponseSchema,
  installmentPlanSchema,
  personSchema,
  shiftPeriod,
  transactionListResponseSchema,
  workspaceSchema,
  type CreateInstallmentPlanInput,
  type TransactionType,
} from '@financas/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './app.js';
import { resetDatabase } from './db.js';
import { expectHiddenFromOutsiders, type WorkspaceRoute } from './isolation.js';

// Parcelamentos (ADR 0038). The months are relative to this month, as the rules are ("pending
// from this month on"). All data here is fictitious (ADR 0019).
const maria = { name: 'Maria Exemplo', email: 'maria@example.com', password: 'senha-de-teste-123' };
const joao = { name: 'João Exemplo', email: 'joao@example.com', password: 'senha-de-teste-456' };

const thisMonth = currentPeriod();
const month = (offset: number) => shiftPeriod(thisMonth, offset);

const installmentRoutes: WorkspaceRoute[] = [
  { method: 'get', path: (id) => `/api/workspaces/${id}/installments` },
  { method: 'post', path: (id) => `/api/workspaces/${id}/installments`, body: {} },
  {
    method: 'delete',
    path: (id) => `/api/workspaces/${id}/installments/01920000-0000-7000-8000-000000000999`,
  },
];

describe('installments', () => {
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
    const fridge = (
      overrides: Partial<CreateInstallmentPlanInput> = {},
    ): CreateInstallmentPlanInput => ({
      type: 'DEBIT',
      description: 'Geladeira',
      categoryId: categoryId('Cartão de crédito', 'DEBIT'),
      installments: 3,
      amountCents: 100_000,
      amountIs: 'TOTAL',
      firstPeriod: thisMonth,
      dueDay: 15,
      ...overrides,
    });
    const create = async (input: CreateInstallmentPlanInput) => {
      const response = await user.browser.post(`${base}/installments`).send(input).expect(201);
      return installmentPlanSchema.parse(response.body);
    };
    const transactionsOf = async (period: string) => {
      const response = await user.browser.get(`${base}/transactions?period=${period}`).expect(200);
      return transactionListResponseSchema.parse(response.body);
    };
    const plans = async () =>
      installmentPlanListResponseSchema.parse(
        (await user.browser.get(`${base}/installments`).expect(200)).body,
      );
    return { ...user, base, categoryId, fridge, create, transactionsOf, plans };
  }

  it('creates every installment at once, one per month, the leftover cents on the last', async () => {
    const { create, fridge, transactionsOf } = await setUp();

    const plan = await create(fridge());

    expect(plan).toMatchObject({
      totalCents: 100_000,
      installments: 3,
      settledCount: 0,
      pendingCount: 3,
      pendingCents: 100_000,
      lastPendingPeriod: month(2),
    });
    const months = await Promise.all([0, 1, 2, 3].map((offset) => transactionsOf(month(offset))));
    expect(months.map((transactions) => transactions.map((t) => t.amountCents))).toEqual([
      [33_333],
      [33_333],
      [33_334],
      [],
    ]);
    expect(months[2]?.[0]).toMatchObject({
      description: 'Geladeira',
      dueDate: `${month(2)}-15`,
      settledAt: null,
      installment: { planId: plan.id, number: 3, count: 3 },
    });
  });

  it('takes the amount of each installment, as the card bill shows it', async () => {
    const { create, fridge, transactionsOf } = await setUp();

    const plan = await create(
      fridge({ amountCents: 9_990, amountIs: 'INSTALLMENT', installments: 10 }),
    );

    expect(plan.totalCents).toBe(99_900);
    expect((await transactionsOf(month(9)))[0]).toMatchObject({
      amountCents: 9_990,
      installment: { number: 10, count: 10 },
    });
  });

  it('counts the settled installments and what is left to pay', async () => {
    const { create, fridge, transactionsOf, plans, base, browser } = await setUp();
    await create(fridge());
    const [first] = await transactionsOf(thisMonth);

    await browser
      .patch(`${base}/transactions/${first?.id}`)
      .send({ settledAt: `${thisMonth}-15` })
      .expect(200);

    // What is left: the other two, with the leftover cents of the last, until its month.
    expect(await plans()).toEqual([
      expect.objectContaining({
        settledCount: 1,
        pendingCount: 2,
        pendingCents: 66_667,
        lastPendingPeriod: month(2),
        endedAt: null,
      }),
    ]);
  });

  it('ends it: pending installments from this month on go, settled and past ones stay', async () => {
    const { create, fridge, transactionsOf, plans, base, browser } = await setUp();
    const plan = await create(fridge({ firstPeriod: month(-1), installments: 4 }));
    const [now] = await transactionsOf(thisMonth);
    await browser
      .patch(`${base}/transactions/${now?.id}`)
      .send({ settledAt: `${thisMonth}-15` })
      .expect(200);

    await browser.delete(`${base}/installments/${plan.id}`).expect(204);

    expect(await transactionsOf(month(-1))).toHaveLength(1);
    expect(await transactionsOf(thisMonth)).toHaveLength(1);
    expect(await transactionsOf(month(1))).toEqual([]);
    expect(await transactionsOf(month(2))).toEqual([]);
    expect((await plans())[0]?.endedAt).not.toBeNull();
    // Ending twice changes nothing.
    await browser.delete(`${base}/installments/${plan.id}`).expect(204);
  });

  it('makes each installment due in the next month, as a card bill is', async () => {
    const { create, fridge, transactionsOf, base, browser } = await setUp();

    const plan = await create(fridge({ dueMonthOffset: 1 }));

    expect(plan.dueMonthOffset).toBe(1);
    for (const offset of [0, 1, 2]) {
      expect((await transactionsOf(month(offset)))[0]?.dueDate).toBe(`${month(offset + 1)}-15`);
    }
    await browser
      .post(`${base}/installments`)
      .send(fridge({ dueMonthOffset: 2 }))
      .expect(400);
  });

  it('refuses an invalid number of installments or category', async () => {
    const { fridge, categoryId, base, browser } = await setUp();

    const one = await browser
      .post(`${base}/installments`)
      .send(fridge({ installments: 1 }))
      .expect(400);
    expect(one.body).toMatchObject({ code: 'INVALID_INPUT', message: 'Use de 2 a 72 parcelas.' });
    const credit = await browser
      .post(`${base}/installments`)
      .send(fridge({ categoryId: categoryId('Salário', 'CREDIT') }))
      .expect(400);
    expect(credit.body).toMatchObject({ code: 'INVALID_CATEGORY' });
  });

  it('gives every installment the person it is owed to, and refuses an archived one', async () => {
    const { create, fridge, transactionsOf, base, browser } = await setUp();
    const add = async (name: string) =>
      personSchema.parse((await browser.post(`${base}/people`).send({ name }).expect(201)).body);
    const bruno = await add('Bruno');
    const carla = await add('Carla');
    await browser.patch(`${base}/people/${carla.id}`).send({ archived: true }).expect(200);

    const loan = await create(fridge({ description: 'Empréstimo do Bruno', personId: bruno.id }));

    expect(loan.personId).toBe(bruno.id);
    for (const offset of [0, 1, 2]) {
      expect((await transactionsOf(month(offset)))[0]?.personId).toBe(bruno.id);
    }
    const refused = await browser
      .post(`${base}/installments`)
      .send(fridge({ personId: carla.id }))
      .expect(400);
    expect(refused.body).toMatchObject({ code: 'INVALID_PERSON' });
  });

  describe('split (ADR 0052)', () => {
    it('gives every installment one pending share per person, each total adding up', async () => {
      const { create, fridge, transactionsOf, base, browser, categoryId, plans } = await setUp();
      const ana = personSchema.parse(
        (await browser.post(`${base}/people`).send({ name: 'Ana' }).expect(201)).body,
      );

      // R$ 1.000,00 in 3, a third for Ana and R$ 100,00 for Bruno, new.
      const plan = await create(
        fridge({
          split: [
            { personId: ana.id, amountCents: 33_334 },
            { newPersonName: 'Bruno', amountCents: 10_000 },
          ],
        }),
      );

      expect(plan).toMatchObject({ installments: 3, settledCount: 0, pendingCount: 3 });
      const months = await Promise.all([0, 1, 2].map((offset) => transactionsOf(month(offset))));
      const sharesOf = (transactions: (typeof months)[number]) => {
        const installment = transactions.find((t) => t.installment !== null)!;
        return transactions
          .filter((t) => t.splitOfId === installment.id)
          .map(({ type, description, amountCents, categoryId: category, settledAt }) => ({
            type,
            description,
            amountCents,
            category,
            settledAt,
          }))
          .sort((a, b) => a.description.localeCompare(b.description));
      };
      const reembolso = categoryId('Reembolso', 'CREDIT');
      expect(sharesOf(months[0]!)).toEqual([
        {
          type: 'CREDIT',
          description: 'Ana: parte de Geladeira (1/3)',
          amountCents: 11_111,
          category: reembolso,
          settledAt: null,
        },
        {
          type: 'CREDIT',
          description: 'Bruno: parte de Geladeira (1/3)',
          amountCents: 3_333,
          category: reembolso,
          settledAt: null,
        },
      ]);
      // The cents left over on the last one: each person's total adds up exactly.
      expect(sharesOf(months[2]!).map((share) => share.amountCents)).toEqual([11_112, 3_334]);
      // The shares are not installments: the plan still has 3.
      expect((await plans())[0]).toMatchObject({ pendingCount: 3, pendingCents: 100_000 });
    });

    it('takes each share per installment when the amount is per installment', async () => {
      const { create, fridge, transactionsOf } = await setUp();

      await create(
        fridge({
          amountCents: 9_990,
          amountIs: 'INSTALLMENT',
          installments: 10,
          split: [{ newPersonName: 'Ana', amountCents: 4_995 }],
        }),
      );

      const last = await transactionsOf(month(9));
      expect(last.find((t) => t.splitOfId !== null)).toMatchObject({
        description: 'Ana: parte de Geladeira (10/10)',
        amountCents: 4_995,
      });
    });

    it('ends it with the shares still pending of the installments removed', async () => {
      const { create, fridge, transactionsOf, base, browser } = await setUp();
      const plan = await create(
        fridge({ firstPeriod: month(-1), split: [{ newPersonName: 'Ana', amountCents: 30_000 }] }),
      );
      // Ana already paid her part of this month's installment.
      const now = await transactionsOf(thisMonth);
      const paidShare = now.find((t) => t.splitOfId !== null)!;
      await browser
        .patch(`${base}/transactions/${paidShare.id}`)
        .send({ settledAt: `${thisMonth}-02` })
        .expect(200);

      await browser.delete(`${base}/installments/${plan.id}`).expect(204);

      // Last month stays whole; this month's paid share stays, unlinked; next month is gone.
      expect(await transactionsOf(month(-1))).toHaveLength(2);
      expect(await transactionsOf(thisMonth)).toEqual([
        expect.objectContaining({ id: paidShare.id, splitOfId: null }),
      ]);
      expect(await transactionsOf(month(1))).toEqual([]);
    });
  });

  it('a VIEWER sees them but does not create them', async () => {
    const owner = await t.signUp(maria);
    const created = await owner.browser.post('/api/workspaces').send({ name: 'Casa' }).expect(201);
    const workspaceId = workspaceSchema.parse(created.body).id;
    const viewer = await t.signUp(joao);
    await t.prisma.member.create({ data: { workspaceId, userId: viewer.userId, role: 'VIEWER' } });

    await viewer.browser.get(`/api/workspaces/${workspaceId}/installments`).expect(200);
    await viewer.browser.post(`/api/workspaces/${workspaceId}/installments`).send({}).expect(403);
  });

  describe('isolation', () => {
    it('hides the routes from non-members', async () => {
      const { personalWorkspaceId } = await t.signUp(maria);

      await expectHiddenFromOutsiders(t, personalWorkspaceId, installmentRoutes);
    });

    it("never shows another workspace's plans", async () => {
      const { create, fridge } = await setUp();
      await create(fridge());
      const joaoUser = await t.signUp(joao);

      const response = await joaoUser.browser
        .get(`/api/workspaces/${joaoUser.personalWorkspaceId}/installments`)
        .expect(200);

      expect(response.body).toEqual([]);
    });
  });
});
