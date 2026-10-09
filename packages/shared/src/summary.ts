import { z } from 'zod';
import { budgetDestinationKindSchema } from './budget-destination.ts';
import {
  budgetSchema,
  FULL_BASIS_POINTS,
  shareOfIncome,
  splitShares,
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

/** One side of the month (credits, debits, expenses). `pendingCents` includes `overdueCents`. */
const sideSchema = z.object({
  totalCents: z.number().int(),
  settledCents: z.number().int(),
  pendingCents: z.number().int(),
  overdueCents: z.number().int(),
  overdueCount: z.number().int(),
});

/**
 * One destination of the budget, with real money (ADR 0047): its goal, what was applied to it
 * (paid) and what is still to apply (pending). For Despesas, the applications are the expenses.
 */
const destinationSummarySchema = z.object({
  destinationId: z.uuid(),
  name: z.string(),
  kind: budgetDestinationKindSchema,
  basisPoints: z.number().int(),
  /** Despesas: net income × %. A saving destination: what is left after expenses (planned) × %. */
  targetCents: z.number().int(),
  /** Paid: expenses for Despesas; transactions in the destination's category for the others. */
  appliedCents: z.number().int(),
  /** Pending, scheduled for this competência (recurrences and installments included). */
  pendingCents: z.number().int(),
});

export type DestinationSummary = z.infer<typeof destinationSummarySchema>;

/** `GET /workspaces/:workspaceId/summary/:period`: the month's dashboard, never stored. */
export const summarySchema = z.object({
  period: periodSchema,
  credits: sideSchema,
  debits: sideSchema,
  /** Credits − debits: the money really free, after expenses and applications. */
  balance: twoViewsSchema,
  /** The debits outside the saving destinations' categories. */
  expenses: sideSchema,
  /** The debits in the saving destinations' categories: money put aside. */
  applied: twoViewsSchema,
  /** Credits − expenses: the base of the saving destinations' goals (never minus applications). */
  available: twoViewsSchema,
  budget: budgetSchema,
  destinations: z.array(destinationSummarySchema),
  /**
   * What the saving destinations leave without a destination, when their shares add up to less
   * than 100%: the missing share and what is available minus their goals, so the cents add up.
   */
  unallocated: z
    .object({ basisPoints: z.number().int(), targetCents: z.number().int() })
    .default({ basisPoints: 0, targetCents: 0 }),
  /** Expenses goal − all expenses: positive while within the goal, negative when over it. */
  expensesLeftCents: z.number().int(),
  /**
   * Of the pending amounts, how much is still an estimate of a variable recurrence (ADR 0038):
   * the planned view counts it, so the dashboard says so.
   */
  estimatedCents: z.number().int().default(0),
});

export type Summary = z.infer<typeof summarySchema>;

type SummaryTransaction = Pick<
  Transaction,
  'type' | 'amountCents' | 'dueDate' | 'settledAt' | 'categoryId'
> & {
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
 * The month's indicators (ADRs 0031, 0047), computed from the competência's transactions and
 * budget. Pure: same input, same output, so it is tested without a database. `today` is
 * `YYYY-MM-DD` in São Paulo (`todayIso()`), for what is overdue.
 *
 * A debit in a saving destination's category is an application; every other debit is an
 * expense. The saving goals are a share of credits − expenses, so applying never lowers its own
 * goal; Despesas is a share of the net income set in the budget.
 */
export function summarizePeriod(
  transactions: SummaryTransaction[],
  budget: Budget,
  today: string,
): Summary {
  const savingCategories = new Set(
    budget.shares.flatMap((share) => (share.categoryId ? [share.categoryId] : [])),
  );
  const isApplication = (transaction: SummaryTransaction) =>
    transaction.type === 'DEBIT' && savingCategories.has(transaction.categoryId);

  const credits = side(
    transactions.filter((transaction) => transaction.type === 'CREDIT'),
    today,
  );
  const debits = side(
    transactions.filter((transaction) => transaction.type === 'DEBIT'),
    today,
  );
  const expenses = side(
    transactions.filter(
      (transaction) => transaction.type === 'DEBIT' && !isApplication(transaction),
    ),
    today,
  );
  const applications = transactions.filter(isApplication);
  const available = {
    plannedCents: credits.totalCents - expenses.totalCents,
    settledCents: credits.settledCents - expenses.settledCents,
  };
  // Nothing to set aside when expenses pass the credits: the goals are zero, not negative.
  const savingBase = Math.max(0, available.plannedCents);
  // Split together, so the goals add up to the cent (and the "Sem destino" rest is exact).
  const savingShares = budget.shares.filter((share) => share.kind === 'SAVINGS');
  const savingParts = splitShares(
    savingBase,
    savingShares.map((share) => share.basisPoints),
  );
  const savingTargets = new Map(
    savingShares.map((share, index) => [share.destinationId, savingParts[index] ?? 0]),
  );

  const destinations = budget.shares.map((share) => {
    if (share.kind === 'EXPENSES') {
      return {
        destinationId: share.destinationId,
        name: share.name,
        kind: share.kind,
        basisPoints: share.basisPoints,
        targetCents: shareOfIncome(budget.netIncomeCents, share.basisPoints),
        appliedCents: expenses.settledCents,
        pendingCents: expenses.pendingCents,
      };
    }
    const own = side(
      applications.filter((transaction) => transaction.categoryId === share.categoryId),
      today,
    );
    return {
      destinationId: share.destinationId,
      name: share.name,
      kind: share.kind,
      basisPoints: share.basisPoints,
      targetCents: savingTargets.get(share.destinationId) ?? 0,
      appliedCents: own.settledCents,
      pendingCents: own.pendingCents,
    };
  });
  const expensesTarget =
    destinations.find((destination) => destination.kind === 'EXPENSES')?.targetCents ?? 0;
  const appliedSide = side(applications, today);
  const savings = destinations.filter((destination) => destination.kind === 'SAVINGS');
  const unallocatedBasisPoints = Math.max(
    0,
    FULL_BASIS_POINTS - savings.reduce((sum, destination) => sum + destination.basisPoints, 0),
  );

  return {
    period: budget.period,
    credits,
    debits,
    balance: {
      plannedCents: credits.totalCents - debits.totalCents,
      settledCents: credits.settledCents - debits.settledCents,
    },
    expenses,
    applied: { plannedCents: appliedSide.totalCents, settledCents: appliedSide.settledCents },
    available,
    budget,
    destinations,
    unallocated: {
      basisPoints: unallocatedBasisPoints,
      targetCents:
        unallocatedBasisPoints > 0
          ? savingBase - savings.reduce((sum, destination) => sum + destination.targetCents, 0)
          : 0,
    },
    expensesLeftCents: expensesTarget - expenses.totalCents,
    estimatedCents: transactions
      .filter((transaction) => transaction.amountEstimated && !transaction.settledAt)
      .reduce((sum, transaction) => sum + transaction.amountCents, 0),
  };
}
