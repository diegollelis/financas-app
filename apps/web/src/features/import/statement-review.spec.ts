import {
  parseNubankCsv,
  type Category,
  type InstallmentPlan,
  type Merchant,
  type Transaction,
} from '@financas/shared';
import { describe, expect, it } from 'vitest';
import { readyImport } from './review';
import {
  applyToSameTitle,
  mergeStatementRows,
  pendingMerchants,
  sameTitleCount,
  startStatementReview,
  suggestedPeriod,
  wholeBillAlreadyLaunched,
  type StatementContext,
} from './statement-review';

// An invented statement and workspace (ADR 0019).
const id = (n: number) => `01920000-0000-7000-8000-0000000009${String(n).padStart(2, '0')}`;
const category = (n: number, name: string, type: Category['type']): Category => ({
  id: id(n),
  name,
  type,
  archived: false,
  recentUses: 0,
});
const lazer = category(1, 'Lazer', 'DEBIT');
const compras = category(2, 'Compras', 'DEBIT');
const assinaturas = category(3, 'Assinaturas', 'DEBIT');
const merchant = (n: number, name: string, aliases: string[] = []): Merchant => ({
  id: id(20 + n),
  name,
  archived: false,
  inUse: true,
  aliases: aliases.map((alias, index) => ({ id: id(40 + n * 5 + index), alias })),
});
const pizzaria = merchant(1, 'Pizzaria Exemplo', ['Ifd*Pizzaria Exemplo']);
const loja = merchant(2, 'Loja Exemplo', ['Loja.Exemplo']);
const netflix = merchant(3, 'Netflix', ['Netflix.Com']);
const transaction = (n: number, fields: Partial<Transaction>): Transaction => ({
  id: id(60 + n),
  type: 'DEBIT',
  description: 'Lançamento',
  notes: null,
  categoryId: assinaturas.id,
  amountCents: 1_000,
  period: '2026-10',
  dueDate: null,
  settledAt: null,
  occurredOn: null,
  recurrenceId: null,
  recurrenceIntervalMonths: null,
  amountEstimated: false,
  installment: null,
  personId: null,
  merchantId: null,
  paymentMethod: null,
  splitOfId: null,
  ...fields,
});

const context = (more: Partial<StatementContext> = {}): StatementContext => ({
  period: '2026-10',
  dueDate: '2026-11-04',
  merchants: [pizzaria, loja, netflix],
  categories: [lazer, compras, assinaturas],
  hints: {
    merchants: [{ merchantId: pizzaria.id, type: 'DEBIT', categoryId: lazer.id }],
    descriptions: [],
    paymentMethods: { merchants: [], descriptions: [] },
  },
  plans: [],
  transactions: [],
  ...more,
});

/** Intl separates "R$" from the number with a non-breaking space. */
const plain = (texts: string[] | undefined) => texts?.map((text) => text.replace(/\u00a0/g, ' '));

const lines = (...rows: string[]) =>
  parseNubankCsv(['date,title,amount', ...rows].join('\n')).lines;

describe('startStatementReview', () => {
  it("makes a purchase a debit of the statement's month, due on the bill: merchant by alias, named by it", () => {
    const [row] = startStatementReview(lines('2026-10-03,IFD*PIZZARIA EXEMPLO,"86,50"'), context());

    expect(row).toMatchObject({
      included: true,
      type: 'DEBIT',
      description: 'Pizzaria Exemplo',
      merchantName: 'Pizzaria Exemplo',
      merchantByAlias: true,
      categoryId: lazer.id,
      paymentMethod: 'CREDIT_CARD',
      amountCents: 8_650,
      // The statement's reference month (ADR 0055 note).
      period: '2026-10',
      occurredOn: '2026-10-03',
      dueDate: '2026-11-04',
      statementTitle: 'IFD*PIZZARIA EXEMPLO',
      warnings: [],
    });
  });

  it('keeps the statement text without a merchant, with no warning: the merchant is optional', () => {
    // Bought on September 29th, after the card turned: it belongs to October's statement.
    const [row] = startStatementReview(
      lines('2026-09-29,Spaceship.Com* Gypcbz,"32,40"'),
      context(),
    );

    expect(row).toMatchObject({
      description: 'Spaceship.Com* Gypcbz',
      merchantName: '',
      categoryId: null,
      period: '2026-10',
      occurredOn: '2026-09-29',
      warnings: [],
    });
  });

  it("suggests the month of the statement's latest purchase, leaving installments out", () => {
    expect(
      suggestedPeriod(
        lines(
          '2026-09-29,Loja A,"10,00"',
          '2026-10-27,Loja B,"10,00"',
          '2026-12-01,Loja C - Parcela 2/3,"10,00"',
          '2026-10-30,Pagamento recebido,"- 10,00"',
        ),
      ),
    ).toBe('2026-10');
  });

  it("puts an installment billed here in the statement's month, starting a plan from it", () => {
    const geladeira: InstallmentPlan = {
      id: id(80),
      type: 'DEBIT',
      description: 'Geladeira',
      notes: null,
      categoryId: compras.id,
      totalCents: 120_000,
      installments: 10,
      firstNumber: 1,
      occurredOn: null,
      firstPeriod: '2026-07',
      dueDay: 4,
      dueMonthOffset: 1,
      personId: null,
      merchantId: loja.id,
      paymentMethod: 'CREDIT_CARD',
      isSplit: false,
      endedAt: null,
      adoptedTransactionId: null,
      settledCount: 3,
      pendingCount: 7,
      pendingCents: 84_000,
      lastPendingPeriod: '2027-04',
    };
    const statement = lines(
      '2026-08-28,Loja.Exemplo - Parcela 3/10,"50,00"',
      '2026-07-02,Loja.Exemplo - Parcela 4/10,"120,00"',
      '2026-05-15,Cursos Exemplo - Parcela 6/6,"99,00"',
    );
    const rows = startStatementReview(statement, context({ plans: [geladeira] }));

    expect(rows[0]).toMatchObject({
      included: true,
      period: '2026-10',
      plan: { installments: 10, firstNumber: 3 },
    });
    expect(plain(rows[0]?.warnings)).toEqual([
      'Vai criar um parcelamento: da 3/10 à 10/10, 8 parcelas de R$ 50,00, a primeira em outubro de 2026.',
    ]);
    expect(rows[1]).toMatchObject({
      included: false,
      warnings: ['Já lançada: é a parcela 4/10 do parcelamento "Geladeira".'],
    });
    expect(rows[1]?.plan).toBeUndefined();
    expect(rows[2]).toMatchObject({ included: true, period: '2026-10', notes: 'Parcela 6/6' });
    expect(rows[2]?.plan).toBeUndefined();
  });

  it('waits for the due date, and refuses a plan due beyond the next month', () => {
    const [waiting] = startStatementReview(
      lines('2026-08-28,Loja.Exemplo - Parcela 3/10,"50,00"'),
      context({ dueDate: null }),
    );
    expect(waiting).toMatchObject({ dueDate: null, period: '2026-10' });

    const [late] = startStatementReview(
      lines('2026-08-28,Loja.Exemplo - Parcela 3/10,"50,00"'),
      context({ dueDate: '2026-12-04' }),
    );
    const ready = readyImport(
      [{ ...late!, categoryId: compras.id }],
      context().categories,
      new Map(),
    );
    expect(ready.plans).toEqual([]);
  });

  it('leaves out the last bill payment, and brings a refund in as an inflow', () => {
    const [payment, refund] = startStatementReview(
      lines('2026-10-10,Pagamento recebido,"- 2.345,10"', '2026-10-12,IOF de volta,"- 1,64"'),
      context(),
    );

    expect(payment).toMatchObject({
      included: false,
      type: 'CREDIT',
      warnings: ['Pagamento da fatura anterior: não é uma entrada.'],
    });
    expect(refund).toMatchObject({ included: true, type: 'CREDIT', amountCents: 164 });
    expect(refund?.warnings[0]).toMatch(/^Valor negativo na fatura: entra como entrada/);
  });

  it("matches a purchase already in the statement's month, and the month of a recurrence (ADR 0061 note)", () => {
    const rows = startStatementReview(
      lines('2026-10-03,Ifd*Pizzaria Exemplo,"86,50"', '2026-10-20,Netflix.Com,"56,90"'),
      context({
        transactions: [
          transaction(1, {
            description: 'Pizzaria Exemplo',
            merchantId: pizzaria.id,
            amountCents: 8_650,
            occurredOn: '2026-10-03',
          }),
          transaction(2, {
            description: 'Netflix',
            merchantId: netflix.id,
            amountCents: 5_590,
            recurrenceId: id(90),
          }),
          // Another month's Netflix does not count.
          transaction(3, {
            description: 'Netflix',
            merchantId: netflix.id,
            amountCents: 5_690,
            recurrenceId: id(90),
            period: '2026-09',
          }),
        ],
      }),
    );

    // The same purchase: already in the app, it creates nothing.
    expect(rows[0]).toMatchObject({
      included: true,
      match: { transactionId: id(61), sameAmount: true, card: true },
    });
    // This month's Netflix, with another amount: "Valor diferente", never September's.
    expect(rows[1]).toMatchObject({
      included: true,
      match: { transactionId: id(62), sameAmount: false, card: true, recurring: true },
    });

    // Importing gives each one the bill's due date and the purchase's day; the bill's amount
    // where it differs. Nothing is settled.
    const ready = readyImport(
      rows.map((row) => ({ ...row, dueDate: '2026-11-04' })),
      [],
      new Map(),
    );
    expect(ready.matches).toEqual([
      { transactionId: id(61), dueDate: '2026-11-04', occurredOn: '2026-10-03' },
      {
        transactionId: id(62),
        dueDate: '2026-11-04',
        occurredOn: '2026-10-20',
        amountCents: 5_690,
      },
    ]);
    expect(ready.transactions).toEqual([]);
  });

  it('turns a match into a new purchase with "Não é este", and never takes one twice', () => {
    const rows = startStatementReview(
      lines('2026-10-03,Ifd*Pizzaria Exemplo,"86,50"', '2026-10-04,Ifd*Pizzaria Exemplo,"86,50"'),
      context({
        transactions: [
          transaction(1, {
            description: 'Pizzaria Exemplo',
            merchantId: pizzaria.id,
            amountCents: 8_650,
          }),
        ],
      }),
    );

    expect(rows.map((row) => row.match?.transactionId ?? null)).toEqual([id(61), null]);
    const refused = {
      ...rows[0]!,
      matchRefused: true,
      categoryId: compras.id,
      dueDate: '2026-11-04',
    };
    const ready = readyImport([refused], [], new Map());
    expect(ready.matches).toEqual([]);
    expect(ready.transactions).toHaveLength(1);
  });

  it('sends a plan, a transaction and the alias learned, as the import takes them', () => {
    const rows = startStatementReview(
      lines(
        '2026-08-28,Loja.Exemplo - Parcela 3/10,"50,00"',
        '2026-10-05,Spaceship.Com* Gypcbz,"32,40"',
      ),
      context(),
    );
    const fixed = { ...rows[0]!, categoryId: compras.id };
    const learned = {
      ...rows[1]!,
      merchantName: 'Spaceship',
      description: 'Spaceship',
      categoryId: assinaturas.id,
      rememberAlias: 'Spaceship.Com',
    };

    const ready = readyImport([fixed, learned], context().categories, new Map());

    expect(ready.plans).toEqual([
      {
        type: 'DEBIT',
        description: 'Loja Exemplo',
        notes: null,
        categoryId: compras.id,
        installments: 10,
        firstNumber: 3,
        amountCents: 5_000,
        firstPeriod: '2026-10',
        occurredOn: '2026-08-28',
        dueDay: 4,
        dueMonthOffset: 1,
        paymentMethod: 'CREDIT_CARD',
        merchantName: 'Loja Exemplo',
      },
    ]);
    expect(ready.transactions).toMatchObject([
      {
        description: 'Spaceship',
        merchantName: 'Spaceship',
        period: '2026-10',
        dueDate: '2026-11-04',
      },
    ]);
    // Due in the month after the reference month.
    expect(ready.plans[0]?.dueMonthOffset).toBe(1);
    expect(ready.aliases).toEqual([{ merchantName: 'Spaceship', alias: 'Spaceship.Com' }]);
  });
});

describe('applyToSameTitle', () => {
  it('gives the merchant and the category chosen to the lines of the same title without them', () => {
    const rows = startStatementReview(
      lines(
        '2026-10-05,Spaceship.Com* Gypcbz,"32,40"',
        '2026-10-19,SPACESHIP.COM* GYPCBZ,"12,00"',
        '2026-10-06,Outra Loja,"10,00"',
      ),
      context(),
    );
    const fixed = {
      ...rows[0]!,
      merchantName: 'Spaceship',
      description: 'Spaceship',
      categoryId: assinaturas.id,
    };

    expect(sameTitleCount(rows, rows[0]!)).toBe(1);
    const applied = applyToSameTitle(rows, fixed);

    expect(applied[1]).toMatchObject({
      merchantName: 'Spaceship',
      description: 'Spaceship',
      categoryId: assinaturas.id,
    });
    expect(applied[2]).toMatchObject({ merchantName: '', categoryId: null });
  });

  it('gives them to the lines the alias learned begins, as the next statement would', () => {
    const rows = startStatementReview(
      lines(
        '2026-10-05,Spaceship.Com* Gypcbz,"32,40"',
        '2026-10-07,Spaceship.Com* H2m9u1,"46,97"',
        '2026-10-08,Spaceship Outra,"10,00"',
      ),
      context(),
    );
    const fixed = {
      ...rows[0]!,
      merchantName: 'Spaceship',
      description: 'Spaceship',
      rememberAlias: 'Spaceship.Com*',
    };

    // Without the alias, no other line has the same title.
    expect(sameTitleCount(rows, rows[0]!)).toBe(0);
    expect(sameTitleCount(rows, rows[0]!, 'Spaceship.Com*')).toBe(1);
    const applied = applyToSameTitle(rows, fixed);

    // Its merchant came from the alias: there is none to learn on it.
    expect(applied[1]).toMatchObject({
      merchantName: 'Spaceship',
      description: 'Spaceship',
      merchantByAlias: true,
    });
    expect(applied[2]).toMatchObject({ merchantName: '' });
  });
});

describe('pendingMerchants', () => {
  it('lists the merchants named in the review that do not exist yet, with their aliases', () => {
    const rows = startStatementReview(
      lines(
        '2026-10-05,Spaceship.Com* Gypcbz,"32,40"',
        '2026-10-06,Ifd*Pizzaria Exemplo,"50,00"',
        '2026-10-07,Varejao de Frutas,"20,00"',
      ),
      context(),
    );
    const named = [
      { ...rows[0]!, merchantName: 'Spaceship', rememberAlias: 'Spaceship.Com*' },
      // Already a merchant, by its alias: not pending.
      rows[1]!,
      { ...rows[2]!, merchantName: ' Varejão de Frutas ' },
    ];

    expect(pendingMerchants(named, [pizzaria, loja, netflix])).toEqual([
      { name: 'Spaceship', aliases: ['Spaceship.Com*'] },
      { name: 'Varejão de Frutas', aliases: [] },
    ]);
  });
});

describe('mergeStatementRows', () => {
  it('keeps what the person chose on a row when the month changes, and moves it to the new month', () => {
    const statement = lines(
      '2026-10-05,Spaceship.Com* Gypcbz,"32,40"',
      '2026-10-06,Outra Loja,"10,00"',
    );
    const october = startStatementReview(statement, context());
    const chosen = [
      { ...october[0]!, categoryId: assinaturas.id, included: false, touched: true },
      october[1]!,
    ];
    const september = startStatementReview(
      statement,
      context({ period: '2026-09', dueDate: '2026-10-04' }),
    );

    const merged = mergeStatementRows(chosen, september, '2026-10');

    expect(merged[0]).toMatchObject({
      categoryId: assinaturas.id,
      included: false,
      period: '2026-09',
      dueDate: '2026-10-04',
    });
    // An untouched row is simply the new one.
    expect(merged[1]).toBe(september[1]);
  });
});

describe('wholeBillAlreadyLaunched', () => {
  it('finds a credit card debit close to the whole statement', () => {
    const statement = lines('2026-10-03,Loja A,"1.000,00"', '2026-10-04,Loja B,"406,25"');
    const bill = transaction(4, {
      description: 'Fatura do cartão',
      amountCents: 141_000,
      paymentMethod: 'CREDIT_CARD',
    });

    expect(wholeBillAlreadyLaunched(statement, context({ transactions: [bill] }))).toEqual({
      transaction: bill,
      totalCents: 140_625,
    });
    expect(wholeBillAlreadyLaunched(statement, context())).toBeNull();
  });
});
