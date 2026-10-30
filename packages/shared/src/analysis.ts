import { z } from 'zod';
import { FULL_BASIS_POINTS } from './budget.ts';
import { transactionTypeSchema, type TransactionType } from './category.ts';
import { periodSchema } from './money-and-dates.ts';
import { paymentMethodSchema, type PaymentMethod } from './payment-method.ts';

// Analysis of a range of competências (ADR 0037). The API sums the transactions by competência,
// type, category and merchant (ADR 0053); these pure functions turn those sums into what the page shows, applying
// the filters on the client so changing them needs no new request.

/** The longest range: two years, enough to compare a month with the same one a year before. */
export const MAX_ANALYSIS_MONTHS = 24;

/** "2026-10" → a month count, to compare and subtract competências with integer math. */
function periodIndex(period: string): number {
  const [year, month] = period.split('-').map(Number);
  return (year ?? 0) * 12 + (month ?? 1) - 1;
}

/**
 * The range of the same length right before this one, to compare with: the 6 months before the
 * last 6, the month before a single one.
 */
export function previousRange(from: string, to: string): { from: string; to: string } {
  const months = periodsBetween(from, to).length;
  const end = periodIndex(from) - 1;
  const start = end - months + 1;
  const name = (index: number) =>
    `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
  return { from: name(start), to: name(end) };
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
    message: 'O mês inicial precisa vir antes do final.',
    path: ['to'],
  })
  .refine((query) => periodsBetween(query.from, query.to).length <= MAX_ANALYSIS_MONTHS, {
    message: `Escolha no máximo ${MAX_ANALYSIS_MONTHS} meses.`,
    path: ['to'],
  });

export type AnalysisQuery = z.infer<typeof analysisQuerySchema>;

/**
 * The sums of one competência, type, category, merchant and payment method (none: null):
 * everything launched, and what was settled.
 */
export const analysisRowSchema = z.object({
  period: periodSchema,
  type: transactionTypeSchema,
  categoryId: z.uuid(),
  merchantId: z.uuid().nullable().default(null),
  /** How it was paid or received (ADR 0054); null when not given. */
  paymentMethod: paymentMethodSchema.nullable().default(null),
  plannedCents: z.number().int().nonnegative(),
  settledCents: z.number().int().nonnegative(),
  /**
   * The part of `plannedCents` pending with no due date in a category marked "Nem renda nem
   * gasto" (`undatedReceivable` / `undatedPayable`, ADR 0057): a loan with no month to come back
   * or be paid, out of the planned view, as on the dashboard.
   */
  undatedCents: z.number().int().nonnegative().default(0),
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
  /** Only these payment methods, null for "Sem meio"; empty means all of them (ADR 0037 note). */
  paymentMethods: (PaymentMethod | null)[];
  /** Only these merchants; empty means all, with or without one (ADR 0037 note). */
  merchantIds: string[];
}

export const defaultAnalysisFilters: AnalysisFilters = {
  view: 'PLANNED',
  type: 'BOTH',
  categoryIds: [],
  paymentMethods: [],
  merchantIds: [],
};

/** What a row counts in a view: the planned one leaves out what has no due date (ADR 0057 note). */
const amountOf = (row: AnalysisRow, view: AnalysisFilters['view']) =>
  view === 'SETTLED' ? row.settledCents : row.plannedCents - row.undatedCents;

/** Whether a row passes every filter: each one empty means "all". */
function matches(row: AnalysisRow, filters: AnalysisFilters) {
  if (filters.type !== 'BOTH' && row.type !== filters.type) return false;
  if (filters.categoryIds.length > 0 && !filters.categoryIds.includes(row.categoryId)) return false;
  if (filters.paymentMethods.length > 0 && !filters.paymentMethods.includes(row.paymentMethod)) {
    return false;
  }
  return (
    filters.merchantIds.length === 0 ||
    (row.merchantId !== null && filters.merchantIds.includes(row.merchantId))
  );
}

export interface MonthlyPoint {
  period: string;
  creditsCents: number;
  /** Every debit: expenses and applications (ADR 0047). */
  debitsCents: number;
  /** The debits in a saving destination's category: money put aside, not spent. */
  appliedCents: number;
  /** The debits in a category marked "Nem renda nem gasto" (ADR 0056): a loan, not spending. */
  neutralCents: number;
  /** The credits in such a category: money coming back, not income (ADR 0056). */
  neutralCreditsCents: number;
  /**
   * "Para guardar": in the planned view, what was paid into the goals plus what is pending there
   * up to the month's leftover, the dashboard's ceiling (ADR 0064 note); in the settled view,
   * what was paid, the same as `appliedCents`.
   */
  toSaveCents: number;
  /** Credits minus debits of the competência. */
  balanceCents: number;
  /** Left out of the planned view (ADR 0057 note): to receive, and to pay, with no due date. */
  undatedCreditsCents: number;
  undatedDebitsCents: number;
}

/** No saving destination: every debit is an expense. */
const NONE: ReadonlySet<string> = new Set();

/**
 * One point per competência of the range, months without transactions included as zeros.
 * `savingCategoryIds`: the saving destinations' categories, whose debits are applications.
 * `neutralCategoryIds`: the ones marked "Nem renda nem gasto" (ADR 0056), whose debits are not
 * spending either.
 */
export function monthlySeries(
  analysis: Analysis,
  filters: AnalysisFilters,
  savingCategoryIds: ReadonlySet<string> = NONE,
  neutralCategoryIds: ReadonlySet<string> = NONE,
): MonthlyPoint[] {
  const points = new Map(
    periodsBetween(analysis.from, analysis.to).map((period) => [
      period,
      {
        period,
        creditsCents: 0,
        debitsCents: 0,
        appliedCents: 0,
        neutralCents: 0,
        neutralCreditsCents: 0,
        toSaveCents: 0,
        balanceCents: 0,
        undatedCreditsCents: 0,
        undatedDebitsCents: 0,
      },
    ]),
  );
  // What was already paid into the goals in each month: a fact, never cut by the ceiling.
  const paidIntoGoals = new Map<string, number>();
  for (const row of analysis.rows) {
    const point = points.get(row.period);
    if (!point || !matches(row, filters)) continue;
    const cents = amountOf(row, filters.view);
    if (row.type === 'CREDIT') point.creditsCents += cents;
    else point.debitsCents += cents;
    if (filters.view === 'PLANNED') {
      if (row.type === 'CREDIT') point.undatedCreditsCents += row.undatedCents;
      else point.undatedDebitsCents += row.undatedCents;
    }
    if (row.type === 'DEBIT' && savingCategoryIds.has(row.categoryId)) {
      point.appliedCents += cents;
      paidIntoGoals.set(row.period, (paidIntoGoals.get(row.period) ?? 0) + row.settledCents);
    }
    if (neutralCategoryIds.has(row.categoryId)) {
      if (row.type === 'DEBIT') point.neutralCents += cents;
      else point.neutralCreditsCents += cents;
    }
    point.balanceCents = point.creditsCents - point.debitsCents;
  }
  for (const point of points.values()) {
    point.toSaveCents =
      filters.view === 'SETTLED'
        ? point.appliedCents
        : toSave(point, paidIntoGoals.get(point.period) ?? 0);
  }
  return [...points.values()];
}

/**
 * The dashboard's ceiling of the goals (ADR 0064 note), for one month of the planned view: what
 * is pending in the goals counts only up to the month's leftover (credits that are income, less
 * spending and the "Nem renda nem gasto" debits, as `available`), and what was paid always counts.
 */
function toSave(point: MonthlyPoint, paidCents: number) {
  const expensesCents = point.debitsCents - point.appliedCents - point.neutralCents;
  const leftoverCents =
    point.creditsCents - point.neutralCreditsCents - expensesCents - point.neutralCents;
  return Math.max(paidCents, Math.min(point.appliedCents, Math.max(0, leftoverCents)));
}

/**
 * The whole range: received, spent (expenses only: no applications, nothing neutral), applied,
 * and what was left after every debit, as on the dashboard (ADRs 0047, 0056).
 */
export function seriesTotals(series: MonthlyPoint[]) {
  const creditsCents = series.reduce((sum, point) => sum + point.creditsCents, 0);
  const debitsCents = series.reduce((sum, point) => sum + point.debitsCents, 0);
  const appliedCents = series.reduce((sum, point) => sum + point.appliedCents, 0);
  const neutralCents = series.reduce((sum, point) => sum + point.neutralCents, 0);
  return {
    undatedCreditsCents: series.reduce((sum, point) => sum + point.undatedCreditsCents, 0),
    undatedDebitsCents: series.reduce((sum, point) => sum + point.undatedDebitsCents, 0),
    creditsCents,
    debitsCents,
    expensesCents: debitsCents - appliedCents - neutralCents,
    appliedCents,
    // Month by month, so a month that leaves money never covers one that does not.
    toSaveCents: series.reduce((sum, point) => sum + point.toSaveCents, 0),
    neutralCents,
    neutralCreditsCents: series.reduce((sum, point) => sum + point.neutralCreditsCents, 0),
    balanceCents: creditsCents - debitsCents,
  };
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
 * Where the money went: the debit categories of the range, largest first, without the saving
 * destinations' (an application is not spending, ADR 0047). With the type filter on credits, the
 * credit categories instead (where it came from).
 */
export function categoryRanking(
  analysis: Analysis,
  filters: AnalysisFilters,
  savingCategoryIds: ReadonlySet<string> = NONE,
): CategoryShare[] {
  const type: TransactionType = filters.type === 'CREDIT' ? 'CREDIT' : 'DEBIT';
  const months = periodsBetween(analysis.from, analysis.to).length;
  const totals = new Map<string, number>();
  for (const row of analysis.rows) {
    if (row.type !== type || !matches(row, { ...filters, type })) continue;
    if (type === 'DEBIT' && savingCategoryIds.has(row.categoryId)) continue;
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

export interface MerchantShare {
  /** null: the transactions with no merchant. */
  merchantId: string | null;
  totalCents: number;
  /** Over every month of the range, including the ones without this merchant. */
  averageCents: number;
  /** Of the category's total, in basis points (10000 = 100%). */
  shareBp: number;
}

/**
 * Where the money of one category went in the range (ADR 0053): each merchant, largest first,
 * and what had no merchant at the end. "Quanto foi para cada mercado."
 */
export function merchantRanking(
  analysis: Analysis,
  categoryId: string,
  view: AnalysisFilters['view'],
): MerchantShare[] {
  const months = periodsBetween(analysis.from, analysis.to).length;
  const totals = new Map<string | null, number>();
  for (const row of analysis.rows) {
    if (row.categoryId !== categoryId) continue;
    totals.set(row.merchantId, (totals.get(row.merchantId) ?? 0) + amountOf(row, view));
  }
  const grand = [...totals.values()].reduce((sum, cents) => sum + cents, 0);
  return [...totals.entries()]
    .filter(([, cents]) => cents > 0)
    .map(([merchantId, totalCents]) => ({
      merchantId,
      totalCents,
      averageCents: Math.round(totalCents / months),
      shareBp: Math.round((totalCents * FULL_BASIS_POINTS) / grand),
    }))
    .sort((a, b) =>
      a.merchantId === null ? 1 : b.merchantId === null ? -1 : b.totalCents - a.totalCents,
    );
}

export interface PaymentMethodShare {
  /** null: the transactions with no method ("Sem meio"). */
  paymentMethod: PaymentMethod | null;
  totalCents: number;
  /** Over every month of the range, including the ones without this method. */
  averageCents: number;
  /** Of the total, in basis points (10000 = 100%). */
  shareBp: number;
}

/**
 * How the money went out in the range (ADR 0054), as the category ranking sees it: the expenses
 * (no applications), or the credits with the type filter on them, within the categories picked.
 * Each method, largest first, and what had none last ("Sem meio": what is left to fill in).
 */
export function paymentMethodRanking(
  analysis: Analysis,
  filters: AnalysisFilters,
  savingCategoryIds: ReadonlySet<string> = NONE,
): PaymentMethodShare[] {
  const type: TransactionType = filters.type === 'CREDIT' ? 'CREDIT' : 'DEBIT';
  const months = periodsBetween(analysis.from, analysis.to).length;
  const totals = new Map<PaymentMethod | null, number>();
  for (const row of analysis.rows) {
    if (row.type !== type || !matches(row, { ...filters, type })) continue;
    if (type === 'DEBIT' && savingCategoryIds.has(row.categoryId)) continue;
    totals.set(
      row.paymentMethod,
      (totals.get(row.paymentMethod) ?? 0) + amountOf(row, filters.view),
    );
  }
  const grand = [...totals.values()].reduce((sum, cents) => sum + cents, 0);
  return [...totals.entries()]
    .filter(([, cents]) => cents > 0)
    .map(([paymentMethod, totalCents]) => ({
      paymentMethod,
      totalCents,
      averageCents: Math.round(totalCents / months),
      shareBp: Math.round((totalCents * FULL_BASIS_POINTS) / grand),
    }))
    .sort((a, b) =>
      a.paymentMethod === null ? 1 : b.paymentMethod === null ? -1 : b.totalCents - a.totalCents,
    );
}
