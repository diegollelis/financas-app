import { describe, expect, it } from 'vitest';
import {
  analysisQuerySchema,
  categoryRanking,
  categorySeries,
  defaultAnalysisFilters,
  monthlySeries,
  periodsBetween,
  previousRange,
  seriesTotals,
  type Analysis,
  type AnalysisRow,
} from './analysis.ts';

// Fictitious categories and amounts (ADR 0019).
const salary = '01920000-0000-7000-8000-000000000101';
const market = '01920000-0000-7000-8000-000000000102';
const rent = '01920000-0000-7000-8000-000000000103';
const fuel = '01920000-0000-7000-8000-000000000104';

const row = (
  period: string,
  type: AnalysisRow['type'],
  categoryId: string,
  plannedCents: number,
  settledCents = plannedCents,
): AnalysisRow => ({ period, type, categoryId, plannedCents, settledCents });

// August had nothing at all; in October, part of it is still to be paid.
const analysis: Analysis = {
  from: '2026-07',
  to: '2026-10',
  rows: [
    row('2026-07', 'CREDIT', salary, 500_000),
    row('2026-07', 'DEBIT', rent, 180_000),
    row('2026-07', 'DEBIT', market, 60_000),
    row('2026-09', 'CREDIT', salary, 500_000),
    row('2026-09', 'DEBIT', rent, 180_000),
    row('2026-09', 'DEBIT', market, 80_000),
    row('2026-10', 'CREDIT', salary, 520_000, 0),
    row('2026-10', 'DEBIT', rent, 180_000, 0),
    row('2026-10', 'DEBIT', market, 70_000, 30_000),
    row('2026-10', 'DEBIT', fuel, 10_000),
  ],
};

describe('periodsBetween', () => {
  it('lists every competência of the range, across the year', () => {
    expect(periodsBetween('2026-11', '2027-02')).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ]);
    expect(periodsBetween('2026-10', '2026-10')).toEqual(['2026-10']);
  });
});

describe('analysisQuerySchema', () => {
  it('accepts up to 24 competências, in order', () => {
    expect(analysisQuerySchema.safeParse({ from: '2025-01', to: '2026-12' }).success).toBe(true);
  });

  it('refuses a range that ends before it starts', () => {
    const result = analysisQuerySchema.safeParse({ from: '2026-10', to: '2026-09' });
    expect(result.error?.issues[0]?.message).toBe(
      'A competência inicial precisa vir antes da final.',
    );
  });

  it('refuses more than 24 competências', () => {
    const result = analysisQuerySchema.safeParse({ from: '2025-01', to: '2027-01' });
    expect(result.error?.issues[0]?.message).toBe('Escolha no máximo 24 competências.');
  });
});

describe('monthlySeries', () => {
  it('has one point per competência, a month without transactions as zero', () => {
    const series = monthlySeries(analysis, defaultAnalysisFilters);

    expect(series.map((point) => point.period)).toEqual([
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
    expect(series[1]).toEqual({
      period: '2026-08',
      creditsCents: 0,
      debitsCents: 0,
      appliedCents: 0,
      balanceCents: 0,
    });
    expect(series[3]).toEqual({
      period: '2026-10',
      creditsCents: 520_000,
      debitsCents: 260_000,
      appliedCents: 0,
      balanceCents: 260_000,
    });
  });

  it('counts only what was settled in the settled view', () => {
    const october = monthlySeries(analysis, { ...defaultAnalysisFilters, view: 'SETTLED' })[3];

    expect(october).toEqual({
      period: '2026-10',
      creditsCents: 0,
      debitsCents: 40_000,
      appliedCents: 0,
      balanceCents: -40_000,
    });
  });

  it('keeps only the chosen type and categories', () => {
    const series = monthlySeries(analysis, {
      ...defaultAnalysisFilters,
      type: 'DEBIT',
      categoryIds: [market],
    });

    expect(series.map((point) => point.debitsCents)).toEqual([60_000, 0, 80_000, 70_000]);
    expect(series.every((point) => point.creditsCents === 0)).toBe(true);
  });

  it('adds up the whole range', () => {
    expect(seriesTotals(monthlySeries(analysis, defaultAnalysisFilters))).toEqual({
      creditsCents: 1_520_000,
      debitsCents: 760_000,
      expensesCents: 760_000,
      appliedCents: 0,
      balanceCents: 760_000,
    });
  });

  it('keeps applications apart from spending (ADR 0047)', () => {
    // Fuel stands in for a saving destination's category here.
    const saving = new Set([fuel]);
    const totals = seriesTotals(monthlySeries(analysis, defaultAnalysisFilters, saving));

    expect(totals).toMatchObject({
      debitsCents: 760_000,
      expensesCents: 750_000,
      appliedCents: 10_000,
      // The balance is after every debit, as on the dashboard.
      balanceCents: 760_000,
    });
    expect(
      categoryRanking(analysis, defaultAnalysisFilters, saving).map((s) => s.categoryId),
    ).toEqual([rent, market]);
  });
});

describe('previousRange', () => {
  it('is the range of the same length right before, across the year', () => {
    expect(previousRange('2026-01', '2026-06')).toEqual({ from: '2025-07', to: '2025-12' });
    expect(previousRange('2026-10', '2026-10')).toEqual({ from: '2026-09', to: '2026-09' });
  });
});

describe('categoryRanking', () => {
  it('ranks where the money went, with the monthly average and the share', () => {
    expect(categoryRanking(analysis, defaultAnalysisFilters)).toEqual([
      { categoryId: rent, totalCents: 540_000, averageCents: 135_000, shareBp: 7_105 },
      { categoryId: market, totalCents: 210_000, averageCents: 52_500, shareBp: 2_763 },
      { categoryId: fuel, totalCents: 10_000, averageCents: 2_500, shareBp: 132 },
    ]);
  });

  it('ranks the credits when the type filter asks for them', () => {
    expect(categoryRanking(analysis, { ...defaultAnalysisFilters, type: 'CREDIT' })).toEqual([
      { categoryId: salary, totalCents: 1_520_000, averageCents: 380_000, shareBp: 10_000 },
    ]);
  });

  it('leaves out categories with nothing in the view', () => {
    const settled = categoryRanking(analysis, { ...defaultAnalysisFilters, view: 'SETTLED' });

    expect(settled.map((share) => share.categoryId)).toEqual([rent, market, fuel]);
    expect(settled[0]?.totalCents).toBe(360_000);
  });
});

describe('categorySeries', () => {
  it('shows one category month by month, with its average', () => {
    expect(categorySeries(analysis, market, 'PLANNED')).toEqual({
      series: [
        { period: '2026-07', cents: 60_000 },
        { period: '2026-08', cents: 0 },
        { period: '2026-09', cents: 80_000 },
        { period: '2026-10', cents: 70_000 },
      ],
      averageCents: 52_500,
    });
  });
});
