import type { Category, TemplateRow } from '@financas/shared';
import { describe, expect, it } from 'vitest';
import {
  categoryKey,
  groupByPeriod,
  groupTotals,
  readyTransactions,
  resolveCategory,
  startReview,
  toTransaction,
  unmatchedCategories,
  type ReviewRow,
} from './review';

// Fictitious data (ADR 0019).
const category = (n: number, name: string, type: Category['type'], archived = false) => ({
  id: `01920000-0000-7000-8000-0000000001${String(n).padStart(2, '0')}`,
  name,
  type,
  archived,
  recentUses: 0,
});
const salario = category(1, 'Salário', 'CREDIT');
const mercado = category(2, 'Mercado', 'DEBIT');
const ipva = category(3, 'IPVA', 'DEBIT', true);
const categories = [salario, mercado, ipva];

const parsedRow = (line: number, overrides: Partial<TemplateRow> = {}): TemplateRow => ({
  line,
  type: 'DEBIT',
  description: 'Supermercado',
  notes: null,
  categoryName: 'mercado',
  amountCents: 64_035,
  period: '2026-09',
  dueDate: '2026-09-10',
  settledAt: null,
  ...overrides,
});

const reviewRow = (overrides: Partial<ReviewRow> = {}): ReviewRow => ({
  ...parsedRow(2),
  included: true,
  categoryId: null,
  warnings: [],
  ...overrides,
});

describe('startReview', () => {
  it('checks the valid rows and leaves the ones with errors unchecked, in spreadsheet order', () => {
    const rows = startReview({
      rows: [parsedRow(3)],
      drafts: [{ ...parsedRow(2), amountCents: 0 }],
      issues: [
        { line: 2, severity: 'error', message: 'Valor zero ou negativo.' },
        { line: 3, severity: 'warning', message: 'Parece uma parcela.' },
      ],
    });

    expect(rows.map((row) => [row.line, row.included, row.warnings])).toEqual([
      [2, false, []],
      [3, true, ['Parece uma parcela.']],
    ]);
  });
});

describe('categories', () => {
  it('matches a spreadsheet name to the active category of the same type, ignoring case and accents', () => {
    expect(resolveCategory(reviewRow({ categoryName: 'MERCADO' }), categories, new Map())).toBe(
      mercado.id,
    );
    expect(
      resolveCategory(
        reviewRow({ type: 'CREDIT', categoryName: 'salario' }),
        categories,
        new Map(),
      ),
    ).toBe(salario.id);
  });

  it('does not match an archived category, nor one of the other type', () => {
    expect(resolveCategory(reviewRow({ categoryName: 'IPVA' }), categories, new Map())).toBeNull();
    expect(
      resolveCategory(reviewRow({ categoryName: 'Salário' }), categories, new Map()),
    ).toBeNull();
  });

  it('uses the match chosen for a name, and a category chosen in the form above all', () => {
    const matches = new Map([[categoryKey('DEBIT', 'Feira'), mercado.id]]);

    expect(resolveCategory(reviewRow({ categoryName: 'feira' }), categories, matches)).toBe(
      mercado.id,
    );
    expect(
      resolveCategory(
        reviewRow({ categoryName: 'feira', categoryId: ipva.id }),
        categories,
        matches,
      ),
    ).toBe(ipva.id);
  });

  it('lists the names still without a category, once per type, counting checked rows only', () => {
    const rows = [
      reviewRow({ line: 2, categoryName: 'Feira' }),
      reviewRow({ line: 3, categoryName: 'feira' }),
      reviewRow({ line: 4, categoryName: 'Feira', included: false }),
      reviewRow({ line: 5, categoryName: 'Feira', type: 'CREDIT' }),
      reviewRow({ line: 6, categoryName: 'Mercado' }),
    ];

    expect(unmatchedCategories(rows, categories)).toEqual([
      { key: 'DEBIT|feira', type: 'DEBIT', name: 'Feira', rowCount: 2 },
      { key: 'CREDIT|feira', type: 'CREDIT', name: 'Feira', rowCount: 1 },
    ]);
  });
});

describe('toTransaction', () => {
  it('builds what the API takes', () => {
    expect(toTransaction(reviewRow(), mercado.id)).toEqual({
      ok: true,
      transaction: {
        type: 'DEBIT',
        description: 'Supermercado',
        notes: null,
        categoryId: mercado.id,
        amountCents: 64_035,
        period: '2026-09',
        dueDate: '2026-09-10',
        settledAt: null,
      },
    });
  });

  it('says what is still wrong, with the shared messages', () => {
    expect(toTransaction(reviewRow(), null)).toEqual({
      ok: false,
      problems: ['Escolha a categoria.'],
    });
    const result = toTransaction(reviewRow({ amountCents: 0, period: null }), mercado.id);
    expect(result.ok).toBe(false);
  });
});

describe('readyTransactions', () => {
  it('takes only checked rows that are valid and have a category', () => {
    const rows = [
      reviewRow({ line: 2 }),
      reviewRow({ line: 3, included: false }),
      reviewRow({ line: 4, categoryName: 'Feira' }),
      reviewRow({ line: 5, amountCents: 0 }),
    ];

    expect(readyTransactions(rows, categories, new Map())).toHaveLength(1);
    expect(
      readyTransactions(rows, categories, new Map([[categoryKey('DEBIT', 'Feira'), mercado.id]])),
    ).toHaveLength(2);
  });
});

describe('groups', () => {
  it('groups by competência, oldest first, the rows without one last', () => {
    const groups = groupByPeriod([
      reviewRow({ line: 2, period: '2026-09' }),
      reviewRow({ line: 3, period: null }),
      reviewRow({ line: 4, period: '2026-08' }),
      reviewRow({ line: 5, period: '2026-09' }),
    ]);

    expect(groups.map((group) => [group.period, group.rows.map((row) => row.line)])).toEqual([
      ['2026-08', [4]],
      ['2026-09', [2, 5]],
      [null, [3]],
    ]);
  });

  it('adds credits and debits of the checked rows', () => {
    expect(
      groupTotals([
        reviewRow({ type: 'CREDIT', amountCents: 520_000 }),
        reviewRow({ amountCents: 64_035 }),
        reviewRow({ amountCents: 10_000, included: false }),
      ]),
    ).toEqual({ credits: 520_000, debits: 64_035 });
  });
});
