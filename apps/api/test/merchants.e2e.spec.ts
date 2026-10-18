import {
  categoryListResponseSchema,
  currentPeriod,
  merchantListResponseSchema,
  merchantSchema,
  shiftPeriod,
  transactionListResponseSchema,
  transactionSchema,
  workspaceSchema,
} from '@financas/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './app.js';
import { resetDatabase } from './db.js';
import { expectHiddenFromOutsiders, type WorkspaceRoute } from './isolation.js';

// Merchants: where a transaction was bought or who paid it (ADR 0053).
// All data here is fictitious (ADR 0019).
const maria = { name: 'Maria Exemplo', email: 'maria@example.com', password: 'senha-de-teste-123' };
const joao = { name: 'João Exemplo', email: 'joao@example.com', password: 'senha-de-teste-456' };

const SOME_ID = '01920000-0000-7000-8000-000000000000';

const merchantRoutes: WorkspaceRoute[] = [
  { method: 'get', path: (id) => `/api/workspaces/${id}/merchants` },
  { method: 'post', path: (id) => `/api/workspaces/${id}/merchants`, body: { name: 'Intrusa' } },
  {
    method: 'patch',
    path: (id) => `/api/workspaces/${id}/merchants/${SOME_ID}`,
    body: { archived: true },
  },
  { method: 'delete', path: (id) => `/api/workspaces/${id}/merchants/${SOME_ID}` },
  {
    method: 'post',
    path: (id) => `/api/workspaces/${id}/merchants/${SOME_ID}/aliases`,
    body: { alias: 'Intrusa' },
  },
  {
    method: 'delete',
    path: (id) => `/api/workspaces/${id}/merchants/${SOME_ID}/aliases/${SOME_ID}`,
  },
];

describe('merchants', () => {
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
    const addMerchant = async (name: string) => {
      const response = await signedUp.browser.post(`${base}/merchants`).send({ name }).expect(201);
      return merchantSchema.parse(response.body);
    };
    // A debit without its competência: recurrences and plans name their own.
    const fields = (more: object) => ({
      type: 'DEBIT',
      description: 'Compras',
      categoryId: lazer.id,
      amountCents: 10_000,
      ...more,
    });
    const debit = (more: object) => ({ ...fields(more), period });
    return { ...signedUp, base, addMerchant, fields, debit };
  }

  async function merchants(browser: Browser, base: string) {
    const response = await browser.get(`${base}/merchants`).expect(200);
    return merchantListResponseSchema.parse(response.body);
  }

  async function transactions(browser: Browser, base: string, of = period) {
    const response = await browser.get(`${base}/transactions?period=${of}`).expect(200);
    return transactionListResponseSchema.parse(response.body);
  }

  describe('the list', () => {
    it('creates, renames, archives and lists merchants by name', async () => {
      const { browser, base, addMerchant } = await setup();
      const netflix = await addMerchant('Netflix');
      await addMerchant('Açougue Central');

      expect(netflix).toMatchObject({ name: 'Netflix', archived: false, inUse: false });
      await browser
        .patch(`${base}/merchants/${netflix.id}`)
        .send({ name: 'Netflix BR' })
        .expect(200);
      await browser.patch(`${base}/merchants/${netflix.id}`).send({ archived: true }).expect(200);
      expect(
        (await merchants(browser, base)).map(({ name, archived }) => [name, archived]),
      ).toEqual([
        ['Açougue Central', false],
        ['Netflix BR', true],
      ]);
    });

    it('refuses a name already used, ignoring case and accents', async () => {
      const { browser, base, addMerchant } = await setup();
      await addMerchant('Açougue Central');
      const other = await addMerchant('Padaria');

      const created = await browser
        .post(`${base}/merchants`)
        .send({ name: 'acougue central' })
        .expect(409);
      const renamed = await browser
        .patch(`${base}/merchants/${other.id}`)
        .send({ name: 'ACOUGUE CENTRAL' })
        .expect(409);

      expect(created.body).toMatchObject({ code: 'MERCHANT_EXISTS' });
      expect(renamed.body).toMatchObject({ code: 'MERCHANT_EXISTS' });
    });

    it('deletes only an unused merchant; one in use is archived instead', async () => {
      const { browser, base, addMerchant, debit } = await setup();
      const unused = await addMerchant('Padaria');
      const used = await addMerchant('Mercado A');
      await browser
        .post(`${base}/transactions`)
        .send(debit({ merchantId: used.id }))
        .expect(201);

      expect((await merchants(browser, base)).find((m) => m.id === used.id)?.inUse).toBe(true);
      const refused = await browser.delete(`${base}/merchants/${used.id}`).expect(409);
      await browser.delete(`${base}/merchants/${unused.id}`).expect(204);

      expect(refused.body).toMatchObject({ code: 'MERCHANT_IN_USE' });
      expect((await merchants(browser, base)).map((m) => m.name)).toEqual(['Mercado A']);
    });

    it('hides the routes from outsiders', async () => {
      const { personalWorkspaceId } = await setup();

      await expectHiddenFromOutsiders(t, personalWorkspaceId, merchantRoutes);
    });

    it('lets a VIEWER read merchants but not change them', async () => {
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

      await viewer.browser.get(`${base}/merchants`).expect(200);
      await viewer.browser.post(`${base}/merchants`).send({ name: 'Padaria' }).expect(403);
      await viewer.browser
        .post(`${base}/merchants/${SOME_ID}/aliases`)
        .send({ alias: 'Padaria' })
        .expect(403);
    });
  });

  describe('aliases (ADR 0055)', () => {
    it('adds and lists the texts it appears as in a statement, by alias, and removes one', async () => {
      const { browser, base, addMerchant } = await setup();
      const pizzaria = await addMerchant('Pizzaria Exemplo');

      await browser
        .post(`${base}/merchants/${pizzaria.id}/aliases`)
        .send({ alias: 'Ifd*Pizzaria Exemplo' })
        .expect(201);
      const response = await browser
        .post(`${base}/merchants/${pizzaria.id}/aliases`)
        .send({ alias: ' Pizzaria Ex ' })
        .expect(201);

      const withAliases = merchantSchema.parse(response.body);
      expect(withAliases.aliases.map((item) => item.alias)).toEqual([
        'Ifd*Pizzaria Exemplo',
        'Pizzaria Ex',
      ]);
      expect((await merchants(browser, base))[0]?.aliases).toEqual(withAliases.aliases);
      await browser
        .delete(`${base}/merchants/${pizzaria.id}/aliases/${withAliases.aliases[0]!.id}`)
        .expect(204);
      expect((await merchants(browser, base))[0]?.aliases.map((item) => item.alias)).toEqual([
        'Pizzaria Ex',
      ]);
    });

    it('refuses an alias already used, ignoring case, accents and the installment at the end', async () => {
      const { browser, base, addMerchant } = await setup();
      const loja = await addMerchant('Loja Exemplo');
      const outra = await addMerchant('Outra Loja');
      await browser
        .post(`${base}/merchants/${loja.id}/aliases`)
        .send({ alias: 'Loja.Exemplo' })
        .expect(201);

      const taken = await browser
        .post(`${base}/merchants/${outra.id}/aliases`)
        .send({ alias: 'LOJA.EXEMPLO - Parcela 2/3' })
        .expect(409);

      expect(taken.body).toMatchObject({
        code: 'MERCHANT_ALIAS_EXISTS',
        message: 'Esse apelido já é de "Loja Exemplo".',
      });
      const onlyInstallment = await browser
        .post(`${base}/merchants/${outra.id}/aliases`)
        .send({ alias: 'Parcela 1/2' })
        .expect(400);
      expect(onlyInstallment.body).toMatchObject({ code: 'INVALID_INPUT' });
    });

    it('goes with its merchant, and frees the alias for another one', async () => {
      const { browser, base, addMerchant } = await setup();
      const loja = await addMerchant('Loja Exemplo');
      await browser
        .post(`${base}/merchants/${loja.id}/aliases`)
        .send({ alias: 'Loja.Exemplo' })
        .expect(201);

      await browser.delete(`${base}/merchants/${loja.id}`).expect(204);

      const outra = await addMerchant('Outra Loja');
      await browser
        .post(`${base}/merchants/${outra.id}/aliases`)
        .send({ alias: 'Loja.Exemplo' })
        .expect(201);
    });

    it("answers 404 for another merchant's alias or an unknown one", async () => {
      const { browser, base, addMerchant } = await setup();
      const loja = await addMerchant('Loja Exemplo');
      const outra = await addMerchant('Outra Loja');
      const added = merchantSchema.parse(
        (
          await browser
            .post(`${base}/merchants/${loja.id}/aliases`)
            .send({ alias: 'Loja.Exemplo' })
            .expect(201)
        ).body,
      );

      await browser
        .delete(`${base}/merchants/${outra.id}/aliases/${added.aliases[0]!.id}`)
        .expect(404);
      await browser.delete(`${base}/merchants/${loja.id}/aliases/nada`).expect(404);
    });
  });

  describe('on a transaction', () => {
    it('keeps the merchant, which may stay after it is archived', async () => {
      const { browser, base, addMerchant, debit } = await setup();
      const mercado = await addMerchant('Mercado A');

      const created = transactionSchema.parse(
        (
          await browser
            .post(`${base}/transactions`)
            .send(debit({ merchantId: mercado.id }))
            .expect(201)
        ).body,
      );
      await browser.patch(`${base}/merchants/${mercado.id}`).send({ archived: true }).expect(200);
      // Another change keeps the archived merchant; unlinking it works too.
      await browser
        .patch(`${base}/transactions/${created.id}`)
        .send({ description: 'Compras do mês' })
        .expect(200);

      expect(created.merchantId).toBe(mercado.id);
      expect((await transactions(browser, base))[0]?.merchantId).toBe(mercado.id);
      await browser
        .patch(`${base}/transactions/${created.id}`)
        .send({ merchantId: null })
        .expect(200);
      expect((await transactions(browser, base))[0]?.merchantId).toBeNull();
    });

    it("refuses an archived merchant, or another workspace's", async () => {
      const { browser, base, addMerchant, debit } = await setup();
      const archived = await addMerchant('Padaria');
      await browser.patch(`${base}/merchants/${archived.id}`).send({ archived: true }).expect(200);
      const other = await setup(joao);
      const theirs = await other.addMerchant('Mercado do João');

      const refusedArchived = await browser
        .post(`${base}/transactions`)
        .send(debit({ merchantId: archived.id }))
        .expect(400);
      const refusedOther = await browser
        .post(`${base}/transactions`)
        .send(debit({ merchantId: theirs.id }))
        .expect(400);

      expect(refusedArchived.body).toMatchObject({ code: 'INVALID_MERCHANT' });
      expect(refusedOther.body).toMatchObject({ code: 'INVALID_MERCHANT' });
    });

    it('is not copied to the shares of a split', async () => {
      const { browser, base, addMerchant, debit } = await setup();
      const mercado = await addMerchant('Mercado A');

      await browser
        .post(`${base}/transactions`)
        .send(
          debit({ merchantId: mercado.id, split: [{ newPersonName: 'Ana', amountCents: 5_000 }] }),
        )
        .expect(201);

      const list = await transactions(browser, base);
      expect(list.find((item) => item.type === 'DEBIT')?.merchantId).toBe(mercado.id);
      expect(list.find((item) => item.type === 'CREDIT')?.merchantId).toBeNull();
    });
  });

  describe('on recurrences and installment plans', () => {
    it('copies it to every month of a recurrence, and a change reaches the pending ones', async () => {
      const { browser, base, addMerchant, fields } = await setup();
      const netflix = await addMerchant('Netflix');
      const other = await addMerchant('Netflix Família');

      const created = await browser
        .post(`${base}/recurrences`)
        .send({
          ...fields({ description: 'Streaming' }),
          startPeriod: period,
          merchantId: netflix.id,
        })
        .expect(201);
      expect(created.body).toMatchObject({ merchantId: netflix.id });
      expect((await transactions(browser, base, next))[0]?.merchantId).toBe(netflix.id);

      await browser
        .patch(`${base}/recurrences/${(created.body as { id: string }).id}`)
        .send({ merchantId: other.id })
        .expect(200);

      expect((await transactions(browser, base))[0]?.merchantId).toBe(other.id);
      expect((await transactions(browser, base, next))[0]?.merchantId).toBe(other.id);
    });

    it('copies it to every installment of a plan', async () => {
      const { browser, base, addMerchant, fields } = await setup();
      const loja = await addMerchant('Loja de Móveis');

      const created = await browser
        .post(`${base}/installments`)
        .send({
          ...fields({ description: 'Sofá' }),
          installments: 3,
          amountIs: 'TOTAL',
          firstPeriod: period,
          merchantId: loja.id,
        })
        .expect(201);

      expect(created.body).toMatchObject({ merchantId: loja.id });
      expect((await transactions(browser, base))[0]?.merchantId).toBe(loja.id);
      expect((await transactions(browser, base, shiftPeriod(period, 2)))[0]?.merchantId).toBe(
        loja.id,
      );
    });
  });
});
