import {
  cardListResponseSchema,
  cardSchema,
  categoryListResponseSchema,
  currentPeriod,
  importSchema,
  shiftPeriod,
  todayIso,
  transactionListResponseSchema,
  transactionSchema,
  workspaceSchema,
} from '@financas/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './app.js';
import { resetDatabase } from './db.js';
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
  });
});
