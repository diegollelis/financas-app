import {
  analysisSchema,
  categoryListResponseSchema,
  currentPeriod,
  personSchema,
  recurrenceListResponseSchema,
  recurrenceSchema,
  shiftPeriod,
  transactionListResponseSchema,
  workspaceSchema,
  type CreateRecurrenceInput,
  type Transaction,
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
    method: 'post',
    path: (id) => `/api/workspaces/${id}/recurrences/from-transaction`,
    body: { transactionId: '01920000-0000-7000-8000-000000000999' },
  },
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
      categoryId: categoryId('Contas da casa', 'DEBIT'),
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
    const energia = categoryId('Contas da casa', 'DEBIT');
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

  describe('due in the next month (ADR 0038 note)', () => {
    it('makes each month due in the next one, its last day when shorter', async () => {
      const { create, energy, transactionsOf } = await setUp();

      const recurrence = await create(energy({ dueMonthOffset: 1 }));
      await create(
        energy({ description: 'Água', dueDay: 31, dueMonthOffset: 1, startPeriod: '2027-01' }),
      );

      expect(recurrence.dueMonthOffset).toBe(1);
      expect((await transactionsOf(thisMonth))[0]?.dueDate).toBe(`${month(1)}-10`);
      expect((await transactionsOf(month(1)))[0]?.dueDate).toBe(`${month(2)}-10`);
      expect(
        (await transactionsOf('2027-01')).find((item) => item.description === 'Água'),
      ).toMatchObject({
        dueDate: '2027-02-28',
      });
    });

    it('moves the due month of the pending transactions from this month on only', async () => {
      const { create, energy, transactionsOf, base, browser } = await setUp();
      const recurrence = await create(energy({ startPeriod: month(-1) }));
      const [settledNow] = await transactionsOf(thisMonth);
      await transactionsOf(month(1));
      await browser
        .patch(`${base}/transactions/${settledNow?.id}`)
        .send({ settledAt: `${thisMonth}-05` })
        .expect(200);

      const response = await browser
        .patch(`${base}/recurrences/${recurrence.id}`)
        .send({ dueMonthOffset: 1 })
        .expect(200);

      expect(recurrenceSchema.parse(response.body)).toMatchObject({
        dueDay: 10,
        dueMonthOffset: 1,
      });
      expect((await transactionsOf(month(-1)))[0]?.dueDate).toBe(`${month(-1)}-10`);
      expect((await transactionsOf(thisMonth))[0]?.dueDate).toBe(`${thisMonth}-10`);
      expect((await transactionsOf(month(1)))[0]?.dueDate).toBe(`${month(2)}-10`);
    });

    it('refuses a due date two months later', async () => {
      const { energy, base, browser } = await setUp();

      await browser
        .post(`${base}/recurrences`)
        .send(energy({ dueMonthOffset: 2 }))
        .expect(400);
    });
  });

  describe('"Tornar recorrente"', () => {
    async function launched(
      browser: Browser,
      base: string,
      fields: Record<string, unknown>,
    ): Promise<{ id: string }> {
      const response = await browser
        .post(`${base}/transactions`)
        .send({
          type: 'DEBIT',
          description: 'Internet',
          amountCents: 12_000,
          period: thisMonth,
          ...fields,
        })
        .expect(201);
      return response.body as { id: string };
    }

    it('adopts the transaction as the first month, never duplicating it', async () => {
      const { browser, base, categoryId, transactionsOf } = await setUp();
      const merchant = (
        (await browser.post(`${base}/merchants`).send({ name: 'Provedor Exemplo' }).expect(201))
          .body as { id: string }
      ).id;
      const transaction = await launched(browser, base, {
        categoryId: categoryId('Contas da casa', 'DEBIT'),
        notes: 'Plano de 500 MB',
        dueDate: `${thisMonth}-15`,
        merchantId: merchant,
      });

      const response = await browser
        .post(`${base}/recurrences/from-transaction`)
        .send({ transactionId: transaction.id })
        .expect(201);

      expect(recurrenceSchema.parse(response.body)).toMatchObject({
        type: 'DEBIT',
        description: 'Internet',
        notes: 'Plano de 500 MB',
        amountCents: 12_000,
        dueDay: 15,
        merchantId: merchant,
        startPeriod: thisMonth,
        variableAmount: false,
        endPeriod: null,
      });
      const recurrenceId = (response.body as { id: string }).id;
      const now = await transactionsOf(thisMonth);
      expect(now).toEqual([expect.objectContaining({ id: transaction.id, recurrenceId })]);
      expect(await transactionsOf(month(1))).toEqual([
        expect.objectContaining({
          description: 'Internet',
          amountCents: 12_000,
          dueDate: `${month(1)}-15`,
          merchantId: merchant,
          recurrenceId,
        }),
      ]);
    });

    it('keeps a due date in the next month, and refuses one further away', async () => {
      const { browser, base, categoryId, transactionsOf } = await setUp();
      const category = categoryId('Contas da casa', 'DEBIT');
      const nextMonth = await launched(browser, base, {
        description: 'Conta de luz',
        categoryId: category,
        dueDate: `${month(1)}-10`,
      });
      const farAway = await launched(browser, base, {
        categoryId: category,
        dueDate: `${month(2)}-10`,
      });

      const response = await browser
        .post(`${base}/recurrences/from-transaction`)
        .send({ transactionId: nextMonth.id })
        .expect(201);
      const refused = await browser
        .post(`${base}/recurrences/from-transaction`)
        .send({ transactionId: farAway.id })
        .expect(409);

      expect(recurrenceSchema.parse(response.body)).toMatchObject({
        dueDay: 10,
        dueMonthOffset: 1,
      });
      expect(
        (await transactionsOf(month(1))).find((item) => item.description === 'Conta de luz'),
      ).toMatchObject({
        dueDate: `${month(2)}-10`,
      });
      expect(refused.body).toMatchObject({ code: 'NOT_REPEATABLE' });
    });

    it('keeps the real amount of the first month of a variable one', async () => {
      const { browser, base, categoryId, transactionsOf } = await setUp();
      const transaction = await launched(browser, base, {
        description: 'Conta de luz',
        categoryId: categoryId('Contas da casa', 'DEBIT'),
        amountCents: 17_250,
      });

      await browser
        .post(`${base}/recurrences/from-transaction`)
        .send({ transactionId: transaction.id, variableAmount: true })
        .expect(201);

      expect((await transactionsOf(thisMonth))[0]).toMatchObject({
        amountCents: 17_250,
        amountEstimated: false,
      });
      expect((await transactionsOf(month(1)))[0]).toMatchObject({ amountEstimated: true });
    });

    it('refuses one already repeating, an installment, a split one and a share', async () => {
      const { browser, base, categoryId, create, energy, transactionsOf } = await setUp();
      const category = categoryId('Contas da casa', 'DEBIT');
      await create(energy());
      const generated = (await transactionsOf(thisMonth))[0]!;
      await browser
        .post(`${base}/installments`)
        .send({
          type: 'DEBIT',
          description: 'Sofá',
          categoryId: category,
          installments: 3,
          amountCents: 90_000,
          amountIs: 'TOTAL',
          firstPeriod: month(2),
        })
        .expect(201);
      const installment = (await transactionsOf(month(2))).find((item) => item.installment)!;
      const split = await launched(browser, base, {
        description: 'Jantar',
        categoryId: category,
        split: [{ newPersonName: 'Ana', amountCents: 6_000 }],
      });
      const share = (await transactionsOf(thisMonth)).find((item) => item.splitOfId === split.id)!;
      const repeat = (transactionId: string) =>
        browser.post(`${base}/recurrences/from-transaction`).send({ transactionId }).expect(409);

      for (const id of [generated.id, installment.id, split.id, share.id]) {
        expect((await repeat(id)).body).toMatchObject({ code: 'NOT_REPEATABLE' });
      }
    });

    it('answers 404 for a transaction of another workspace', async () => {
      const { browser, base } = await setUp();
      const other = await t.signUp(joao);
      const otherCategory = (await categoryIds(other.browser, other.personalWorkspaceId))(
        'Contas da casa',
        'DEBIT',
      );
      const theirs = await launched(other.browser, `/api/workspaces/${other.personalWorkspaceId}`, {
        categoryId: otherCategory,
      });

      await browser
        .post(`${base}/recurrences/from-transaction`)
        .send({ transactionId: theirs.id })
        .expect(404);
    });
  });

  describe('person (ADR 0052)', () => {
    async function withPeople() {
      const setup = await setUp();
      const add = async (name: string) =>
        personSchema.parse(
          (await setup.browser.post(`${setup.base}/people`).send({ name }).expect(201)).body,
        );
      return { ...setup, ana: await add('Ana'), bruno: await add('Bruno') };
    }

    it('gives every month it generates the person it is from', async () => {
      const { create, energy, categoryId, transactionsOf, ana } = await withPeople();

      const rent = await create(
        energy({
          type: 'CREDIT',
          description: 'Aluguel do quarto',
          categoryId: categoryId('Renda extra', 'CREDIT'),
          personId: ana.id,
        }),
      );

      expect(rent.personId).toBe(ana.id);
      expect((await transactionsOf(thisMonth))[0]?.personId).toBe(ana.id);
      expect((await transactionsOf(month(1)))[0]?.personId).toBe(ana.id);
    });

    it('changes the person of the pending months from this month on only', async () => {
      const { create, energy, transactionsOf, base, browser, ana, bruno } = await withPeople();
      const recurrence = await create(energy({ startPeriod: month(-1), personId: ana.id }));
      await transactionsOf(month(-1));
      const [settledNow] = await transactionsOf(thisMonth);
      await transactionsOf(month(1));
      await browser
        .patch(`${base}/transactions/${settledNow?.id}`)
        .send({ settledAt: `${thisMonth}-05` })
        .expect(200);

      const changed = await browser
        .patch(`${base}/recurrences/${recurrence.id}`)
        .send({ personId: bruno.id })
        .expect(200);

      expect(recurrenceSchema.parse(changed.body).personId).toBe(bruno.id);
      expect((await transactionsOf(month(-1)))[0]?.personId).toBe(ana.id);
      expect((await transactionsOf(thisMonth))[0]?.personId).toBe(ana.id);
      expect((await transactionsOf(month(1)))[0]?.personId).toBe(bruno.id);
      expect((await transactionsOf(month(2)))[0]?.personId).toBe(bruno.id);

      // And unlinks with null.
      await browser
        .patch(`${base}/recurrences/${recurrence.id}`)
        .send({ personId: null })
        .expect(200);
      expect((await transactionsOf(month(1)))[0]?.personId).toBeNull();
    });

    it('refuses an archived person, and keeps a person it uses from being deleted', async () => {
      const { create, energy, transactionsOf, base, browser, ana, bruno } = await withPeople();
      await browser.patch(`${base}/people/${bruno.id}`).send({ archived: true }).expect(200);
      const refused = await browser
        .post(`${base}/recurrences`)
        .send(energy({ personId: bruno.id }))
        .expect(400);
      expect(refused.body).toMatchObject({ code: 'INVALID_PERSON' });

      await create(energy({ personId: ana.id }));
      // Without its transaction, only the recurrence holds Ana.
      const [generated] = await transactionsOf(thisMonth);
      await browser.delete(`${base}/transactions/${generated?.id}`).expect(204);
      const inUse = await browser.delete(`${base}/people/${ana.id}`).expect(409);
      expect(inUse.body).toMatchObject({ code: 'PERSON_IN_USE' });
    });
  });

  describe('split (ADR 0052)', () => {
    /** The pending shares of a month's transaction: who, and how much. */
    async function sharesIn(
      transactionsOf: (period: string) => Promise<Transaction[]>,
      period: string,
    ) {
      const list = await transactionsOf(period);
      const parent = list.find((t) => t.splitOfId === null && t.description.startsWith('Conta'));
      return list
        .filter((t) => t.splitOfId === parent?.id)
        .map(({ description, amountCents, type, settledAt }) => ({
          description,
          amountCents,
          type,
          settledAt,
        }));
    }
    it('gives every month it generates the shares, in reais or in percentages', async () => {
      const { create, energy, transactionsOf, categoryId, base, browser } = await setUp();
      const ana = personSchema.parse(
        (await browser.post(`${base}/people`).send({ name: 'Ana' }).expect(201)).body,
      );

      const recurrence = await create(
        energy({
          split: [
            { personId: ana.id, amountCents: 6_000 },
            { newPersonName: 'Bruno', amountCents: 4_000 },
          ],
        }),
      );

      expect(recurrence.split).toEqual(
        expect.arrayContaining([
          { personId: ana.id, amountCents: 6_000, basisPoints: null },
          expect.objectContaining({ amountCents: 4_000, basisPoints: null }),
        ]),
      );
      for (const period of [thisMonth, month(1)]) {
        expect(await sharesIn(transactionsOf, period)).toEqual(
          expect.arrayContaining([
            {
              description: 'Ana: parte de Conta de luz',
              amountCents: 6_000,
              type: 'CREDIT',
              settledAt: null,
            },
            {
              description: 'Bruno: parte de Conta de luz',
              amountCents: 4_000,
              type: 'CREDIT',
              settledAt: null,
            },
          ]),
        );
      }
      const shares = (await transactionsOf(thisMonth)).filter((t) => t.splitOfId !== null);
      expect(new Set(shares.map((t) => t.categoryId))).toEqual(
        new Set([categoryId('Reembolso', 'CREDIT')]),
      );
    });

    it('a variable one: the pending shares in % follow the real amount, settled ones stay', async () => {
      const { create, energy, transactionsOf, base, browser } = await setUp();
      await create(
        energy({ variableAmount: true, split: [{ newPersonName: 'Ana', basisPoints: 5_000 }] }),
      );
      const [luzNow] = (await transactionsOf(thisMonth)).filter((t) => t.splitOfId === null);
      expect((await sharesIn(transactionsOf, thisMonth))[0]?.amountCents).toBe(9_000);

      // The bill came: R$ 240,00.
      await browser
        .patch(`${base}/transactions/${luzNow?.id}`)
        .send({ amountCents: 24_000 })
        .expect(200);
      expect((await sharesIn(transactionsOf, thisMonth))[0]?.amountCents).toBe(12_000);

      // Ana paid her part; a later correction of the bill no longer changes it.
      const share = (await transactionsOf(thisMonth)).find((t) => t.splitOfId === luzNow?.id)!;
      await browser
        .patch(`${base}/transactions/${share.id}`)
        .send({ settledAt: `${thisMonth}-12` })
        .expect(200);
      await browser
        .patch(`${base}/transactions/${luzNow?.id}`)
        .send({ amountCents: 26_000 })
        .expect(200);
      expect((await sharesIn(transactionsOf, thisMonth))[0]?.amountCents).toBe(12_000);
    });

    it('a new amount recomputes the pending shares in % from this month on only', async () => {
      const { create, energy, transactionsOf, base, browser } = await setUp();
      const recurrence = await create(
        energy({ startPeriod: month(-1), split: [{ newPersonName: 'Ana', basisPoints: 5_000 }] }),
      );
      await transactionsOf(month(-1));
      await transactionsOf(month(1));

      await browser
        .patch(`${base}/recurrences/${recurrence.id}`)
        .send({ amountCents: 20_000 })
        .expect(200);

      expect((await sharesIn(transactionsOf, month(-1)))[0]?.amountCents).toBe(9_000);
      expect((await sharesIn(transactionsOf, thisMonth))[0]?.amountCents).toBe(10_000);
      expect((await sharesIn(transactionsOf, month(1)))[0]?.amountCents).toBe(10_000);
    });

    it('refuses an amount below the shares in reais, or turning them variable', async () => {
      const { create, energy, base, browser } = await setUp();
      const recurrence = await create(
        energy({ split: [{ newPersonName: 'Ana', amountCents: 10_000 }] }),
      );

      const lower = await browser
        .patch(`${base}/recurrences/${recurrence.id}`)
        .send({ amountCents: 9_999 })
        .expect(400);
      expect(lower.body).toMatchObject({
        message: 'As partes dos outros passam do valor do lançamento.',
      });
      await browser
        .patch(`${base}/recurrences/${recurrence.id}`)
        .send({ variableAmount: true })
        .expect(400);
      const invalid = await browser
        .post(`${base}/recurrences`)
        .send(energy({ variableAmount: true, split: [{ newPersonName: 'Bia', amountCents: 100 }] }))
        .expect(400);
      expect(invalid.body).toMatchObject({ message: 'Num valor que varia, divida em percentual.' });
    });

    it('ends it with the shares still pending of the months removed', async () => {
      const { create, energy, transactionsOf, base, browser } = await setUp();
      const recurrence = await create(
        energy({ startPeriod: month(-1), split: [{ newPersonName: 'Ana', amountCents: 9_000 }] }),
      );
      await transactionsOf(month(1));
      // Ana already paid this month's part.
      const paid = (await transactionsOf(thisMonth)).find((t) => t.splitOfId !== null)!;
      await browser
        .patch(`${base}/transactions/${paid.id}`)
        .send({ settledAt: `${thisMonth}-02` })
        .expect(200);

      await browser.delete(`${base}/recurrences/${recurrence.id}`).expect(204);

      expect(await transactionsOf(month(-1))).toHaveLength(2);
      expect(await transactionsOf(thisMonth)).toEqual([
        expect.objectContaining({ id: paid.id, splitOfId: null }),
      ]);
      expect(await transactionsOf(month(1))).toEqual([]);
    });
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
        energy({ description: 'Internet', categoryId: categoryId('Assinaturas', 'DEBIT') }),
      );

      const transactions = await transactionsOf(thisMonth);
      expect(transactions.find((t) => t.description === 'Internet')).toMatchObject({
        amountEstimated: false,
      });
      const summary = await browser.get(`${base}/summary/${thisMonth}`).expect(200);
      expect(summary.body).toMatchObject({ estimatedCents: 18_000 });
    });
  });

  describe('yearly (ADR 0038 note)', () => {
    it('generates only the month of its start, every year, with the same due day', async () => {
      const { create, energy, transactionsOf } = await setUp();
      const recurrence = await create(
        energy({ description: 'IPVA', amountCents: 120_000, intervalMonths: 12 }),
      );

      expect(recurrence.intervalMonths).toBe(12);
      for (const offset of [1, 6, 11]) expect(await transactionsOf(month(offset))).toEqual([]);
      expect(await transactionsOf(month(12))).toEqual([
        expect.objectContaining({
          description: 'IPVA',
          dueDate: `${month(12)}-10`,
          recurrenceId: recurrence.id,
          recurrenceIntervalMonths: 12,
        }),
      ]);
      expect(await transactionsOf(month(13))).toEqual([]);
    });

    it('tells a monthly transaction apart from a yearly one', async () => {
      const { create, energy, transactionsOf } = await setUp();
      await create(energy());

      expect(await transactionsOf(thisMonth)).toEqual([
        expect.objectContaining({ recurrenceIntervalMonths: 1 }),
      ]);
    });

    it('estimates a variable one from the years settled', async () => {
      const { create, energy, transactionsOf, base, browser } = await setUp();
      await create(energy({ variableAmount: true, intervalMonths: 12, startPeriod: month(-24) }));
      for (const [offset, amountCents] of [
        [-24, 100_000],
        [-12, 110_000],
      ] as const) {
        const [transaction] = await transactionsOf(month(offset));
        await browser
          .patch(`${base}/transactions/${transaction?.id}`)
          .send({ amountCents, settledAt: `${month(offset)}-05` })
          .expect(200);
      }

      expect((await transactionsOf(thisMonth))[0]).toMatchObject({
        amountCents: 105_000,
        amountEstimated: true,
      });
    });

    it('makes a transaction recurrent every year', async () => {
      const { browser, base, categoryId, transactionsOf } = await setUp();
      const transaction = (
        await browser
          .post(`${base}/transactions`)
          .send({
            type: 'DEBIT',
            description: 'Anuidade',
            categoryId: categoryId('Contas da casa', 'DEBIT'),
            amountCents: 40_000,
            period: thisMonth,
          })
          .expect(201)
      ).body as { id: string };

      const response = await browser
        .post(`${base}/recurrences/from-transaction`)
        .send({ transactionId: transaction.id, intervalMonths: 12 })
        .expect(201);

      expect(recurrenceSchema.parse(response.body).intervalMonths).toBe(12);
      expect(await transactionsOf(month(1))).toEqual([]);
      expect(await transactionsOf(month(12))).toHaveLength(1);
    });

    it('never changes its interval, and refuses one other than 1 or 12', async () => {
      const { create, energy, base, browser } = await setUp();
      const recurrence = await create(energy({ intervalMonths: 12 }));

      await browser
        .patch(`${base}/recurrences/${recurrence.id}`)
        .send({ intervalMonths: 1, amountCents: 19_000 })
        .expect(200);
      const list = recurrenceListResponseSchema.parse(
        (await browser.get(`${base}/recurrences`).expect(200)).body,
      );
      expect(list[0]).toMatchObject({ intervalMonths: 12, amountCents: 19_000 });
      await browser
        .post(`${base}/recurrences`)
        .send({ ...energy(), intervalMonths: 6 })
        .expect(400);
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
