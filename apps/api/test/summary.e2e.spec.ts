import {
  categoryListResponseSchema,
  summarySchema,
  workspaceSchema,
  type CreateTransactionInput,
  type TransactionType,
} from '@financas/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './app.js';
import { resetDatabase } from './db.js';
import { expectHiddenFromOutsiders, type WorkspaceRoute } from './isolation.js';

// The month's dashboard (ADR 0031). The formulas are tested in packages/shared/src/summary.spec.ts;
// here, that the route reads the right competência of the right workspace.
// All data here is fictitious (ADR 0019).
const maria = { name: 'Maria Exemplo', email: 'maria@example.com', password: 'senha-de-teste-123' };
const joao = { name: 'João Exemplo', email: 'joao@example.com', password: 'senha-de-teste-456' };

const summaryRoutes: WorkspaceRoute[] = [
  { method: 'get', path: (id) => `/api/workspaces/${id}/summary/2026-10` },
];

describe('summary', () => {
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

  async function categoryIds(browser: Browser, workspaceId: string) {
    const response = await browser.get(`/api/workspaces/${workspaceId}/categories`).expect(200);
    const categories = categoryListResponseSchema.parse(response.body);
    return (name: string, type: TransactionType) => {
      const found = categories.find((category) => category.name === name && category.type === type);
      if (!found) throw new Error(`No category ${name} (${type})`);
      return found.id;
    };
  }

  async function create(browser: Browser, workspaceId: string, input: CreateTransactionInput) {
    await browser.post(`/api/workspaces/${workspaceId}/transactions`).send(input).expect(201);
  }

  async function summary(browser: Browser, workspaceId: string, period: string) {
    const response = await browser
      .get(`/api/workspaces/${workspaceId}/summary/${period}`)
      .expect(200);
    return summarySchema.parse(response.body);
  }

  it('sums the competência with its budget, and nothing from other months', async () => {
    const { browser, personalWorkspaceId: id } = await t.signUp(maria);
    const categoryId = await categoryIds(browser, id);
    await browser
      .put(`/api/workspaces/${id}/budget/2026-10`)
      .send({
        netIncomeCents: 500_000,
        grossIncomeCents: null,
        expensesBp: 6_000,
        investmentsBp: 2_000,
        emergencyReserveBp: 1_500,
        travelBp: 500,
      })
      .expect(200);
    await create(browser, id, {
      type: 'CREDIT',
      description: 'Salário',
      categoryId: categoryId('Salário', 'CREDIT'),
      amountCents: 500_000,
      period: '2026-10',
      settledAt: '2026-10-05',
    });
    await create(browser, id, {
      type: 'DEBIT',
      description: 'Conta de luz',
      categoryId: categoryId('Energia', 'DEBIT'),
      amountCents: 15_990,
      period: '2026-10',
      // Long past whatever day the test runs: overdue is judged by the server's today.
      dueDate: '2000-01-10',
    });
    await create(browser, id, {
      type: 'DEBIT',
      description: 'Mercado de novembro',
      categoryId: categoryId('Mercado', 'DEBIT'),
      amountCents: 40_000,
      period: '2026-11',
    });

    const october = await summary(browser, id, '2026-10');

    expect(october.credits).toMatchObject({ totalCents: 500_000, settledCents: 500_000 });
    expect(october.debits).toEqual({
      totalCents: 15_990,
      settledCents: 0,
      pendingCents: 15_990,
      overdueCents: 15_990,
      overdueCount: 1,
    });
    expect(october.balance).toEqual({ plannedCents: 484_010, settledCents: 500_000 });
    expect(october.budget).toMatchObject({ source: 'SAVED', netIncomeCents: 500_000 });
    expect(october.expensesLeftCents).toBe(300_000 - 15_990);
  });

  it('an empty competência is all zeros, with the inherited or default budget', async () => {
    const { browser, personalWorkspaceId: id } = await t.signUp(maria);

    const empty = await summary(browser, id, '2026-10');

    expect(empty.budget.source).toBe('DEFAULT');
    expect(empty.balance).toEqual({ plannedCents: 0, settledCents: 0 });
    expect(empty.result).toEqual({ plannedCents: 0, settledCents: 0 });
  });

  it('a VIEWER sees the dashboard', async () => {
    const owner = await t.signUp(maria);
    const created = await owner.browser.post('/api/workspaces').send({ name: 'Casa' }).expect(201);
    const workspaceId = workspaceSchema.parse(created.body).id;
    const viewer = await t.signUp(joao);
    await t.prisma.member.create({ data: { workspaceId, userId: viewer.userId, role: 'VIEWER' } });

    expect(await summary(viewer.browser, workspaceId, '2026-10')).toMatchObject({
      period: '2026-10',
    });
  });

  it('refuses an invalid competência in the address', async () => {
    const { browser, personalWorkspaceId: id } = await t.signUp(maria);

    const response = await browser.get(`/api/workspaces/${id}/summary/2026-13`).expect(400);

    expect(response.body).toMatchObject({ message: 'Use uma competência no formato AAAA-MM.' });
  });

  describe('isolation', () => {
    it('hides the route from non-members', async () => {
      const { personalWorkspaceId } = await t.signUp(maria);

      await expectHiddenFromOutsiders(t, personalWorkspaceId, summaryRoutes);
    });

    it("never counts another workspace's transactions", async () => {
      const mariaUser = await t.signUp(maria);
      const categoryId = await categoryIds(mariaUser.browser, mariaUser.personalWorkspaceId);
      await create(mariaUser.browser, mariaUser.personalWorkspaceId, {
        type: 'CREDIT',
        description: 'Salário',
        categoryId: categoryId('Salário', 'CREDIT'),
        amountCents: 500_000,
        period: '2026-10',
      });
      const joaoUser = await t.signUp(joao);

      const joaoSummary = await summary(joaoUser.browser, joaoUser.personalWorkspaceId, '2026-10');

      expect(joaoSummary.credits.totalCents).toBe(0);
    });
  });
});
