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
    method: 'post',
    path: (id) => `/api/workspaces/${id}/installments/from-transaction`,
    body: {},
  },
  {
    method: 'patch',
    path: (id) => `/api/workspaces/${id}/installments/01920000-0000-7000-8000-000000000999`,
    body: { description: 'Intruso' },
  },
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
      categoryId: categoryId('Compras', 'DEBIT'),
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

  describe('a purchase already running (ADR 0055)', () => {
    it('creates only the installments from the first number on, numbered as the bill', async () => {
      const { create, fridge, transactionsOf } = await setUp();

      const plan = await create(
        fridge({ installments: 10, firstNumber: 3, amountCents: 5_000, amountIs: 'INSTALLMENT' }),
      );

      // Installments 3 to 10: eight of them, from this month on.
      expect(plan).toMatchObject({
        installments: 10,
        firstNumber: 3,
        totalCents: 40_000,
        pendingCount: 8,
        lastPendingPeriod: month(7),
      });
      expect((await transactionsOf(thisMonth))[0]?.installment).toEqual({
        planId: plan.id,
        number: 3,
        count: 10,
      });
      expect((await transactionsOf(month(7)))[0]?.installment).toMatchObject({ number: 10 });
      expect(await transactionsOf(month(8))).toEqual([]);
    });

    it('takes a total as the total of the installments created, and names the shares as the bill', async () => {
      const { create, fridge, transactionsOf } = await setUp();

      const plan = await create(
        fridge({
          installments: 4,
          firstNumber: 3,
          amountCents: 10_001,
          split: [{ newPersonName: 'Ana', amountCents: 5_000 }],
        }),
      );

      expect(plan).toMatchObject({ totalCents: 10_001, pendingCount: 2 });
      const last = await transactionsOf(month(1));
      expect(last.find((t) => t.installment)?.amountCents).toBe(5_001);
      expect(last.find((t) => t.splitOfId !== null)).toMatchObject({
        description: 'Geladeira (4/4)',
        amountCents: 2_500,
      });
    });

    it('refuses a first number past the installments, also when editing', async () => {
      const { create, fridge, base, browser } = await setUp();

      const refused = await browser
        .post(`${base}/installments`)
        .send(fridge({ firstNumber: 4 }))
        .expect(400);
      expect(refused.body).toMatchObject({
        message: 'A parcela inicial passa do número de parcelas.',
      });
      const plan = await create(fridge());
      await browser.patch(`${base}/installments/${plan.id}`).send({ firstNumber: 4 }).expect(400);
    });

    it('remakes the installments from a new first number while none is settled', async () => {
      const { create, fridge, base, browser, transactionsOf } = await setUp();
      const plan = await create(fridge({ installments: 5 }));

      const response = await browser
        .patch(`${base}/installments/${plan.id}`)
        .send({ firstNumber: 4 })
        .expect(200);

      expect(installmentPlanSchema.parse(response.body)).toMatchObject({
        firstNumber: 4,
        totalCents: 100_000,
        pendingCount: 2,
      });
      expect((await transactionsOf(thisMonth))[0]?.installment).toMatchObject({
        number: 4,
        count: 5,
      });
    });
  });

  describe('the day of the purchase (ADR 0055 note)', () => {
    it('gives it to every installment and share, and a change reaches the pending ones', async () => {
      const { create, fridge, transactionsOf, base, browser } = await setUp();
      const day = (n: number) => `${month(-1)}-${n}`;
      const plan = await create(
        fridge({ occurredOn: day(28), split: [{ newPersonName: 'Ana', amountCents: 30_000 }] }),
      );
      expect(plan.occurredOn).toBe(day(28));
      const days = async (offset: number) =>
        (await transactionsOf(month(offset))).map((t) => t.occurredOn);
      expect(await days(2)).toEqual([day(28), day(28)]);
      // This month's installment is already paid: history, it keeps its day.
      const paid = (await transactionsOf(thisMonth)).find((t) => t.installment)!;
      await browser
        .patch(`${base}/transactions/${paid.id}`)
        .send({ settledAt: `${thisMonth}-05` })
        .expect(200);

      const response = await browser
        .patch(`${base}/installments/${plan.id}`)
        .send({ occurredOn: day(27) })
        .expect(200);

      expect(installmentPlanSchema.parse(response.body).occurredOn).toBe(day(27));
      expect((await transactionsOf(thisMonth)).find((t) => t.installment)?.occurredOn).toBe(
        day(28),
      );
      expect(await days(1)).toEqual([day(27), day(27)]);
    });
  });

  describe('editing and deleting (ADR 0038 note)', () => {
    it('changes what it is in the pending installments, never in the settled ones', async () => {
      const { create, fridge, transactionsOf, base, browser, categoryId } = await setUp();
      const plan = await create(fridge());
      const [first] = await transactionsOf(thisMonth);
      await browser
        .patch(`${base}/transactions/${first?.id}`)
        .send({ settledAt: `${thisMonth}-15` })
        .expect(200);

      const response = await browser
        .patch(`${base}/installments/${plan.id}`)
        .send({
          description: 'Geladeira nova',
          categoryId: categoryId('Compras', 'DEBIT'),
          paymentMethod: 'CREDIT_CARD',
          dueDay: 20,
        })
        .expect(200);

      expect(installmentPlanSchema.parse(response.body)).toMatchObject({
        description: 'Geladeira nova',
        paymentMethod: 'CREDIT_CARD',
        dueDay: 20,
        settledCount: 1,
      });
      expect((await transactionsOf(thisMonth))[0]).toMatchObject({
        description: 'Geladeira',
        paymentMethod: null,
      });
      expect((await transactionsOf(month(1)))[0]).toMatchObject({
        description: 'Geladeira nova',
        categoryId: categoryId('Compras', 'DEBIT'),
        paymentMethod: 'CREDIT_CARD',
        dueDate: `${month(1)}-20`,
      });
    });

    it('remakes the installments when the amounts change and none is settled', async () => {
      const { create, fridge, transactionsOf, base, browser } = await setUp();
      const plan = await create(fridge());

      const response = await browser
        .patch(`${base}/installments/${plan.id}`)
        .send({ amountCents: 120_000, amountIs: 'TOTAL', installments: 4 })
        .expect(200);

      expect(installmentPlanSchema.parse(response.body)).toMatchObject({
        totalCents: 120_000,
        installments: 4,
        pendingCount: 4,
      });
      expect((await transactionsOf(month(3)))[0]).toMatchObject({
        amountCents: 30_000,
        installment: { planId: plan.id, number: 4, count: 4 },
      });
    });

    it('refuses new amounts once an installment is settled, or when it is split', async () => {
      const { create, fridge, transactionsOf, base, browser } = await setUp();
      const paid = await create(fridge());
      const [first] = await transactionsOf(thisMonth);
      await browser
        .patch(`${base}/transactions/${first?.id}`)
        .send({ settledAt: `${thisMonth}-15` })
        .expect(200);
      const split = await create(
        fridge({ description: 'TV', split: [{ newPersonName: 'Ana', amountCents: 30_000 }] }),
      );
      const newAmount = { amountCents: 90_000, amountIs: 'TOTAL' };

      const refusedPaid = await browser
        .patch(`${base}/installments/${paid.id}`)
        .send(newAmount)
        .expect(409);
      const refusedSplit = await browser
        .patch(`${base}/installments/${split.id}`)
        .send(newAmount)
        .expect(409);

      expect(refusedPaid.body).toMatchObject({ code: 'PLAN_HAS_PAYMENTS' });
      expect(refusedSplit.body).toMatchObject({ code: 'PLAN_IS_SPLIT' });
    });

    it('deletes one with no installment settled, also its past months and shares', async () => {
      const { create, fridge, transactionsOf, base, browser, plans } = await setUp();
      const plan = await create(
        fridge({ firstPeriod: month(-1), split: [{ newPersonName: 'Ana', amountCents: 30_000 }] }),
      );

      await browser.delete(`${base}/installments/${plan.id}`).expect(204);

      expect(await plans()).toEqual([]);
      for (const offset of [-1, 0, 1]) expect(await transactionsOf(month(offset))).toEqual([]);
    });

    it('does not change an ended plan, and deletes an ended one with nothing settled', async () => {
      const { create, fridge, transactionsOf, base, browser, plans } = await setUp();
      const plan = await create(fridge({ firstPeriod: month(-1) }));
      const [last] = await transactionsOf(month(-1));
      await browser
        .patch(`${base}/transactions/${last?.id}`)
        .send({ settledAt: `${month(-1)}-15` })
        .expect(200);
      await browser.delete(`${base}/installments/${plan.id}`).expect(204);

      const refused = await browser
        .patch(`${base}/installments/${plan.id}`)
        .send({ description: 'Outra' })
        .expect(409);
      expect(refused.body).toMatchObject({ code: 'PLAN_ENDED' });

      // Its paid installment taken back: nothing settled left, so it can now be deleted.
      await browser.patch(`${base}/transactions/${last?.id}`).send({ settledAt: null }).expect(200);
      await browser.delete(`${base}/installments/${plan.id}`).expect(204);
      expect(await plans()).toEqual([]);
    });
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
        return (
          transactions
            .filter((t) => t.splitOfId === installment.id)
            .map(({ type, description, amountCents, categoryId: category, settledAt }) => ({
              type,
              description,
              amountCents,
              category,
              settledAt,
            }))
            // The same description for both: the larger share (Ana's) first.
            .sort(
              (a, b) => a.description.localeCompare(b.description) || b.amountCents - a.amountCents,
            )
        );
      };
      const reembolso = categoryId('Reembolso', 'CREDIT');
      expect(sharesOf(months[0]!)).toEqual([
        {
          type: 'CREDIT',
          description: 'Geladeira (1/3)',
          amountCents: 11_111,
          category: reembolso,
          settledAt: null,
        },
        {
          type: 'CREDIT',
          description: 'Geladeira (1/3)',
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
        description: 'Geladeira (10/10)',
        amountCents: 4_995,
      });
    });

    it('renames the pending shares with the plan, each with its installment (ADR 0052 note)', async () => {
      const { create, fridge, transactionsOf, base, browser } = await setUp();
      const plan = await create(fridge({ split: [{ newPersonName: 'Ana', amountCents: 30_000 }] }));
      // This month's share is already paid back: history, it keeps its name.
      const [paid] = (await transactionsOf(thisMonth)).filter((t) => t.splitOfId !== null);
      await browser
        .patch(`${base}/transactions/${paid?.id}`)
        .send({ settledAt: `${thisMonth}-05` })
        .expect(200);

      await browser
        .patch(`${base}/installments/${plan.id}`)
        .send({ description: 'Geladeira nova' })
        .expect(200);

      const shareOf = async (offset: number) =>
        (await transactionsOf(month(offset))).find((t) => t.splitOfId !== null)?.description;
      expect(await shareOf(0)).toBe('Geladeira (1/3)');
      expect(await shareOf(1)).toBe('Geladeira nova (2/3)');
      expect(await shareOf(2)).toBe('Geladeira nova (3/3)');
    });

    it('makes each share due with its installment, and moves the pending ones (ADR 0052 note)', async () => {
      const { create, fridge, transactionsOf, base, browser } = await setUp();
      const plan = await create(fridge({ split: [{ newPersonName: 'Ana', amountCents: 30_000 }] }));
      const shareOf = async (offset: number) =>
        (await transactionsOf(month(offset))).find((t) => t.splitOfId !== null)!;
      expect((await shareOf(1)).dueDate).toBe(`${month(1)}-15`);
      const paid = await shareOf(0);
      await browser
        .patch(`${base}/transactions/${paid.id}`)
        .send({ settledAt: `${thisMonth}-05` })
        .expect(200);

      await browser.patch(`${base}/installments/${plan.id}`).send({ dueDay: 20 }).expect(200);

      expect((await shareOf(0)).dueDate).toBe(`${thisMonth}-15`);
      expect((await shareOf(1)).dueDate).toBe(`${month(1)}-20`);
      expect((await shareOf(2)).dueDate).toBe(`${month(2)}-20`);
    });

    it('ends it with the shares still pending of the installments removed', async () => {
      const { create, fridge, transactionsOf, base, browser } = await setUp();
      const plan = await create(
        fridge({ firstPeriod: month(-1), split: [{ newPersonName: 'Ana', amountCents: 30_000 }] }),
      );
      // Last month's installment is paid (so it ends, and is not deleted, ADR 0038 note), and
      // Ana already paid her part of this month's installment.
      const lastMonth = (await transactionsOf(month(-1))).find((t) => t.installment)!;
      await browser
        .patch(`${base}/transactions/${lastMonth.id}`)
        .send({ settledAt: `${month(-1)}-20` })
        .expect(200);
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

  describe('"Tornar parcelado" (ADR 0038 note)', () => {
    async function launched(
      browser: Browser,
      base: string,
      categoryId: string,
      fields: Record<string, unknown> = {},
    ) {
      const response = await browser
        .post(`${base}/transactions`)
        .send({
          type: 'DEBIT',
          description: 'Notebook',
          categoryId,
          amountCents: 50_000,
          period: thisMonth,
          dueDate: `${month(1)}-10`,
          occurredOn: `${thisMonth}-02`,
          ...fields,
        })
        .expect(201);
      return response.body as { id: string };
    }

    it('adopts the transaction as its installment and creates the next ones', async () => {
      const { browser, base, categoryId, transactionsOf, plans } = await setUp();
      const notebook = await launched(browser, base, categoryId('Compras', 'DEBIT'));

      const response = await browser
        .post(`${base}/installments/from-transaction`)
        .send({
          transactionId: notebook.id,
          installments: 10,
          firstNumber: 3,
          amountIs: 'INSTALLMENT',
        })
        .expect(201);

      expect(installmentPlanSchema.parse(response.body)).toMatchObject({
        description: 'Notebook',
        installments: 10,
        firstNumber: 3,
        totalCents: 400_000,
        firstPeriod: thisMonth,
        dueDay: 10,
        dueMonthOffset: 1,
        occurredOn: `${thisMonth}-02`,
        pendingCount: 8,
      });
      // This month's is the same transaction, now 3/10; the next is 4/10, due the month after.
      const now = await transactionsOf(thisMonth);
      expect(now).toEqual([
        expect.objectContaining({
          id: notebook.id,
          amountCents: 50_000,
          installment: expect.objectContaining({ number: 3, count: 10 }) as unknown,
        }),
      ]);
      expect((await transactionsOf(month(1)))[0]).toMatchObject({
        amountCents: 50_000,
        dueDate: `${month(2)}-10`,
        occurredOn: `${thisMonth}-02`,
        installment: { number: 4, count: 10 },
      });
      expect((await transactionsOf(month(7)))[0]?.installment?.number).toBe(10);
      expect(await transactionsOf(month(8))).toEqual([]);
      expect(await plans()).toHaveLength(1);
    });

    it('splits a total like a new plan, this transaction becoming its first installment', async () => {
      const { browser, base, categoryId, transactionsOf } = await setUp();
      const sofa = await launched(browser, base, categoryId('Compras', 'DEBIT'), {
        description: 'Sofá',
        amountCents: 100_000,
      });

      await browser
        .post(`${base}/installments/from-transaction`)
        .send({ transactionId: sofa.id, installments: 3, amountIs: 'TOTAL' })
        .expect(201);

      expect((await transactionsOf(thisMonth))[0]).toMatchObject({
        id: sofa.id,
        amountCents: 33_333,
        installment: { number: 1, count: 3 },
      });
      expect((await transactionsOf(month(2)))[0]?.amountCents).toBe(33_334);
    });

    it('refuses one in a plan or a recurrence, a share, a split one, a settled total, the last installment', async () => {
      const { browser, base, categoryId, create, fridge, transactionsOf } = await setUp();
      const compras = categoryId('Compras', 'DEBIT');
      await create(fridge({ firstPeriod: month(1) }));
      const installment = (await transactionsOf(month(1))).find((item) => item.installment)!;
      await browser
        .post(`${base}/recurrences`)
        .send({
          type: 'DEBIT',
          description: 'Internet',
          categoryId: compras,
          amountCents: 10_000,
          startPeriod: thisMonth,
        })
        .expect(201);
      const month0 = await transactionsOf(thisMonth);
      const generated = month0.find((item) => item.recurrenceId)!;
      const split = await launched(browser, base, compras, {
        description: 'Jantar',
        split: [{ newPersonName: 'Ana', amountCents: 10_000 }],
      });
      const share = (await transactionsOf(thisMonth)).find((item) => item.splitOfId === split.id)!;
      const settled = await launched(browser, base, compras, { settledAt: `${thisMonth}-02` });
      const once = await launched(browser, base, compras);
      const make = (body: object) =>
        browser.post(`${base}/installments/from-transaction`).send(body);

      for (const id of [installment.id, generated.id, split.id, share.id]) {
        const response = await make({
          transactionId: id,
          installments: 3,
          amountIs: 'INSTALLMENT',
        });
        expect(response.status).toBe(409);
        expect(response.body).toMatchObject({ code: 'NOT_INSTALLABLE' });
      }
      await make({ transactionId: settled.id, installments: 3, amountIs: 'TOTAL' }).expect(409);
      // Settled, as an installment's amount it does not change: accepted.
      await make({ transactionId: settled.id, installments: 3, amountIs: 'INSTALLMENT' }).expect(
        201,
      );
      // The last installment has nothing after it.
      await make({
        transactionId: once.id,
        installments: 3,
        firstNumber: 3,
        amountIs: 'INSTALLMENT',
      }).expect(400);
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
