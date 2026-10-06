import { z } from 'zod';
import {
  budgetSchema,
  budgetShareKeys,
  budgetShareKeySchema,
  shareOfIncome,
  type Budget,
} from './budget.ts';
import { periodSchema } from './money-and-dates.ts';
import { transactionStatus, type Transaction } from './transaction.ts';

/**
 * Two views of every indicator (ADR 0031): `planned` counts every transaction of the competência
 * (the spreadsheet's "simulado": as if everything were settled); `settled` counts only what was
 * actually received or paid.
 */
const twoViewsSchema = z.object({
  plannedCents: z.number().int(),
  settledCents: z.number().int(),
});

/** One side of the month (credits or debits). `pendingCents` includes `overdueCents`. */
const sideSchema = z.object({
  totalCents: z.number().int(),
  settledCents: z.number().int(),
  pendingCents: z.number().int(),
  overdueCents: z.number().int(),
  overdueCount: z.number().int(),
});

/** One budget destination: its percentage applied to three bases. */
const shareSchema = z.object({
  key: budgetShareKeySchema,
  basisPoints: z.number().int(),
  /** Net income × percentage: the goal set in the budget. */
  targetCents: z.number().int(),
  /** All credits × percentage. */
  plannedCents: z.number().int(),
  /** Credits received × percentage. */
  settledCents: z.number().int(),
});

/** `GET /workspaces/:workspaceId/summary/:period`: the month's dashboard, never stored. */
export const summarySchema = z.object({
  period: periodSchema,
  credits: sideSchema,
  debits: sideSchema,
  /** Credits − debits. */
  balance: twoViewsSchema,
  budget: budgetSchema,
  shares: z.array(shareSchema),
  /** Expenses goal − all debits: positive while within the goal, negative when over it. */
  expensesLeftCents: z.number().int(),
  /** What is left after the debits and after setting aside every other destination. */
  result: twoViewsSchema,
  /**
   * Of the pending amounts, how much is still an estimate of a variable recurrence (ADR 0038):
   * the planned view counts it, so the dashboard says so.
   */
  estimatedCents: z.number().int().default(0),
});

export type Summary = z.infer<typeof summarySchema>;

type SummaryTransaction = Pick<Transaction, 'type' | 'amountCents' | 'dueDate' | 'settledAt'> & {
  amountEstimated?: boolean;
};

function side(transactions: SummaryTransaction[], today: string): Summary['credits'] {
  const totals = { totalCents: 0, settledCents: 0, pendingCents: 0, overdueCents: 0 };
  let overdueCount = 0;
  for (const transaction of transactions) {
    const status = transactionStatus(transaction, today);
    totals.totalCents += transaction.amountCents;
    if (status === 'SETTLED') {
      totals.settledCents += transaction.amountCents;
      continue;
    }
    totals.pendingCents += transaction.amountCents;
    if (status === 'OVERDUE') {
      totals.overdueCents += transaction.amountCents;
      overdueCount += 1;
    }
  }
  return { ...totals, overdueCount };
}

/**
 * The spreadsheet's indicators (docs/dominio/planilha-origem.md), computed from the competência's
 * transactions and budget. Pure: same input, same output, so it is tested without a database.
 * `today` is `YYYY-MM-DD` in São Paulo (`todayIso()`), for what is overdue.
 */
export function summarizePeriod(
  transactions: SummaryTransaction[],
  budget: Budget,
  today: string,
): Summary {
  const credits = side(
    transactions.filter((transaction) => transaction.type === 'CREDIT'),
    today,
  );
  const debits = side(
    transactions.filter((transaction) => transaction.type === 'DEBIT'),
    today,
  );
  const shares = budgetShareKeys.map((key) => ({
    key,
    basisPoints: budget[key],
    targetCents: shareOfIncome(budget.netIncomeCents, budget[key]),
    plannedCents: shareOfIncome(credits.totalCents, budget[key]),
    settledCents: shareOfIncome(credits.settledCents, budget[key]),
  }));
  // Expenses are the debits themselves; the other destinations are money set aside.
  const setAside = shares.filter((share) => share.key !== 'expensesBp');
  const expensesTarget = shares.find((share) => share.key === 'expensesBp')?.targetCents ?? 0;

  return {
    period: budget.period,
    credits,
    debits,
    balance: {
      plannedCents: credits.totalCents - debits.totalCents,
      settledCents: credits.settledCents - debits.settledCents,
    },
    budget,
    shares,
    expensesLeftCents: expensesTarget - debits.totalCents,
    result: {
      plannedCents:
        credits.totalCents -
        debits.totalCents -
        setAside.reduce((sum, share) => sum + share.plannedCents, 0),
      settledCents:
        credits.settledCents -
        debits.settledCents -
        setAside.reduce((sum, share) => sum + share.settledCents, 0),
    },
    estimatedCents: transactions
      .filter((transaction) => transaction.amountEstimated && !transaction.settledAt)
      .reduce((sum, transaction) => sum + transaction.amountCents, 0),
  };
}
