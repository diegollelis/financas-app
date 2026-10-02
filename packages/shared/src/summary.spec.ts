import { describe, expect, it } from 'vitest';
import { DEFAULT_BUDGET_SHARES, type Budget } from './budget.ts';
import { summarizePeriod } from './summary.ts';

// Fictitious data (ADR 0019). "Today" is Oct 15th, 2026.
const today = '2026-10-15';
const budget: Budget = {
  period: '2026-10',
  netIncomeCents: 500_000,
  grossIncomeCents: null,
  ...DEFAULT_BUDGET_SHARES,
  source: 'SAVED',
  inheritedFrom: null,
};

const credit = (amountCents: number, settledAt: string | null = null) => ({
  type: 'CREDIT' as const,
  amountCents,
  dueDate: null,
  settledAt,
});
const debit = (amountCents: number, dueDate: string | null, settledAt: string | null = null) => ({
  type: 'DEBIT' as const,
  amountCents,
  dueDate,
  settledAt,
});

const month = [
  credit(500_000, '2026-10-05'), // salary, received
  credit(100_000), // freelance, still to receive
  debit(15_990, '2026-10-10'), // past its due date
  debit(35_000, null, '2026-10-08'), // paid
  debit(200_000, '2026-10-20'), // due later
];

describe('summarizePeriod', () => {
  it('splits credits and debits into settled, pending and overdue', () => {
    const summary = summarizePeriod(month, budget, today);

    expect(summary.credits).toEqual({
      totalCents: 600_000,
      settledCents: 500_000,
      pendingCents: 100_000,
      overdueCents: 0,
      overdueCount: 0,
    });
    expect(summary.debits).toEqual({
      totalCents: 250_990,
      settledCents: 35_000,
      pendingCents: 215_990,
      overdueCents: 15_990,
      overdueCount: 1,
    });
  });

  it('gives the balance in both views: as if everything were settled, and settled so far', () => {
    expect(summarizePeriod(month, budget, today).balance).toEqual({
      plannedCents: 349_010,
      settledCents: 465_000,
    });
  });

  it('applies each percentage to the net income, to all credits and to the credits received', () => {
    const { shares } = summarizePeriod(month, budget, today);

    expect(shares[0]).toEqual({
      key: 'expensesBp',
      basisPoints: 6_000,
      targetCents: 300_000,
      plannedCents: 360_000,
      settledCents: 300_000,
    });
    expect(shares.map((share) => share.key)).toEqual([
      'expensesBp',
      'investmentsBp',
      'emergencyReserveBp',
      'travelBp',
    ]);
  });

  it('compares the debits with the expenses goal', () => {
    expect(summarizePeriod(month, budget, today).expensesLeftCents).toBe(49_010);
    expect(summarizePeriod([...month, debit(100_000, null)], budget, today).expensesLeftCents).toBe(
      -50_990,
    );
  });

  it('gives what is left after the debits and setting aside the other destinations', () => {
    // Planned: 600.000 − 250.990 − (120.000 + 90.000 + 30.000).
    // Settled: 500.000 − 35.000 − (100.000 + 75.000 + 25.000).
    expect(summarizePeriod(month, budget, today).result).toEqual({
      plannedCents: 109_010,
      settledCents: 265_000,
    });
  });

  it('an empty month is all zeros, not an error', () => {
    const summary = summarizePeriod([], { ...budget, netIncomeCents: 0 }, today);

    expect(summary.balance).toEqual({ plannedCents: 0, settledCents: 0 });
    expect(summary.result).toEqual({ plannedCents: 0, settledCents: 0 });
    expect(summary.expensesLeftCents).toBe(0);
  });
});
