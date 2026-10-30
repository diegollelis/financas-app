import {
  formatCents,
  parseNubankAccountCsv,
  type Category,
  type Merchant,
  type Person,
  type Transaction,
} from '@financas/shared';
import { describe, expect, it } from 'vitest';
import {
  accountGroup,
  accountSummary,
  billText,
  matchText,
  partText,
  startAccountReview,
} from './account-review';
import { readyImport, takesMatch, type ReviewRow } from './review';

// Invented movements and transactions (ADR 0019: never a real statement).
const ids = {
  salary: '01920000-0000-7000-8000-000000000101',
  market: '01920000-0000-7000-8000-000000000102',
  bills: '01920000-0000-7000-8000-000000000103',
  school: '01920000-0000-7000-8000-000000000104',
  loans: '01920000-0000-7000-8000-000000000105',
  shopping: '01920000-0000-7000-8000-000000000106',
};
const categories: Category[] = [
  { id: ids.salary, name: 'Salário', type: 'CREDIT', archived: false },
  { id: ids.market, name: 'Mercado', type: 'DEBIT', archived: false },
  { id: ids.bills, name: 'Contas da casa', type: 'DEBIT', archived: false },
  { id: ids.school, name: 'Educação', type: 'DEBIT', archived: false },
  { id: ids.loans, name: 'Empréstimos', type: 'CREDIT', archived: false, neutral: true },
  { id: ids.shopping, name: 'Compras', type: 'DEBIT', archived: false },
] as Category[];
const padaria: Merchant = {
  id: '01920000-0000-7000-8000-0000000000a1',
  name: 'Padaria Exemplo',
  archived: false,
  inUse: true,
  aliases: [],
};
const pedro = {
  id: '01920000-0000-7000-8000-0000000000b1',
  name: 'Pedro Exemplo',
  archived: false,
} as Person;

let counter = 0;
const transaction = (fields: Partial<Transaction>): Transaction => ({
  id: `01920000-0000-7000-8000-${String(++counter).padStart(12, '0')}`,
  type: 'DEBIT',
  description: 'Lançamento',
  notes: null,
  categoryId: ids.market,
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
  cardId: null,
  splitOfId: null,
  settlementId: null,
  ...fields,
});

const salary = transaction({
  type: 'CREDIT',
  description: 'Salário',
  categoryId: ids.salary,
  amountCents: 800_000,
  dueDate: '2026-10-05',
});
const sweets = transaction({
  description: 'Doceria Exemplo',
  categoryId: ids.shopping,
  amountCents: 45_000,
  settledAt: '2026-10-16',
});
const school = transaction({
  description: 'Escola de Inglês Exemplo',
  categoryId: ids.school,
  amountCents: 52_088,
  settledAt: '2026-10-01',
});
const energy = transaction({
  description: 'Energia Exemplo S.A.',
  categoryId: ids.bills,
  amountCents: 21_000,
  dueDate: '2026-11-06',
  recurrenceId: '01920000-0000-7000-8000-0000000000c1',
});
const loan = transaction({
  type: 'CREDIT',
  description: 'Empréstimo ao Pedro',
  categoryId: ids.loans,
  amountCents: 300_000,
  personId: pedro.id,
});

const line = (n: number, day: string, amount: string, description: string) =>
  `${day},${amount},6a1f0000-0000-4000-8000-${String(n).padStart(12, '0')},${description}`;
const csv = [
  'Data,Valor,Identificador,Descrição',
  line(
    1,
    '05/10/2026',
    '8000.00',
    'Transferência recebida pelo Pix - EMPRESA EXEMPLO - 12.345.678/0001-90 - BANCO (0999) Agência: 1 Conta: 1-1',
  ),
  line(
    2,
    '16/10/2026',
    '-450.00',
    'Transferência enviada pelo Pix - DOCERIA EXEMPLO - 22.345.678/0001-90 - BANCO (0999) Agência: 1 Conta: 1-1',
  ),
  line(
    3,
    '01/10/2026',
    '-578.76',
    'Transferência enviada pelo Pix - ESCOLA DE INGLES EXEMPLO - 32.345.678/0001-90 - BANCO (0999) Agência: 1 Conta: 1-1',
  ),
  line(4, '08/10/2026', '-45.90', 'Compra no débito - PADARIA EXEMPLO'),
  line(5, '10/10/2026', '-2500.00', 'Pagamento de fatura'),
  line(6, '11/10/2026', '300.00', 'Resgate RDB'),
  line(
    7,
    '07/10/2026',
    '1000.00',
    'Transferência Recebida - MARIA DA SILVA EXEMPLO - •••.111.222-•• - OUTRO BANCO (0001) Agência: 1 Conta: 1-1',
  ),
  line(
    8,
    '06/10/2026',
    '320.50',
    'Transferência recebida pelo Pix - PEDRO EXEMPLO - •••.654.321-•• - BANCO (0999) Agência: 2 Conta: 2-2',
  ),
  line(9, '02/10/2026', '-198.40', 'Pagamento de boleto efetuado - ENERGIA EXEMPLO S.A.'),
  line(
    10,
    '03/10/2026',
    '-30.00',
    'Transferência enviada pelo Pix - LOJA JA IMPORTADA - 42.345.678/0001-90 - BANCO (0999) Agência: 1 Conta: 1-1',
  ),
].join('\n');
const { lines } = parseNubankAccountCsv(csv);

const context = {
  known: new Set(['NUBANK:6a1f0000-0000-4000-8000-000000000010']),
  candidates: [salary, sweets, school, energy, loan],
  merchants: [padaria],
  categories,
  people: [pedro],
  hints: {
    merchants: [{ merchantId: padaria.id, type: 'DEBIT' as const, categoryId: ids.market }],
    descriptions: [],
    paymentMethods: { merchants: [], descriptions: [] },
  },
  userName: 'Maria Exemplo',
};
const review = () => startAccountReview(lines, context);
const rowOf = (rows: ReviewRow[], n: number) => rows.find((row) => row.line === n + 1)!;

describe('startAccountReview', () => {
  it('leaves out what was imported before, only counted', () => {
    const { rows, knownCount } = review();

    expect(knownCount).toBe(1);
    expect(rows).toHaveLength(9);
  });

  it('settles a pending one with the same amount near its due date', () => {
    const row = rowOf(review().rows, 1);

    expect(row.match).toMatchObject({ transactionId: salary.id, pending: true, sameAmount: true });
    expect(accountGroup(row)).toBe('MATCHED');
    expect(matchText(row as never)).toBe(
      'O app tinha "Salário" pendente, vencendo em 05/10/2026, com o mesmo valor. Importar marca esse lançamento como recebido em 05/10/2026.',
    );
  });

  it('links a settled one with the same amount, settled within days', () => {
    expect(rowOf(review().rows, 2).match).toMatchObject({
      transactionId: sweets.id,
      pending: false,
      sameAmount: true,
    });
  });

  it('offers the same one with another amount when merchant or description and day fit', () => {
    const row = rowOf(review().rows, 3);

    expect(row.match).toMatchObject({ transactionId: school.id, sameAmount: false });
    expect(row.included).toBe(true);
  });

  it('makes a new one of the rest: its month, settled on its day, merchant and category', () => {
    const row = rowOf(review().rows, 4);

    expect(row).toMatchObject({
      included: true,
      type: 'DEBIT',
      description: 'Padaria Exemplo',
      merchantName: 'Padaria Exemplo',
      categoryId: ids.market,
      paymentMethod: 'DEBIT_CARD',
      period: '2026-10',
      occurredOn: '2026-10-08',
      settledAt: '2026-10-08',
      dueDate: null,
      externalId: 'NUBANK:6a1f0000-0000-4000-8000-000000000004',
    });
    expect(row.match).toBeUndefined();
    expect(accountGroup(row)).toBe('NEW');
  });

  it('leaves out the card bill, savings, money between own accounts and last month’s bill', () => {
    const { rows } = review();
    const out = [5, 6, 7, 9].map((n) => rowOf(rows, n));

    expect(out.every((row) => !row.included && row.skipped)).toBe(true);
    expect(out.map((row) => accountGroup(row))).toEqual(['OUT', 'OUT', 'OUT', 'OUT']);
    expect(out[2]!.warnings[0]).toBe('Entre as suas contas: veio de uma conta no seu nome.');
    expect(out[3]!.warnings[0]).toContain(
      'Pode ser a conta de setembro de 2026 de "Energia Exemplo S.A."',
    );
  });

  describe('the bill payment (ADR 0062 note)', () => {
    const card = {
      id: '01920000-0000-7000-8000-0000000000e1',
      name: 'Cartão Exemplo',
      bank: 'NUBANK' as const,
      functions: ['CREDIT' as const, 'DEBIT' as const],
      closingDay: 27,
      dueDay: 12,
      archived: false,
      inUse: true,
    };
    const purchase = transaction({
      description: 'Mercado Exemplo',
      categoryId: ids.market,
      amountCents: 250_000,
      dueDate: '2026-10-12',
    });
    const bill = (totalCents: number, dueDate = '2026-10-12') => ({
      cardId: card.id,
      dueDate,
      totalCents,
      transactions: [{ ...purchase, amountCents: totalCents, dueDate }],
    });
    const withBills = (bills: ReturnType<typeof bill>[]) =>
      rowOf(
        startAccountReview(lines, { ...context, bills, cards: [card], bank: 'NUBANK' }).rows,
        5,
      );

    it('pays the open bill of the same amount, checked, never as a transaction', () => {
      const row = withBills([bill(250_000)]);

      expect(row).toMatchObject({
        included: true,
        bill: { cardId: card.id, dueDate: '2026-10-12', count: 1, sameAmount: true },
      });
      expect(accountGroup(row)).toBe('MATCHED');
      expect(billText(row as never)).toBe(
        'Fatura do Cartão Exemplo que vence em 12/10/2026: 1 lançamento, com o mesmo valor. Importar marca esses lançamentos como pagos em 10/10/2026, sem criar nada.',
      );
      expect(readyImport([row], categories, new Map())).toMatchObject({
        transactions: [],
        bills: [{ cardId: card.id, dueDate: '2026-10-12', settledAt: '2026-10-10' }],
      });
    });

    it('leaves one of another amount unchecked, saying so, and pays it if checked', () => {
      const row = withBills([bill(240_000)]);

      expect(row).toMatchObject({ included: false, skipped: true, bill: { sameAmount: false } });
      expect(billText(row as never)).toContain(
        `soma ${formatCents(240_000)} (1 lançamento); o banco mostra ${formatCents(250_000)}. Marque para pagar a fatura assim mesmo`,
      );
      expect(readyImport([{ ...row, included: true }], categories, new Map()).bills).toHaveLength(
        1,
      );
    });

    it('leaves it out with no open bill near the day, or of another bank', () => {
      const reason =
        'As compras do cartão vêm da fatura: importar o pagamento contaria tudo duas vezes.';

      expect(withBills([bill(250_000, '2026-11-12')]).warnings).toEqual([reason]);
      expect(
        withBills([{ ...bill(250_000), cardId: '01920000-0000-7000-8000-0000000000e2' }]).warnings,
      ).toEqual([reason]);
      expect(withBills([]).bill).toBeUndefined();
    });
  });

  it('takes money coming back from a person with a loan as a part of it (ADR 0061 note)', () => {
    const row = rowOf(review().rows, 8);

    expect(row).toMatchObject({
      included: true,
      part: {
        transactionId: loan.id,
        description: 'Empréstimo ao Pedro',
        personName: 'Pedro Exemplo',
        remainingCents: 300_000,
      },
    });
    expect(accountGroup(row)).toBe('MATCHED');
    expect(partText(row as never)).toBe(
      `Recebimento parcial de "Empréstimo ao Pedro", de Pedro Exemplo: faltam ${formatCents(300_000)}; depois deste, ${formatCents(267_950)}.`,
    );
  });

  it('leaves out a part bigger than what the loan still has', () => {
    const big = parseNubankAccountCsv(
      [
        'Data,Valor,Identificador,Descrição',
        line(
          1,
          '06/10/2026',
          '2000.00',
          'Transferência recebida pelo Pix - PEDRO EXEMPLO - •••.654.321-•• - BANCO (0999) Agência: 2 Conta: 2-2',
        ),
        line(
          2,
          '07/10/2026',
          '1500.00',
          'Transferência recebida pelo Pix - PEDRO EXEMPLO - •••.654.321-•• - BANCO (0999) Agência: 2 Conta: 2-2',
        ),
      ].join('\n'),
    ).lines;
    const [first, second] = startAccountReview(big, context).rows;

    expect(first!.part?.remainingCents).toBe(300_000);
    // After the first, R$ 1.000,00 is left: the second does not fit.
    expect(second!.part).toBeUndefined();
    expect(second!.warnings[0]).toContain('Pode ser a devolução do empréstimo a Pedro Exemplo');
  });

  it('takes the part from the loan that takes parts, when the person has several', () => {
    // A share lent with "Emprestado para" comes first, and does not take parts (ADR 0057).
    const share = transaction({
      type: 'CREDIT',
      description: 'Empréstimo pessoal',
      categoryId: ids.loans,
      amountCents: 50_000,
      personId: pedro.id,
      splitOfId: '01920000-0000-7000-8000-0000000000d1',
    });
    const older = transaction({
      type: 'CREDIT',
      description: 'Empréstimo pessoal',
      categoryId: ids.loans,
      amountCents: 4_180_000,
      personId: pedro.id,
    });
    const movement = parseNubankAccountCsv(
      [
        'Data,Valor,Identificador,Descrição',
        line(
          1,
          '06/10/2026',
          '670.00',
          'Transferência recebida pelo Pix - PEDRO EXEMPLO - •••.654.321-•• - BANCO (0999) Agência: 2 Conta: 2-2',
        ),
      ].join('\n'),
    ).lines;

    const [row] = startAccountReview(movement, {
      ...context,
      candidates: [share, older],
    }).rows;
    expect(row!.part).toMatchObject({ transactionId: older.id, remainingCents: 4_180_000 });

    // With only the share, it stays out, without suggesting what the share cannot take.
    const [alone] = startAccountReview(movement, { ...context, candidates: [share] }).rows;
    expect(alone!.part).toBeUndefined();
    expect(alone!.warnings[0]).toBe(
      `Pode ser a devolução do empréstimo a Pedro Exemplo (faltam ${formatCents(50_000)}).`,
    );
  });

  it('never matches one transaction with two movements', () => {
    const twice = parseNubankAccountCsv(
      [
        'Data,Valor,Identificador,Descrição',
        line(1, '16/10/2026', '-450.00', 'Compra no débito - DOCERIA EXEMPLO'),
        line(2, '17/10/2026', '-450.00', 'Compra no débito - DOCERIA EXEMPLO'),
      ].join('\n'),
    ).lines;
    const { rows } = startAccountReview(twice, context);

    expect(rows.filter((row) => row.match).map((row) => row.line)).toEqual([2]);
  });

  it('sums up what it found', () => {
    expect(accountSummary(review().rows)).toEqual({
      matched: 2,
      settling: 1,
      different: 1,
      parts: 1,
      bills: 0,
      fresh: 1,
      out: 4,
    });
  });
});

describe('readyImport of an account statement', () => {
  it('sends matches for what is in the app, and new ones with their identifier', () => {
    const { rows } = review();
    const ready = readyImport(rows, categories, new Map());

    expect(ready.matches).toEqual([
      {
        transactionId: salary.id,
        externalId: 'NUBANK:6a1f0000-0000-4000-8000-000000000001',
        settledAt: '2026-10-05',
      },
      {
        transactionId: sweets.id,
        externalId: 'NUBANK:6a1f0000-0000-4000-8000-000000000002',
        settledAt: '2026-10-16',
      },
      // "Valor diferente": the bank's amount.
      {
        transactionId: school.id,
        externalId: 'NUBANK:6a1f0000-0000-4000-8000-000000000003',
        settledAt: '2026-10-01',
        amountCents: 57_876,
      },
    ]);
    expect(ready.parts).toEqual([
      {
        transactionId: loan.id,
        externalId: 'NUBANK:6a1f0000-0000-4000-8000-000000000008',
        amountCents: 32_050,
        settledAt: '2026-10-06',
      },
    ]);
    expect(ready.transactions).toEqual([
      expect.objectContaining({
        description: 'Padaria Exemplo',
        externalId: 'NUBANK:6a1f0000-0000-4000-8000-000000000004',
      }),
    ]);
  });

  it('turns a refused match into a new transaction, once it has a category', () => {
    const rows = review().rows.map((row) =>
      row.line === 2 ? { ...row, matchRefused: true, categoryId: ids.salary } : row,
    );
    const refused = rowOf(rows, 1);
    const ready = readyImport(rows, categories, new Map());

    expect(takesMatch(refused)).toBe(false);
    expect(ready.matches.map((match) => match.transactionId)).not.toContain(salary.id);
    expect(ready.transactions.map((item) => item.externalId)).toContain(
      'NUBANK:6a1f0000-0000-4000-8000-000000000001',
    );
  });
});
