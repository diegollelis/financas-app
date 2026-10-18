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
  sameTitleCount,
  startStatementReview,
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
  period: '2026-11',
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
  it('makes a purchase a debit of the bill: its merchant by the alias, named by it, the history category', () => {
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
      period: '2026-11',
      occurredOn: '2026-10-03',
      dueDate: '2026-11-04',
      statementTitle: 'IFD*PIZZARIA EXEMPLO',
      warnings: [],
    });
  });

  it('keeps the statement text without a merchant, and says how to learn one', () => {
    const [row] = startStatementReview(
      lines('2026-10-05,Spaceship.Com* Gypcbz,"32,40"'),
      context(),
    );

    expect(row).toMatchObject({
      description: 'Spaceship.Com* Gypcbz',
      merchantName: '',
      categoryId: null,
      warnings: ['Sem estabelecimento: escolha um em "Editar" para lembrar das próximas vezes.'],
    });
  });

  it('turns an installment into a plan from it, unless it is the last or already launched', () => {
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
      firstPeriod: '2026-08',
      dueDay: 4,
      dueMonthOffset: 0,
      personId: null,
      merchantId: loja.id,
      paymentMethod: 'CREDIT_CARD',
      isSplit: false,
      endedAt: null,
      settledCount: 3,
      pendingCount: 7,
      pendingCents: 84_000,
      lastPendingPeriod: '2027-05',
    };
    const rows = startStatementReview(
      lines(
        '2026-08-28,Loja.Exemplo - Parcela 3/10,"50,00"',
        '2026-07-02,Loja.Exemplo - Parcela 4/10,"120,00"',
        '2026-05-15,Cursos Exemplo - Parcela 6/6,"99,00"',
      ),
      context({ plans: [geladeira] }),
    );

    expect(rows[0]).toMatchObject({ included: true, plan: { installments: 10, firstNumber: 3 } });
    expect(plain(rows[0]?.warnings)).toEqual([
      'Vai criar um parcelamento: da 3/10 à 10/10, 8 parcelas de R$ 50,00, a primeira em novembro de 2026.',
    ]);
    expect(rows[1]).toMatchObject({
      included: false,
      warnings: ['Já lançada: é a parcela 4/10 do parcelamento "Geladeira".'],
    });
    expect(rows[1]?.plan).toBeUndefined();
    expect(rows[2]).toMatchObject({ included: true, notes: 'Parcela 6/6' });
    expect(rows[2]?.plan).toBeUndefined();
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

  it('leaves out a purchase already in the month, and the month of a recurrence', () => {
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
        ],
      }),
    );

    expect(rows[0]).toMatchObject({
      included: false,
      warnings: [
        'Possivelmente já importada: novembro de 2026 já tem esta compra, no mesmo dia e valor.',
      ],
    });
    expect(rows[1]?.included).toBe(false);
    expect(plain(rows[1]?.warnings)).toEqual([
      'Já lançada pela recorrência "Netflix" (R$ 55,90 na recorrência; a fatura diz R$ 56,90). Para o valor real, edite o lançamento da recorrência.',
    ]);
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
        firstPeriod: '2026-11',
        occurredOn: '2026-08-28',
        dueDay: 4,
        dueMonthOffset: 0,
        paymentMethod: 'CREDIT_CARD',
        merchantName: 'Loja Exemplo',
      },
    ]);
    expect(ready.transactions).toMatchObject([
      { description: 'Spaceship', merchantName: 'Spaceship' },
    ]);
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
      warnings: [],
    });
    expect(applied[2]).toMatchObject({ merchantName: '', categoryId: null });
  });
});

describe('wholeBillAlreadyLaunched', () => {
  it('finds a credit card debit of the month close to the whole statement', () => {
    const statement = lines('2026-10-03,Loja A,"1.000,00"', '2026-10-04,Loja B,"406,25"');
    const bill = transaction(3, {
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
