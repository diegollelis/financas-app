import { budgetSchema, DEFAULT_BUDGET_SHARES, workspaceSchema } from '@financas/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './app.js';
import { resetDatabase } from './db.js';
import { expectHiddenFromOutsiders, type WorkspaceRoute } from './isolation.js';

// Budget configuration per competência (ADR 0030). All data here is fictitious (ADR 0019).
const maria = { name: 'Maria Exemplo', email: 'maria@example.com', password: 'senha-de-teste-123' };
const joao = { name: 'João Exemplo', email: 'joao@example.com', password: 'senha-de-teste-456' };

const september = {
  netIncomeCents: 500_000,
  grossIncomeCents: 650_000,
  expensesBp: 5_000,
  investmentsBp: 2_500,
  emergencyReserveBp: 1_500,
  travelBp: 1_000,
};

const budgetRoutes: WorkspaceRoute[] = [
  { method: 'get', path: (id) => `/api/workspaces/${id}/budget/2026-10` },
  { method: 'put', path: (id) => `/api/workspaces/${id}/budget/2026-10`, body: september },
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

  it('without anything saved, shows the spreadsheet defaults', async () => {
    const { browser, personalWorkspaceId } = await t.signUp(maria);

    expect(await get(browser, personalWorkspaceId, '2026-10')).toEqual({
      period: '2026-10',
      netIncomeCents: 0,
      grossIncomeCents: null,
      ...DEFAULT_BUDGET_SHARES,
      source: 'DEFAULT',
      inheritedFrom: null,
    });
  });

  it('saves a competência, and later ones inherit it until they save their own', async () => {
    const { browser, personalWorkspaceId: id } = await t.signUp(maria);

    expect(await save(browser, id, '2026-09', september)).toEqual({
      period: '2026-09',
      ...september,
      source: 'SAVED',
      inheritedFrom: null,
    });
    expect(await get(browser, id, '2026-12')).toEqual({
      period: '2026-12',
      ...september,
      source: 'INHERITED',
      inheritedFrom: '2026-09',
    });

    const november = { ...september, netIncomeCents: 520_000 };
    await save(browser, id, '2026-11', november);

    expect(await get(browser, id, '2026-10')).toMatchObject({ inheritedFrom: '2026-09' });
    expect(await get(browser, id, '2026-12')).toMatchObject({
      netIncomeCents: 520_000,
      inheritedFrom: '2026-11',
    });
    // Earlier competências are not affected: inheritance only goes forward.
    expect(await get(browser, id, '2026-08')).toMatchObject({ source: 'DEFAULT' });
  });

  it('reading never writes: an inherited competência follows a fix to the one it comes from', async () => {
    const { browser, personalWorkspaceId: id } = await t.signUp(maria);
    await save(browser, id, '2026-09', september);
    await get(browser, id, '2026-10');

    await save(browser, id, '2026-09', { ...september, travelBp: 500 });

    expect(await get(browser, id, '2026-10')).toMatchObject({ travelBp: 500 });
    expect(await t.prisma.forWorkspace(id).budgetConfig.count()).toBe(1);
  });

  it('saving again replaces the competência', async () => {
    const { browser, personalWorkspaceId: id } = await t.signUp(maria);
    await save(browser, id, '2026-10', september);

    const saved = await save(browser, id, '2026-10', { ...september, grossIncomeCents: null });

    expect(saved).toMatchObject({ grossIncomeCents: null, source: 'SAVED' });
  });

  it('refuses percentages adding up to more than 100%', async () => {
    const { browser, personalWorkspaceId: id } = await t.signUp(maria);

    const response = await browser
      .put(`/api/workspaces/${id}/budget/2026-10`)
      .send({ ...september, travelBp: 1_001 })
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'INVALID_INPUT',
      message: 'A soma dos percentuais não pode passar de 100%.',
    });
  });

  it('refuses an invalid competência in the address', async () => {
    const { browser, personalWorkspaceId: id } = await t.signUp(maria);

    const response = await browser.get(`/api/workspaces/${id}/budget/2026-13`).expect(400);

    expect(response.body).toMatchObject({ message: 'Use uma competência no formato AAAA-MM.' });
  });

  it('the database itself refuses percentages adding up to more than 100%', async () => {
    const { personalWorkspaceId: workspaceId } = await t.signUp(maria);

    const write = t.prisma.forWorkspace(workspaceId).budgetConfig.create({
      data: { workspaceId, period: '2026-10', ...september, expensesBp: 6_000 },
    });

    await expect(write).rejects.toThrow(/budget_configs_shares_valid/);
  });

  it('a VIEWER reads but cannot save', async () => {
    const owner = await t.signUp(maria);
    const created = await owner.browser.post('/api/workspaces').send({ name: 'Casa' }).expect(201);
    const workspaceId = workspaceSchema.parse(created.body).id;
    await save(owner.browser, workspaceId, '2026-10', september);
    const viewer = await t.signUp(joao);
    await t.prisma.member.create({ data: { workspaceId, userId: viewer.userId, role: 'VIEWER' } });

    expect(await get(viewer.browser, workspaceId, '2026-10')).toMatchObject({ source: 'SAVED' });
    await viewer.browser
      .put(`/api/workspaces/${workspaceId}/budget/2026-10`)
      .send(september)
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
      await save(mariaUser.browser, mariaUser.personalWorkspaceId, '2026-09', september);

      expect(await get(joaoUser.browser, joaoUser.personalWorkspaceId, '2026-10')).toMatchObject({
        source: 'DEFAULT',
      });
      // RLS: a query by the API role without any filter sees nothing outside a workspace.
      expect(await t.prisma.budgetConfig.findMany()).toEqual([]);
    });
  });
});
