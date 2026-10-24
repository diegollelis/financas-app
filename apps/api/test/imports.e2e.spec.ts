import {
  categoryListResponseSchema,
  importCandidatesResponseSchema,
  importListResponseSchema,
  importSchema,
  installmentPlanListResponseSchema,
  MAX_IMPORT_TRANSACTIONS,
  merchantListResponseSchema,
  transactionListResponseSchema,
  transactionSchema,
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
    method: 'post',
    path: (id) => `/api/workspaces/${id}/imports/candidates`,
    body: { from: '2026-10-01', to: '2026-10-31', externalIds: [] },
  },
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
        occurredOn: `${period}-03`,
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
      planCount: 0,
      // None given: as the imports made before the "Origem" (ADR 0055 note).
      label: null,
      statementDueDate: null,
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
      // The "Data" column of the template (ADR 0055).
      occurredOn: '2026-08-03',
    });

    const list = importListResponseSchema.parse(
      (await browser.get(`${base}/imports`).expect(200)).body,
    );
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(created.id);
  });

  it('records what it brought and from which bank (ADR 0060)', async () => {
    const { browser, base, rows } = await setUp();
    const send = (body: object) =>
      browser.post(`${base}/imports`).send({ transactions: rows, ...body });

    expect((await send({ kind: 'TEMPLATE' }).expect(201)).body).toMatchObject({
      kind: 'TEMPLATE',
      bank: null,
    });
    expect((await send({ kind: 'CARD_STATEMENT', bank: 'NUBANK' }).expect(201)).body).toMatchObject(
      { kind: 'CARD_STATEMENT', bank: 'NUBANK' },
    );
    // A client from before: a due date was only ever sent by Nubank's card statement.
    expect((await send({ statementDueDate: '2026-11-04' }).expect(201)).body).toMatchObject({
      kind: 'CARD_STATEMENT',
      bank: 'NUBANK',
    });
    // A statement says its bank; the template has none.
    await send({ kind: 'CARD_STATEMENT' }).expect(400);
    await send({ kind: 'TEMPLATE', bank: 'NUBANK' }).expect(400);
  });

  it('names merchants: a new one is created, an existing one reused, an archived one comes back', async () => {
    const { browser, base, rows, transactionsOf } = await setUp();
    const existing = (
      await browser.post(`${base}/merchants`).send({ name: 'Açougue Central' }).expect(201)
    ).body as { id: string };
    const archived = (await browser.post(`${base}/merchants`).send({ name: 'Feira' }).expect(201))
      .body as { id: string };
    await browser.patch(`${base}/merchants/${archived.id}`).send({ archived: true }).expect(200);
    const [salary, grocery, salary2, grocery2] = rows;

    await browser
      .post(`${base}/imports`)
      .send({
        transactions: [
          { ...salary, merchantName: 'Empresa Exemplo' },
          { ...grocery, merchantName: 'acougue central' },
          { ...salary2, merchantName: 'EMPRESA EXEMPLO' },
          { ...grocery2, merchantName: 'feira' },
        ],
      })
      .expect(201);

    const merchants = (await browser.get(`${base}/merchants`).expect(200)).body as {
      id: string;
      name: string;
      archived: boolean;
    }[];
    const created = merchants.find((merchant) => merchant.name === 'Empresa Exemplo');
    expect(merchants.map(({ name, archived }) => [name, archived])).toEqual([
      ['Açougue Central', false],
      ['Empresa Exemplo', false],
      ['Feira', false],
    ]);
    const august = await transactionsOf('2026-08');
    const september = await transactionsOf('2026-09');
    expect(august.find((item) => item.type === 'CREDIT')?.merchantId).toBe(created?.id);
    expect(august.find((item) => item.type === 'DEBIT')?.merchantId).toBe(existing.id);
    expect(september.find((item) => item.type === 'CREDIT')?.merchantId).toBe(created?.id);
    expect(september.find((item) => item.type === 'DEBIT')?.merchantId).toBe(archived.id);
  });

  it('names people: a new one is created, an existing one reused, an archived one comes back (ADR 0042)', async () => {
    const { browser, base, rows, transactionsOf } = await setUp();
    const existing = (await browser.post(`${base}/people`).send({ name: 'Ana' }).expect(201))
      .body as { id: string };
    const archived = (await browser.post(`${base}/people`).send({ name: 'Bruno' }).expect(201))
      .body as { id: string };
    await browser.patch(`${base}/people/${archived.id}`).send({ archived: true }).expect(200);
    const [salary, grocery, salary2, grocery2] = rows;

    await browser
      .post(`${base}/imports`)
      .send({
        transactions: [
          { ...salary, personName: 'Carla Exemplo' },
          { ...grocery, personName: 'ANA' },
          { ...salary2, personName: 'carla exemplo' },
          { ...grocery2, personName: 'bruno' },
        ],
      })
      .expect(201);

    const people = (await browser.get(`${base}/people`).expect(200)).body as {
      id: string;
      name: string;
      archived: boolean;
    }[];
    const created = people.find((person) => person.name === 'Carla Exemplo');
    expect(people.map(({ name, archived }) => [name, archived])).toEqual([
      ['Ana', false],
      ['Bruno', false],
      ['Carla Exemplo', false],
    ]);
    const august = await transactionsOf('2026-08');
    const september = await transactionsOf('2026-09');
    expect(august.find((item) => item.type === 'CREDIT')?.personId).toBe(created?.id);
    expect(august.find((item) => item.type === 'DEBIT')?.personId).toBe(existing.id);
    expect(september.find((item) => item.type === 'CREDIT')?.personId).toBe(created?.id);
    expect(september.find((item) => item.type === 'DEBIT')?.personId).toBe(archived.id);
  });

  it('keeps the payment method of each transaction (ADR 0054)', async () => {
    const { browser, base, rows, transactionsOf } = await setUp();
    const [salary, grocery] = rows;

    await browser
      .post(`${base}/imports`)
      .send({ transactions: [{ ...salary, paymentMethod: 'TRANSFER' }, grocery] })
      .expect(201);

    const august = await transactionsOf('2026-08');
    expect(august.find((item) => item.type === 'CREDIT')?.paymentMethod).toBe('TRANSFER');
    expect(august.find((item) => item.type === 'DEBIT')?.paymentMethod).toBeNull();
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
      message: 'A categoria Salário é de entrada.',
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

  it('removes an import from the history, keeping its transactions (ADR 0060 note)', async () => {
    const { browser, base, rows, transactionsOf } = await setUp();
    const created = importSchema.parse(
      (await browser.post(`${base}/imports`).send({ transactions: rows }).expect(201)).body,
    );

    await browser.delete(`${base}/imports/${created.id}?keepTransactions=true`).expect(204);

    expect((await browser.get(`${base}/imports`).expect(200)).body).toEqual([]);
    expect(await transactionsOf('2026-08')).toHaveLength(2);
    expect(await transactionsOf('2026-09')).toHaveLength(2);
    await browser.delete(`${base}/imports/${created.id}?keepTransactions=true`).expect(404);
  });

  it('says what was built on an import since, which undoing it touches (ADR 0060 note)', async () => {
    const { browser, base, rows, transactionsOf } = await setUp();
    const created = importSchema.parse(
      (await browser.post(`${base}/imports`).send({ transactions: rows }).expect(201)).body,
    );
    const august = await transactionsOf('2026-08');
    const salary = august.find((transaction) => transaction.type === 'CREDIT')!;
    const grocery = august.find((transaction) => transaction.type === 'DEBIT')!;
    // The salary repeats every month; the grocery bill is split with Ana.
    await browser
      .post(`${base}/recurrences/from-transaction`)
      .send({ transactionId: salary.id })
      .expect(201);
    await browser
      .patch(`${base}/transactions/${grocery.id}`)
      .send({ split: [{ newPersonName: 'Ana', amountCents: 20_000 }] })
      .expect(200);

    const list = importListResponseSchema.parse(
      (await browser.get(`${base}/imports`).expect(200)).body,
    );

    expect(list.find((item) => item.id === created.id)?.dependents).toEqual({
      recurrenceMonths: 1,
      splitTransactions: 1,
      installmentAdoptions: 0,
      plansUntil: null,
    });
  });

  describe('a card statement (ADR 0055)', () => {
    const statementPeriod = '2026-11';
    const tv = (overrides: object = {}) => ({
      type: 'DEBIT',
      description: 'TV da sala',
      installments: 10,
      firstNumber: 3,
      amountCents: 5_000,
      firstPeriod: statementPeriod,
      occurredOn: '2026-08-28',
      dueDay: 4,
      paymentMethod: 'CREDIT_CARD',
      merchantName: 'Loja Exemplo',
      ...overrides,
    });
    const plansOf = async (browser: ReturnType<typeof t.http>, base: string) =>
      installmentPlanListResponseSchema.parse(
        (await browser.get(`${base}/installments`).expect(200)).body,
      );

    it('creates the installment plans with the import, and undoing deletes them', async () => {
      const { browser, base, categoryId, transactionsOf } = await setUp();
      const compras = categoryId('Compras', 'DEBIT');

      const created = importSchema.parse(
        (
          await browser
            .post(`${base}/imports`)
            .send({
              transactions: [
                {
                  type: 'DEBIT',
                  description: 'Pizza de sexta',
                  categoryId: categoryId('Lazer', 'DEBIT'),
                  amountCents: 8_650,
                  period: statementPeriod,
                  occurredOn: '2026-10-03',
                  dueDate: '2026-11-04',
                },
              ],
              plans: [tv({ categoryId: compras })],
              label: ' Fatura Nubank ',
              statementDueDate: '2026-11-04',
            })
            .expect(201)
        ).body,
      );

      // The purchase and the eight installments, 3/10 to 10/10.
      expect(created).toMatchObject({
        transactionCount: 9,
        planCount: 1,
        label: 'Fatura Nubank',
        statementDueDate: '2026-11-04',
        firstPeriod: statementPeriod,
        lastPeriod: '2027-06',
      });
      // The list says how far the plans it created go, which undoing it deletes.
      const [listed] = importListResponseSchema.parse(
        (await browser.get(`${base}/imports`).expect(200)).body,
      );
      expect(listed?.dependents.plansUntil).toBe('2027-06');
      const [plan] = await plansOf(browser, base);
      expect(plan).toMatchObject({
        installments: 10,
        firstNumber: 3,
        totalCents: 40_000,
        occurredOn: '2026-08-28',
        pendingCount: 8,
      });
      // The merchant named reaches the plan and every installment (ADR 0053).
      const merchants = merchantListResponseSchema.parse(
        (await browser.get(`${base}/merchants`).expect(200)).body,
      );
      const loja = merchants.find((merchant) => merchant.name === 'Loja Exemplo');
      expect(plan?.merchantId).toBe(loja?.id);
      const installment = (await transactionsOf(statementPeriod)).find((t) => t.installment);
      expect(installment).toMatchObject({
        installment: { number: 3, count: 10 },
        amountCents: 5_000,
        dueDate: '2026-11-04',
        occurredOn: '2026-08-28',
        paymentMethod: 'CREDIT_CARD',
        merchantId: loja?.id,
      });
      const last = (await transactionsOf('2027-06')).find((t) => t.installment);
      expect(last).toMatchObject({ installment: { number: 10 }, merchantId: loja?.id });

      await browser.delete(`${base}/imports/${created.id}`).expect(204);

      expect(await plansOf(browser, base)).toEqual([]);
      expect(await transactionsOf(statementPeriod)).toEqual([]);
      expect(await transactionsOf('2027-06')).toEqual([]);
    });

    it('takes installment plans alone, but not an empty import', async () => {
      const { browser, base, categoryId } = await setUp();

      await browser
        .post(`${base}/imports`)
        .send({ transactions: [], plans: [tv({ categoryId: categoryId('Compras', 'DEBIT') })] })
        .expect(201);
      const empty = await browser
        .post(`${base}/imports`)
        .send({ transactions: [], plans: [] })
        .expect(400);
      expect(empty.body).toMatchObject({
        message: 'Escolha ao menos um lançamento para importar.',
      });
    });

    it('keeps the aliases learned, also after undoing, and refuses one of another merchant', async () => {
      const { browser, base, rows } = await setUp();
      const pizza = {
        ...rows[1]!,
        description: 'Pizza',
        merchantName: 'Pizzaria Exemplo',
      };

      const created = importSchema.parse(
        (
          await browser
            .post(`${base}/imports`)
            .send({
              transactions: [pizza],
              aliases: [
                { merchantName: 'Pizzaria Exemplo', alias: 'Ifd*Pizzaria Exemplo' },
                // The same alias twice in the batch: once.
                { merchantName: 'pizzaria exemplo', alias: 'IFD*PIZZARIA EXEMPLO' },
              ],
            })
            .expect(201)
        ).body,
      );
      await browser.delete(`${base}/imports/${created.id}`).expect(204);

      const merchants = merchantListResponseSchema.parse(
        (await browser.get(`${base}/merchants`).expect(200)).body,
      );
      expect(merchants.map(({ name, aliases }) => [name, aliases.map((a) => a.alias)])).toEqual([
        ['Pizzaria Exemplo', ['Ifd*Pizzaria Exemplo']],
      ]);
      const refused = await browser
        .post(`${base}/imports`)
        .send({
          transactions: [{ ...pizza, merchantName: 'Outra Pizzaria' }],
          aliases: [
            { merchantName: 'Outra Pizzaria', alias: 'Ifd*Pizzaria Exemplo - Parcela 1/2' },
          ],
        })
        .expect(409);
      expect(refused.body).toMatchObject({
        code: 'MERCHANT_ALIAS_EXISTS',
        message: 'O apelido "Ifd*Pizzaria Exemplo - Parcela 1/2" já é de "Pizzaria Exemplo".',
      });
      // Nothing of it was saved, not even the new merchant.
      expect((await browser.get(`${base}/imports`).expect(200)).body).toEqual([]);
      expect(
        merchantListResponseSchema
          .parse((await browser.get(`${base}/merchants`).expect(200)).body)
          .map((merchant) => merchant.name),
      ).toEqual(['Pizzaria Exemplo']);
    });
  });

  describe('an account statement (ADR 0061)', () => {
    const account = { kind: 'ACCOUNT_STATEMENT', bank: 'NUBANK', label: 'Conta Nubank' } as const;
    const id = (n: number) => `NUBANK:6a1f0000-0000-4000-8000-${String(n).padStart(12, '0')}`;

    async function withLaunched() {
      const user = await setUp();
      const launch = async (input: Record<string, unknown>) =>
        transactionSchema.parse(
          (
            await user.browser
              .post(`${user.base}/transactions`)
              .send({
                type: 'DEBIT',
                categoryId: user.categoryId('Contas da casa', 'DEBIT'),
                period: '2026-10',
                ...input,
              })
              .expect(201)
          ).body,
        );
      // Pending, due in November: what the October bill paid on 05/11 is.
      const energy = await launch({
        description: 'Energia',
        amountCents: 21_000,
        dueDate: '2026-11-06',
      });
      // Already settled by hand on 16/10.
      const sweets = await launch({
        description: 'Doceria',
        categoryId: user.categoryId('Compras', 'DEBIT'),
        amountCents: 45_000,
        settledAt: '2026-10-16',
      });
      const newOne = {
        type: 'DEBIT' as const,
        description: 'Padaria Exemplo',
        categoryId: user.categoryId('Mercado', 'DEBIT'),
        amountCents: 4_590,
        period: '2026-10',
        settledAt: '2026-10-08',
        occurredOn: '2026-10-08',
        paymentMethod: 'DEBIT_CARD' as const,
        externalId: id(1),
      };
      return { ...user, launch, energy, sweets, newOne };
    }

    it('creates the new movements with their identifier, and refuses one imported again', async () => {
      const { browser, base, newOne, transactionsOf } = await withLaunched();

      await browser
        .post(`${base}/imports`)
        .send({ ...account, transactions: [newOne] })
        .expect(201);
      const again = await browser
        .post(`${base}/imports`)
        .send({ ...account, transactions: [{ ...newOne, description: 'Outra vez' }] })
        .expect(409);

      expect(again.body).toMatchObject({ code: 'STATEMENT_LINE_IMPORTED' });
      expect(
        (await transactionsOf('2026-10')).filter((tx) => tx.description === 'Padaria Exemplo'),
      ).toHaveLength(1);
      expect((await browser.get(`${base}/imports`).expect(200)).body).toHaveLength(1);
    });

    it('settles a pending one on the movement day with the bank amount, and links a settled one', async () => {
      const { browser, base, energy, sweets, newOne, transactionsOf } = await withLaunched();

      const created = importSchema.parse(
        (
          await browser
            .post(`${base}/imports`)
            .send({
              ...account,
              transactions: [newOne],
              matches: [
                {
                  transactionId: energy.id,
                  externalId: id(2),
                  settledAt: '2026-11-05',
                  amountCents: 21_480,
                },
                { transactionId: sweets.id, externalId: id(3), settledAt: '2026-10-17' },
              ],
            })
            .expect(201)
        ).body,
      );

      expect(created).toMatchObject({
        transactionCount: 1,
        reconciledCount: 2,
        firstPeriod: '2026-10',
        lastPeriod: '2026-11',
      });
      const october = await transactionsOf('2026-10');
      expect(october.find((tx) => tx.id === energy.id)).toMatchObject({
        settledAt: '2026-11-05',
        amountCents: 21_480,
        period: '2026-10',
      });
      // A settled one keeps the day it was given.
      expect(october.find((tx) => tx.id === sweets.id)).toMatchObject({
        settledAt: '2026-10-16',
        amountCents: 45_000,
      });
      expect(
        importListResponseSchema.parse((await browser.get(`${base}/imports`).expect(200)).body)[0],
      ).toMatchObject({ reconciledCount: 2 });
    });

    it('takes only matches, but never one transaction for two movements', async () => {
      const { browser, base, energy } = await withLaunched();
      const match = { transactionId: energy.id, externalId: id(2), settledAt: '2026-11-05' };

      const twice = await browser
        .post(`${base}/imports`)
        .send({ ...account, transactions: [], matches: [match, { ...match, externalId: id(4) }] })
        .expect(400);
      expect(twice.body).toMatchObject({ code: 'INVALID_INPUT' });

      await browser
        .post(`${base}/imports`)
        .send({ ...account, transactions: [], matches: [match] })
        .expect(201);
      // That transaction has a movement now.
      const taken = await browser
        .post(`${base}/imports`)
        .send({ ...account, transactions: [], matches: [{ ...match, externalId: id(5) }] })
        .expect(409);
      expect(taken.body).toMatchObject({ code: 'STATEMENT_MATCH_CHANGED' });
    });

    it('refuses a match whose transaction is gone, writing nothing', async () => {
      const { browser, base, energy, newOne, transactionsOf } = await withLaunched();
      await browser.delete(`${base}/transactions/${energy.id}`).expect(204);

      const gone = await browser
        .post(`${base}/imports`)
        .send({
          ...account,
          transactions: [newOne],
          matches: [{ transactionId: energy.id, externalId: id(2), settledAt: '2026-11-05' }],
        })
        .expect(409);

      expect(gone.body).toMatchObject({ code: 'STATEMENT_MATCH_CHANGED' });
      expect(await transactionsOf('2026-10')).toHaveLength(1);
      expect((await browser.get(`${base}/imports`).expect(200)).body).toEqual([]);
    });

    it('undoing keeps what it found in the app, without the movement, so it matches again', async () => {
      const { browser, base, energy, newOne, transactionsOf } = await withLaunched();
      const body = {
        ...account,
        transactions: [newOne],
        matches: [{ transactionId: energy.id, externalId: id(2), settledAt: '2026-11-05' }],
      };
      const created = importSchema.parse(
        (await browser.post(`${base}/imports`).send(body).expect(201)).body,
      );

      await browser.delete(`${base}/imports/${created.id}`).expect(204);

      const october = await transactionsOf('2026-10');
      expect(october.map((tx) => tx.description).sort()).toEqual(['Doceria', 'Energia']);
      expect(october.find((tx) => tx.id === energy.id)?.settledAt).toBe('2026-11-05');
      await browser.post(`${base}/imports`).send(body).expect(201);
    });

    it('gives what a statement may already be: its movements imported and the transactions near it', async () => {
      const { browser, base, energy, sweets, launch, newOne } = await withLaunched();
      // Settled long before the statement: not a candidate.
      await launch({
        description: 'Antiga',
        amountCents: 1_000,
        period: '2026-08',
        settledAt: '2026-08-02',
      });
      // Pending more than a year before: not a candidate either.
      await launch({ description: 'Esquecida', amountCents: 1_000, period: '2025-08' });
      await browser
        .post(`${base}/imports`)
        .send({ ...account, transactions: [newOne] })
        .expect(201);

      const response = importCandidatesResponseSchema.parse(
        (
          await browser
            .post(`${base}/imports/candidates`)
            .send({ from: '2026-10-01', to: '2026-10-23', externalIds: [id(1), id(9)] })
            .expect(200)
        ).body,
      );

      expect(response.known.map((item) => item.externalId)).toEqual([id(1)]);
      // The pending energy and the sweets settled within the statement; never the one imported.
      expect(response.transactions.map((tx) => tx.id).sort()).toEqual(
        [energy.id, sweets.id].sort(),
      );
    });

    it('a VIEWER does not ask for the candidates', async () => {
      const { base, personalWorkspaceId } = await withLaunched();
      const viewer = await t.signUp(joao);
      await t.prisma.member.create({
        data: { workspaceId: personalWorkspaceId, userId: viewer.userId, role: 'VIEWER' },
      });

      await viewer.browser
        .post(`${base}/imports/candidates`)
        .send({ from: '2026-10-01', to: '2026-10-31', externalIds: [] })
        .expect(403);
    });
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
