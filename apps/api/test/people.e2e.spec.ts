import {
  categoryListResponseSchema,
  currentPeriod,
  personListResponseSchema,
  personSchema,
  transactionListResponseSchema,
  transactionSchema,
  workspaceSchema,
} from '@financas/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './app.js';
import { resetDatabase } from './db.js';
import { expectHiddenFromOutsiders, type WorkspaceRoute } from './isolation.js';

// People, receivables and payables, and splitting a debit (ADR 0042).
// All data here is fictitious (ADR 0019).
const maria = { name: 'Maria Exemplo', email: 'maria@example.com', password: 'senha-de-teste-123' };
const joao = { name: 'João Exemplo', email: 'joao@example.com', password: 'senha-de-teste-456' };

const SOME_ID = '01920000-0000-7000-8000-000000000000';

const peopleRoutes: WorkspaceRoute[] = [
  { method: 'get', path: (id) => `/api/workspaces/${id}/people` },
  { method: 'post', path: (id) => `/api/workspaces/${id}/people`, body: { name: 'Intrusa' } },
  {
    method: 'patch',
    path: (id) => `/api/workspaces/${id}/people/${SOME_ID}`,
    body: { archived: true },
  },
  { method: 'delete', path: (id) => `/api/workspaces/${id}/people/${SOME_ID}` },
];

describe('people and splits', () => {
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

  async function setup() {
    const signedUp = await t.signUp(maria);
    const base = `/api/workspaces/${signedUp.personalWorkspaceId}`;
    const categories = categoryListResponseSchema.parse(
      (await signedUp.browser.get(`${base}/categories`).expect(200)).body,
    );
    const category = (name: string, type: 'CREDIT' | 'DEBIT') =>
      categories.find((c) => c.name === name && c.type === type)!;
    return { ...signedUp, base, category };
  }

  async function addPerson(browser: Browser, base: string, name: string) {
    const response = await browser.post(`${base}/people`).send({ name }).expect(201);
    return personSchema.parse(response.body);
  }

  async function people(browser: Browser, base: string) {
    const response = await browser.get(`${base}/people`).expect(200);
    return personListResponseSchema.parse(response.body);
  }

  async function transactions(browser: Browser, base: string) {
    const response = await browser.get(`${base}/transactions?period=${period}`).expect(200);
    return transactionListResponseSchema.parse(response.body);
  }

  describe('people', () => {
    it('creates, renames, archives and lists people by name', async () => {
      const { browser, base } = await setup();
      const bruno = await addPerson(browser, base, 'Bruno');
      await addPerson(browser, base, 'Ana');

      expect(bruno).toMatchObject({ name: 'Bruno', archived: false, receivableCents: 0 });
      await browser.patch(`${base}/people/${bruno.id}`).send({ name: 'Bruno Silva' }).expect(200);
      await browser.patch(`${base}/people/${bruno.id}`).send({ archived: true }).expect(200);
      expect((await people(browser, base)).map(({ name, archived }) => [name, archived])).toEqual([
        ['Ana', false],
        ['Bruno Silva', true],
      ]);
    });

    it('refuses a name already used, ignoring case', async () => {
      const { browser, base } = await setup();
      await addPerson(browser, base, 'Ana');

      const response = await browser.post(`${base}/people`).send({ name: 'ana' }).expect(409);

      expect(response.body).toMatchObject({ code: 'PERSON_EXISTS' });
    });

    it('sums what is pending each way, and leaves out what was settled', async () => {
      const { browser, base, category } = await setup();
      const ana = await addPerson(browser, base, 'Ana');
      const add = (type: 'CREDIT' | 'DEBIT', amountCents: number, settledAt: string | null) =>
        browser
          .post(`${base}/transactions`)
          .send({
            type,
            description: 'Exemplo',
            categoryId: category(type === 'CREDIT' ? 'Outros' : 'Lazer', type).id,
            amountCents,
            period,
            settledAt,
            personId: ana.id,
          })
          .expect(201);

      await add('CREDIT', 15_000, null);
      await add('CREDIT', 5_000, `${period}-01`);
      await add('DEBIT', 40_000, null);

      expect((await people(browser, base))[0]).toMatchObject({
        name: 'Ana',
        receivableCents: 15_000,
        payableCents: 40_000,
      });
    });

    it('deletes only a person with no transactions; one in use is archived instead', async () => {
      const { browser, base, category } = await setup();
      const ana = await addPerson(browser, base, 'Ana');
      const bruno = await addPerson(browser, base, 'Bruno');
      await browser
        .post(`${base}/transactions`)
        .send({
          type: 'CREDIT',
          description: 'Empréstimo de exemplo',
          categoryId: category('Outros', 'CREDIT').id,
          amountCents: 1_000,
          period,
          personId: ana.id,
        })
        .expect(201);

      await browser.delete(`${base}/people/${bruno.id}`).expect(204);
      const inUse = await browser.delete(`${base}/people/${ana.id}`).expect(409);
      expect(inUse.body).toMatchObject({ code: 'PERSON_IN_USE' });
    });

    it('links a person only to a member of the workspace, and shows the account name', async () => {
      const owner = await t.signUp(maria);
      const created = await owner.browser
        .post('/api/workspaces')
        .send({ name: 'Casa' })
        .expect(201);
      const base = `/api/workspaces/${workspaceSchema.parse(created.body).id}`;
      const other = await t.signUp(joao);
      // João is not a member of Casa yet: no link to him.
      const refused = await owner.browser
        .post(`${base}/people`)
        .send({ name: 'Joãozinho', memberUserId: other.userId })
        .expect(400);
      expect(refused.body).toMatchObject({ message: 'Escolha um membro deste espaço.' });
      await t.prisma.member.create({
        data: {
          workspaceId: workspaceSchema.parse(created.body).id,
          userId: other.userId,
          role: 'VIEWER',
        },
      });

      const linked = await owner.browser
        .post(`${base}/people`)
        .send({ name: 'Joãozinho', memberUserId: other.userId })
        .expect(201);

      expect(personSchema.parse(linked.body)).toMatchObject({
        name: joao.name,
        memberUserId: other.userId,
      });
      // He leaves: the person stays, as the name typed.
      await other.browser.delete(`${base}/members/${other.userId}`).expect(204);
      expect((await people(owner.browser, base))[0]).toMatchObject({ name: 'Joãozinho' });
    });

    it('hides the routes from outsiders', async () => {
      const { personalWorkspaceId } = await setup();

      await expectHiddenFromOutsiders(t, personalWorkspaceId, peopleRoutes);
    });

    it('lets a VIEWER read people but not change them', async () => {
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

      await viewer.browser.get(`${base}/people`).expect(200);
      await viewer.browser.post(`${base}/people`).send({ name: 'Ana' }).expect(403);
    });
  });

  describe('linking a transaction', () => {
    it('refuses an archived person', async () => {
      const { browser, base, category } = await setup();
      const ana = await addPerson(browser, base, 'Ana');
      await browser.patch(`${base}/people/${ana.id}`).send({ archived: true }).expect(200);

      const response = await browser
        .post(`${base}/transactions`)
        .send({
          type: 'DEBIT',
          description: 'Casa de praia',
          categoryId: category('Viagem', 'DEBIT').id,
          amountCents: 40_000,
          period,
          personId: ana.id,
        })
        .expect(400);

      expect(response.body).toMatchObject({ code: 'INVALID_PERSON' });
    });
  });

  describe('splitting a debit', () => {
    it('creates the debit and one pending Reembolso credit per person, new names included', async () => {
      const { browser, base, category } = await setup();
      const ana = await addPerson(browser, base, 'Ana');

      const response = await browser
        .post(`${base}/transactions`)
        .send({
          type: 'DEBIT',
          description: 'Hospedagem',
          categoryId: category('Viagem', 'DEBIT').id,
          amountCents: 100_000,
          period,
          settledAt: `${period}-01`,
          split: [
            { personId: ana.id, amountCents: 33_333 },
            { newPersonName: 'Bruno', amountCents: 33_333 },
          ],
        })
        .expect(201);

      const debit = transactionSchema.parse(response.body);
      expect(debit).toMatchObject({ type: 'DEBIT', amountCents: 100_000, personId: null });
      const list = await transactions(browser, base);
      const shares = list.filter((transaction) => transaction.splitOfId === debit.id);
      const bruno = (await people(browser, base)).find((person) => person.name === 'Bruno')!;
      expect(
        shares.map(({ description, amountCents, personId, settledAt }) => ({
          description,
          amountCents,
          personId,
          settledAt,
        })),
      ).toEqual(
        expect.arrayContaining([
          {
            description: 'Ana: parte de Hospedagem',
            amountCents: 33_333,
            personId: ana.id,
            settledAt: null,
          },
          {
            description: 'Bruno: parte de Hospedagem',
            amountCents: 33_333,
            personId: bruno.id,
            settledAt: null,
          },
        ]),
      );
      expect(new Set(shares.map((share) => share.categoryId))).toEqual(
        new Set([category('Reembolso', 'CREDIT').id]),
      );
      expect(bruno.receivableCents).toBe(33_333);
    });

    it('refuses a split of a credit, one bigger than the debit, or the same person twice', async () => {
      const { browser, base, category } = await setup();
      const ana = await addPerson(browser, base, 'Ana');
      const post = (body: object) => browser.post(`${base}/transactions`).send(body).expect(400);
      const debit = {
        type: 'DEBIT',
        description: 'Jantar',
        categoryId: category('Lazer', 'DEBIT').id,
        amountCents: 30_000,
        period,
      };

      for (const [body, message] of [
        [
          {
            ...debit,
            type: 'CREDIT',
            categoryId: category('Outros', 'CREDIT').id,
            split: [{ personId: ana.id, amountCents: 100 }],
          },
          'Só um débito pode ser dividido.',
        ],
        [
          { ...debit, split: [{ personId: ana.id, amountCents: 30_001 }] },
          'As partes dos outros passam do valor do lançamento.',
        ],
        [
          {
            ...debit,
            split: [
              { personId: ana.id, amountCents: 100 },
              { personId: ana.id, amountCents: 100 },
            ],
          },
          'A mesma pessoa aparece duas vezes.',
        ],
      ] as const) {
        expect((await post(body)).body).toMatchObject({ code: 'INVALID_INPUT', message });
      }
      expect(await transactions(browser, base)).toEqual([]);
    });

    it('brings Reembolso back when it was archived or deleted', async () => {
      const { browser, base, category } = await setup();
      const reembolso = category('Reembolso', 'CREDIT');
      await browser
        .patch(`${base}/categories/${reembolso.id}`)
        .send({ archived: true })
        .expect(200);
      const split = (description: string) =>
        browser
          .post(`${base}/transactions`)
          .send({
            type: 'DEBIT',
            description,
            categoryId: category('Lazer', 'DEBIT').id,
            amountCents: 2_000,
            period,
            split: [{ newPersonName: 'Ana', amountCents: 1_000 }],
          })
          .expect(201);

      await split('Cinema');
      const reactivated = categoryListResponseSchema
        .parse((await browser.get(`${base}/categories`).expect(200)).body)
        .find((c) => c.id === reembolso.id)!;
      expect(reactivated.archived).toBe(false);
    });

    it('deletes the debit alone, or with its shares when asked', async () => {
      const { browser, base, category } = await setup();
      const split = async () =>
        transactionSchema.parse(
          (
            await browser
              .post(`${base}/transactions`)
              .send({
                type: 'DEBIT',
                description: 'Jantar',
                categoryId: category('Lazer', 'DEBIT').id,
                amountCents: 30_000,
                period,
                split: [{ newPersonName: 'Ana', amountCents: 15_000 }],
              })
              .expect(201)
          ).body,
        );

      const alone = await split();
      await browser.delete(`${base}/transactions/${alone.id}`).expect(204);
      const left = await transactions(browser, base);
      expect(left).toHaveLength(1);
      expect(left[0]).toMatchObject({ type: 'CREDIT', splitOfId: null });

      const withShares = await split();
      await browser.delete(`${base}/transactions/${withShares.id}?withShares=true`).expect(204);
      // Only the share left from the first one.
      expect(await transactions(browser, base)).toHaveLength(1);
    });
  });
});
