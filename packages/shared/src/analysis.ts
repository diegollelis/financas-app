import { z } from 'zod';
import { FULL_BASIS_POINTS } from './budget.ts';
import { transactionTypeSchema, type TransactionType } from './category.ts';
import { periodSchema } from './money-and-dates.ts';

// Analysis of a range of competências (ADR 0037). The API sums the transactions by competência,
// type and category; these pure functions turn those sums into what the page shows, applying
// the filters on the client so changing them needs no new request.

/** The longest range: two years, enough to compare a month with the same one a year before. */
export const MAX_ANALYSIS_MONTHS = 24;

/** "2026-10" → a month count, to compare and subtract competências with integer math. */
function periodIndex(period: string): number {
  const [year, month] = period.split('-').map(Number);
  return (year ?? 0) * 12 + (month ?? 1) - 1;
}

/** Every competência from `from` to `to`, both included: ('2026-11', '2027-01') → 3 months. */
export function periodsBetween(from: string, to: string): string[] {
  const start = periodIndex(from);
  const count = periodIndex(to) - start + 1;
  return Array.from({ length: Math.max(count, 0) }, (_, offset) => {
    const index = start + offset;
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
  });
}

export const analysisQuerySchema = z
  .object({ from: periodSchema, to: periodSchema })
  .refine((query) => query.from <= query.to, {
    message: 'A competência inicial precisa vir antes da final.',
    path: ['to'],
  })
  .refine((query) => periodsBetween(query.from, query.to).length <= MAX_ANALYSIS_MONTHS, {
    message: `Escolha no máximo ${MAX_ANALYSIS_MONTHS} competências.`,
    path: ['to'],
  });

export type AnalysisQuery = z.infer<typeof analysisQuerySchema>;

/** The sums of one competência, type and category: everything launched, and what was settled. */
export const analysisRowSchema = z.object({
  period: periodSchema,
  type: transactionTypeSchema,
  categoryId: z.uuid(),
  plannedCents: z.number().int().nonnegative(),
  settledCents: z.number().int().nonnegative(),
});

export type AnalysisRow = z.infer<typeof analysisRowSchema>;

export const analysisSchema = z.object({
  from: periodSchema,
  to: periodSchema,
  rows: z.array(analysisRowSchema),
});

export type Analysis = z.infer<typeof analysisSchema>;

/** The same two views as the month's dashboard (ADR 0031). */
export const analysisViewSchema = z.enum(['PLANNED', 'SETTLED']);
export const analysisTypeFilterSchema = z.enum(['BOTH', 'CREDIT', 'DEBIT']);

export interface AnalysisFilters {
  view: z.infer<typeof analysisViewSchema>;
  type: z.infer<typeof analysisTypeFilterSchema>;
  /** Only these categories; empty means all of them. */
  categoryIds: string[];
}

export const defaultAnalysisFilters: AnalysisFilters = {
  view: 'PLANNED',
  type: 'BOTH',
  categoryIds: [],
};

const amountOf = (row: AnalysisRow, view: AnalysisFilters['view']) =>
  view === 'SETTLED' ? row.settledCents : row.plannedCents;

function matches(row: AnalysisRow, filters: AnalysisFilters) {
  if (filters.type !== 'BOTH' && row.type !== filters.type) return false;
  return filters.categoryIds.length === 0 || filters.categoryIds.includes(row.categoryId);
}

export interface MonthlyPoint {
  period: string;
  creditsCents: number;
  debitsCents: number;
  /** Credits minus debits of the competência. */
  balanceCents: number;
}

/** One point per competência of the range, months without transactions included as zeros. */
export function monthlySeries(analysis: Analysis, filters: AnalysisFilters): MonthlyPoint[] {
  const points = new Map(
    periodsBetween(analysis.from, analysis.to).map((period) => [
      period,
      { period, creditsCents: 0, debitsCents: 0, balanceCents: 0 },
    ]),
  );
  for (const row of analysis.rows) {
    const point = points.get(row.period);
    if (!point || !matches(row, filters)) continue;
    const cents = amountOf(row, filters.view);
    if (row.type === 'CREDIT') point.creditsCents += cents;
    else point.debitsCents += cents;
    point.balanceCents = point.creditsCents - point.debitsCents;
  }
  return [...points.values()];
}

/** The whole range: received, spent and what was left. */
export function seriesTotals(series: MonthlyPoint[]) {
  const creditsCents = series.reduce((sum, point) => sum + point.creditsCents, 0);
  const debitsCents = series.reduce((sum, point) => sum + point.debitsCents, 0);
  return { creditsCents, debitsCents, balanceCents: creditsCents - debitsCents };
}

export interface CategoryShare {
  categoryId: string;
  totalCents: number;
  /** Over every month of the range, including the ones without this category. */
  averageCents: number;
  /** Of the total of the ranking's type, in basis points (10000 = 100%). */
  shareBp: number;
}

/**
 * Where the money went: the debit categories of the range, largest first. With the type filter
 * on credits, the credit categories instead (where it came from).
 */
export function categoryRanking(analysis: Analysis, filters: AnalysisFilters): CategoryShare[] {
  const type: TransactionType = filters.type === 'CREDIT' ? 'CREDIT' : 'DEBIT';
  const months = periodsBetween(analysis.from, analysis.to).length;
  const totals = new Map<string, number>();
  for (const row of analysis.rows) {
    if (row.type !== type || !matches(row, { ...filters, type })) continue;
    totals.set(row.categoryId, (totals.get(row.categoryId) ?? 0) + amountOf(row, filters.view));
  }
  const grand = [...totals.values()].reduce((sum, cents) => sum + cents, 0);
  return [...totals.entries()]
    .filter(([, cents]) => cents > 0)
    .map(([categoryId, totalCents]) => ({
      categoryId,
      totalCents,
      averageCents: Math.round(totalCents / months),
      shareBp: Math.round((totalCents * FULL_BASIS_POINTS) / grand),
    }))
    .sort((a, b) => b.totalCents - a.totalCents);
}

/** One category, month by month, and its monthly average over the range. */
export function categorySeries(
  analysis: Analysis,
  categoryId: string,
  view: AnalysisFilters['view'],
) {
  const points = new Map(periodsBetween(analysis.from, analysis.to).map((period) => [period, 0]));
  for (const row of analysis.rows) {
    if (row.categoryId !== categoryId || !points.has(row.period)) continue;
    points.set(row.period, (points.get(row.period) ?? 0) + amountOf(row, view));
  }
  const series = [...points.entries()].map(([period, cents]) => ({ period, cents }));
  const total = series.reduce((sum, point) => sum + point.cents, 0);
  return { series, averageCents: Math.round(total / series.length) };
}
