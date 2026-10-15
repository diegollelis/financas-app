import {
  categoryListResponseSchema,
  currentPeriod,
  dataExportSchema,
  recurrenceSchema,
  shiftPeriod,
  transactionListResponseSchema,
  transactionSchema,
  installmentPlanSchema,
} from '@financas/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './app.js';
import { resetDatabase } from './db.js';

// Meio de pagamento: how a transaction was paid or received (ADR 0054).
// All data here is fictitious (ADR 0019).
const maria = { name: 'Maria Exemplo', email: 'maria@example.com', password: 'senha-de-teste-123' };

describe('payment method', () => {
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

  const period = currentPeriod();
  const next = shiftPeriod(period, 1);

  async function setup() {
    const signedUp = await t.signUp(maria);
    const base = `/api/workspaces/${signedUp.personalWorkspaceId}`;
    const categories = categoryListResponseSchema.parse(
      (await signedUp.browser.get(`${base}/categories`).expect(200)).body,
    );
    const lazer = categories.find((c) => c.name === 'Lazer' && c.type === 'DEBIT')!;
    const fields = (more: object) => ({
      type: 'DEBIT',
      description: 'Compras',
      categoryId: lazer.id,
      amountCents: 10_000,
      ...more,
    });
    const transactionsOf = async (month: string) =>
      transactionListResponseSchema.parse(
        (await signedUp.browser.get(`${base}/transactions?period=${month}`).expect(200)).body,
      );
    return { ...signedUp, base, categories, fields, transactionsOf };
  }

  it('keeps it on a transaction, changes it and takes it away', async () => {
    const { browser, base, fields } = await setup();

    const created = transactionSchema.parse(
      (
        await browser
          .post(`${base}/transactions`)
          .send({ ...fields({ paymentMethod: 'PIX' }), period })
          .expect(201)
      ).body,
    );
    expect(created.paymentMethod).toBe('PIX');

    const changed = await browser
      .patch(`${base}/transactions/${created.id}`)
      .send({ paymentMethod: 'CREDIT_CARD' })
      .expect(200);
    expect(transactionSchema.parse(changed.body).paymentMethod).toBe('CREDIT_CARD');
    const removed = await browser
      .patch(`${base}/transactions/${created.id}`)
      .send({ paymentMethod: null })
      .expect(200);
    expect(transactionSchema.parse(removed.body).paymentMethod).toBeNull();
  });

  it('refuses a method out of the list', async () => {
    const { browser, base, fields } = await setup();

    const response = await browser
      .post(`${base}/transactions`)
      .send({ ...fields({ paymentMethod: 'CHEQUE' }), period })
      .expect(400);

    expect(response.body).toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('gives it to every month of a recurrence, and a change reaches the pending ones', async () => {
    const { browser, base, fields, transactionsOf } = await setup();
    const recurrence = recurrenceSchema.parse(
      (
        await browser
          .post(`${base}/recurrences`)
          .send({ ...fields({ paymentMethod: 'AUTO_DEBIT' }), startPeriod: period })
          .expect(201)
      ).body,
    );
    expect(recurrence.paymentMethod).toBe('AUTO_DEBIT');
    expect((await transactionsOf(next))[0]?.paymentMethod).toBe('AUTO_DEBIT');

    await browser
      .patch(`${base}/recurrences/${recurrence.id}`)
      .send({ paymentMethod: 'BOLETO' })
      .expect(200);

    expect((await transactionsOf(period))[0]?.paymentMethod).toBe('BOLETO');
    expect((await transactionsOf(next))[0]?.paymentMethod).toBe('BOLETO');
  });

  it('carries it when a transaction becomes recurrent', async () => {
    const { browser, base, fields, transactionsOf } = await setup();
    const launched = transactionSchema.parse(
      (
        await browser
          .post(`${base}/transactions`)
          .send({ ...fields({ paymentMethod: 'CREDIT_CARD' }), period })
          .expect(201)
      ).body,
    );

    await browser
      .post(`${base}/recurrences/from-transaction`)
      .send({ transactionId: launched.id })
      .expect(201);

    expect((await transactionsOf(next))[0]?.paymentMethod).toBe('CREDIT_CARD');
  });

  it('gives it to every installment, and never to the shares of a split', async () => {
    const { browser, base, fields, transactionsOf } = await setup();

    const plan = installmentPlanSchema.parse(
      (
        await browser
          .post(`${base}/installments`)
          .send({
            ...fields({ description: 'Geladeira', paymentMethod: 'CREDIT_CARD' }),
            installments: 2,
            amountIs: 'TOTAL',
            firstPeriod: period,
            split: [{ newPersonName: 'Ana', amountCents: 5_000 }],
          })
          .expect(201)
      ).body,
    );

    expect(plan.paymentMethod).toBe('CREDIT_CARD');
    for (const month of [period, next]) {
      const items = await transactionsOf(month);
      expect(items.find((item) => item.installment)?.paymentMethod).toBe('CREDIT_CARD');
      expect(items.find((item) => item.splitOfId)?.paymentMethod).toBeNull();
    }
  });

  it('is in the data export', async () => {
    const { browser, base, fields } = await setup();
    await browser
      .post(`${base}/transactions`)
      .send({ ...fields({ paymentMethod: 'CASH' }), period })
      .expect(201);

    const exported = dataExportSchema.parse((await browser.get('/api/me/export').expect(200)).body);

    const transactions = exported.ownedWorkspaces.flatMap((workspace) => workspace.transactions);
    expect(transactions.map((item) => item.paymentMethod)).toContain('CASH');
  });

  it('no longer gives a new workspace a credit card category, and gives it Bônus', async () => {
    const { categories } = await setup();
    const names = categories.map((category) => `${category.name} (${category.type})`);

    expect(names).not.toContain('Cartão de crédito (DEBIT)');
    expect(names).toContain('Bônus (CREDIT)');
  });

  it('takes a meal or food voucher', async () => {
    const { browser, base, fields } = await setup();

    const created = await browser
      .post(`${base}/transactions`)
      .send({ ...fields({ paymentMethod: 'MEAL_VOUCHER' }), period })
      .expect(201);

    expect(transactionSchema.parse(created.body).paymentMethod).toBe('MEAL_VOUCHER');
  });
});
