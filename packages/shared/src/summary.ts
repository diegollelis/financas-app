import { z } from 'zod';
import { budgetDestinationKindSchema } from './budget-destination.ts';
import { budgetSchema, FULL_BASIS_POINTS, splitShares, type Budget } from './budget.ts';
import { periodSchema } from './money-and-dates.ts';
import {
  transactionStatus,
  undatedPayable,
  undatedReceivable,
  type Transaction,
} from './transaction.ts';

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
  /**
   * Credits − debits: the money really free, after expenses and applications. The planned view
   * leaves out `undatedCents` (ADR 0057).
   */
  balance: twoViewsSchema,
  /** The debits outside the saving destinations' categories and the neutral ones (ADR 0056). */
  expenses: sideSchema,
  /** The debits in the saving destinations' categories: money put aside. */
  applied: twoViewsSchema,
  /**
   * Credits − expenses, without the neutral credits and minus the neutral debits (never minus
   * applications): "Sobra prevista", a fact of the month that tells whether the goals are
   * covered, no longer their base (ADR 0064). A loan lent leaves less; money coming back, or
   * borrowed, stays in the balance only (ADR 0056 note).
   */
  available: twoViewsSchema,
  budget: budgetSchema,
  destinations: z.array(destinationSummarySchema),
  /**
   * The share of the net income that neither the limit nor a goal gets ("Sem meta", ADR 0064):
   * 100% minus every share, and the income minus every goal, so the cents add up.
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
  /**
   * The month's credits, planned, without the shares of a split (`splitOfId`: what someone pays
   * back is not income): set beside the budget's net income on the dashboard, and offered to fill
   * it ("Usar as entradas do mês", ADR 0046 note).
   */
  incomeCents: z.number().int().default(0),
  /**
   * The month's credits, planned, in the categories marked "Nem renda nem gasto" (ADR 0056):
   * left out of `incomeCents`, so the dashboard says how much was left out.
   */
  neutralIncomeCents: z.number().int().default(0),
  /**
   * The pending credits with no due date in those categories (`undatedReceivable`, ADR 0057):
   * still in the credits, left out of the planned balance, since nobody knows when they come.
   */
  undatedCents: z.number().int().default(0),
  /**
   * The pending debits with no due date in those categories (`undatedPayable`, ADR 0057 note):
   * still in the debits, left out of the planned balance and of what is left to save.
   */
  undatedPayableCents: z.number().int().default(0),
});

export type Summary = z.infer<typeof summarySchema>;

type SummaryTransaction = Pick<
  Transaction,
  'type' | 'amountCents' | 'dueDate' | 'settledAt' | 'categoryId'
> & {
  amountEstimated?: boolean;
  splitOfId?: string | null;
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
 *
 * `neutralCategoryIds`: the categories marked "Nem renda nem gasto" (ADR 0056). Their debits are
 * not expenses and their credits are not income; the debits still lower what is left to save, the
 * credits stay in the balance only (ADR 0056 note), the planned one without those still to receive
 * or to pay with no due date (ADR 0057).
 */
export function summarizePeriod(
  transactions: SummaryTransaction[],
  budget: Budget,
  today: string,
  neutralCategoryIds: ReadonlySet<string> = new Set(),
): Summary {
  const savingCategories = new Set(
    budget.shares.flatMap((share) => (share.categoryId ? [share.categoryId] : [])),
  );
  const isApplication = (transaction: SummaryTransaction) =>
    transaction.type === 'DEBIT' && savingCategories.has(transaction.categoryId);
  const isNeutral = (transaction: SummaryTransaction) =>
    neutralCategoryIds.has(transaction.categoryId);

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
      (transaction) =>
        transaction.type === 'DEBIT' && !isApplication(transaction) && !isNeutral(transaction),
    ),
    today,
  );
  const neutralDebits = side(
    transactions.filter((transaction) => transaction.type === 'DEBIT' && isNeutral(transaction)),
    today,
  );
  const neutralCredits = side(
    transactions.filter((transaction) => transaction.type === 'CREDIT' && isNeutral(transaction)),
    today,
  );
  const applications = transactions.filter(isApplication);
  // Money borrowed to pay back with no due date: not this month's, so not in the planned view
  // (ADR 0057 note).
  const undatedPayableCents = transactions
    .filter((transaction) => undatedPayable(transaction, neutralCategoryIds))
    .reduce((total, transaction) => total + transaction.amountCents, 0);
  const available = {
    plannedCents:
      credits.totalCents -
      neutralCredits.totalCents -
      expenses.totalCents -
      (neutralDebits.totalCents - undatedPayableCents),
    settledCents:
      credits.settledCents -
      neutralCredits.settledCents -
      expenses.settledCents -
      neutralDebits.settledCents,
  };
  // Every share is of the net income (ADR 0064), split together so the goals add up to the cent
  // (and the "Sem meta" rest is exact).
  const parts = splitShares(
    budget.netIncomeCents,
    budget.shares.map((share) => share.basisPoints),
  );
  const targets = new Map(
    budget.shares.map((share, index) => [share.destinationId, parts[index] ?? 0]),
  );

  const destinations = budget.shares.map((share) => {
    if (share.kind === 'EXPENSES') {
      return {
        destinationId: share.destinationId,
        name: share.name,
        kind: share.kind,
        basisPoints: share.basisPoints,
        targetCents: targets.get(share.destinationId) ?? 0,
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
      targetCents: targets.get(share.destinationId) ?? 0,
      appliedCents: own.settledCents,
      pendingCents: own.pendingCents,
    };
  });
  const expensesTarget =
    destinations.find((destination) => destination.kind === 'EXPENSES')?.targetCents ?? 0;
  const appliedSide = side(applications, today);
  const unallocatedBasisPoints = Math.max(
    0,
    FULL_BASIS_POINTS - destinations.reduce((sum, destination) => sum + destination.basisPoints, 0),
  );

  const ownCredits = transactions.filter(
    (transaction) => transaction.type === 'CREDIT' && !transaction.splitOfId,
  );
  const sum = (list: SummaryTransaction[]) =>
    list.reduce((total, transaction) => total + transaction.amountCents, 0);
  const undatedCents = sum(
    transactions.filter((transaction) => undatedReceivable(transaction, neutralCategoryIds)),
  );

  return {
    period: budget.period,
    incomeCents: sum(ownCredits.filter((transaction) => !isNeutral(transaction))),
    neutralIncomeCents: sum(ownCredits.filter(isNeutral)),
    undatedCents,
    undatedPayableCents,
    credits,
    debits,
    balance: {
      plannedCents: credits.totalCents - undatedCents - (debits.totalCents - undatedPayableCents),
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
          ? budget.netIncomeCents -
            destinations.reduce((sum, destination) => sum + destination.targetCents, 0)
          : 0,
    },
    expensesLeftCents: expensesTarget - expenses.totalCents,
    estimatedCents: transactions
      .filter((transaction) => transaction.amountEstimated && !transaction.settledAt)
      .reduce((sum, transaction) => sum + transaction.amountCents, 0),
  };
}
