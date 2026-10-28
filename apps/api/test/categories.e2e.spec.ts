import {
  DEFAULT_BUDGET_DESTINATIONS,
  CATEGORY_HINT_MONTHS,
  CATEGORY_USAGE_MONTHS,
  categoryHintsSchema,
  categoryListResponseSchema,
  categorySchema,
  currentPeriod,
  shiftPeriod,
  workspaceSchema,
} from '@financas/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES } from '../src/categories/default-categories.js';
import { createTestApp } from './app.js';
import { ownerClient, resetDatabase } from './db.js';
import { expectHiddenFromOutsiders, type WorkspaceRoute } from './isolation.js';

// Categories of a workspace, the first table with Row Level Security (ADR 0028).
// All data here is fictitious (ADR 0019).
const maria = { name: 'Maria Exemplo', email: 'maria@example.com', password: 'senha-de-teste-123' };
const joao = { name: 'João Exemplo', email: 'joao@example.com', password: 'senha-de-teste-456' };

const SOME_ID = '01920000-0000-7000-8000-000000000000';

const categoryRoutes: WorkspaceRoute[] = [
  { method: 'get', path: (id) => `/api/workspaces/${id}/categories` },
  {
    method: 'post',
    path: (id) => `/api/workspaces/${id}/categories`,
    body: { name: 'Intrusa', type: 'DEBIT' },
  },
  {
    method: 'patch',
    path: (id) => `/api/workspaces/${id}/categories/${SOME_ID}`,
    body: { archived: true },
  },
  { method: 'delete', path: (id) => `/api/workspaces/${id}/categories/${SOME_ID}` },
  { method: 'get', path: (id) => `/api/workspaces/${id}/categories/hints` },
  {
    method: 'post',
    path: (id) => `/api/workspaces/${id}/categories/copy`,
    body: { sourceWorkspaceId: SOME_ID, categoryIds: [SOME_ID] },
  },
];

// The default categories, plus the debit category of each default saving destination (ADR 0047).
const savingDestinations = DEFAULT_BUDGET_DESTINATIONS.filter((d) => d.kind === 'SAVINGS').length;
const defaultCount =
  DEFAULT_CATEGORIES.CREDIT.length + DEFAULT_CATEGORIES.DEBIT.length + savingDestinations;

describe('categories', () => {
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

  async function list(browser: ReturnType<typeof t.http>, workspaceId: string) {
    const response = await browser.get(`/api/workspaces/${workspaceId}/categories`).expect(200);
    return categoryListResponseSchema.parse(response.body);
  }

  async function create(
    browser: ReturnType<typeof t.http>,
    workspaceId: string,
    body: { name: string; type: 'CREDIT' | 'DEBIT' },
  ) {
    const response = await browser
      .post(`/api/workspaces/${workspaceId}/categories`)
      .send(body)
      .expect(201);
    return categorySchema.parse(response.body);
  }

  describe('default categories', () => {
    it('come with the personal workspace, credits first, each type sorted by name', async () => {
      const { browser, personalWorkspaceId } = await t.signUp(maria);

      const categories = await list(browser, personalWorkspaceId);

      expect(categories).toHaveLength(defaultCount);
      expect(categories.every((category) => !category.archived)).toBe(true);
      const credits = categories.filter((category) => category.type === 'CREDIT');
      expect(credits.map((category) => category.name)).toEqual(
        [...DEFAULT_CATEGORIES.CREDIT].sort((a, b) => a.localeCompare(b, 'pt-BR')),
      );
      expect(categories.slice(0, credits.length)).toEqual(credits);
    });

    it('come with a new shared workspace too', async () => {
      const { browser } = await t.signUp(maria);
      const created = await browser.post('/api/workspaces').send({ name: 'Casa' }).expect(201);

      const categories = await list(browser, workspaceSchema.parse(created.body).id);

      expect(categories).toHaveLength(defaultCount);
    });
  });

  describe('Reembolso and Repasse (ADR 0052 note)', () => {
    const byRole = (categories: { splitRole?: string | null; name: string; type: string }[]) =>
      categories
        .filter((category) => category.splitRole)
        .map(({ name, type, splitRole }) => ({ name, type, splitRole }));

    /** A debit split with Ana: its share goes to the Reembolso category. */
    async function split(browser: ReturnType<typeof t.http>, workspaceId: string) {
      const categories = await list(browser, workspaceId);
      const mercado = categories.find((c) => c.name === 'Mercado' && c.type === 'DEBIT')!;
      await browser
        .post(`/api/workspaces/${workspaceId}/transactions`)
        .send({
          type: 'DEBIT',
          description: 'Feira',
          categoryId: mercado.id,
          amountCents: 10_000,
          period: currentPeriod(),
          split: [{ newPersonName: 'Ana', amountCents: 5_000 }],
        })
        .expect(201);
    }

    it('come marked with every new workspace', async () => {
      const { browser, personalWorkspaceId } = await t.signUp(maria);

      expect(byRole(await list(browser, personalWorkspaceId))).toEqual([
        { name: 'Reembolso', type: 'CREDIT', splitRole: 'REIMBURSEMENT' },
        { name: 'Repasse', type: 'DEBIT', splitRole: 'PASS_THROUGH' },
      ]);
    });

    it('are never renamed, archived or deleted', async () => {
      const { browser, personalWorkspaceId } = await t.signUp(maria);
      const reembolso = (await list(browser, personalWorkspaceId)).find(
        (category) => category.splitRole === 'REIMBURSEMENT',
      )!;
      const url = `/api/workspaces/${personalWorkspaceId}/categories/${reembolso.id}`;

      for (const body of [{ name: 'Reembolsos' }, { archived: true }, { neutral: true }]) {
        const response = await browser.patch(url).send(body).expect(409);
        expect(response.body).toMatchObject({ code: 'CATEGORY_OF_SPLIT' });
      }
      await browser.delete(url).expect(409);
      expect(byRole(await list(browser, personalWorkspaceId))).toHaveLength(2);
    });

    it('a split finds the marked one; a workspace from before the mark gets its own marked', async () => {
      const { browser, personalWorkspaceId } = await t.signUp(maria);
      const owner = ownerClient();
      try {
        // As before the mark: one named Reembolso, unmarked.
        await owner.category.updateMany({
          where: { workspaceId: personalWorkspaceId, splitRole: 'REIMBURSEMENT' },
          data: { splitRole: null },
        });

        await split(browser, personalWorkspaceId);
        await split(browser, personalWorkspaceId);
      } finally {
        await owner.$disconnect();
      }

      const categories = await list(browser, personalWorkspaceId);
      // The same category, now marked; never a second Reembolso.
      expect(categories.filter((c) => c.type === 'CREDIT' && c.name === 'Reembolso')).toEqual([
        expect.objectContaining({ splitRole: 'REIMBURSEMENT' }),
      ]);
    });

    it('a workspace that renamed its Reembolso before the mark gets a new one', async () => {
      const { browser, personalWorkspaceId } = await t.signUp(maria);
      const owner = ownerClient();
      try {
        await owner.category.updateMany({
          where: { workspaceId: personalWorkspaceId, splitRole: 'REIMBURSEMENT' },
          data: { splitRole: null, name: 'Devoluções' },
        });

        await split(browser, personalWorkspaceId);
      } finally {
        await owner.$disconnect();
      }

      const credits = (await list(browser, personalWorkspaceId)).filter((c) => c.type === 'CREDIT');
      expect(credits.find((c) => c.name === 'Devoluções')).toMatchObject({ splitRole: null });
      expect(credits.find((c) => c.name === 'Reembolso')).toMatchObject({
        splitRole: 'REIMBURSEMENT',
      });
    });
  });

  describe('recent uses', () => {
    it('counts each category’s transactions in the last months, for the "Mais usadas" group', async () => {
      const { browser, personalWorkspaceId } = await t.signUp(maria);
      const before = await list(browser, personalWorkspaceId);
      expect(before.every((category) => category.recentUses === 0)).toBe(true);
      const mercado = before.find((category) => category.name === 'Mercado')!;
      const energia = before.find((category) => category.name === 'Contas da casa')!;
      const now = currentPeriod();
      const add = (categoryId: string, period: string) =>
        browser
          .post(`/api/workspaces/${personalWorkspaceId}/transactions`)
          .send({
            type: 'DEBIT',
            description: 'Compra de exemplo',
            categoryId,
            amountCents: 1000,
            period,
          })
          .expect(201);

      await add(mercado.id, now);
      await add(mercado.id, shiftPeriod(now, 1 - CATEGORY_USAGE_MONTHS));
      await add(energia.id, shiftPeriod(now, -2));
      // Out of the window: too old, and a future month.
      await add(energia.id, shiftPeriod(now, -CATEGORY_USAGE_MONTHS));
      await add(energia.id, shiftPeriod(now, 1));

      const after = await list(browser, personalWorkspaceId);
      const uses = (id: string) => after.find((category) => category.id === id)!.recentUses;
      expect(uses(mercado.id)).toBe(2);
      expect(uses(energia.id)).toBe(1);
      expect(after.filter((category) => category.recentUses > 0)).toHaveLength(2);
    });
  });

  describe('hints (ADR 0053)', () => {
    it('says the category most used with each merchant and description, leaving shares out', async () => {
      const { browser, personalWorkspaceId: id } = await t.signUp(maria);
      const categories = await list(browser, id);
      const named = (name: string) => categories.find((category) => category.name === name)!;
      const mercado = named('Mercado');
      const lazer = named('Lazer');
      const now = currentPeriod();
      const merchant = (
        (
          await browser
            .post(`/api/workspaces/${id}/merchants`)
            .send({ name: 'Bom Preço' })
            .expect(201)
        ).body as { id: string }
      ).id;
      const add = (fields: object) =>
        browser
          .post(`/api/workspaces/${id}/transactions`)
          .send({ type: 'DEBIT', amountCents: 1000, period: now, ...fields })
          .expect(201);

      await add({ description: 'Compras', categoryId: mercado.id, merchantId: merchant });
      await add({ description: 'compras', categoryId: mercado.id, merchantId: merchant });
      await add({ description: 'Compras', categoryId: lazer.id, merchantId: merchant });
      // Too old: out of the history.
      await add({
        description: 'Cinema',
        categoryId: lazer.id,
        period: shiftPeriod(now, -CATEGORY_HINT_MONTHS),
      });
      // A split's share repeats the description, in Reembolso: it must not suggest Reembolso.
      await add({
        description: 'Jantar',
        categoryId: lazer.id,
        split: [{ newPersonName: 'Ana', amountCents: 500 }],
      });

      const hints = categoryHintsSchema.parse(
        (await browser.get(`/api/workspaces/${id}/categories/hints`).expect(200)).body,
      );

      expect(hints.merchants).toEqual([
        { merchantId: merchant, type: 'DEBIT', categoryId: mercado.id },
      ]);
      expect(hints.descriptions).toEqual([
        { description: 'compras', type: 'DEBIT', categoryId: mercado.id },
        { description: 'jantar', type: 'DEBIT', categoryId: lazer.id },
      ]);
    });

    it('says the payment method most used with each merchant and description (ADR 0054)', async () => {
      const { browser, personalWorkspaceId: id } = await t.signUp(maria);
      const mercado = (await list(browser, id)).find((category) => category.name === 'Mercado')!;
      const now = currentPeriod();
      const merchant = (
        (
          await browser
            .post(`/api/workspaces/${id}/merchants`)
            .send({ name: 'Bom Preço' })
            .expect(201)
        ).body as { id: string }
      ).id;
      const add = (fields: object) =>
        browser
          .post(`/api/workspaces/${id}/transactions`)
          .send({
            type: 'DEBIT',
            amountCents: 1000,
            period: now,
            categoryId: mercado.id,
            ...fields,
          })
          .expect(201);

      await add({ description: 'Compras', merchantId: merchant, paymentMethod: 'CASH' });
      await add({ description: 'compras', merchantId: merchant, paymentMethod: 'CASH' });
      await add({ description: 'Compras', merchantId: merchant, paymentMethod: 'PIX' });
      // Without a method: says nothing.
      await add({ description: 'Feira' });

      const hints = categoryHintsSchema.parse(
        (await browser.get(`/api/workspaces/${id}/categories/hints`).expect(200)).body,
      );

      expect(hints.paymentMethods).toEqual({
        merchants: [{ merchantId: merchant, type: 'DEBIT', paymentMethod: 'CASH' }],
        descriptions: [{ description: 'compras', type: 'DEBIT', paymentMethod: 'CASH' }],
      });
    });
  });

  describe('creating', () => {
    it('adds a category to the workspace', async () => {
      const { browser, personalWorkspaceId } = await t.signUp(maria);

      const category = await create(browser, personalWorkspaceId, { name: ' Pet ', type: 'DEBIT' });

      expect(category).toMatchObject({ name: 'Pet', type: 'DEBIT', archived: false });
      expect(await list(browser, personalWorkspaceId)).toContainEqual(category);
    });

    it('refuses a name already used for the same type, ignoring case', async () => {
      const { browser, personalWorkspaceId } = await t.signUp(maria);

      const response = await browser
        .post(`/api/workspaces/${personalWorkspaceId}/categories`)
        .send({ name: 'mercado', type: 'DEBIT' })
        .expect(409);

      expect(response.body).toMatchObject({ code: 'CATEGORY_EXISTS' });
    });

    it('accepts the same name for the other type', async () => {
      const { browser, personalWorkspaceId } = await t.signUp(maria);

      await create(browser, personalWorkspaceId, { name: 'Mercado', type: 'CREDIT' });
    });

    it('validates the input with the shared schema', async () => {
      const { browser, personalWorkspaceId } = await t.signUp(maria);

      const response = await browser
        .post(`/api/workspaces/${personalWorkspaceId}/categories`)
        .send({ name: '', type: 'DEBIT' })
        .expect(400);

      expect(response.body).toMatchObject({
        code: 'INVALID_INPUT',
        message: 'Dê um nome à categoria.',
      });
    });
  });

  describe('updating', () => {
    it('renames, archives and reactivates', async () => {
      const { browser, personalWorkspaceId } = await t.signUp(maria);
      const pet = await create(browser, personalWorkspaceId, { name: 'Pet', type: 'DEBIT' });
      const path = `/api/workspaces/${personalWorkspaceId}/categories/${pet.id}`;

      const renamed = await browser.patch(path).send({ name: 'Animais' }).expect(200);
      expect(renamed.body).toEqual({ ...pet, name: 'Animais' });

      const archived = await browser.patch(path).send({ archived: true }).expect(200);
      expect(archived.body).toEqual({ ...pet, name: 'Animais', archived: true });

      const reactivated = await browser.patch(path).send({ archived: false }).expect(200);
      expect(reactivated.body).toEqual({ ...pet, name: 'Animais' });
    });

    it('marks and unmarks "Nem renda nem gasto" (ADR 0056)', async () => {
      const { browser, personalWorkspaceId } = await t.signUp(maria);
      const loans = await create(browser, personalWorkspaceId, {
        name: 'Empréstimo pessoal',
        type: 'DEBIT',
      });
      expect(loans).toMatchObject({ neutral: false });
      const path = `/api/workspaces/${personalWorkspaceId}/categories/${loans.id}`;

      const marked = await browser.patch(path).send({ neutral: true }).expect(200);
      expect(marked.body).toEqual({ ...loans, neutral: true });
      expect(await list(browser, personalWorkspaceId)).toContainEqual(
        expect.objectContaining({ id: loans.id, neutral: true }),
      );

      const unmarked = await browser.patch(path).send({ neutral: false }).expect(200);
      expect(unmarked.body).toEqual({ ...loans, neutral: false });
    });

    it("never marks a saving destination's category", async () => {
      const { browser, personalWorkspaceId } = await t.signUp(maria);
      const investimentos = (await list(browser, personalWorkspaceId)).find(
        (category) => category.destinationId,
      )!;

      const response = await browser
        .patch(`/api/workspaces/${personalWorkspaceId}/categories/${investimentos.id}`)
        .send({ neutral: true })
        .expect(409);
      expect(response.body).toMatchObject({ code: 'CATEGORY_OF_DESTINATION' });
    });

    it('never changes the type', async () => {
      const { browser, personalWorkspaceId } = await t.signUp(maria);
      const pet = await create(browser, personalWorkspaceId, { name: 'Pet', type: 'DEBIT' });

      const response = await browser
        .patch(`/api/workspaces/${personalWorkspaceId}/categories/${pet.id}`)
        .send({ name: 'Pet', type: 'CREDIT' })
        .expect(200);

      expect(response.body).toMatchObject({ type: 'DEBIT' });
    });

    it('refuses a rename to a name already taken', async () => {
      const { browser, personalWorkspaceId } = await t.signUp(maria);
      const pet = await create(browser, personalWorkspaceId, { name: 'Pet', type: 'DEBIT' });

      const response = await browser
        .patch(`/api/workspaces/${personalWorkspaceId}/categories/${pet.id}`)
        .send({ name: 'LAZER' })
        .expect(409);

      expect(response.body).toMatchObject({ code: 'CATEGORY_EXISTS' });
    });

    it('answers 404 for an unknown or malformed id', async () => {
      const { browser, personalWorkspaceId } = await t.signUp(maria);
      const base = `/api/workspaces/${personalWorkspaceId}/categories`;

      await browser.patch(`${base}/${SOME_ID}`).send({ archived: true }).expect(404);
      await browser.patch(`${base}/not-a-uuid`).send({ archived: true }).expect(404);
    });
  });

  describe('where a loan comes back (ADR 0058)', () => {
    /** A loans category on each side, both marked, Bruno, and money lent to him before any choice. */
    async function loans() {
      const { browser, personalWorkspaceId: id } = await t.signUp(maria);
      const base = `/api/workspaces/${id}`;
      const marked = async (type: 'CREDIT' | 'DEBIT') => {
        const category = await create(browser, id, { name: 'Empréstimo pessoal', type });
        await browser
          .patch(`${base}/categories/${category.id}`)
          .send({ neutral: true })
          .expect(200);
        return category.id;
      };
      const lent = await marked('DEBIT');
      const back = await marked('CREDIT');
      const bruno = (await browser.post(`${base}/people`).send({ name: 'Bruno' }).expect(201))
        .body as { id: string };
      const lend = async (amountCents: number) =>
        (
          await browser
            .post(`${base}/transactions`)
            .send({
              type: 'DEBIT',
              description: 'Empréstimo ao Bruno',
              categoryId: lent,
              amountCents,
              period: '2026-10',
              settledAt: '2026-10-21',
              split: [{ personId: bruno.id, amountCents }],
            })
            .expect(201)
        ).body as { id: string };
      await lend(50_000);
      const shareCategories = async () => {
        const response = await browser.get(`${base}/transactions?period=2026-10`).expect(200);
        return (response.body as { splitOfId: string | null; categoryId: string }[])
          .filter((transaction) => transaction.splitOfId)
          .map((transaction) => transaction.categoryId);
      };
      const reimbursement = (await list(browser, id)).find((c) => c.splitRole === 'REIMBURSEMENT')!;
      const choose = (returnCategoryId: string | null) =>
        browser.patch(`${base}/categories/${lent}`).send({ returnCategoryId });
      return { browser, id, base, lent, back, lend, shareCategories, reimbursement, choose };
    }

    it('moves the shares already launched there, and back to Reembolso when taken back', async () => {
      const { lent, back, shareCategories, reimbursement, choose } = await loans();
      expect(await shareCategories()).toEqual([reimbursement.id]);

      const chosen = await choose(back).expect(200);

      expect(categorySchema.parse(chosen.body)).toMatchObject({ id: lent, returnCategoryId: back });
      expect(await shareCategories()).toEqual([back]);
      await choose(null).expect(200);
      expect(await shareCategories()).toEqual([reimbursement.id]);
    });

    it('puts the shares of money lent from then on there', async () => {
      const { back, lend, shareCategories, choose } = await loans();
      await choose(back).expect(200);

      await lend(20_000);

      expect(await shareCategories()).toEqual([back, back]);
    });

    it('a debit moved out of the loans category takes its shares to Reembolso', async () => {
      const { browser, id, base, back, lend, shareCategories, reimbursement, choose } =
        await loans();
      await choose(back).expect(200);
      const lunch = await lend(3_000);
      const restaurants = (await list(browser, id)).find(
        (c) => c.name === 'Restaurantes' && c.type === 'DEBIT',
      )!;

      await browser
        .patch(`${base}/transactions/${lunch.id}`)
        .send({ categoryId: restaurants.id })
        .expect(200);

      expect(await shareCategories()).toEqual([back, reimbursement.id]);
    });

    it('takes the choice back with the mark, and the shares with it', async () => {
      const { browser, base, lent, back, shareCategories, reimbursement, choose } = await loans();
      await choose(back).expect(200);

      const unmarked = await browser
        .patch(`${base}/categories/${lent}`)
        .send({ neutral: false })
        .expect(200);

      expect(unmarked.body).toMatchObject({ neutral: false, returnCategoryId: null });
      expect(await shareCategories()).toEqual([reimbursement.id]);
    });

    it('accepts only a marked credit category, chosen by a marked debit one', async () => {
      const { browser, id, base, lent, back, reimbursement, choose } = await loans();
      const plain = await create(browser, id, { name: 'Prêmios', type: 'CREDIT' });
      const otherDebit = await create(browser, id, { name: 'Viagem', type: 'DEBIT' });

      for (const target of [plain.id, lent, reimbursement.id, SOME_ID]) {
        const response = await choose(target).expect(400);
        expect(response.body).toMatchObject({ code: 'INVALID_RETURN_CATEGORY' });
      }
      const notALoan = await browser
        .patch(`${base}/categories/${otherDebit.id}`)
        .send({ returnCategoryId: back })
        .expect(409);
      expect(notALoan.body).toMatchObject({ code: 'NOT_A_LOAN_CATEGORY' });
    });

    it('keeps the chosen category marked, offered and in place while chosen', async () => {
      const { browser, base, back, choose } = await loans();
      await choose(back).expect(200);

      for (const body of [{ neutral: false }, { archived: true }]) {
        const response = await browser.patch(`${base}/categories/${back}`).send(body).expect(409);
        expect(response.body).toMatchObject({ code: 'CATEGORY_RECEIVES_LOANS' });
      }
      await browser.delete(`${base}/categories/${back}`).expect(409);
    });
  });

  describe('where a borrowing keeps its debt (ADR 0059)', () => {
    /** A loans category on each side, both marked, Ana, and money borrowed from her before any choice. */
    async function borrowings() {
      const { browser, personalWorkspaceId: id } = await t.signUp(maria);
      const base = `/api/workspaces/${id}`;
      const marked = async (type: 'CREDIT' | 'DEBIT') => {
        const category = await create(browser, id, { name: 'Empréstimo pessoal', type });
        await browser
          .patch(`${base}/categories/${category.id}`)
          .send({ neutral: true })
          .expect(200);
        return category.id;
      };
      const borrowed = await marked('CREDIT');
      const debt = await marked('DEBIT');
      const ana = (await browser.post(`${base}/people`).send({ name: 'Ana' }).expect(201)).body as {
        id: string;
      };
      const borrow = (amountCents: number) =>
        browser
          .post(`${base}/transactions`)
          .send({
            type: 'CREDIT',
            description: 'Empréstimo da Ana',
            categoryId: borrowed,
            amountCents,
            period: '2026-10',
            settledAt: '2026-10-24',
            split: [{ personId: ana.id, amountCents }],
          })
          .expect(201);
      await borrow(200_000);
      const shareCategories = async () => {
        const response = await browser.get(`${base}/transactions?period=2026-10`).expect(200);
        return (response.body as { splitOfId: string | null; categoryId: string }[])
          .filter((transaction) => transaction.splitOfId)
          .map((transaction) => transaction.categoryId);
      };
      const passThrough = (await list(browser, id)).find((c) => c.splitRole === 'PASS_THROUGH')!;
      const choose = (returnCategoryId: string | null) =>
        browser.patch(`${base}/categories/${borrowed}`).send({ returnCategoryId });
      return { browser, id, base, borrowed, debt, borrow, shareCategories, passThrough, choose };
    }

    it('moves the debts already launched there, and back to Repasse when taken back', async () => {
      const { borrowed, debt, shareCategories, passThrough, choose } = await borrowings();
      expect(await shareCategories()).toEqual([passThrough.id]);

      const chosen = await choose(debt).expect(200);

      expect(categorySchema.parse(chosen.body)).toMatchObject({
        id: borrowed,
        returnCategoryId: debt,
      });
      expect(await shareCategories()).toEqual([debt]);
      await choose(null).expect(200);
      expect(await shareCategories()).toEqual([passThrough.id]);
    });

    it('puts the debts of money borrowed from then on there', async () => {
      const { debt, borrow, shareCategories, choose } = await borrowings();
      await choose(debt).expect(200);

      await borrow(50_000);

      expect(await shareCategories()).toEqual([debt, debt]);
    });

    it('accepts only a marked debit category, and keeps it in place while chosen', async () => {
      const { browser, id, base, borrowed, debt, choose } = await borrowings();
      const plain = await create(browser, id, { name: 'Viagem', type: 'DEBIT' });

      for (const target of [plain.id, borrowed]) {
        const response = await choose(target).expect(400);
        expect(response.body).toMatchObject({
          code: 'INVALID_RETURN_CATEGORY',
          message: 'Escolha uma categoria de saída marcada "Nem renda nem gasto".',
        });
      }
      await choose(debt).expect(200);
      const unmark = await browser
        .patch(`${base}/categories/${debt}`)
        .send({ neutral: false })
        .expect(409);
      expect(unmark.body).toMatchObject({
        code: 'CATEGORY_RECEIVES_LOANS',
        message:
          'Esta categoria é a dívida dos empréstimos de "Empréstimo pessoal". Troque lá, em "Categoria da dívida", antes.',
      });
    });
  });

  describe('in use', () => {
    it('says which categories have anything in them, in any competência', async () => {
      const { browser, personalWorkspaceId: id } = await t.signUp(maria);
      const pet = await create(browser, id, { name: 'Pet', type: 'DEBIT' });
      const mercado = (await list(browser, id)).find((c) => c.name === 'Mercado')!;
      // A year ago: "in use" is not only the recent months.
      await browser
        .post(`/api/workspaces/${id}/transactions`)
        .send({
          type: 'DEBIT',
          description: 'Compras do mês',
          categoryId: mercado.id,
          amountCents: 45_000,
          period: shiftPeriod(currentPeriod(), -12),
        })
        .expect(201);

      const categories = await list(browser, id);

      expect(categories.find((c) => c.id === mercado.id)?.inUse).toBe(true);
      expect(categories.find((c) => c.id === pet.id)?.inUse).toBe(false);
      // Never used: deleted directly, without archiving first.
      await browser.delete(`/api/workspaces/${id}/categories/${pet.id}`).expect(204);
      await browser.delete(`/api/workspaces/${id}/categories/${mercado.id}`).expect(409);
    });
  });

  describe('deleting', () => {
    it('removes the category', async () => {
      const { browser, personalWorkspaceId } = await t.signUp(maria);
      const pet = await create(browser, personalWorkspaceId, { name: 'Pet', type: 'DEBIT' });
      const path = `/api/workspaces/${personalWorkspaceId}/categories/${pet.id}`;

      await browser.delete(path).expect(204);

      await browser.delete(path).expect(404);
      expect(await list(browser, personalWorkspaceId)).not.toContainEqual(pet);
    });
  });

  describe('copying from another workspace (ADR 0048)', () => {
    /** Maria with her personal workspace and a shared one, "Casa". */
    async function twoWorkspaces() {
      const signedUp = await t.signUp(maria);
      const created = await signedUp.browser
        .post('/api/workspaces')
        .send({ name: 'Casa' })
        .expect(201);
      return { ...signedUp, houseId: workspaceSchema.parse(created.body).id };
    }

    function copy(
      browser: ReturnType<typeof t.http>,
      workspaceId: string,
      body: { sourceWorkspaceId: string; categoryIds: string[] },
    ) {
      return browser.post(`/api/workspaces/${workspaceId}/categories/copy`).send(body);
    }

    it('creates the chosen ones with the same name and type', async () => {
      const { browser, personalWorkspaceId, houseId } = await twoWorkspaces();
      const pet = await create(browser, personalWorkspaceId, { name: 'Pet', type: 'DEBIT' });
      const aluguel = await create(browser, personalWorkspaceId, {
        name: 'Aluguel recebido',
        type: 'CREDIT',
      });
      const loans = await create(browser, personalWorkspaceId, {
        name: 'Empréstimo pessoal',
        type: 'DEBIT',
      });
      await browser
        .patch(`/api/workspaces/${personalWorkspaceId}/categories/${loans.id}`)
        .send({ neutral: true })
        .expect(200);

      const response = await copy(browser, houseId, {
        sourceWorkspaceId: personalWorkspaceId,
        categoryIds: [pet.id, aluguel.id, loans.id],
      }).expect(201);

      expect(response.body).toEqual({ copied: 3, skipped: 0 });
      const house = await list(browser, houseId);
      expect(house).toContainEqual(
        expect.objectContaining({ name: 'Pet', type: 'DEBIT', neutral: false }),
      );
      // The mark goes along (ADR 0056).
      expect(house).toContainEqual(
        expect.objectContaining({ name: 'Empréstimo pessoal', neutral: true }),
      );
      expect(house).toContainEqual(
        expect.objectContaining({ name: 'Aluguel recebido', type: 'CREDIT', archived: false }),
      );
    });

    it('keeps where a loan comes back when both categories go along (ADR 0058)', async () => {
      const { browser, personalWorkspaceId: id, houseId } = await twoWorkspaces();
      const marked = async (type: 'CREDIT' | 'DEBIT') => {
        const category = await create(browser, id, { name: 'Empréstimo pessoal', type });
        await browser
          .patch(`/api/workspaces/${id}/categories/${category.id}`)
          .send({ neutral: true })
          .expect(200);
        return category.id;
      };
      const lent = await marked('DEBIT');
      const back = await marked('CREDIT');
      await browser
        .patch(`/api/workspaces/${id}/categories/${lent}`)
        .send({ returnCategoryId: back })
        .expect(200);

      await copy(browser, houseId, {
        sourceWorkspaceId: id,
        categoryIds: [lent, back],
      }).expect(201);

      const house = await list(browser, houseId);
      const copiedBack = house.find((c) => c.name === 'Empréstimo pessoal' && c.type === 'CREDIT');
      expect(house).toContainEqual(
        expect.objectContaining({
          name: 'Empréstimo pessoal',
          type: 'DEBIT',
          returnCategoryId: copiedBack?.id,
        }),
      );
    });

    it('skips names already here, ignoring case and accents, archived ones too', async () => {
      const { browser, personalWorkspaceId, houseId } = await twoWorkspaces();
      const agua = await create(browser, personalWorkspaceId, { name: 'Água', type: 'DEBIT' });
      const pet = await create(browser, personalWorkspaceId, { name: 'Pet', type: 'DEBIT' });
      await create(browser, houseId, { name: 'agua', type: 'DEBIT' });
      const archived = await create(browser, houseId, { name: 'PET', type: 'DEBIT' });
      await browser
        .patch(`/api/workspaces/${houseId}/categories/${archived.id}`)
        .send({ archived: true })
        .expect(200);
      const before = (await list(browser, houseId)).length;

      const response = await copy(browser, houseId, {
        sourceWorkspaceId: personalWorkspaceId,
        categoryIds: [agua.id, pet.id],
      }).expect(201);

      expect(response.body).toEqual({ copied: 0, skipped: 2 });
      expect(await list(browser, houseId)).toHaveLength(before);
    });

    it("never copies archived ones or a saving destination's", async () => {
      const { browser, personalWorkspaceId, houseId } = await twoWorkspaces();
      const old = await create(browser, personalWorkspaceId, { name: 'Antiga', type: 'DEBIT' });
      await browser
        .patch(`/api/workspaces/${personalWorkspaceId}/categories/${old.id}`)
        .send({ archived: true })
        .expect(200);
      const reforma = await browser
        .post(`/api/workspaces/${personalWorkspaceId}/budget-destinations`)
        .send({ name: 'Reforma' })
        .expect(201);

      const response = await copy(browser, houseId, {
        sourceWorkspaceId: personalWorkspaceId,
        categoryIds: [old.id, (reforma.body as { categoryId: string }).categoryId],
      }).expect(201);

      expect(response.body).toEqual({ copied: 0, skipped: 2 });
      const names = (await list(browser, houseId)).map((category) => category.name);
      expect(names).not.toContain('Antiga');
      expect(names).not.toContain('Reforma');
    });

    it('answers 404 for a source workspace the person is not a member of', async () => {
      const { browser, houseId } = await twoWorkspaces();
      const other = await t.signUp(joao);
      const [theirs] = await list(other.browser, other.personalWorkspaceId);

      await copy(browser, houseId, {
        sourceWorkspaceId: other.personalWorkspaceId,
        categoryIds: [theirs!.id],
      }).expect(404);
    });

    it("ignores ids of another workspace's categories", async () => {
      const { browser, personalWorkspaceId, houseId } = await twoWorkspaces();
      const other = await t.signUp(joao);
      const theirs = await create(other.browser, other.personalWorkspaceId, {
        name: 'Do João',
        type: 'DEBIT',
      });

      const response = await copy(browser, houseId, {
        sourceWorkspaceId: personalWorkspaceId,
        categoryIds: [theirs.id],
      }).expect(201);

      expect(response.body).toEqual({ copied: 0, skipped: 1 });
      expect((await list(browser, houseId)).map((c) => c.name)).not.toContain('Do João');
    });

    it('lets a VIEWER of the source copy into a workspace where they edit, not the opposite', async () => {
      const owner = await t.signUp(maria);
      const created = await owner.browser
        .post('/api/workspaces')
        .send({ name: 'Casa' })
        .expect(201);
      const houseId = workspaceSchema.parse(created.body).id;
      const pet = await create(owner.browser, houseId, { name: 'Pet', type: 'DEBIT' });
      const viewer = await t.signUp(joao);
      await t.prisma.member.create({
        data: { workspaceId: houseId, userId: viewer.userId, role: 'VIEWER' },
      });
      const [own] = await list(viewer.browser, viewer.personalWorkspaceId);

      await copy(viewer.browser, viewer.personalWorkspaceId, {
        sourceWorkspaceId: houseId,
        categoryIds: [pet.id],
      }).expect(201);
      await copy(viewer.browser, houseId, {
        sourceWorkspaceId: viewer.personalWorkspaceId,
        categoryIds: [own!.id],
      }).expect(403);
    });

    it('validates the input with the shared schema', async () => {
      const { browser, personalWorkspaceId, houseId } = await twoWorkspaces();

      const response = await copy(browser, houseId, {
        sourceWorkspaceId: personalWorkspaceId,
        categoryIds: [],
      }).expect(400);

      expect(response.body).toMatchObject({ code: 'INVALID_INPUT' });
    });
  });

  describe('roles', () => {
    it('a VIEWER reads but cannot change anything', async () => {
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
      const [first] = await list(viewer.browser, workspaceId);
      const base = `/api/workspaces/${workspaceId}/categories`;

      await viewer.browser.post(base).send({ name: 'Pet', type: 'DEBIT' }).expect(403);
      await viewer.browser.patch(`${base}/${first?.id}`).send({ archived: true }).expect(403);
      await viewer.browser.delete(`${base}/${first?.id}`).expect(403);
    });
  });

  describe('isolation', () => {
    it('hides every route from non-members', async () => {
      const { personalWorkspaceId } = await t.signUp(maria);

      await expectHiddenFromOutsiders(t, personalWorkspaceId, categoryRoutes);
    });

    it("a member of two workspaces cannot reach one workspace's category through the other", async () => {
      const { browser, personalWorkspaceId } = await t.signUp(maria);
      const created = await browser.post('/api/workspaces').send({ name: 'Casa' }).expect(201);
      const houseId = workspaceSchema.parse(created.body).id;
      const pet = await create(browser, houseId, { name: 'Pet', type: 'DEBIT' });
      const wrongPath = `/api/workspaces/${personalWorkspaceId}/categories/${pet.id}`;

      await browser.patch(wrongPath).send({ name: 'Roubada' }).expect(404);
      await browser.delete(wrongPath).expect(404);
      expect(await list(browser, houseId)).toContainEqual(pet);
    });

    it('RLS: a query by the API role WITHOUT a workspace filter sees only the bound workspace', async () => {
      const mariaUser = await t.signUp(maria);
      const joaoUser = await t.signUp(joao);

      // No `where` at all: only the database stands between the two workspaces.
      const unbound = await t.prisma.category.findMany();
      const bound = await t.prisma.forWorkspace(mariaUser.personalWorkspaceId).category.findMany();

      expect(unbound).toEqual([]);
      expect(bound).toHaveLength(defaultCount);
      expect(bound.every((row) => row.workspaceId === mariaUser.personalWorkspaceId)).toBe(true);
      await expect(
        t.prisma.forWorkspace(mariaUser.personalWorkspaceId).category.create({
          data: { workspaceId: joaoUser.personalWorkspaceId, name: 'Intrusa', type: 'DEBIT' },
        }),
      ).rejects.toThrow(/row-level security/);
    });
  });
});
