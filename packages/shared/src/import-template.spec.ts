import { describe, expect, it } from 'vitest';
import { MAX_IMPORT_TRANSACTIONS } from './import.ts';
import {
  normalizeName,
  parseTemplateRows,
  TEMPLATE_EXAMPLE,
  TEMPLATE_HEADERS,
  type TemplateCell,
} from './import-template.ts';

// Fictitious rows only (ADR 0019).
const header = [...TEMPLATE_HEADERS];
/** Midnight UTC of a day, as read-excel-file gives a date cell. */
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const row = (overrides: Partial<Record<string, TemplateCell>> = {}): TemplateCell[] => {
  const values: Record<string, TemplateCell> = {
    'Mês de referência': '2026-09',
    Tipo: 'Saída',
    Descrição: 'Supermercado',
    Categoria: 'Mercado',
    Valor: 640.35,
    Vencimento: day('2026-09-10'),
    'Pago ou recebido em': day('2026-09-10'),
    Observações: null,
    ...overrides,
  };
  return header.map((title) => values[title] ?? null);
};

describe('parseTemplateRows', () => {
  it('reads a row with date and number cells, as Excel stores them', () => {
    const { rows, issues } = parseTemplateRows([header, row()]);

    expect(issues).toEqual([]);
    expect(rows).toEqual([
      {
        line: 2,
        type: 'DEBIT',
        description: 'Supermercado',
        notes: null,
        categoryName: 'Mercado',
        merchantName: '',
        paymentMethod: null,
        amountCents: 64_035,
        period: '2026-09',
        dueDate: '2026-09-10',
        settledAt: '2026-09-10',
      },
    ]);
  });

  it('still reads a spreadsheet filled in with the template before ADR 0051', () => {
    const formerHeader = [
      'Competência',
      'Tipo',
      'Descrição',
      'Categoria',
      'Valor',
      'Vencimento',
      'Efetivado em',
      'Observações',
    ];
    const { rows, issues } = parseTemplateRows([
      formerHeader,
      ['2026-09', 'Débito', 'Supermercado', 'Mercado', 640.35, null, day('2026-09-10'), null],
      ['2026-09', 'Crédito', 'Salário', 'Salário', 5000, null, null, null],
    ]);

    expect(issues).toEqual([]);
    expect(rows).toMatchObject([
      { type: 'DEBIT', period: '2026-09', settledAt: '2026-09-10' },
      { type: 'CREDIT', period: '2026-09', settledAt: null },
    ]);
  });

  it('reads "Mês" as the month column too', () => {
    const titles = header.map((title) => (title === 'Mês de referência' ? 'Mês' : title));

    const { rows, issues } = parseTemplateRows([titles, row()]);

    expect(issues).toEqual([]);
    expect(rows[0]?.period).toBe('2026-09');
  });

  it('reads Entrada and Saída in any case and without accents', () => {
    const { rows } = parseTemplateRows([header, row({ Tipo: 'ENTRADA' }), row({ Tipo: 'saida' })]);

    expect(rows.map((parsed) => parsed.type)).toEqual(['CREDIT', 'DEBIT']);
  });

  it('reads the example row of the template, typed as text', () => {
    const { rows, issues } = parseTemplateRows([header, [...TEMPLATE_EXAMPLE]]);

    expect(issues).toEqual([]);
    expect(rows[0]).toMatchObject({
      type: 'DEBIT',
      description: 'Aluguel',
      categoryName: 'Moradia',
      merchantName: 'Imobiliária Exemplo',
      paymentMethod: 'BOLETO',
      amountCents: 150_000,
      period: '2026-09',
      dueDate: '2026-09-10',
      settledAt: '2026-09-10',
    });
  });

  it('finds the columns by title, in any order, case or accents', () => {
    const shuffled = ['VALOR', 'descricao', 'tipo', 'COMPETENCIA', 'categoria'];
    const { rows, issues } = parseTemplateRows([
      shuffled,
      ['1.500,00', 'Aluguel', 'debito', '9/2026', 'Moradia'],
    ]);

    expect(issues).toEqual([]);
    expect(rows[0]).toMatchObject({
      amountCents: 150_000,
      type: 'DEBIT',
      period: '2026-09',
      dueDate: null,
      settledAt: null,
    });
  });

  it('accepts a month Excel turned into a date', () => {
    const { rows } = parseTemplateRows([header, row({ 'Mês de referência': day('2026-09-01') })]);

    expect(rows[0]?.period).toBe('2026-09');
  });

  it('refuses a sheet without a required column', () => {
    const { rows, issues } = parseTemplateRows([header.filter((title) => title !== 'Valor'), []]);

    expect(rows).toEqual([]);
    expect(issues).toEqual([
      {
        line: 1,
        severity: 'error',
        message: 'Falta a coluna "Valor" no cabeçalho. Use a planilha modelo.',
      },
    ]);
  });

  it('skips empty rows and keeps the spreadsheet line numbers', () => {
    const { rows } = parseTemplateRows([header, row(), [], header.map(() => '  '), row()]);

    expect(rows.map((parsed) => parsed.line)).toEqual([2, 5]);
  });

  it('leaves out a row with errors, saying why', () => {
    const { rows, issues } = parseTemplateRows([
      header,
      row({ Valor: 0, Tipo: 'Transferência', 'Mês de referência': '2026-13' }),
    ]);

    expect(rows).toEqual([]);
    expect(issues).toEqual([
      {
        line: 2,
        severity: 'error',
        message: 'Mês de referência inválido: use AAAA-MM, como 2026-09.',
      },
      { line: 2, severity: 'error', message: 'Tipo inválido: use Entrada ou Saída.' },
      {
        line: 2,
        severity: 'error',
        message: 'Valor zero ou negativo: informe o valor do lançamento.',
      },
    ]);
  });

  it('keeps a row with errors as a draft, with what could be read, to be fixed on screen', () => {
    const { rows, drafts } = parseTemplateRows([
      header,
      row({ Valor: 0, Vencimento: '31/02/2026', Observações: 'Conferir na fatura' }),
      row(),
    ]);

    expect(rows.map((parsed) => parsed.line)).toEqual([3]);
    expect(drafts).toEqual([
      {
        line: 2,
        type: 'DEBIT',
        description: 'Supermercado',
        notes: 'Conferir na fatura',
        categoryName: 'Mercado',
        merchantName: '',
        paymentMethod: null,
        // The zero stays, to be corrected; the unreadable date comes empty.
        amountCents: 0,
        period: '2026-09',
        dueDate: null,
        settledAt: '2026-09-10',
      },
    ]);
  });

  it.each([
    [{ Descrição: '' }, 'Descreva o lançamento.'],
    [{ Categoria: null }, 'Informe a categoria.'],
    [{ Valor: 'quinze reais' }, 'Valor inválido: use números, como 1.500,00.'],
    [{ Vencimento: '31/02/2026' }, 'Vencimento inválido: use dd/mm/aaaa.'],
    [
      { 'Pago ou recebido em': 'ontem' },
      'Data de pagamento ou recebimento inválida: use dd/mm/aaaa.',
    ],
  ])('reports %o', (overrides, message) => {
    const { issues } = parseTemplateRows([header, row(overrides)]);

    expect(issues).toEqual([{ line: 2, severity: 'error', message }]);
  });

  it('warns, but imports, an installment written in the text', () => {
    const { rows, issues } = parseTemplateRows([
      header,
      row({ Descrição: 'Geladeira - Parcela 04 de 08' }),
    ]);

    expect(rows).toHaveLength(1);
    expect(issues).toEqual([
      {
        line: 2,
        severity: 'warning',
        message:
          'Parece uma parcela. Para o app acompanhar as próximas, crie um parcelamento em Lançamentos.',
      },
    ]);
  });

  it.each([
    'Transferência 123.456.789-09',
    'Pix para fulano',
    'conta 12345-6',
    'reembolso a fulano@example.com',
  ])('warns about personal data in "%s"', (notes) => {
    const { rows, issues } = parseTemplateRows([header, row({ Observações: notes })]);

    expect(rows).toHaveLength(1);
    expect(issues[0]?.severity).toBe('warning');
    expect(issues[0]?.message).toContain('dado pessoal');
  });

  it('warns when the settlement falls in another month', () => {
    const { issues } = parseTemplateRows([
      header,
      row({ 'Pago ou recebido em': day('2026-10-02') }),
    ]);

    expect(issues).toEqual([
      {
        line: 2,
        severity: 'warning',
        message: 'Pago ou recebido em 2026-10, fora do mês de referência 2026-09.',
      },
    ]);
  });

  it('refuses more transactions than one import takes', () => {
    const many = Array.from({ length: MAX_IMPORT_TRANSACTIONS + 1 }, () => row());

    const { issues } = parseTemplateRows([header, ...many]);

    expect(issues).toContainEqual(expect.objectContaining({ line: null, severity: 'error' }));
  });
});

describe('the merchant column (ADR 0053)', () => {
  it('reads the merchant by name, and a spreadsheet without the column as before', () => {
    const withMerchant = parseTemplateRows([
      header,
      row({ Estabelecimento: ' Mercado Bom Preço ' }),
    ]);
    const before = header.filter((title) => title !== 'Estabelecimento');
    const without = parseTemplateRows([
      before,
      before.map((title) => (title === 'Valor' ? 640.35 : (row()[header.indexOf(title)] ?? null))),
    ]);

    expect(withMerchant.rows[0]?.merchantName).toBe('Mercado Bom Preço');
    expect(without.issues).toEqual([]);
    expect(without.rows[0]?.merchantName).toBe('');
  });

  it('leaves out a row whose merchant name is too long', () => {
    const { rows, drafts, issues } = parseTemplateRows([
      header,
      row({ Estabelecimento: 'M'.repeat(101) }),
    ]);

    expect(rows).toEqual([]);
    expect(drafts).toHaveLength(1);
    expect(issues).toEqual([
      { line: 2, severity: 'error', message: 'Estabelecimento: Use no máximo 100 caracteres.' },
    ]);
  });
});

describe('the payment method column (ADR 0054)', () => {
  it('reads the label in any case or accents, and the usual synonyms', () => {
    const typed = ['Crédito', 'pix', 'DEBITO', 'Vale-alimentação/refeição', 'VR', 'TED', ''];

    const { rows, issues } = parseTemplateRows([
      header,
      ...typed.map((method) => row({ 'Meio de pagamento': method })),
    ]);

    expect(issues).toEqual([]);
    expect(rows.map((parsed) => parsed.paymentMethod)).toEqual([
      'CREDIT_CARD',
      'PIX',
      'DEBIT_CARD',
      'MEAL_VOUCHER',
      'MEAL_VOUCHER',
      'TRANSFER',
      null,
    ]);
  });

  it('brings a method not in the list in without one, with a warning', () => {
    const { rows, issues } = parseTemplateRows([header, row({ 'Meio de pagamento': 'Cheque' })]);

    expect(rows[0]?.paymentMethod).toBeNull();
    expect(issues).toEqual([
      {
        line: 2,
        severity: 'warning',
        message: 'Meio de pagamento "Cheque" não está na lista: o lançamento entra sem meio.',
      },
    ]);
  });

  it('reads "Meio de recebimento" as the column, and a spreadsheet without it as before', () => {
    const inflow = header.map((title) =>
      title === 'Meio de pagamento' ? 'Meio de recebimento' : title,
    );
    const before = header.filter((title) => title !== 'Meio de pagamento');

    const named = parseTemplateRows([inflow, row({ 'Meio de pagamento': 'Transferência' })]);
    const without = parseTemplateRows([
      before,
      before.map((title) => (title === 'Valor' ? 640.35 : (row()[header.indexOf(title)] ?? null))),
    ]);

    expect(named.rows[0]?.paymentMethod).toBe('TRANSFER');
    expect(without.issues).toEqual([]);
    expect(without.rows[0]?.paymentMethod).toBeNull();
  });
});

describe('normalizeName', () => {
  it('ignores accents, case and extra spaces', () => {
    expect(normalizeName('  Pago ou   Recebido EM ')).toBe('pago ou recebido em');
    expect(normalizeName('Observações')).toBe('observacoes');
  });
});
