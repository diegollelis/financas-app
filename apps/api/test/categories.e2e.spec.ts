import {
  DEFAULT_BUDGET_DESTINATIONS,
  CATEGORY_USAGE_MONTHS,
  categoryListResponseSchema,
  categorySchema,
  currentPeriod,
  shiftPeriod,
  workspaceSchema,
} from '@financas/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES } from '../src/categories/default-categories.js';
import { createTestApp } from './app.js';
import { resetDatabase } from './db.js';
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

  describe('recent uses', () => {
    it('counts each category’s transactions in the last months, for the "Mais usadas" group', async () => {
      const { browser, personalWorkspaceId } = await t.signUp(maria);
      const before = await list(browser, personalWorkspaceId);
      expect(before.every((category) => category.recentUses === 0)).toBe(true);
      const mercado = before.find((category) => category.name === 'Mercado')!;
      const energia = before.find((category) => category.name === 'Energia')!;
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

      const response = await copy(browser, houseId, {
        sourceWorkspaceId: personalWorkspaceId,
        categoryIds: [pet.id, aluguel.id],
      }).expect(201);

      expect(response.body).toEqual({ copied: 2, skipped: 0 });
      const house = await list(browser, houseId);
      expect(house).toContainEqual(expect.objectContaining({ name: 'Pet', type: 'DEBIT' }));
      expect(house).toContainEqual(
        expect.objectContaining({ name: 'Aluguel recebido', type: 'CREDIT', archived: false }),
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
