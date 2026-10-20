import {
  categoryListResponseSchema,
  currentPeriod,
  personListResponseSchema,
  shiftPeriod,
  personSchema,
  transactionListResponseSchema,
  transactionSchema,
  workspaceSchema,
} from '@financas/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './app.js';
import { ownerClient, resetDatabase } from './db.js';
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
  { method: 'get', path: (id) => `/api/workspaces/${id}/people/${SOME_ID}/transactions` },
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

    it('sums what is pending each way up to this month, and leaves out what was settled', async () => {
      const { browser, base, category } = await setup();
      const ana = await addPerson(browser, base, 'Ana');
      const lastMonth = shiftPeriod(period, -1);
      const add = (
        type: 'CREDIT' | 'DEBIT',
        amountCents: number,
        settledAt: string | null,
        when: { period: string; dueDate?: string } = { period },
      ) =>
        browser
          .post(`${base}/transactions`)
          .send({
            type,
            description: 'Exemplo',
            categoryId: category(type === 'CREDIT' ? 'Outros' : 'Lazer', type).id,
            amountCents,
            settledAt,
            personId: ana.id,
            ...when,
          })
          .expect(201);

      await add('CREDIT', 15_000, null);
      await add('CREDIT', 5_000, `${period}-01`);
      await add('DEBIT', 40_000, null);
      await add('CREDIT', 3_000, null, { period: lastMonth, dueDate: `${lastMonth}-10` });
      await add('DEBIT', 7_000, null, { period: shiftPeriod(period, 1) });

      expect((await people(browser, base))[0]).toMatchObject({
        name: 'Ana',
        receivableCents: 18_000,
        payableCents: 40_000,
        overdueReceivableCents: 3_000,
        overduePayableCents: 0,
      });
    });

    it('puts the installments of later months apart, and leaves out the months of a recurrence ahead', async () => {
      const { browser, base, category } = await setup();
      const ana = await addPerson(browser, base, 'Ana');
      const moradia = category('Moradia', 'DEBIT').id;
      await browser
        .post(`${base}/installments`)
        .send({
          type: 'DEBIT',
          description: 'Geladeira',
          categoryId: moradia,
          amountCents: 300_000,
          amountIs: 'TOTAL',
          installments: 3,
          firstPeriod: period,
          split: [{ personId: ana.id, amountCents: 30_000 }],
        })
        .expect(201);
      await browser
        .post(`${base}/recurrences`)
        .send({
          type: 'DEBIT',
          description: 'Internet',
          categoryId: moradia,
          amountCents: 10_000,
          startPeriod: period,
          personId: ana.id,
        })
        .expect(201);
      // Opening next month creates its month of the recurrence.
      await browser.get(`${base}/transactions?period=${shiftPeriod(period, 1)}`).expect(200);

      expect((await people(browser, base))[0]).toMatchObject({
        receivableCents: 10_000,
        payableCents: 10_000,
        futureInstallmentsReceivableCents: 20_000,
        futureInstallmentsPayableCents: 0,
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

    it("lists a person's transactions of any competência, newest first", async () => {
      const { browser, base, category } = await setup();
      const ana = await addPerson(browser, base, 'Ana');
      const bruno = await addPerson(browser, base, 'Bruno');
      const add = (personId: string, description: string, when: string) =>
        browser
          .post(`${base}/transactions`)
          .send({
            type: 'CREDIT',
            description,
            categoryId: category('Outros', 'CREDIT').id,
            amountCents: 1_000,
            period: when,
            personId,
          })
          .expect(201);
      await add(ana.id, 'Mais antigo', shiftPeriod(period, -3));
      await add(ana.id, 'Mais novo', period);
      await add(bruno.id, 'Do Bruno', period);

      const response = await browser.get(`${base}/people/${ana.id}/transactions`).expect(200);

      expect(
        transactionListResponseSchema.parse(response.body).map((item) => item.description),
      ).toEqual(['Mais novo', 'Mais antigo']);
      await browser.get(`${base}/people/${SOME_ID}/transactions`).expect(404);
    });

    it("leaves the months of a recurrence ahead out of a person's list, never the installments", async () => {
      const { browser, base, category } = await setup();
      const ana = await addPerson(browser, base, 'Ana');
      const moradia = category('Moradia', 'DEBIT').id;
      await browser
        .post(`${base}/recurrences`)
        .send({
          type: 'DEBIT',
          description: 'Internet',
          categoryId: moradia,
          amountCents: 10_000,
          startPeriod: period,
          personId: ana.id,
        })
        .expect(201);
      await browser
        .post(`${base}/recurrences`)
        .send({
          type: 'DEBIT',
          description: 'Condomínio',
          categoryId: moradia,
          amountCents: 40_000,
          startPeriod: period,
          split: [{ personId: ana.id, amountCents: 20_000 }],
        })
        .expect(201);
      await browser
        .post(`${base}/installments`)
        .send({
          type: 'DEBIT',
          description: 'Geladeira',
          categoryId: moradia,
          amountCents: 20_000,
          amountIs: 'TOTAL',
          installments: 2,
          firstPeriod: period,
          personId: ana.id,
        })
        .expect(201);
      // Opening the next two months creates their months of both recurrences.
      for (const ahead of [1, 2]) {
        await browser.get(`${base}/transactions?period=${shiftPeriod(period, ahead)}`).expect(200);
      }

      const response = await browser.get(`${base}/people/${ana.id}/transactions`).expect(200);

      expect(
        transactionListResponseSchema
          .parse(response.body)
          .map((item) => `${item.description} ${item.period}`)
          .sort(),
      ).toEqual(
        [
          `Condomínio ${period}`,
          `Geladeira ${period}`,
          `Geladeira ${shiftPeriod(period, 1)}`,
          `Internet ${period}`,
        ].sort(),
      );
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

  describe('members as people', () => {
    /** Maria (OWNER) with a shared workspace "Casa", and João, who joins it by invitation. */
    async function house() {
      const owner = await t.signUp(maria);
      const created = await owner.browser
        .post('/api/workspaces')
        .send({ name: 'Casa' })
        .expect(201);
      const workspaceId = workspaceSchema.parse(created.body).id;
      const base = `/api/workspaces/${workspaceId}`;
      const join = async (account: typeof joao) => {
        await owner.browser
          .post(`${base}/invitations`)
          .send({ email: account.email, role: 'EDITOR' })
          .expect(201);
        const token = t.mailer.lastLinkTo(account.email).pathname.split('/').at(-1) ?? '';
        const joined = await t.signUp(account);
        await joined.browser.post(`/api/invitations/${token}/accept`).expect(200);
        return joined;
      };
      return { owner, workspaceId, base, join };
    }

    const summary = (list: Awaited<ReturnType<typeof people>>) =>
      list.map(({ name, isMember, archived }) => [name, isMember, archived]);

    /** The names as stored, read as the owner of the tables (the API role is under RLS). */
    async function storedNames(workspaceId: string) {
      const db = ownerClient();
      try {
        const rows = await db.person.findMany({ where: { workspaceId }, select: { name: true } });
        return rows.map((row) => row.name).sort();
      } finally {
        await db.$disconnect();
      }
    }

    it('makes the new member and the OWNER people when an invitation is accepted', async () => {
      const { owner, workspaceId, base, join } = await house();
      const joined = await join(joao);
      // Created by the acceptance itself, before anyone lists them.
      expect(await storedNames(workspaceId)).toEqual([joao.name, maria.name]);

      const list = await people(owner.browser, base);

      expect(summary(list)).toEqual([
        [joao.name, true, false],
        [maria.name, true, false],
      ]);
      expect(list.find((person) => person.name === joao.name)?.memberUserId).toBe(joined.userId);
      expect(summary(await people(joined.browser, base))).toEqual(summary(list));
    });

    it('links a person typed before, ignoring case and accents, with their history', async () => {
      const { owner, base, join } = await house();
      const typed = await addPerson(owner.browser, base, 'joao exemplo');
      const categories = categoryListResponseSchema.parse(
        (await owner.browser.get(`${base}/categories`).expect(200)).body,
      );
      await owner.browser
        .post(`${base}/transactions`)
        .send({
          type: 'CREDIT',
          description: 'Empréstimo de exemplo',
          categoryId: categories.find((c) => c.name === 'Outros' && c.type === 'CREDIT')!.id,
          amountCents: 2_500,
          period,
          personId: typed.id,
        })
        .expect(201);

      await join(joao);

      const list = await people(owner.browser, base);
      expect(list).toHaveLength(2);
      expect(list.find((person) => person.id === typed.id)).toMatchObject({
        name: joao.name,
        isMember: true,
        receivableCents: 2_500,
      });
    });

    it('keeps names unique when two members have the same one', async () => {
      const { owner, workspaceId, base, join } = await house();
      await join(joao);
      // A second account with João's name joins too.
      await join({ ...joao, email: 'outro.joao@example.com' });

      expect(summary(await people(owner.browser, base))).toEqual([
        [joao.name, true, false],
        [joao.name, true, false],
        [maria.name, true, false],
      ]);
      expect(await storedNames(workspaceId)).toEqual([joao.name, `${joao.name} (2)`, maria.name]);
    });

    it('keeps the person of a member who leaves as a contact, and reuses it if they return', async () => {
      const { owner, base, join } = await house();
      const joined = await join(joao);
      const before = await people(owner.browser, base);
      const joaoPerson = before.find((person) => person.memberUserId === joined.userId)!;

      await joined.browser.delete(`${base}/members/${joined.userId}`).expect(204);
      expect((await people(owner.browser, base)).find((p) => p.id === joaoPerson.id)).toMatchObject(
        { name: joao.name, isMember: false },
      );
      // Now a contact, it can be archived; coming back reactivates the same one.
      await owner.browser
        .patch(`${base}/people/${joaoPerson.id}`)
        .send({ archived: true })
        .expect(200);
      await owner.browser
        .post(`${base}/invitations`)
        .send({ email: joao.email, role: 'EDITOR' })
        .expect(201);
      const token = t.mailer.lastLinkTo(joao.email).pathname.split('/').at(-1) ?? '';
      await joined.browser.post(`/api/invitations/${token}/accept`).expect(200);

      const after = await people(owner.browser, base);
      expect(after).toHaveLength(2);
      expect(after.find((p) => p.id === joaoPerson.id)).toMatchObject({
        isMember: true,
        archived: false,
      });
    });

    it("refuses to rename, archive, delete or relink a member's person", async () => {
      const { owner, base, join } = await house();
      const joined = await join(joao);
      const joaoPerson = (await people(owner.browser, base)).find(
        (person) => person.memberUserId === joined.userId,
      )!;

      for (const body of [{ name: 'Outro nome' }, { archived: true }, { memberUserId: null }]) {
        const response = await owner.browser
          .patch(`${base}/people/${joaoPerson.id}`)
          .send(body)
          .expect(409);
        expect(response.body).toMatchObject({ code: 'PERSON_IS_MEMBER' });
      }
      const removed = await owner.browser.delete(`${base}/people/${joaoPerson.id}`).expect(409);
      expect(removed.body).toMatchObject({ code: 'PERSON_IS_MEMBER' });
      const second = await owner.browser
        .post(`${base}/people`)
        .send({ name: 'Joãozinho', memberUserId: joined.userId })
        .expect(409);
      expect(second.body).toMatchObject({ code: 'PERSON_EXISTS' });
    });

    it('gives people to the members of a workspace shared before this rule, on listing', async () => {
      const { owner, workspaceId, base } = await house();
      const other = await t.signUp(joao);
      // A membership with no people, as in the workspaces shared before.
      await t.prisma.member.create({ data: { workspaceId, userId: other.userId, role: 'VIEWER' } });

      expect(summary(await people(other.browser, base))).toEqual([
        [joao.name, true, false],
        [maria.name, true, false],
      ]);
      expect(await people(owner.browser, base)).toHaveLength(2);
    });

    it('gives no people to a workspace with only its OWNER, nor to the personal one', async () => {
      const { owner, base } = await house();

      expect(await people(owner.browser, base)).toEqual([]);
      expect(await people(owner.browser, `/api/workspaces/${owner.personalWorkspaceId}`)).toEqual(
        [],
      );
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
          categoryId: category('Lazer', 'DEBIT').id,
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
          categoryId: category('Lazer', 'DEBIT').id,
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
            description: 'Hospedagem',
            amountCents: 33_333,
            personId: ana.id,
            settledAt: null,
          },
          {
            description: 'Hospedagem',
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

    it('renames the pending shares with the transaction, never a settled one (ADR 0052 note)', async () => {
      const { browser, base, category } = await setup();
      const ana = await addPerson(browser, base, 'Ana');
      const bruno = await addPerson(browser, base, 'Bruno');
      const debit = transactionSchema.parse(
        (
          await browser
            .post(`${base}/transactions`)
            .send({
              type: 'DEBIT',
              description: 'Jantar',
              categoryId: category('Lazer', 'DEBIT').id,
              amountCents: 30_000,
              period,
              split: [
                { personId: ana.id, amountCents: 10_000 },
                { personId: bruno.id, amountCents: 10_000 },
              ],
            })
            .expect(201)
        ).body,
      );
      const sharesOf = async () =>
        (await transactions(browser, base)).filter((t) => t.splitOfId === debit.id);
      const anaShare = (await sharesOf()).find((share) => share.personId === ana.id)!;
      await browser
        .patch(`${base}/transactions/${anaShare.id}`)
        .send({ settledAt: `${period}-02` })
        .expect(200);

      await browser
        .patch(`${base}/transactions/${debit.id}`)
        .send({ description: 'Jantar de aniversário' })
        .expect(200);

      const shares = await sharesOf();
      expect(shares.find((share) => share.personId === ana.id)?.description).toBe('Jantar');
      expect(shares.find((share) => share.personId === bruno.id)?.description).toBe(
        'Jantar de aniversário',
      );
    });

    it('refuses a split bigger than the debit, or the same person twice', async () => {
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

    it('makes the shares due with the transaction, and moves the pending ones with it (ADR 0052 note)', async () => {
      const { browser, base, category } = await setup();
      const ana = await addPerson(browser, base, 'Ana');
      const bruno = await addPerson(browser, base, 'Bruno');
      const debit = transactionSchema.parse(
        (
          await browser
            .post(`${base}/transactions`)
            .send({
              type: 'DEBIT',
              description: 'Aluguel da casa de praia',
              categoryId: category('Lazer', 'DEBIT').id,
              amountCents: 90_000,
              period,
              dueDate: `${period}-10`,
              occurredOn: `${period}-01`,
              split: [
                { personId: ana.id, amountCents: 30_000 },
                { personId: bruno.id, amountCents: 30_000 },
              ],
            })
            .expect(201)
        ).body,
      );
      const sharesOf = async () =>
        (await transactions(browser, base)).filter((t) => t.splitOfId === debit.id);
      expect((await sharesOf()).map((share) => [share.dueDate, share.occurredOn])).toEqual([
        [`${period}-10`, `${period}-01`],
        [`${period}-10`, `${period}-01`],
      ]);
      const anaShare = (await sharesOf()).find((share) => share.personId === ana.id)!;
      await browser
        .patch(`${base}/transactions/${anaShare.id}`)
        .send({ settledAt: `${period}-02` })
        .expect(200);

      await browser
        .patch(`${base}/transactions/${debit.id}`)
        .send({ dueDate: `${period}-20`, occurredOn: `${period}-02` })
        .expect(200);

      const shares = await sharesOf();
      expect(shares.find((share) => share.personId === ana.id)).toMatchObject({
        dueDate: `${period}-10`,
        occurredOn: `${period}-01`,
      });
      // The day it happened goes with it too (ADR 0055).
      expect(shares.find((share) => share.personId === bruno.id)).toMatchObject({
        dueDate: `${period}-20`,
        occurredOn: `${period}-02`,
      });
    });

    it('keeps Reembolso: it is never archived, and the shares go to it (ADR 0052 note)', async () => {
      const { browser, base, category } = await setup();
      const reembolso = category('Reembolso', 'CREDIT');
      await browser
        .patch(`${base}/categories/${reembolso.id}`)
        .send({ archived: true })
        .expect(409);
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
      const shares = (await transactions(browser, base)).filter((t) => t.splitOfId !== null);
      expect(shares.map((share) => share.categoryId)).toEqual([reembolso.id]);
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

  describe('splitting a transaction already launched (ADR 0052 note)', () => {
    async function launch(browser: Browser, base: string, categoryId: string, extra = {}) {
      const response = await browser
        .post(`${base}/transactions`)
        .send({
          type: 'DEBIT',
          description: 'Conta de luz',
          categoryId,
          amountCents: 18_990,
          period,
          dueDate: `${period}-15`,
          ...extra,
        })
        .expect(201);
      return transactionSchema.parse(response.body);
    }

    it('splits it on edit: the shares come pending, with what it is after the change', async () => {
      const { browser, base, category } = await setup();
      const ana = await addPerson(browser, base, 'Ana');
      const bill = await launch(browser, base, category('Moradia', 'DEBIT').id);

      await browser
        .patch(`${base}/transactions/${bill.id}`)
        .send({
          description: 'Energia',
          amountCents: 20_000,
          split: [
            { personId: ana.id, amountCents: 10_000 },
            { newPersonName: 'Bruno', amountCents: 5_000 },
          ],
        })
        .expect(200);

      const list = await transactions(browser, base);
      const shares = list.filter((transaction) => transaction.splitOfId === bill.id);
      expect(shares).toHaveLength(2);
      for (const share of shares) {
        expect(share).toMatchObject({
          type: 'CREDIT',
          description: 'Energia',
          dueDate: `${period}-15`,
          categoryId: category('Reembolso', 'CREDIT').id,
          settledAt: null,
        });
      }
      expect(shares.map((share) => share.amountCents).sort()).toEqual([10_000, 5_000].sort());
      expect(list.find((transaction) => transaction.id === bill.id)?.amountCents).toBe(20_000);
    });

    it('refuses a transaction already split, a share, one with a person, or shares above it', async () => {
      const { browser, base, category } = await setup();
      const ana = await addPerson(browser, base, 'Ana');
      const moradia = category('Moradia', 'DEBIT').id;
      const split = [{ personId: ana.id, amountCents: 1_000 }];

      const once = await launch(browser, base, moradia);
      await browser.patch(`${base}/transactions/${once.id}`).send({ split }).expect(200);
      const again = await browser
        .patch(`${base}/transactions/${once.id}`)
        .send({ split })
        .expect(409);
      expect(again.body).toMatchObject({ code: 'NOT_SPLITTABLE' });

      const share = (await transactions(browser, base)).find((t) => t.splitOfId === once.id)!;
      await browser.patch(`${base}/transactions/${share.id}`).send({ split }).expect(409);

      const withPerson = await launch(browser, base, moradia, { personId: ana.id });
      await browser.patch(`${base}/transactions/${withPerson.id}`).send({ split }).expect(409);
      // Unlinking the person in the same change lets it be split.
      await browser
        .patch(`${base}/transactions/${withPerson.id}`)
        .send({ personId: null, split })
        .expect(200);

      const small = await launch(browser, base, moradia);
      const tooMuch = await browser
        .patch(`${base}/transactions/${small.id}`)
        .send({ split: [{ personId: ana.id, amountCents: 18_991 }] })
        .expect(400);
      expect(tooMuch.body).toMatchObject({
        message: 'As partes dos outros passam do valor do lançamento.',
      });
    });

    it('refuses a month of a recurrence and an installment', async () => {
      const { browser, base, category } = await setup();
      const ana = await addPerson(browser, base, 'Ana');
      const moradia = category('Moradia', 'DEBIT').id;
      const split = [{ personId: ana.id, amountCents: 1_000 }];

      await browser
        .post(`${base}/recurrences`)
        .send({
          type: 'DEBIT',
          description: 'Internet',
          categoryId: moradia,
          amountCents: 10_000,
          startPeriod: period,
        })
        .expect(201);
      await browser
        .post(`${base}/installments`)
        .send({
          type: 'DEBIT',
          description: 'Geladeira',
          categoryId: moradia,
          amountCents: 300_000,
          amountIs: 'TOTAL',
          installments: 3,
          firstPeriod: period,
        })
        .expect(201);
      const list = await transactions(browser, base);
      const month = list.find((transaction) => transaction.recurrenceId)!;
      const installment = list.find((transaction) => transaction.installment)!;

      await browser.patch(`${base}/transactions/${month.id}`).send({ split }).expect(409);
      await browser.patch(`${base}/transactions/${installment.id}`).send({ split }).expect(409);
    });

    it('keeps the type of one tied to others, and changes it on one launched once (ADR 0029 note)', async () => {
      const { browser, base, category } = await setup();
      const ana = await addPerson(browser, base, 'Ana');
      const moradia = category('Moradia', 'DEBIT').id;
      const toCredit = { type: 'CREDIT', categoryId: category('Outros', 'CREDIT').id };
      await browser
        .post(`${base}/recurrences`)
        .send({
          type: 'DEBIT',
          description: 'Internet',
          categoryId: moradia,
          amountCents: 10_000,
          startPeriod: period,
        })
        .expect(201);
      await browser
        .post(`${base}/installments`)
        .send({
          type: 'DEBIT',
          description: 'Geladeira',
          categoryId: moradia,
          amountCents: 300_000,
          amountIs: 'TOTAL',
          installments: 3,
          firstPeriod: period,
        })
        .expect(201);
      const split = await launch(browser, base, moradia);
      await browser
        .patch(`${base}/transactions/${split.id}`)
        .send({ split: [{ personId: ana.id, amountCents: 1_000 }] })
        .expect(200);
      const list = await transactions(browser, base);
      const tied = {
        month: list.find((t) => t.recurrenceId)!,
        installment: list.find((t) => t.installment)!,
        split,
        share: list.find((t) => t.splitOfId === split.id)!,
      };

      for (const transaction of Object.values(tied)) {
        const refused = await browser
          .patch(`${base}/transactions/${transaction.id}`)
          .send(transaction.type === 'CREDIT' ? { type: 'DEBIT', categoryId: moradia } : toCredit)
          .expect(409);
        expect(refused.body).toMatchObject({ code: 'TYPE_LOCKED' });
      }
      // The same type sent again is no change.
      await browser
        .patch(`${base}/transactions/${tied.month.id}`)
        .send({ type: 'DEBIT', description: 'Internet' })
        .expect(200);
      const once = await launch(browser, base, moradia);
      const changed = await browser
        .patch(`${base}/transactions/${once.id}`)
        .send(toCredit)
        .expect(200);
      expect(changed.body).toMatchObject({ type: 'CREDIT' });
    });
  });

  describe('splitting a credit (ADR 0052)', () => {
    it('creates the credit and one pending Repasse debit per person', async () => {
      const { browser, base, category } = await setup();
      const irmao = await addPerson(browser, base, 'Irmão');

      const response = await browser
        .post(`${base}/transactions`)
        .send({
          type: 'CREDIT',
          description: 'Aluguel recebido',
          categoryId: category('Renda extra', 'CREDIT').id,
          amountCents: 100_000,
          period,
          settledAt: `${period}-05`,
          split: [{ personId: irmao.id, amountCents: 50_000 }],
        })
        .expect(201);

      const credit = transactionSchema.parse(response.body);
      expect(credit).toMatchObject({ type: 'CREDIT', amountCents: 100_000 });
      const shares = (await transactions(browser, base)).filter(
        (transaction) => transaction.splitOfId === credit.id,
      );
      expect(shares).toEqual([
        expect.objectContaining({
          type: 'DEBIT',
          description: 'Aluguel recebido',
          categoryId: category('Repasse', 'DEBIT').id,
          amountCents: 50_000,
          personId: irmao.id,
          settledAt: null,
        }),
      ]);
      expect((await people(browser, base))[0]).toMatchObject({ payableCents: 50_000 });
    });

    it('creates Repasse again, marked, in a workspace that deleted it before the mark', async () => {
      const { browser, base, category } = await setup();
      const repasse = category('Repasse', 'DEBIT');
      // The routes refuse it now; a workspace from before could have done it.
      await browser.delete(`${base}/categories/${repasse.id}`).expect(409);
      const owner = ownerClient();
      try {
        await owner.category.delete({ where: { id: repasse.id } });
      } finally {
        await owner.$disconnect();
      }

      await browser
        .post(`${base}/transactions`)
        .send({
          type: 'CREDIT',
          description: 'Rifa',
          categoryId: category('Outros', 'CREDIT').id,
          amountCents: 4_000,
          period,
          split: [{ newPersonName: 'Ana', amountCents: 1_000 }],
        })
        .expect(201);

      const recreated = categoryListResponseSchema
        .parse((await browser.get(`${base}/categories`).expect(200)).body)
        .filter((c) => c.name === 'Repasse' && c.type === 'DEBIT');
      expect(recreated).toHaveLength(1);
      expect(recreated[0]).toMatchObject({ archived: false, splitRole: 'PASS_THROUGH' });
    });
  });
});
