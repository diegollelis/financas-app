import {
  budgetDestinationListResponseSchema,
  budgetSchema,
  currentPeriod,
  shiftPeriod,
  workspaceSchema,
  type BudgetDestination,
} from '@financas/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './app.js';
import { resetDatabase } from './db.js';
import { expectHiddenFromOutsiders, type WorkspaceRoute } from './isolation.js';

// Budget per competência (ADRs 0030, 0047): the net income and one share per destination.
// All data here is fictitious (ADR 0019).
const maria = { name: 'Maria Exemplo', email: 'maria@example.com', password: 'senha-de-teste-123' };
const joao = { name: 'João Exemplo', email: 'joao@example.com', password: 'senha-de-teste-456' };

const budgetRoutes: WorkspaceRoute[] = [
  { method: 'get', path: (id) => `/api/workspaces/${id}/budget/2026-10` },
  {
    method: 'put',
    path: (id) => `/api/workspaces/${id}/budget/2026-10`,
    body: { netIncomeCents: 500_000, shares: [] },
  },
];

describe('budget', () => {
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

  async function get(browser: Browser, workspaceId: string, period: string) {
    const response = await browser
      .get(`/api/workspaces/${workspaceId}/budget/${period}`)
      .expect(200);
    return budgetSchema.parse(response.body);
  }

  async function save(browser: Browser, workspaceId: string, period: string, input: object) {
    const response = await browser
      .put(`/api/workspaces/${workspaceId}/budget/${period}`)
      .send(input)
      .expect(200);
    return budgetSchema.parse(response.body);
  }

  async function destinations(browser: Browser, workspaceId: string) {
    const response = await browser
      .get(`/api/workspaces/${workspaceId}/budget-destinations`)
      .expect(200);
    const list = budgetDestinationListResponseSchema.parse(response.body);
    const named = (name: string) => list.find((d) => d.name === name)!;
    return { list, named };
  }

  /** Despesas 50%; Investimentos 50%, Reserva 30%, Viagens 20% of what is left. */
  function september(named: (name: string) => BudgetDestination) {
    return {
      netIncomeCents: 500_000,
      shares: [
        { destinationId: named('Despesas').id, basisPoints: 5_000 },
        { destinationId: named('Investimentos').id, basisPoints: 5_000 },
        { destinationId: named('Reserva de emergência').id, basisPoints: 3_000 },
        { destinationId: named('Viagens').id, basisPoints: 2_000 },
      ],
    };
  }

  const percentages = (budget: { shares: { name: string; basisPoints: number }[] }) =>
    Object.fromEntries(budget.shares.map((share) => [share.name, share.basisPoints]));

  it('without anything saved, is empty: no default percentages (ADR 0047)', async () => {
    const { browser, personalWorkspaceId: id } = await t.signUp(maria);

    const budget = await get(browser, id, '2026-10');

    expect(budget).toMatchObject({
      period: '2026-10',
      netIncomeCents: 0,
      source: 'NONE',
      inheritedFrom: null,
    });
    expect(percentages(budget)).toEqual({
      Despesas: 0,
      Investimentos: 0,
      'Reserva de emergência': 0,
      Viagens: 0,
    });
    expect(budget.shares[0]).toMatchObject({ kind: 'EXPENSES', categoryId: null });
  });

  it('saves a competência, and later ones inherit it until they save their own', async () => {
    const { browser, personalWorkspaceId: id } = await t.signUp(maria);
    const { named } = await destinations(browser, id);

    const saved = await save(browser, id, '2026-09', september(named));
    expect(saved).toMatchObject({ netIncomeCents: 500_000, source: 'SAVED', inheritedFrom: null });
    expect(percentages(saved)).toEqual({
      Despesas: 5_000,
      Investimentos: 5_000,
      'Reserva de emergência': 3_000,
      Viagens: 2_000,
    });
    expect(await get(browser, id, '2026-12')).toMatchObject({
      period: '2026-12',
      source: 'INHERITED',
      inheritedFrom: '2026-09',
    });

    await save(browser, id, '2026-11', { ...september(named), netIncomeCents: 520_000 });

    expect(await get(browser, id, '2026-10')).toMatchObject({ inheritedFrom: '2026-09' });
    expect(await get(browser, id, '2026-12')).toMatchObject({
      netIncomeCents: 520_000,
      inheritedFrom: '2026-11',
    });
    // Earlier competências are not affected: inheritance only goes forward.
    expect(await get(browser, id, '2026-08')).toMatchObject({ source: 'NONE' });
  });

  it('a destination left out, or created after the save, has 0%', async () => {
    const { browser, personalWorkspaceId: id } = await t.signUp(maria);
    const { named } = await destinations(browser, id);
    await save(browser, id, '2026-10', {
      netIncomeCents: 500_000,
      shares: [{ destinationId: named('Despesas').id, basisPoints: 6_000 }],
    });
    await browser.post(`/api/workspaces/${id}/budget-destinations`).send({ name: 'Reforma' });

    expect(percentages(await get(browser, id, '2026-10'))).toEqual({
      Despesas: 6_000,
      Investimentos: 0,
      'Reserva de emergência': 0,
      Viagens: 0,
      Reforma: 0,
    });
  });

  it('saving again replaces the shares of the competência', async () => {
    const { browser, personalWorkspaceId: id } = await t.signUp(maria);
    const { named } = await destinations(browser, id);
    await save(browser, id, '2026-10', september(named));

    const saved = await save(browser, id, '2026-10', {
      netIncomeCents: 450_000,
      shares: [{ destinationId: named('Viagens').id, basisPoints: 10_000 }],
    });

    expect(saved.netIncomeCents).toBe(450_000);
    expect(percentages(saved)).toMatchObject({ Despesas: 0, Investimentos: 0, Viagens: 10_000 });
    expect(await t.prisma.forWorkspace(id).budgetConfig.count()).toBe(1);
  });

  it('refuses saving destinations adding up to more than 100%; Despesas has its own base', async () => {
    const { browser, personalWorkspaceId: id } = await t.signUp(maria);
    const { named } = await destinations(browser, id);

    // Despesas at 100% of the income and the saving ones at 100% of what is left: fine.
    await save(browser, id, '2026-10', {
      netIncomeCents: 500_000,
      shares: [
        { destinationId: named('Despesas').id, basisPoints: 10_000 },
        { destinationId: named('Investimentos').id, basisPoints: 10_000 },
      ],
    });
    const response = await browser
      .put(`/api/workspaces/${id}/budget/2026-10`)
      .send({
        netIncomeCents: 500_000,
        shares: [
          { destinationId: named('Investimentos').id, basisPoints: 6_000 },
          { destinationId: named('Viagens').id, basisPoints: 4_001 },
        ],
      })
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'INVALID_INPUT',
      message: 'A soma dos destinos de guardar não pode passar de 100%.',
    });
  });

  it("refuses another workspace's destination", async () => {
    const mariaUser = await t.signUp(maria);
    const joaoUser = await t.signUp(joao);
    const joaos = await destinations(joaoUser.browser, joaoUser.personalWorkspaceId);

    const response = await mariaUser.browser
      .put(`/api/workspaces/${mariaUser.personalWorkspaceId}/budget/2026-10`)
      .send({
        netIncomeCents: 500_000,
        shares: [{ destinationId: joaos.named('Despesas').id, basisPoints: 6_000 }],
      })
      .expect(400);

    expect(response.body).toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('keeps showing an archived destination that still has a share in the budget', async () => {
    const { browser, personalWorkspaceId: id } = await t.signUp(maria);
    const { named } = await destinations(browser, id);
    await save(browser, id, '2026-10', september(named));
    await browser
      .patch(`/api/workspaces/${id}/budget-destinations/${named('Viagens').id}`)
      .send({ archived: true })
      .expect(200);
    await browser
      .patch(`/api/workspaces/${id}/budget-destinations/${named('Investimentos').id}`)
      .send({ archived: true })
      .expect(200);
    await save(browser, id, '2026-11', {
      netIncomeCents: 500_000,
      shares: [{ destinationId: named('Viagens').id, basisPoints: 1_000 }],
    });

    // Investimentos is archived and has 0% in November: it is gone; Viagens still has 10%.
    expect(Object.keys(percentages(await get(browser, id, '2026-11')))).toEqual([
      'Despesas',
      'Reserva de emergência',
      'Viagens',
    ]);
  });

  it('archiving takes a destination out of the budget from this competência on, never before', async () => {
    const { browser, personalWorkspaceId: id } = await t.signUp(maria);
    const { named } = await destinations(browser, id);
    const now = currentPeriod();
    const before = shiftPeriod(now, -1);
    const later = shiftPeriod(now, 2);
    await save(browser, id, before, september(named));
    await save(browser, id, later, september(named));
    const viagens = `/api/workspaces/${id}/budget-destinations/${named('Viagens').id}`;

    await browser.patch(viagens).send({ archived: true }).expect(200);

    // An earlier competência keeps its share: its dashboard does not change.
    expect(percentages(await get(browser, id, before))).toMatchObject({ Viagens: 2_000 });
    // This one only inherited: it is saved now, the same budget without Viagens.
    const thisMonth = await get(browser, id, now);
    expect(thisMonth).toMatchObject({ source: 'SAVED', netIncomeCents: 500_000 });
    expect(percentages(thisMonth)).toEqual({
      Despesas: 5_000,
      Investimentos: 5_000,
      'Reserva de emergência': 3_000,
    });
    // A later saved one loses it too.
    expect(percentages(await get(browser, id, later))).not.toHaveProperty('Viagens');
    // Reactivated, it comes back with 0%.
    await browser.patch(viagens).send({ archived: false }).expect(200);
    expect(percentages(await get(browser, id, now))).toMatchObject({ Viagens: 0 });
  });

  it('refuses an invalid competência in the address', async () => {
    const { browser, personalWorkspaceId: id } = await t.signUp(maria);

    const response = await browser.get(`/api/workspaces/${id}/budget/2026-13`).expect(400);

    expect(response.body).toMatchObject({ message: 'Use uma competência no formato AAAA-MM.' });
  });

  it('the database itself refuses a share over 100%', async () => {
    const { browser, personalWorkspaceId: workspaceId } = await t.signUp(maria);
    const { named } = await destinations(browser, workspaceId);
    const db = t.prisma.forWorkspace(workspaceId);
    const config = await db.budgetConfig.create({
      data: { workspaceId, period: '2026-10', netIncomeCents: 500_000 },
    });

    const write = db.budgetShare.create({
      data: {
        workspaceId,
        budgetConfigId: config.id,
        destinationId: named('Despesas').id,
        basisPoints: 10_001,
      },
    });

    await expect(write).rejects.toThrow(/budget_shares_basis_points_range/);
  });

  it('a VIEWER reads but cannot save', async () => {
    const owner = await t.signUp(maria);
    const created = await owner.browser.post('/api/workspaces').send({ name: 'Casa' }).expect(201);
    const workspaceId = workspaceSchema.parse(created.body).id;
    const { named } = await destinations(owner.browser, workspaceId);
    await save(owner.browser, workspaceId, '2026-10', september(named));
    const viewer = await t.signUp(joao);
    await t.prisma.member.create({ data: { workspaceId, userId: viewer.userId, role: 'VIEWER' } });

    expect(await get(viewer.browser, workspaceId, '2026-10')).toMatchObject({ source: 'SAVED' });
    await viewer.browser
      .put(`/api/workspaces/${workspaceId}/budget/2026-10`)
      .send(september(named))
      .expect(403);
  });

  describe('isolation', () => {
    it('hides every route from non-members', async () => {
      const { personalWorkspaceId } = await t.signUp(maria);

      await expectHiddenFromOutsiders(t, personalWorkspaceId, budgetRoutes);
    });

    it("another workspace's budget is neither inherited nor visible", async () => {
      const mariaUser = await t.signUp(maria);
      const joaoUser = await t.signUp(joao);
      const { named } = await destinations(mariaUser.browser, mariaUser.personalWorkspaceId);
      await save(mariaUser.browser, mariaUser.personalWorkspaceId, '2026-09', september(named));

      expect(await get(joaoUser.browser, joaoUser.personalWorkspaceId, '2026-10')).toMatchObject({
        source: 'NONE',
      });
      // RLS: a query by the API role without any filter sees nothing outside a workspace.
      expect(await t.prisma.budgetConfig.findMany()).toEqual([]);
      expect(await t.prisma.budgetShare.findMany()).toEqual([]);
    });
  });
});
