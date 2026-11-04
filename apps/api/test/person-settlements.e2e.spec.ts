import {
  categoryListResponseSchema,
  currentPeriod,
  dataExportSchema,
  personSchema,
  personSettlementDraftSchema,
  personSettlementSchema,
  shiftPeriod,
  todayIso,
  transactionListResponseSchema,
  transactionSchema,
  type TransactionType,
} from '@financas/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './app.js';
import { resetDatabase } from './db.js';
import { expectHiddenFromOutsiders, type WorkspaceRoute } from './isolation.js';

// Acerto com uma pessoa (ADR 0065): what you owe someone settled at once, offsetting what they
// owe you when chosen, with the reward they give back as a credit. All data is fictitious.
const maria = { name: 'Maria Exemplo', email: 'maria@example.com', password: 'senha-de-teste-123' };
const joao = { name: 'João Exemplo', email: 'joao@example.com', password: 'senha-de-teste-456' };

const SOME_ID = '01920000-0000-7000-8000-000000000000';

const routes: WorkspaceRoute[] = [
  { method: 'get', path: (id) => `/api/workspaces/${id}/people/${SOME_ID}/settlement` },
  {
    method: 'post',
    path: (id) => `/api/workspaces/${id}/people/${SOME_ID}/settlements`,
    body: { transactionIds: [SOME_ID], settledAt: '2026-10-30' },
  },
  {
    method: 'delete',
    path: (id) => `/api/workspaces/${id}/people/${SOME_ID}/settlements/${SOME_ID}`,
  },
];

describe('settling up with a person', () => {
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

  const today = todayIso();
  const thisMonth = currentPeriod();
  const lastMonth = shiftPeriod(thisMonth, -1);

  async function setup(user = maria) {
    const signedUp = await t.signUp(user);
    const { browser } = signedUp;
    const base = `/api/workspaces/${signedUp.personalWorkspaceId}`;
    const categories = categoryListResponseSchema.parse(
      (await browser.get(`${base}/categories`).expect(200)).body,
    );
    const categoryId = (name: string, type: TransactionType) =>
      categories.find((category) => category.name === name && category.type === type)!.id;
    const person = async (name: string) =>
      personSchema.parse((await browser.post(`${base}/people`).send({ name }).expect(201)).body);
    const ana = await person('Ana Exemplo');
    const launch = async (fields: {
      type?: TransactionType;
      amountCents: number;
      personId?: string;
      period?: string;
      dueDate?: string;
      settledAt?: string;
    }) => {
      const type = fields.type ?? 'DEBIT';
      const response = await browser
        .post(`${base}/transactions`)
        .send({
          type,
          description: type === 'DEBIT' ? 'Mercado no vale' : 'Empréstimo de volta',
          categoryId:
            type === 'DEBIT' ? categoryId('Mercado', 'DEBIT') : categoryId('Outros', 'CREDIT'),
          paymentMethod: type === 'DEBIT' ? 'MEAL_VOUCHER' : undefined,
          period: lastMonth,
          personId: ana.id,
          ...fields,
        })
        .expect(201);
      return transactionSchema.parse(response.body);
    };
    const draft = async (personId = ana.id) =>
      personSettlementDraftSchema.parse(
        (await browser.get(`${base}/people/${personId}/settlement`).expect(200)).body,
      );
    const settle = (body: object, personId = ana.id) =>
      browser.post(`${base}/people/${personId}/settlements`).send(body);
    const listOf = async (period: string) =>
      transactionListResponseSchema.parse(
        (await browser.get(`${base}/transactions?period=${period}`).expect(200)).body,
      );
    return { ...signedUp, base, categoryId, person, ana, launch, draft, settle, listOf };
  }

  it('lists what may go in: the pending debits and credits of the person, oldest first', async () => {
    const { person, launch, draft, categoryId } = await setup();
    const later = await launch({ amountCents: 15_000, dueDate: `${lastMonth}-20` });
    const earlier = await launch({ amountCents: 10_000, dueDate: `${lastMonth}-05` });
    const owed = await launch({ type: 'CREDIT', amountCents: 5_000 });
    await launch({ amountCents: 2_000, settledAt: today });
    const pedro = await person('Pedro Exemplo');
    await launch({ amountCents: 3_000, personId: pedro.id });

    const result = await draft();

    expect(result.debits.map((debit) => debit.id)).toEqual([earlier.id, later.id]);
    expect(result.credits.map((credit) => credit.id)).toEqual([owed.id]);
    expect(result.rewardCategoryId).toBe(categoryId('Bônus', 'CREDIT'));
  });

  it('settles the debits, offsets the credits chosen and launches the reward', async () => {
    const { ana, launch, settle, listOf, categoryId } = await setup();
    const first = await launch({ amountCents: 30_000 });
    const second = await launch({ amountCents: 20_000 });
    const owed = await launch({ type: 'CREDIT', amountCents: 10_000 });
    const notOffset = await launch({ type: 'CREDIT', amountCents: 4_000 });

    const response = await settle({
      transactionIds: [first.id, second.id, owed.id],
      settledAt: today,
      reward: { amountCents: 5_000, categoryId: categoryId('Bônus', 'CREDIT') },
    }).expect(201);
    const settlement = personSettlementSchema.parse(response.body);

    expect(settlement).toMatchObject({
      personId: ana.id,
      settledAt: today,
      debitCents: 50_000,
      creditCents: 10_000,
    });
    expect(settlement.reward).toMatchObject({
      type: 'CREDIT',
      description: 'Recompensa de Ana Exemplo',
      amountCents: 5_000,
      categoryId: categoryId('Bônus', 'CREDIT'),
      period: thisMonth,
      settledAt: today,
      occurredOn: today,
      personId: ana.id,
    });
    const before = await listOf(lastMonth);
    for (const id of [first.id, second.id, owed.id]) {
      expect(before.find((row) => row.id === id)).toMatchObject({
        settledAt: today,
        settlementId: settlement.id,
      });
    }
    expect(before.find((row) => row.id === notOffset.id)).toMatchObject({
      settledAt: null,
      settlementId: null,
    });
  });

  it('remembers the category of the last reward from the person', async () => {
    const { launch, settle, draft, categoryId } = await setup();
    const purchase = await launch({ amountCents: 10_000 });
    await settle({
      transactionIds: [purchase.id],
      settledAt: today,
      reward: { amountCents: 1_000, categoryId: categoryId('Renda extra', 'CREDIT') },
    }).expect(201);
    await launch({ amountCents: 8_000 });

    expect((await draft()).rewardCategoryId).toBe(categoryId('Renda extra', 'CREDIT'));
  });

  it('undoes a settlement: back to pending, the reward deleted', async () => {
    const { base, browser, ana, launch, settle, listOf, categoryId } = await setup();
    const purchase = await launch({ amountCents: 10_000 });
    const owed = await launch({ type: 'CREDIT', amountCents: 2_000 });
    const settlement = personSettlementSchema.parse(
      (
        await settle({
          transactionIds: [purchase.id, owed.id],
          settledAt: today,
          reward: { amountCents: 500, categoryId: categoryId('Bônus', 'CREDIT') },
        }).expect(201)
      ).body,
    );

    await browser.delete(`${base}/people/${ana.id}/settlements/${settlement.id}`).expect(204);

    const back = await listOf(lastMonth);
    for (const id of [purchase.id, owed.id]) {
      expect(back.find((row) => row.id === id)).toMatchObject({
        settledAt: null,
        settlementId: null,
      });
    }
    expect((await listOf(thisMonth)).some((row) => row.id === settlement.reward!.id)).toBe(false);
    await browser.delete(`${base}/people/${ana.id}/settlements/${settlement.id}`).expect(404);
  });

  it('lets a transaction back to pending leave its settlement', async () => {
    const { base, browser, launch, settle } = await setup();
    const purchase = await launch({ amountCents: 10_000 });
    await settle({ transactionIds: [purchase.id], settledAt: today }).expect(201);

    const changed = await browser
      .patch(`${base}/transactions/${purchase.id}`)
      .send({ settledAt: null })
      .expect(200);

    expect(transactionSchema.parse(changed.body)).toMatchObject({
      settledAt: null,
      settlementId: null,
    });
  });

  it('refuses what cannot be settled', async () => {
    const { person, launch, settle, categoryId } = await setup();
    const purchase = await launch({ amountCents: 10_000 });
    const owed = await launch({ type: 'CREDIT', amountCents: 2_000 });
    const paid = await launch({ amountCents: 1_000, settledAt: today });
    const pedro = await person('Pedro Exemplo');
    const pedros = await launch({ amountCents: 3_000, personId: pedro.id });
    const reward = (amountCents: number, categoryId: string) => ({
      transactionIds: [purchase.id],
      settledAt: today,
      reward: { amountCents, categoryId },
    });

    const future = await settle({
      transactionIds: [purchase.id],
      settledAt: shiftPeriod(thisMonth, 1) + '-01',
    }).expect(400);
    expect(future.body).toMatchObject({ code: 'INVALID_INPUT' });
    for (const ids of [[purchase.id, pedros.id], [paid.id], [SOME_ID]]) {
      const changed = await settle({ transactionIds: ids, settledAt: today }).expect(409);
      expect(changed.body).toMatchObject({ code: 'SETTLEMENT_CHANGED' });
    }
    const onlyCredits = await settle({ transactionIds: [owed.id], settledAt: today }).expect(409);
    expect(onlyCredits.body).toMatchObject({ code: 'NOTHING_TO_PAY' });
    const tooMuch = await settle(reward(10_001, categoryId('Bônus', 'CREDIT'))).expect(400);
    expect(tooMuch.body).toMatchObject({ code: 'INVALID_INPUT' });
    const wrongType = await settle(reward(1_000, categoryId('Mercado', 'DEBIT'))).expect(400);
    expect(wrongType.body).toMatchObject({ code: 'INVALID_CATEGORY' });
    await settle({ transactionIds: [purchase.id], settledAt: today }, SOME_ID).expect(404);
  });

  it('refuses a settlement or an undo that reaches a closed month', async () => {
    const { base, browser, ana, launch, settle, categoryId } = await setup();
    const purchase = await launch({ amountCents: 10_000 });
    await browser.post(`${base}/periods/${thisMonth}/close`).expect(200);

    const closed = await settle({
      transactionIds: [purchase.id],
      settledAt: today,
      reward: { amountCents: 1_000, categoryId: categoryId('Bônus', 'CREDIT') },
    }).expect(409);
    expect(closed.body).toMatchObject({ code: 'PERIOD_CLOSED' });

    await browser
      .post(`${base}/periods/${thisMonth}/reopen`)
      .send({ reason: 'Correção' })
      .expect(200);
    const settlement = personSettlementSchema.parse(
      (await settle({ transactionIds: [purchase.id], settledAt: today }).expect(201)).body,
    );
    await browser.post(`${base}/periods/${lastMonth}/close`).expect(200);
    const undo = await browser
      .delete(`${base}/people/${ana.id}/settlements/${settlement.id}`)
      .expect(409);
    expect(undo.body).toMatchObject({ code: 'PERIOD_CLOSED' });
  });

  it('exports the settlements', async () => {
    const { browser, launch, settle, categoryId } = await setup();
    const purchase = await launch({ amountCents: 10_000 });
    const settlement = personSettlementSchema.parse(
      (
        await settle({
          transactionIds: [purchase.id],
          settledAt: today,
          reward: { amountCents: 1_000, categoryId: categoryId('Bônus', 'CREDIT') },
        }).expect(201)
      ).body,
    );

    const exported = dataExportSchema.parse((await browser.get('/api/me/export').expect(200)).body);
    const [workspace] = exported.ownedWorkspaces;

    expect(workspace!.personSettlements).toEqual([
      expect.objectContaining({
        id: settlement.id,
        debitCents: 10_000,
        creditCents: 0,
        rewardTransactionId: settlement.reward!.id,
        createdBy: 'Maria Exemplo',
      }) as unknown,
    ]);
    expect(workspace!.transactions.find((row) => row.id === purchase.id)).toMatchObject({
      settlementId: settlement.id,
    });
  });

  it('hides the routes from outsiders', async () => {
    const { personalWorkspaceId } = await t.signUp(maria);
    await expectHiddenFromOutsiders(t, personalWorkspaceId, routes);
  });

  it('lets a VIEWER see what may be settled but not settle', async () => {
    const owner = await setup();
    const purchase = await owner.launch({ amountCents: 10_000 });
    const viewer = await t.signUp(joao);
    await t.prisma.member.create({
      data: { workspaceId: owner.personalWorkspaceId, userId: viewer.userId, role: 'VIEWER' },
    });
    const path = `${owner.base}/people/${owner.ana.id}`;

    await viewer.browser.get(`${path}/settlement`).expect(200);
    await viewer.browser
      .post(`${path}/settlements`)
      .send({ transactionIds: [purchase.id], settledAt: today })
      .expect(403);
  });
});
