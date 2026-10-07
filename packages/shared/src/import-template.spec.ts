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
    Competência: '2026-09',
    Tipo: 'Débito',
    Descrição: 'Supermercado',
    Categoria: 'Mercado',
    Valor: 640.35,
    Vencimento: day('2026-09-10'),
    'Efetivado em': day('2026-09-10'),
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
        amountCents: 64_035,
        period: '2026-09',
        dueDate: '2026-09-10',
        settledAt: '2026-09-10',
      },
    ]);
  });

  it('reads the example row of the template, typed as text', () => {
    const { rows, issues } = parseTemplateRows([header, [...TEMPLATE_EXAMPLE]]);

    expect(issues).toEqual([]);
    expect(rows[0]).toMatchObject({
      type: 'DEBIT',
      description: 'Aluguel',
      categoryName: 'Moradia',
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

  it('accepts a competência Excel turned into a date', () => {
    const { rows } = parseTemplateRows([header, row({ Competência: day('2026-09-01') })]);

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
      row({ Valor: 0, Tipo: 'Transferência', Competência: '2026-13' }),
    ]);

    expect(rows).toEqual([]);
    expect(issues).toEqual([
      { line: 2, severity: 'error', message: 'Competência inválida: use AAAA-MM, como 2026-09.' },
      { line: 2, severity: 'error', message: 'Tipo inválido: use Crédito ou Débito.' },
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
    [{ 'Efetivado em': 'ontem' }, 'Data de efetivação inválida: use dd/mm/aaaa.'],
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

  it('warns when the settlement falls in another competência', () => {
    const { issues } = parseTemplateRows([header, row({ 'Efetivado em': day('2026-10-02') })]);

    expect(issues).toEqual([
      {
        line: 2,
        severity: 'warning',
        message: 'Efetivado em 2026-10, fora da competência 2026-09.',
      },
    ]);
  });

  it('refuses more transactions than one import takes', () => {
    const many = Array.from({ length: MAX_IMPORT_TRANSACTIONS + 1 }, () => row());

    const { issues } = parseTemplateRows([header, ...many]);

    expect(issues).toContainEqual(expect.objectContaining({ line: null, severity: 'error' }));
  });
});

describe('normalizeName', () => {
  it('ignores accents, case and extra spaces', () => {
    expect(normalizeName('  Efetivado   EM ')).toBe('efetivado em');
    expect(normalizeName('Observações')).toBe('observacoes');
  });
});
