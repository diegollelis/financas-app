import {
  categoryListResponseSchema,
  importListResponseSchema,
  importSchema,
  MAX_IMPORT_TRANSACTIONS,
  transactionListResponseSchema,
  type CreateTransactionInput,
  type TransactionType,
} from '@financas/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './app.js';
import { resetDatabase } from './db.js';
import { expectHiddenFromOutsiders, type WorkspaceRoute } from './isolation.js';

// Importação da planilha (ADR 0040): the browser sends the confirmed transactions; the API
// creates them all or none, and undoing deletes them. All data here is fictitious (ADR 0019).
const maria = { name: 'Maria Exemplo', email: 'maria@example.com', password: 'senha-de-teste-123' };
const joao = { name: 'João Exemplo', email: 'joao@example.com', password: 'senha-de-teste-456' };

const importRoutes: WorkspaceRoute[] = [
  { method: 'get', path: (id) => `/api/workspaces/${id}/imports` },
  { method: 'post', path: (id) => `/api/workspaces/${id}/imports`, body: {} },
  {
    method: 'delete',
    path: (id) => `/api/workspaces/${id}/imports/01920000-0000-7000-8000-000000000999`,
  },
];

describe('imports', () => {
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

  async function setUp() {
    const user = await t.signUp(maria);
    const base = `/api/workspaces/${user.personalWorkspaceId}`;
    const categories = categoryListResponseSchema.parse(
      (await user.browser.get(`${base}/categories`).expect(200)).body,
    );
    const categoryId = (name: string, type: TransactionType) => {
      const found = categories.find((category) => category.name === name && category.type === type);
      if (!found) throw new Error(`No category ${name} (${type})`);
      return found.id;
    };
    /** Two months of a fictitious spreadsheet: a salary and a settled grocery bill each. */
    const rows: CreateTransactionInput[] = ['2026-08', '2026-09'].flatMap((period) => [
      {
        type: 'CREDIT',
        description: 'Salário',
        categoryId: categoryId('Salário', 'CREDIT'),
        amountCents: 520_000,
        period,
        dueDate: `${period}-05`,
        settledAt: `${period}-05`,
      },
      {
        type: 'DEBIT',
        description: 'Supermercado',
        notes: 'Importado da planilha',
        categoryId: categoryId('Mercado', 'DEBIT'),
        amountCents: 64_035,
        period,
        dueDate: null,
        settledAt: null,
      },
    ]);
    const transactionsOf = async (period: string) =>
      transactionListResponseSchema.parse(
        (await user.browser.get(`${base}/transactions?period=${period}`).expect(200)).body,
      );
    return { ...user, base, categoryId, rows, transactionsOf };
  }

  it('creates every transaction of the import, and lists it', async () => {
    const { browser, base, rows, transactionsOf } = await setUp();

    const created = importSchema.parse(
      (await browser.post(`${base}/imports`).send({ transactions: rows }).expect(201)).body,
    );

    expect(created).toMatchObject({
      transactionCount: 4,
      firstPeriod: '2026-08',
      lastPeriod: '2026-09',
      createdBy: { name: maria.name },
    });
    const august = await transactionsOf('2026-08');
    expect(august.map((transaction) => transaction.description).sort()).toEqual([
      'Salário',
      'Supermercado',
    ]);
    expect(august.find((transaction) => transaction.type === 'CREDIT')).toMatchObject({
      amountCents: 520_000,
      dueDate: '2026-08-05',
      settledAt: '2026-08-05',
    });
    expect(august.find((transaction) => transaction.type === 'DEBIT')).toMatchObject({
      notes: 'Importado da planilha',
      settledAt: null,
    });

    const list = importListResponseSchema.parse(
      (await browser.get(`${base}/imports`).expect(200)).body,
    );
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(created.id);
  });

  it('refuses the whole batch when one category is of the wrong type, saving nothing', async () => {
    const { browser, base, rows, categoryId, transactionsOf } = await setUp();
    const wrong = { ...rows[1]!, categoryId: categoryId('Salário', 'CREDIT') };

    const response = await browser
      .post(`${base}/imports`)
      .send({ transactions: [...rows, wrong] })
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'INVALID_CATEGORY',
      message: 'A categoria Salário é de crédito.',
    });
    expect(await transactionsOf('2026-08')).toHaveLength(0);
    expect((await browser.get(`${base}/imports`).expect(200)).body).toEqual([]);
  });

  it('refuses a category of another workspace', async () => {
    const { browser, base, rows } = await setUp();
    const other = await t.signUp(joao);
    const otherCategories = categoryListResponseSchema.parse(
      (
        await other.browser
          .get(`/api/workspaces/${other.personalWorkspaceId}/categories`)
          .expect(200)
      ).body,
    );
    const foreign = otherCategories.find((category) => category.type === 'DEBIT')!;

    const response = await browser
      .post(`${base}/imports`)
      .send({ transactions: [{ ...rows[1]!, categoryId: foreign.id }] })
      .expect(400);

    expect(response.body).toMatchObject({ code: 'INVALID_CATEGORY' });
  });

  it('validates every transaction with the shared rules', async () => {
    const { browser, base, rows } = await setUp();

    const zero = await browser
      .post(`${base}/imports`)
      .send({ transactions: [{ ...rows[0]!, amountCents: 0 }] })
      .expect(400);
    expect(zero.body).toMatchObject({ code: 'INVALID_INPUT' });

    await browser.post(`${base}/imports`).send({ transactions: [] }).expect(400);
  });

  it('takes a whole spreadsheet at once (beyond the default body limit), up to the maximum', async () => {
    const { browser, base, rows } = await setUp();
    // Long texts, as a real spreadsheet may have: far beyond Express's default 100 KB.
    const row = { ...rows[1]!, description: 'D'.repeat(200), notes: 'N'.repeat(500) };
    const full = Array.from({ length: MAX_IMPORT_TRANSACTIONS }, () => row);

    const created = await browser.post(`${base}/imports`).send({ transactions: full }).expect(201);
    expect(created.body).toMatchObject({ transactionCount: MAX_IMPORT_TRANSACTIONS });

    const response = await browser
      .post(`${base}/imports`)
      .send({ transactions: [...full, row] })
      .expect(400);
    expect(response.body).toMatchObject({
      message: `Importe no máximo ${MAX_IMPORT_TRANSACTIONS} lançamentos de uma vez.`,
    });
  });

  it('keeps the default body limit on the other routes', async () => {
    const { browser, base, rows } = await setUp();

    await browser
      .post(`${base}/transactions`)
      .send({ ...rows[1]!, notes: 'N'.repeat(200_000) })
      .expect(413);
  });

  it('undoes an import: only its transactions go, also those changed since', async () => {
    const { browser, base, rows, transactionsOf } = await setUp();
    const created = importSchema.parse(
      (await browser.post(`${base}/imports`).send({ transactions: rows }).expect(201)).body,
    );
    // One typed by hand in the same month stays; one imported and then settled still goes.
    await browser
      .post(`${base}/transactions`)
      .send({ ...rows[1]!, description: 'Farmácia', notes: null })
      .expect(201);
    const imported = (await transactionsOf('2026-08')).find(
      (tx) => tx.description === 'Supermercado',
    )!;
    await browser
      .patch(`${base}/transactions/${imported.id}`)
      .send({ settledAt: '2026-08-20' })
      .expect(200);

    await browser.delete(`${base}/imports/${created.id}`).expect(204);

    expect((await transactionsOf('2026-08')).map((tx) => tx.description)).toEqual(['Farmácia']);
    expect(await transactionsOf('2026-09')).toHaveLength(0);
    expect((await browser.get(`${base}/imports`).expect(200)).body).toEqual([]);
    await browser.delete(`${base}/imports/${created.id}`).expect(404);
    await browser.delete(`${base}/imports/nao-e-um-id`).expect(404);
  });

  it('a VIEWER sees the imports but does not import nor undo', async () => {
    const { browser, base, rows, personalWorkspaceId } = await setUp();
    const created = importSchema.parse(
      (await browser.post(`${base}/imports`).send({ transactions: rows }).expect(201)).body,
    );
    const viewer = await t.signUp(joao);
    await t.prisma.member.create({
      data: { workspaceId: personalWorkspaceId, userId: viewer.userId, role: 'VIEWER' },
    });

    await viewer.browser.get(`${base}/imports`).expect(200);
    await viewer.browser.post(`${base}/imports`).send({ transactions: rows }).expect(403);
    await viewer.browser.delete(`${base}/imports/${created.id}`).expect(403);
  });

  it('is hidden from outsiders', async () => {
    const { personalWorkspaceId } = await setUp();

    await expectHiddenFromOutsiders(t, personalWorkspaceId, importRoutes);
  });
});
