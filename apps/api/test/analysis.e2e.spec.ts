import {
  analysisSchema,
  categoryListResponseSchema,
  workspaceSchema,
  type CreateTransactionInput,
  type TransactionType,
} from '@financas/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './app.js';
import { resetDatabase } from './db.js';
import { expectHiddenFromOutsiders, type WorkspaceRoute } from './isolation.js';

// Sums of a range of competências (ADR 0037). How the page shapes them is tested in
// packages/shared/src/analysis.spec.ts; here, that the route sums the right transactions of the
// right workspace and range. All data here is fictitious (ADR 0019).
const maria = { name: 'Maria Exemplo', email: 'maria@example.com', password: 'senha-de-teste-123' };
const joao = { name: 'João Exemplo', email: 'joao@example.com', password: 'senha-de-teste-456' };

const analysisRoutes: WorkspaceRoute[] = [
  { method: 'get', path: (id) => `/api/workspaces/${id}/analysis?from=2026-01&to=2026-10` },
];

describe('analysis', () => {
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

  async function analysis(browser: Browser, workspaceId: string, from: string, to: string) {
    const response = await browser
      .get(`/api/workspaces/${workspaceId}/analysis?from=${from}&to=${to}`)
      .expect(200);
    return analysisSchema.parse(response.body);
  }

  it('sums each competência, type and category of the range, planned and settled', async () => {
    const { browser, personalWorkspaceId: id } = await t.signUp(maria);
    const categoryId = await categoryIds(browser, id);
    const mercado = categoryId('Mercado', 'DEBIT');
    const salario = categoryId('Salário', 'CREDIT');
    const debit = (period: string, amountCents: number, settledAt: string | null) =>
      create(browser, id, {
        type: 'DEBIT',
        description: 'Compras',
        categoryId: mercado,
        amountCents,
        period,
        settledAt,
      });
    await debit('2026-09', 40_000, '2026-09-05');
    await debit('2026-09', 25_000, null);
    await debit('2026-10', 30_000, '2026-10-03');
    await create(browser, id, {
      type: 'CREDIT',
      description: 'Salário',
      categoryId: salario,
      amountCents: 500_000,
      period: '2026-10',
      settledAt: '2026-10-05',
    });
    // Outside the range: not counted.
    await debit('2026-08', 99_000, null);

    const result = await analysis(browser, id, '2026-09', '2026-10');

    expect(result).toEqual({
      from: '2026-09',
      to: '2026-10',
      rows: [
        {
          period: '2026-09',
          type: 'DEBIT',
          categoryId: mercado,
          plannedCents: 65_000,
          settledCents: 40_000,
        },
        {
          period: '2026-10',
          type: 'CREDIT',
          categoryId: salario,
          plannedCents: 500_000,
          settledCents: 500_000,
        },
        {
          period: '2026-10',
          type: 'DEBIT',
          categoryId: mercado,
          plannedCents: 30_000,
          settledCents: 30_000,
        },
      ],
    });
  });

  it('a range without transactions has no rows', async () => {
    const { browser, personalWorkspaceId: id } = await t.signUp(maria);

    expect(await analysis(browser, id, '2025-01', '2026-12')).toEqual({
      from: '2025-01',
      to: '2026-12',
      rows: [],
    });
  });

  it('a VIEWER sees the analysis', async () => {
    const owner = await t.signUp(maria);
    const created = await owner.browser.post('/api/workspaces').send({ name: 'Casa' }).expect(201);
    const workspaceId = workspaceSchema.parse(created.body).id;
    const viewer = await t.signUp(joao);
    await t.prisma.member.create({ data: { workspaceId, userId: viewer.userId, role: 'VIEWER' } });

    expect(await analysis(viewer.browser, workspaceId, '2026-01', '2026-10')).toMatchObject({
      rows: [],
    });
  });

  it('refuses a reversed range and one longer than 24 competências', async () => {
    const { browser, personalWorkspaceId: id } = await t.signUp(maria);
    const base = `/api/workspaces/${id}/analysis`;

    const reversed = await browser.get(`${base}?from=2026-10&to=2026-09`).expect(400);
    expect(reversed.body).toMatchObject({
      code: 'INVALID_INPUT',
      message: 'A competência inicial precisa vir antes da final.',
    });
    const tooLong = await browser.get(`${base}?from=2024-01&to=2026-10`).expect(400);
    expect(tooLong.body).toMatchObject({ message: 'Escolha no máximo 24 competências.' });
    await browser.get(`${base}?from=2026-13&to=2026-10`).expect(400);
    await browser.get(base).expect(400);
  });

  describe('isolation', () => {
    it('hides the route from non-members', async () => {
      const { personalWorkspaceId } = await t.signUp(maria);

      await expectHiddenFromOutsiders(t, personalWorkspaceId, analysisRoutes);
    });

    it("never sums another workspace's transactions", async () => {
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

      const joaoAnalysis = await analysis(
        joaoUser.browser,
        joaoUser.personalWorkspaceId,
        '2026-01',
        '2026-10',
      );

      expect(joaoAnalysis.rows).toEqual([]);
    });
  });
});
