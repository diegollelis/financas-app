import {
  cardBillListResponseSchema,
  cardListResponseSchema,
  cardSchema,
  categoryListResponseSchema,
  currentPeriod,
  importSchema,
  payCardBillResponseSchema,
  shiftPeriod,
  todayIso,
  transactionListResponseSchema,
  transactionSchema,
  workspaceSchema,
} from '@financas/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './app.js';
import { ownerClient, resetDatabase } from './db.js';
import { expectHiddenFromOutsiders, type WorkspaceRoute } from './isolation.js';

// Cards: a detail of the Crédito and Débito payment methods (ADR 0062).
// All data here is fictitious (ADR 0019).
const maria = { name: 'Maria Exemplo', email: 'maria@example.com', password: 'senha-de-teste-123' };
const joao = { name: 'João Exemplo', email: 'joao@example.com', password: 'senha-de-teste-456' };

const SOME_ID = '01920000-0000-7000-8000-000000000000';

const cardRoutes: WorkspaceRoute[] = [
  { method: 'get', path: (id) => `/api/workspaces/${id}/cards` },
  {
    method: 'post',
    path: (id) => `/api/workspaces/${id}/cards`,
    body: { name: 'Intruso', functions: ['DEBIT'] },
  },
  {
    method: 'patch',
    path: (id) => `/api/workspaces/${id}/cards/${SOME_ID}`,
    body: { archived: true },
  },
  { method: 'delete', path: (id) => `/api/workspaces/${id}/cards/${SOME_ID}` },
  { method: 'get', path: (id) => `/api/workspaces/${id}/cards/unlinked` },
  { method: 'get', path: (id) => `/api/workspaces/${id}/cards/bills` },
  {
    method: 'post',
    path: (id) => `/api/workspaces/${id}/cards/${SOME_ID}/bills/pay`,
    body: { dueDate: '2026-11-04', settledAt: '2026-10-28' },
  },
  {
    method: 'post',
    path: (id) => `/api/workspaces/${id}/cards/${SOME_ID}/bills/undo`,
    body: { transactionIds: [SOME_ID], settledAt: '2026-10-28' },
  },
  {
    method: 'post',
    path: (id) => `/api/workspaces/${id}/cards/${SOME_ID}/link`,
    body: { functions: ['DEBIT'] },
  },
];

/** A multiple card, closing on the 27th and due on the 4th. */
const both = {
  name: 'Cartão Exemplo',
  bank: 'NUBANK',
  functions: ['CREDIT', 'DEBIT'],
  closingDay: 27,
  dueDay: 4,
};

describe('cards', () => {
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
  const period = currentPeriod();
  const next = shiftPeriod(period, 1);

  async function setup(user = maria) {
    const signedUp = await t.signUp(user);
    const base = `/api/workspaces/${signedUp.personalWorkspaceId}`;
    const categories = categoryListResponseSchema.parse(
      (await signedUp.browser.get(`${base}/categories`).expect(200)).body,
    );
    const lazer = categories.find((c) => c.name === 'Lazer' && c.type === 'DEBIT')!;
    const addCard = async (card: object = both) => {
      const response = await signedUp.browser.post(`${base}/cards`).send(card).expect(201);
      return cardSchema.parse(response.body);
    };
    const fields = (more: object) => ({
      type: 'DEBIT',
      description: 'Compras',
      categoryId: lazer.id,
      amountCents: 10_000,
      ...more,
    });
    const debit = (more: object) => ({ ...fields(more), period });
    const launch = async (more: object) => {
      const response = await signedUp.browser
        .post(`${base}/transactions`)
        .send(debit(more))
        .expect(201);
      return transactionSchema.parse(response.body);
    };
    return { ...signedUp, base, lazer, addCard, fields, debit, launch };
  }

  async function cards(browser: Browser, base: string) {
    const response = await browser.get(`${base}/cards`).expect(200);
    return cardListResponseSchema.parse(response.body);
  }

  async function transactions(browser: Browser, base: string, of = period) {
    const response = await browser.get(`${base}/transactions?period=${of}`).expect(200);
    return transactionListResponseSchema.parse(response.body);
  }

  describe('the list', () => {
    it('creates, renames, archives and lists cards by name', async () => {
      const { browser, base, addCard } = await setup();
      const nubank = await addCard();
      await addCard({ name: 'Alimentação Exemplo', functions: ['DEBIT'] });

      expect(nubank).toMatchObject({
        name: 'Cartão Exemplo',
        bank: 'NUBANK',
        functions: ['CREDIT', 'DEBIT'],
        closingDay: 27,
        dueDay: 4,
        archived: false,
        inUse: false,
      });
      await browser.patch(`${base}/cards/${nubank.id}`).send({ name: 'Roxinho' }).expect(200);
      await browser.patch(`${base}/cards/${nubank.id}`).send({ archived: true }).expect(200);
      expect((await cards(browser, base)).map(({ name, archived }) => [name, archived])).toEqual([
        ['Alimentação Exemplo', false],
        ['Roxinho', true],
      ]);
    });

    it('refuses a name already used, ignoring case and accents', async () => {
      const { browser, base, addCard } = await setup();
      await addCard({ name: 'Cartão Azul', functions: ['DEBIT'] });
      const other = await addCard({ name: 'Cartão Verde', functions: ['DEBIT'] });

      const created = await browser
        .post(`${base}/cards`)
        .send({ name: 'cartao azul', functions: ['DEBIT'] })
        .expect(409);
      expect(created.body).toMatchObject({ code: 'CARD_EXISTS' });
      await browser.patch(`${base}/cards/${other.id}`).send({ name: 'CARTÃO AZUL' }).expect(409);
    });

    it('asks the days of the bill of a credit card, and only of one', async () => {
      const { browser, base } = await setup();
      const send = (card: object) => browser.post(`${base}/cards`).send(card);

      await send({ name: 'A', functions: ['CREDIT'], dueDay: 4 }).expect(400);
      await send({ name: 'B', functions: ['DEBIT'], closingDay: 27, dueDay: 4 }).expect(400);
      await send({ name: 'C', functions: [] }).expect(400);
      await send({ name: 'D', functions: ['DEBIT', 'DEBIT'] }).expect(400);
      await send({ name: 'E', functions: ['CREDIT'], closingDay: 32, dueDay: 4 }).expect(400);
      await send({ name: 'F', functions: ['CREDIT'], closingDay: 27, dueDay: 4 }).expect(201);
    });

    it('clears the days when the credit goes, and asks them when it comes', async () => {
      const { browser, base, addCard } = await setup();
      const card = await addCard();

      const debitOnly = await browser
        .patch(`${base}/cards/${card.id}`)
        .send({ functions: ['DEBIT'] })
        .expect(200);
      expect(debitOnly.body).toMatchObject({
        functions: ['DEBIT'],
        closingDay: null,
        dueDay: null,
      });

      await browser
        .patch(`${base}/cards/${card.id}`)
        .send({ functions: ['DEBIT', 'CREDIT'] })
        .expect(400);
      const again = await browser
        .patch(`${base}/cards/${card.id}`)
        .send({ functions: ['CREDIT', 'DEBIT'], closingDay: 20, dueDay: 28 })
        .expect(200);
      expect(again.body).toMatchObject({ closingDay: 20, dueDay: 28 });
      await browser.patch(`${base}/cards/${card.id}`).send({ closingDay: 21 }).expect(200);
    });

    it('keeps a function something uses', async () => {
      const { browser, base, addCard, launch } = await setup();
      const card = await addCard();
      await launch({ paymentMethod: 'DEBIT_CARD', cardId: card.id });

      const refused = await browser
        .patch(`${base}/cards/${card.id}`)
        .send({ functions: ['CREDIT'] })
        .expect(409);
      expect(refused.body).toMatchObject({ code: 'CARD_FUNCTION_IN_USE' });
      await browser
        .patch(`${base}/cards/${card.id}`)
        .send({ functions: ['DEBIT'] })
        .expect(200);
    });

    it('deletes only an unused card; one in use is archived instead', async () => {
      const { browser, base, addCard, launch } = await setup();
      const unused = await addCard({ name: 'Sem uso', functions: ['DEBIT'] });
      const used = await addCard();
      await launch({ paymentMethod: 'CREDIT_CARD', cardId: used.id });

      expect((await cards(browser, base)).find((card) => card.id === used.id)?.inUse).toBe(true);
      await browser.delete(`${base}/cards/${unused.id}`).expect(204);
      const refused = await browser.delete(`${base}/cards/${used.id}`).expect(409);
      expect(refused.body).toMatchObject({ code: 'CARD_IN_USE' });
      await browser.delete(`${base}/cards/${SOME_ID}`).expect(404);
    });

    it('hides the routes from outsiders', async () => {
      const { personalWorkspaceId } = await t.signUp(maria);
      await expectHiddenFromOutsiders(t, personalWorkspaceId, cardRoutes);
    });

    it('lets a VIEWER read cards but not change them', async () => {
      const owner = await t.signUp(maria);
      const created = await owner.browser
        .post('/api/workspaces')
        .send({ name: 'Casa' })
        .expect(201);
      const workspaceId = workspaceSchema.parse(created.body).id;
      const viewer = await t.signUp(joao);
      await t.prisma.member.create({
        data: { workspaceId, userId: viewer.userId, role: 'VIEWER' },
      });
      const base = `/api/workspaces/${workspaceId}`;

      await viewer.browser.get(`${base}/cards`).expect(200);
      await viewer.browser
        .post(`${base}/cards`)
        .send({ name: 'Cartão', functions: ['DEBIT'] })
        .expect(403);
    });
  });

  describe('on a transaction', () => {
    it('keeps the card of a Crédito or Débito one, which may stay after it is archived', async () => {
      const { browser, base, addCard, launch } = await setup();
      const card = await addCard();
      const bought = await launch({ paymentMethod: 'CREDIT_CARD', cardId: card.id });
      expect(bought.cardId).toBe(card.id);

      await browser.patch(`${base}/cards/${card.id}`).send({ archived: true }).expect(200);
      const edited = await browser
        .patch(`${base}/transactions/${bought.id}`)
        .send({ description: 'Mercado', paymentMethod: 'CREDIT_CARD' })
        .expect(200);
      expect(transactionSchema.parse(edited.body).cardId).toBe(card.id);
    });

    it('refuses a card without the method of its function', async () => {
      const { browser, base, addCard, debit } = await setup();
      const credit = await addCard({ ...both, name: 'Só crédito', functions: ['CREDIT'] });
      const send = (more: object) => browser.post(`${base}/transactions`).send(debit(more));

      const pix = await send({ paymentMethod: 'PIX', cardId: credit.id }).expect(400);
      expect(pix.body).toMatchObject({ code: 'INVALID_CARD' });
      await send({ cardId: credit.id }).expect(400);
      await send({ paymentMethod: 'DEBIT_CARD', cardId: credit.id }).expect(400);
      await send({ paymentMethod: 'CREDIT_CARD', cardId: credit.id }).expect(201);
    });

    it("refuses an archived card, or another workspace's", async () => {
      const { browser, base, addCard, debit } = await setup();
      const archived = await addCard();
      await browser.patch(`${base}/cards/${archived.id}`).send({ archived: true }).expect(200);
      const joaoSide = await setup(joao);
      const theirs = await joaoSide.addCard();

      for (const cardId of [archived.id, theirs.id]) {
        const refused = await browser
          .post(`${base}/transactions`)
          .send(debit({ paymentMethod: 'CREDIT_CARD', cardId }))
          .expect(400);
        expect(refused.body).toMatchObject({ code: 'INVALID_CARD' });
      }
    });

    it('refuses a method changed away from the card, until the card goes too', async () => {
      const { browser, base, addCard, launch } = await setup();
      const card = await addCard();
      const bought = await launch({ paymentMethod: 'CREDIT_CARD', cardId: card.id });
      const edit = (body: object) => browser.patch(`${base}/transactions/${bought.id}`).send(body);

      await edit({ paymentMethod: 'PIX' }).expect(400);
      await edit({ paymentMethod: 'DEBIT_CARD' }).expect(200);
      const cleared = await edit({ paymentMethod: 'PIX', cardId: null }).expect(200);
      expect(transactionSchema.parse(cleared.body)).toMatchObject({
        paymentMethod: 'PIX',
        cardId: null,
      });
    });

    it('goes to the part settled, never to the shares of a split', async () => {
      const { browser, base, addCard, launch } = await setup();
      const card = await addCard();
      const split = await launch({
        paymentMethod: 'CREDIT_CARD',
        cardId: card.id,
        split: [{ newPersonName: 'Ana Exemplo', amountCents: 5_000 }],
      });
      const share = (await transactions(browser, base)).find((row) => row.splitOfId === split.id);
      expect(share?.cardId).toBeNull();

      const loan = await launch({ paymentMethod: 'DEBIT_CARD', cardId: card.id });
      const parted = await browser
        .post(`${base}/transactions/${loan.id}/settle-part`)
        .send({ amountCents: 4_000, settledAt: todayIso() })
        .expect(201);
      expect(parted.body).toMatchObject({ settled: { cardId: card.id } });
    });
  });

  describe('required with Crédito and Débito (ADR 0062 note)', () => {
    /** A transaction from before cards: a card method with no card, written as the owner. */
    async function fromBefore(
      workspaceId: string,
      categoryId: string,
      paymentMethod: 'CREDIT_CARD' | 'DEBIT_CARD',
      settledAt: Date | null = null,
    ) {
      const owner = ownerClient();
      try {
        return await owner.transaction.create({
          data: {
            workspaceId,
            type: 'DEBIT',
            description: 'Compra antiga',
            categoryId,
            amountCents: 3_000,
            period,
            paymentMethod,
            settledAt,
          },
        });
      } finally {
        await owner.$disconnect();
      }
    }

    it('refuses Crédito or Débito with no card on what is created', async () => {
      const { browser, base, debit, fields } = await setup();

      for (const paymentMethod of ['CREDIT_CARD', 'DEBIT_CARD']) {
        const refused = await browser
          .post(`${base}/transactions`)
          .send(debit({ paymentMethod }))
          .expect(400);
        expect(refused.body).toMatchObject({ code: 'CARD_REQUIRED' });
      }
      await browser
        .post(`${base}/recurrences`)
        .send({ ...fields({}), startPeriod: period, paymentMethod: 'CREDIT_CARD' })
        .expect(400);
      await browser
        .post(`${base}/installments`)
        .send({
          ...fields({}),
          installments: 2,
          amountIs: 'TOTAL',
          firstPeriod: period,
          paymentMethod: 'DEBIT_CARD',
        })
        .expect(400);
      await browser
        .post(`${base}/transactions`)
        .send(debit({ paymentMethod: 'PIX' }))
        .expect(201);
    });

    it('keeps one from before valid until its method or card is changed', async () => {
      const { browser, base, lazer, personalWorkspaceId, addCard } = await setup();
      const old = await fromBefore(personalWorkspaceId, lazer.id, 'CREDIT_CARD');
      const card = await addCard();
      const path = `${base}/transactions/${old.id}`;

      await browser.patch(path).send({ description: 'Compra de antes' }).expect(200);
      const refused = await browser.patch(path).send({ paymentMethod: 'CREDIT_CARD' }).expect(400);
      expect(refused.body).toMatchObject({ code: 'CARD_REQUIRED' });
      await browser.patch(path).send({ paymentMethod: 'CREDIT_CARD', cardId: card.id }).expect(200);
      await browser.patch(path).send({ cardId: null }).expect(400);
    });

    it('counts and links the ones from before: Crédito still to pay, and every Débito', async () => {
      const { browser, base, lazer, personalWorkspaceId, addCard } = await setup();
      const workspaceId = personalWorkspaceId;
      const pending = await fromBefore(workspaceId, lazer.id, 'CREDIT_CARD');
      const paid = await fromBefore(workspaceId, lazer.id, 'CREDIT_CARD', new Date());
      const debitOne = await fromBefore(workspaceId, lazer.id, 'DEBIT_CARD', new Date());
      const owner = ownerClient();
      await owner.recurrence.create({
        data: {
          workspaceId,
          type: 'DEBIT',
          description: 'Streaming',
          categoryId: lazer.id,
          amountCents: 4_000,
          startPeriod: next,
          paymentMethod: 'CREDIT_CARD',
        },
      });
      await owner.$disconnect();

      const counts = await browser.get(`${base}/cards/unlinked`).expect(200);
      expect(counts.body).toEqual({ credit: 1, debit: 1 });

      const credit = await addCard({ ...both, name: 'Só crédito', functions: ['CREDIT'] });
      await browser
        .post(`${base}/cards/${credit.id}/link`)
        .send({ functions: ['DEBIT'] })
        .expect(400);
      const linked = await browser
        .post(`${base}/cards/${credit.id}/link`)
        .send({ functions: ['CREDIT'] })
        .expect(200);
      expect(linked.body).toEqual({ linked: 1 });

      const rows = await transactions(browser, base);
      const cardOf = (id: string) => rows.find((row) => row.id === id)?.cardId;
      expect(cardOf(pending.id)).toBe(credit.id);
      expect(cardOf(paid.id)).toBeNull();
      expect(cardOf(debitOne.id)).toBeNull();
      // The running recurrence takes it too, and its next months come with it.
      expect((await transactions(browser, base, next))[0]).toMatchObject({
        description: 'Streaming',
        cardId: credit.id,
      });
      expect((await browser.get(`${base}/cards/unlinked`).expect(200)).body).toEqual({
        credit: 0,
        debit: 1,
      });
    });
  });

  describe('on recurrences and installment plans', () => {
    it('copies it to every month of a recurrence, and a change reaches the pending ones', async () => {
      const { browser, base, addCard, fields } = await setup();
      const card = await addCard();
      const other = await addCard({ name: 'Débito Exemplo', functions: ['DEBIT'] });

      const created = await browser
        .post(`${base}/recurrences`)
        .send({
          ...fields({ description: 'Streaming' }),
          startPeriod: period,
          paymentMethod: 'CREDIT_CARD',
          cardId: card.id,
        })
        .expect(201);
      expect(created.body).toMatchObject({ cardId: card.id });
      expect((await transactions(browser, base, next))[0]?.cardId).toBe(card.id);

      const path = `${base}/recurrences/${(created.body as { id: string }).id}`;
      await browser.patch(path).send({ cardId: other.id }).expect(400);
      await browser.patch(path).send({ paymentMethod: 'DEBIT_CARD', cardId: other.id }).expect(200);

      expect((await transactions(browser, base))[0]).toMatchObject({
        paymentMethod: 'DEBIT_CARD',
        cardId: other.id,
      });
      expect((await transactions(browser, base, next))[0]?.cardId).toBe(other.id);
    });

    it('takes it along when a transaction is made recurrent', async () => {
      const { browser, base, addCard, launch } = await setup();
      const card = await addCard();
      const bought = await launch({ paymentMethod: 'CREDIT_CARD', cardId: card.id });

      const repeated = await browser
        .post(`${base}/recurrences/from-transaction`)
        .send({ transactionId: bought.id })
        .expect(201);
      expect(repeated.body).toMatchObject({ cardId: card.id });
      expect((await transactions(browser, base, next))[0]?.cardId).toBe(card.id);
    });

    it('copies it to every installment of a plan, and refuses a method away from it', async () => {
      const { browser, base, addCard, fields } = await setup();
      const card = await addCard();

      const created = await browser
        .post(`${base}/installments`)
        .send({
          ...fields({ description: 'Sofá' }),
          installments: 3,
          amountIs: 'TOTAL',
          firstPeriod: period,
          paymentMethod: 'CREDIT_CARD',
          cardId: card.id,
        })
        .expect(201);

      expect(created.body).toMatchObject({ cardId: card.id });
      expect((await transactions(browser, base, shiftPeriod(period, 2)))[0]?.cardId).toBe(card.id);
      const path = `${base}/installments/${(created.body as { id: string }).id}`;
      await browser.patch(path).send({ paymentMethod: 'PIX' }).expect(400);
      await browser.patch(path).send({ paymentMethod: 'PIX', cardId: null }).expect(200);
      expect((await transactions(browser, base, next))[0]).toMatchObject({
        paymentMethod: 'PIX',
        cardId: null,
      });
    });
  });

  describe('"Pagar fatura" (ADR 0062)', () => {
    async function withBills() {
      const signedUp = await setup();
      const { browser, base, addCard, launch } = signedUp;
      const card = await addCard();
      const categories = categoryListResponseSchema.parse(
        (await browser.get(`${base}/categories`).expect(200)).body,
      );
      const credit = categories.find((c) => c.type === 'CREDIT')!;
      const due = `${next}-04`;
      const onCard = { paymentMethod: 'CREDIT_CARD', cardId: card.id, dueDate: due };
      const pizza = await launch({ ...onCard, description: 'Pizzaria', amountCents: 6_500 });
      const market = await launch({ ...onCard, description: 'Mercado', amountCents: 23_140 });
      const refund = transactionSchema.parse(
        (
          await browser
            .post(`${base}/transactions`)
            .send({
              type: 'CREDIT',
              description: 'Estorno',
              categoryId: credit.id,
              amountCents: 1_500,
              period,
              ...onCard,
            })
            .expect(201)
        ).body,
      );
      // Left out: another bill, a paid one and a purchase in Débito.
      await launch({ ...onCard, description: 'Posto', dueDate: `${period}-04` });
      await launch({ ...onCard, description: 'Pago', settledAt: todayIso() });
      await launch({ paymentMethod: 'DEBIT_CARD', cardId: card.id, dueDate: due });
      return { ...signedUp, card, due, pizza, market, refund };
    }

    it('lists each pending bill by card and due date, purchases less refunds, oldest first', async () => {
      const { browser, base, card, due, pizza, market, refund } = await withBills();

      const bills = cardBillListResponseSchema.parse(
        (await browser.get(`${base}/cards/bills`).expect(200)).body,
      );
      expect(bills.map((bill) => [bill.cardId, bill.dueDate, bill.transactions.length])).toEqual([
        [card.id, `${period}-04`, 1],
        [card.id, due, 3],
      ]);
      expect(bills[1]?.totalCents).toBe(6_500 + 23_140 - 1_500);
      expect(bills[1]?.transactions.map((row) => row.id).sort()).toEqual(
        [pizza.id, market.id, refund.id].sort(),
      );
    });

    it('pays a bill at once on a day, never ahead, and undoes only what it paid', async () => {
      const { browser, base, card, due, pizza } = await withBills();
      const pay = (body: object) => browser.post(`${base}/cards/${card.id}/bills/pay`).send(body);
      const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);

      await pay({ dueDate: due, settledAt: tomorrow }).expect(400);
      const paid = await pay({ dueDate: due, settledAt: todayIso() }).expect(200);
      const { transactionIds, totalCents } = payCardBillResponseSchema.parse(paid.body);
      expect(transactionIds).toHaveLength(3);
      expect(totalCents).toBe(28_140);
      const refused = await pay({ dueDate: due, settledAt: todayIso() }).expect(409);
      expect(refused.body).toMatchObject({ code: 'NOTHING_TO_PAY' });
      expect(
        (await transactions(browser, base)).find((row) => row.id === pizza.id)?.settledAt,
      ).toBe(todayIso());

      await browser
        .post(`${base}/cards/${card.id}/bills/undo`)
        .send({ transactionIds, settledAt: todayIso() })
        .expect(204);
      const bills = cardBillListResponseSchema.parse(
        (await browser.get(`${base}/cards/bills`).expect(200)).body,
      );
      expect(bills.find((bill) => bill.dueDate === due)?.transactions).toHaveLength(3);
    });

    it('is paid by an account statement, and undoing the import takes it back (ADR 0062 note)', async () => {
      const { browser, base, card, due, pizza } = await withBills();
      const statement = (bills: object[]) => ({
        kind: 'ACCOUNT_STATEMENT',
        bank: 'NUBANK',
        transactions: [],
        bills,
      });

      const imported = await browser
        .post(`${base}/imports`)
        .send(statement([{ cardId: card.id, dueDate: due, settledAt: todayIso() }]))
        .expect(201);
      const created = importSchema.parse(imported.body);
      expect(created.billCount).toBe(1);
      const paid = (await transactions(browser, base)).find((row) => row.id === pizza.id);
      expect(paid?.settledAt).toBe(todayIso());
      // The bill is paid: nothing pending is left to pay again.
      const again = await browser
        .post(`${base}/imports`)
        .send(statement([{ cardId: card.id, dueDate: due, settledAt: todayIso() }]))
        .expect(409);
      expect(again.body).toMatchObject({ code: 'STATEMENT_MATCH_CHANGED' });

      await browser.delete(`${base}/imports/${created.id}`).expect(204);
      const back = cardBillListResponseSchema.parse(
        (await browser.get(`${base}/cards/bills`).expect(200)).body,
      );
      expect(back.find((bill) => bill.dueDate === due)?.transactions).toHaveLength(3);
    });

    it('lets a VIEWER see the bills but not pay them', async () => {
      const owner = await t.signUp(maria);
      const created = await owner.browser
        .post('/api/workspaces')
        .send({ name: 'Casa' })
        .expect(201);
      const workspaceId = workspaceSchema.parse(created.body).id;
      const viewer = await t.signUp(joao);
      await t.prisma.member.create({
        data: { workspaceId, userId: viewer.userId, role: 'VIEWER' },
      });
      const base = `/api/workspaces/${workspaceId}`;

      await viewer.browser.get(`${base}/cards/bills`).expect(200);
      await viewer.browser
        .post(`${base}/cards/${SOME_ID}/bills/pay`)
        .send({ dueDate: `${next}-04`, settledAt: todayIso() })
        .expect(403);
    });
  });

  describe('on an import', () => {
    it("keeps the statement's card and each transaction's", async () => {
      const { browser, base, lazer, addCard } = await setup();
      const card = await addCard();

      const imported = await browser
        .post(`${base}/imports`)
        .send({
          kind: 'CARD_STATEMENT',
          bank: 'NUBANK',
          cardId: card.id,
          statementDueDate: `${next}-04`,
          transactions: [
            {
              type: 'DEBIT',
              description: 'Pizzaria Exemplo',
              categoryId: lazer.id,
              amountCents: 6_500,
              period,
              dueDate: `${next}-04`,
              paymentMethod: 'CREDIT_CARD',
              cardId: card.id,
            },
          ],
        })
        .expect(201);

      expect(importSchema.parse(imported.body).cardId).toBe(card.id);
      expect((await transactions(browser, base))[0]?.cardId).toBe(card.id);
    });

    it('refuses a card without the method of its function', async () => {
      const { browser, base, lazer, addCard } = await setup();
      const card = await addCard({ name: 'Débito Exemplo', functions: ['DEBIT'] });

      const refused = await browser
        .post(`${base}/imports`)
        .send({
          kind: 'TEMPLATE',
          transactions: [
            {
              type: 'DEBIT',
              description: 'Pizzaria Exemplo',
              categoryId: lazer.id,
              amountCents: 6_500,
              period,
              paymentMethod: 'CREDIT_CARD',
              cardId: card.id,
            },
          ],
        })
        .expect(400);
      expect(refused.body).toMatchObject({ code: 'INVALID_CARD' });
    });

    it('asks the card of a line in Crédito or Débito (ADR 0062 note)', async () => {
      const { browser, base, lazer } = await setup();

      const refused = await browser
        .post(`${base}/imports`)
        .send({
          kind: 'TEMPLATE',
          transactions: [
            {
              type: 'DEBIT',
              description: 'Pizzaria Exemplo',
              categoryId: lazer.id,
              amountCents: 6_500,
              period,
              paymentMethod: 'DEBIT_CARD',
            },
          ],
        })
        .expect(400);
      expect(refused.body).toMatchObject({ code: 'CARD_REQUIRED' });
    });

    it("puts a purchase found in the app on the statement's card, in Crédito", async () => {
      const { browser, base, addCard, launch } = await setup();
      const card = await addCard();
      // Launched by hand before, with no method: the bill shows it was on the card.
      const found = await launch({ description: 'Streaming' });

      await browser
        .post(`${base}/imports`)
        .send({
          kind: 'CARD_STATEMENT',
          bank: 'NUBANK',
          cardId: card.id,
          statementDueDate: `${next}-04`,
          transactions: [],
          matches: [{ transactionId: found.id, dueDate: `${next}-04` }],
        })
        .expect(201);

      expect((await transactions(browser, base)).find((row) => row.id === found.id)).toMatchObject({
        paymentMethod: 'CREDIT_CARD',
        cardId: card.id,
        dueDate: `${next}-04`,
      });
    });
  });
});
