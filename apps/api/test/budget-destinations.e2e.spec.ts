import {
  budgetDestinationListResponseSchema,
  budgetDestinationSchema,
  categoryListResponseSchema,
  currentPeriod,
  workspaceSchema,
} from '@financas/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './app.js';
import { resetDatabase } from './db.js';
import { expectHiddenFromOutsiders, type WorkspaceRoute } from './isolation.js';

// Destinations of the budget, each saving one with its own debit category (ADR 0047).
// All data here is fictitious (ADR 0019).
const maria = { name: 'Maria Exemplo', email: 'maria@example.com', password: 'senha-de-teste-123' };
const joao = { name: 'João Exemplo', email: 'joao@example.com', password: 'senha-de-teste-456' };

const SOME_ID = '01920000-0000-7000-8000-000000000000';

const destinationRoutes: WorkspaceRoute[] = [
  { method: 'get', path: (id) => `/api/workspaces/${id}/budget-destinations` },
  {
    method: 'post',
    path: (id) => `/api/workspaces/${id}/budget-destinations`,
    body: { name: 'Intrusa' },
  },
  {
    method: 'patch',
    path: (id) => `/api/workspaces/${id}/budget-destinations/${SOME_ID}`,
    body: { archived: true },
  },
  { method: 'delete', path: (id) => `/api/workspaces/${id}/budget-destinations/${SOME_ID}` },
];

describe('budget destinations', () => {
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

  async function setup() {
    const signedUp = await t.signUp(maria);
    return { ...signedUp, base: `/api/workspaces/${signedUp.personalWorkspaceId}` };
  }

  async function destinations(browser: Browser, base: string) {
    const response = await browser.get(`${base}/budget-destinations`).expect(200);
    return budgetDestinationListResponseSchema.parse(response.body);
  }

  async function categories(browser: Browser, base: string) {
    const response = await browser.get(`${base}/categories`).expect(200);
    return categoryListResponseSchema.parse(response.body);
  }

  async function create(browser: Browser, base: string, name: string) {
    const response = await browser.post(`${base}/budget-destinations`).send({ name }).expect(201);
    return budgetDestinationSchema.parse(response.body);
  }

  it('gives every new workspace Despesas and three saving destinations, each with its category', async () => {
    const { browser, base } = await setup();

    const list = await destinations(browser, base);

    expect(list.map(({ name, kind, position }) => ({ name, kind, position }))).toEqual([
      { name: 'Despesas', kind: 'EXPENSES', position: 0 },
      { name: 'Investimentos', kind: 'SAVINGS', position: 1 },
      { name: 'Reserva de emergência', kind: 'SAVINGS', position: 2 },
      { name: 'Viagens', kind: 'SAVINGS', position: 3 },
    ]);
    expect(list[0]!.categoryId).toBeNull();
    const debitCategories = (await categories(browser, base)).filter((c) => c.type === 'DEBIT');
    for (const destination of list.slice(1)) {
      expect(debitCategories.find((c) => c.id === destination.categoryId)).toMatchObject({
        name: destination.name,
        // The categories list says whose it is, so the page can mark it.
        destinationId: destination.id,
      });
    }
    expect(debitCategories.find((c) => c.name === 'Mercado')?.destinationId).toBeNull();
    // The expense category "Viagem" (spending on a trip) stays apart from "Viagens".
    expect(debitCategories.some((c) => c.name === 'Viagem')).toBe(true);
  });

  it('gives a new shared workspace its defaults too', async () => {
    const { browser } = await setup();
    const created = await browser.post('/api/workspaces').send({ name: 'Casa' }).expect(201);
    const base = `/api/workspaces/${workspaceSchema.parse(created.body).id}`;

    expect((await destinations(browser, base)).map((d) => d.name)).toEqual([
      'Despesas',
      'Investimentos',
      'Reserva de emergência',
      'Viagens',
    ]);
  });

  it('creates a saving destination last, with its debit category of the same name', async () => {
    const { browser, base } = await setup();

    const reforma = await create(browser, base, 'Reforma');

    expect(reforma).toMatchObject({ name: 'Reforma', kind: 'SAVINGS', position: 4 });
    const category = (await categories(browser, base)).find((c) => c.id === reforma.categoryId);
    expect(category).toMatchObject({ name: 'Reforma', type: 'DEBIT', archived: false });
  });

  it('refuses a name already taken by a destination or by a debit category', async () => {
    const { browser, base } = await setup();

    const sameDestination = await browser
      .post(`${base}/budget-destinations`)
      .send({ name: 'investimentos' })
      .expect(409);
    expect(sameDestination.body).toMatchObject({ code: 'DESTINATION_EXISTS' });
    const sameCategory = await browser
      .post(`${base}/budget-destinations`)
      .send({ name: 'Mercado' })
      .expect(409);
    expect(sameCategory.body).toMatchObject({ code: 'CATEGORY_EXISTS' });
  });

  it('renames and archives a destination together with its category', async () => {
    const { browser, base } = await setup();
    const reforma = await create(browser, base, 'Reforma');

    const changed = await browser
      .patch(`${base}/budget-destinations/${reforma.id}`)
      .send({ name: 'Reforma da cozinha', archived: true })
      .expect(200);

    expect(budgetDestinationSchema.parse(changed.body)).toMatchObject({
      name: 'Reforma da cozinha',
      archived: true,
    });
    const category = (await categories(browser, base)).find((c) => c.id === reforma.categoryId);
    expect(category).toMatchObject({ name: 'Reforma da cozinha', archived: true });
  });

  it('keeps Despesas fixed', async () => {
    const { browser, base } = await setup();
    const despesas = (await destinations(browser, base))[0]!;

    // Each request is built when it runs: supertest starts it as soon as it is created.
    for (const request of [
      () => browser.patch(`${base}/budget-destinations/${despesas.id}`).send({ name: 'Gastos' }),
      () => browser.patch(`${base}/budget-destinations/${despesas.id}`).send({ archived: true }),
      () => browser.delete(`${base}/budget-destinations/${despesas.id}`),
    ]) {
      const response = await request().expect(409);
      expect(response.body).toMatchObject({ code: 'DESTINATION_FIXED' });
    }
  });

  it('deletes an unused destination with its category, and refuses one in use', async () => {
    const { browser, base } = await setup();
    const reforma = await create(browser, base, 'Reforma');
    const viagens = (await destinations(browser, base)).find((d) => d.name === 'Viagens')!;
    await browser
      .post(`${base}/transactions`)
      .send({
        type: 'DEBIT',
        description: 'Guardar para as férias',
        categoryId: viagens.categoryId,
        amountCents: 30_000,
        period: currentPeriod(),
      })
      .expect(201);

    // The list says which ones were applied to: only the others can be deleted.
    const listed = await destinations(browser, base);
    expect(listed.find((d) => d.id === viagens.id)?.inUse).toBe(true);
    expect(listed.find((d) => d.id === reforma.id)?.inUse).toBe(false);
    await browser.delete(`${base}/budget-destinations/${reforma.id}`).expect(204);
    const inUse = await browser.delete(`${base}/budget-destinations/${viagens.id}`).expect(409);

    expect(inUse.body).toMatchObject({ code: 'DESTINATION_IN_USE' });
    const names = (await destinations(browser, base)).map((d) => d.name);
    expect(names).not.toContain('Reforma');
    expect(names).toContain('Viagens');
    const categoryIds = (await categories(browser, base)).map((c) => c.id);
    expect(categoryIds).not.toContain(reforma.categoryId);
    expect(categoryIds).toContain(viagens.categoryId);
  });

  it("refuses to change a destination's category through the categories routes", async () => {
    const { browser, base } = await setup();
    const investimentos = (await destinations(browser, base))[1]!;

    for (const request of [
      () => browser.patch(`${base}/categories/${investimentos.categoryId}`).send({ name: 'Outra' }),
      () => browser.delete(`${base}/categories/${investimentos.categoryId}`),
    ]) {
      const response = await request().expect(409);
      expect(response.body).toMatchObject({ code: 'CATEGORY_OF_DESTINATION' });
    }
  });

  it('deletes the destinations along with a deleted shared workspace', async () => {
    const { browser } = await setup();
    const created = await browser.post('/api/workspaces').send({ name: 'Casa' }).expect(201);
    const workspaceId = workspaceSchema.parse(created.body).id;

    await browser.delete(`/api/workspaces/${workspaceId}`).expect(204);
  });

  it('hides the routes from outsiders', async () => {
    const { personalWorkspaceId } = await setup();

    await expectHiddenFromOutsiders(t, personalWorkspaceId, destinationRoutes);
  });

  it('lets a VIEWER read the destinations but not change them', async () => {
    const owner = await t.signUp(maria);
    const created = await owner.browser.post('/api/workspaces').send({ name: 'Casa' }).expect(201);
    const workspaceId = workspaceSchema.parse(created.body).id;
    const viewer = await t.signUp(joao);
    await t.prisma.member.create({
      data: { workspaceId, userId: viewer.userId, role: 'VIEWER' },
    });
    const base = `/api/workspaces/${workspaceId}`;

    await viewer.browser.get(`${base}/budget-destinations`).expect(200);
    await viewer.browser.post(`${base}/budget-destinations`).send({ name: 'Reforma' }).expect(403);
  });
});
