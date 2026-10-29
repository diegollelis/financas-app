import {
  budgetDestinationListResponseSchema,
  budgetSchema,
  categoryListResponseSchema,
  categorySchema,
  periodClosingStateSchema,
  transactionSchema,
  type CreateTransactionInput,
  type TransactionType,
} from '@financas/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './app.js';
import { resetDatabase } from './db.js';
import { expectHiddenFromOutsiders, type WorkspaceRoute } from './isolation.js';

// Fechamento do mês (ADR 0063): closing and reopening a competência.
// All data here is fictitious (ADR 0019).
const maria = { name: 'Maria Exemplo', email: 'maria@example.com', password: 'senha-de-teste-123' };
const joao = { name: 'João Exemplo', email: 'joao@example.com', password: 'senha-de-teste-456' };

const periodRoutes: WorkspaceRoute[] = [
  { method: 'get', path: (id) => `/api/workspaces/${id}/periods/2026-09/closing` },
  { method: 'post', path: (id) => `/api/workspaces/${id}/periods/2026-09/close` },
  {
    method: 'post',
    path: (id) => `/api/workspaces/${id}/periods/2026-09/reopen`,
    body: { reason: 'Correção' },
  },
];

describe('periods (fechamento do mês)', () => {
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

  async function mariaReady() {
    const { browser, personalWorkspaceId: workspaceId, userId } = await t.signUp(maria);
    const response = await browser.get(`/api/workspaces/${workspaceId}/categories`).expect(200);
    const categories = categoryListResponseSchema.parse(response.body);
    const categoryId = (name: string, type: TransactionType) => {
      const found = categories.find((category) => category.name === name && category.type === type);
      if (!found) throw new Error(`No category ${name} (${type})`);
      return found.id;
    };
    const create = async (input: CreateTransactionInput) =>
      transactionSchema.parse(
        (await browser.post(`/api/workspaces/${workspaceId}/transactions`).send(input).expect(201))
          .body,
      );
    return { browser, workspaceId, userId, categoryId, create };
  }

  const base = (browser: Browser, workspaceId: string, period: string) =>
    `/api/workspaces/${workspaceId}/periods/${period}`;

  async function state(browser: Browser, workspaceId: string, period: string) {
    const response = await browser.get(`${base(browser, workspaceId, period)}/closing`).expect(200);
    return periodClosingStateSchema.parse(response.body);
  }

  it('lists what is pending, but a loan with no due date, and refuses closing with it', async () => {
    const { browser, workspaceId, categoryId, create } = await mariaReady();
    const loanCategory = categorySchema.parse(
      (
        await browser
          .post(`/api/workspaces/${workspaceId}/categories`)
          .send({ name: 'Empréstimo feito', type: 'CREDIT' })
          .expect(201)
      ).body,
    );
    await browser
      .patch(`/api/workspaces/${workspaceId}/categories/${loanCategory.id}`)
      .send({ neutral: true })
      .expect(200);
    await create({
      type: 'CREDIT',
      description: 'Ana me deve',
      categoryId: loanCategory.id,
      amountCents: 50_000,
      period: '2026-09',
    });
    const rent = await create({
      type: 'DEBIT',
      description: 'Aluguel',
      categoryId: categoryId('Moradia', 'DEBIT'),
      amountCents: 150_000,
      period: '2026-09',
      dueDate: '2026-09-10',
    });

    expect(await state(browser, workspaceId, '2026-09')).toMatchObject({
      closing: null,
      history: [],
      pending: [
        {
          id: rent.id,
          type: 'DEBIT',
          description: 'Aluguel',
          amountCents: 150_000,
          dueDate: '2026-09-10',
        },
      ],
    });
    const refused = await browser
      .post(`${base(browser, workspaceId, '2026-09')}/close`)
      .expect(409);
    expect(refused.body).toMatchObject({
      code: 'PERIOD_HAS_PENDING',
      message: 'Ainda há 1 lançamento pendente neste mês: pague ou receba antes de fechar.',
      pending: [{ id: rent.id }],
    });

    await browser
      .patch(`/api/workspaces/${workspaceId}/transactions/${rent.id}`)
      .send({ settledAt: '2026-09-10' })
      .expect(200);
    const closed = periodClosingStateSchema.parse(
      (await browser.post(`${base(browser, workspaceId, '2026-09')}/close`).expect(200)).body,
    );
    expect(closed).toMatchObject({
      closing: { period: '2026-09', closedBy: 'Maria Exemplo', reopenedAt: null },
      pending: [],
    });
    expect(closed.history).toHaveLength(1);
  });

  it('counts a recurrence month not generated yet as pending', async () => {
    const { browser, workspaceId, categoryId } = await mariaReady();
    await browser
      .post(`/api/workspaces/${workspaceId}/recurrences`)
      .send({
        type: 'DEBIT',
        description: 'Internet',
        categoryId: categoryId('Moradia', 'DEBIT'),
        amountCents: 10_000,
        dueDay: 15,
        startPeriod: '2026-08',
      })
      .expect(201);

    const refused = await browser
      .post(`${base(browser, workspaceId, '2026-09')}/close`)
      .expect(409);

    expect(refused.body).toMatchObject({
      code: 'PERIOD_HAS_PENDING',
      pending: [{ description: 'Internet', dueDate: '2026-09-15' }],
    });
  });

  it('saves an inherited budget as the month’s own, so an earlier change does not reach it', async () => {
    const { browser, workspaceId } = await mariaReady();
    const destinations = budgetDestinationListResponseSchema.parse(
      (await browser.get(`/api/workspaces/${workspaceId}/budget-destinations`).expect(200)).body,
    );
    const shares = destinations.map((destination) => ({
      destinationId: destination.id,
      basisPoints: destination.kind === 'EXPENSES' ? 6_000 : 0,
    }));
    await browser
      .put(`/api/workspaces/${workspaceId}/budget/2026-08`)
      .send({ netIncomeCents: 500_000, shares })
      .expect(200);

    await browser.post(`${base(browser, workspaceId, '2026-09')}/close`).expect(200);
    await browser
      .put(`/api/workspaces/${workspaceId}/budget/2026-08`)
      .send({ netIncomeCents: 900_000, shares })
      .expect(200);

    const september = budgetSchema.parse(
      (await browser.get(`/api/workspaces/${workspaceId}/budget/2026-09`).expect(200)).body,
    );
    expect(september).toMatchObject({ source: 'SAVED', netIncomeCents: 500_000 });
    expect(september.shares.find((share) => share.kind === 'EXPENSES')?.basisPoints).toBe(6_000);
  });

  it('refuses closing twice and reopening an open month', async () => {
    const { browser, workspaceId } = await mariaReady();

    await browser
      .post(`${base(browser, workspaceId, '2026-09')}/reopen`)
      .send({ reason: 'x' })
      .expect(409);
    await browser.post(`${base(browser, workspaceId, '2026-09')}/close`).expect(200);
    const twice = await browser.post(`${base(browser, workspaceId, '2026-09')}/close`).expect(409);

    expect(twice.body).toMatchObject({ code: 'PERIOD_ALREADY_CLOSED' });
  });

  it('reopens with a reason and keeps every closing as history', async () => {
    const { browser, workspaceId } = await mariaReady();
    await browser.post(`${base(browser, workspaceId, '2026-09')}/close`).expect(200);

    const noReason = await browser
      .post(`${base(browser, workspaceId, '2026-09')}/reopen`)
      .send({ reason: '   ' })
      .expect(400);
    expect(noReason.body).toMatchObject({ code: 'INVALID_INPUT' });
    const reopened = periodClosingStateSchema.parse(
      (
        await browser
          .post(`${base(browser, workspaceId, '2026-09')}/reopen`)
          .send({ reason: 'Faltou a conta de luz' })
          .expect(200)
      ).body,
    );
    expect(reopened).toMatchObject({
      closing: null,
      history: [{ reopenedBy: 'Maria Exemplo', reopenReason: 'Faltou a conta de luz' }],
    });

    await browser.post(`${base(browser, workspaceId, '2026-09')}/close`).expect(200);
    const again = await state(browser, workspaceId, '2026-09');
    expect(again.history).toHaveLength(2);
    expect(again.closing).toMatchObject({ reopenedAt: null });
    expect(again.history[1]).toMatchObject({ reopenReason: 'Faltou a conta de luz' });
  });

  it('lets an EDITOR close and reopen, and a VIEWER only read', async () => {
    const owner = await t.signUp(maria);
    const created = await owner.browser.post('/api/workspaces').send({ name: 'Casa' }).expect(201);
    const workspaceId = (created.body as { id: string }).id;
    const editor = await t.signUp(joao);
    await t.prisma.member.create({ data: { workspaceId, userId: editor.userId, role: 'EDITOR' } });

    await editor.browser.post(`${base(editor.browser, workspaceId, '2026-09')}/close`).expect(200);
    await editor.browser
      .post(`${base(editor.browser, workspaceId, '2026-09')}/reopen`)
      .send({ reason: 'Correção' })
      .expect(200);

    await t.prisma.member.updateMany({
      where: { workspaceId, userId: editor.userId },
      data: { role: 'VIEWER' },
    });
    await editor.browser.get(`${base(editor.browser, workspaceId, '2026-09')}/closing`).expect(200);
    await editor.browser.post(`${base(editor.browser, workspaceId, '2026-09')}/close`).expect(403);
  });

  it('hides every route from non-members', async () => {
    const { personalWorkspaceId } = await t.signUp(maria);

    await expectHiddenFromOutsiders(t, personalWorkspaceId, periodRoutes);
  });
});
