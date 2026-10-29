import { describe, expect, it } from 'vitest';
import type { Budget } from './budget.ts';
import { summarizePeriod } from './summary.ts';

// Fictitious data (ADR 0019). "Today" is Oct 15th, 2026.
const today = '2026-10-15';
const id = (n: number) => `01920000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const mercado = id(101); // an expense category
const investimentosCategory = id(102);
const reservaCategory = id(103);
const viagensCategory = id(104);

// Every share is of the net income (ADR 0064): Despesas 60%, then 20% + 12% + 8%, 100% in all.
const budget: Budget = {
  period: '2026-10',
  netIncomeCents: 500_000,
  source: 'SAVED',
  inheritedFrom: null,
  shares: [
    {
      destinationId: id(1),
      name: 'Despesas',
      kind: 'EXPENSES',
      categoryId: null,
      basisPoints: 6_000,
    },
    {
      destinationId: id(2),
      name: 'Investimentos',
      kind: 'SAVINGS',
      categoryId: investimentosCategory,
      basisPoints: 2_000,
    },
    {
      destinationId: id(3),
      name: 'Reserva de emergência',
      kind: 'SAVINGS',
      categoryId: reservaCategory,
      basisPoints: 1_200,
    },
    {
      destinationId: id(4),
      name: 'Viagens',
      kind: 'SAVINGS',
      categoryId: viagensCategory,
      basisPoints: 800,
    },
  ],
};

const credit = (amountCents: number, settledAt: string | null = null) => ({
  type: 'CREDIT' as const,
  amountCents,
  dueDate: null,
  settledAt,
  categoryId: id(200),
});
const debit = (
  amountCents: number,
  dueDate: string | null,
  settledAt: string | null = null,
  categoryId = mercado,
) => ({ type: 'DEBIT' as const, amountCents, dueDate, settledAt, categoryId });

const month = [
  credit(500_000, '2026-10-05'), // salary, received
  credit(100_000), // freelance, still to receive
  debit(15_990, '2026-10-10'), // expense past its due date
  debit(35_000, null, '2026-10-08'), // expense paid
  debit(200_000, '2026-10-20'), // expense due later
  debit(50_000, null, '2026-10-06', investimentosCategory), // applied to Investimentos
  debit(20_000, '2026-10-25', null, reservaCategory), // to apply to the reserve
];

describe('summarizePeriod', () => {
  it("gives the month's income: every credit, received or not, but the shares of a split", () => {
    // Someone paying back their part of a dinner is not income (ADR 0046 note).
    const share = { ...credit(4_500), splitOfId: id(300) };
    const summary = summarizePeriod([...month, share], budget, today);
    expect(summary.incomeCents).toBe(600_000);
    expect(summary.credits.totalCents).toBe(604_500);
  });

  it('leaves a "Nem renda nem gasto" category out of income and expenses (ADR 0056)', () => {
    const loans = id(105);
    const lent = debit(100_000, null, '2026-10-02', loans); // lent to a friend
    const repaid = { ...credit(300_000), categoryId: loans }; // an old loan paid back
    const summary = summarizePeriod([...month, lent, repaid], budget, today, new Set([loans]));

    expect(summary.incomeCents).toBe(600_000);
    expect(summary.neutralIncomeCents).toBe(300_000);
    // Not spending: the expenses and their limit are those of the month without the loan.
    expect(summary.expenses.totalCents).toBe(250_990);
    expect(summary.expensesLeftCents).toBe(300_000 - 250_990);
    // The loan lent leaves less to save; the money paid back is no new goal (ADR 0056 note).
    expect(summary.available).toEqual({
      plannedCents: 600_000 - 250_990 - 100_000,
      settledCents: 500_000 - 35_000 - 100_000,
    });
    // Still to receive with no due date: in the credits, not in the planned balance (ADR 0057).
    expect(summary.credits.totalCents).toBe(900_000);
    expect(summary.undatedCents).toBe(300_000);
    expect(summary.balance.plannedCents).toBe(600_000 - 420_990);
  });

  it('keeps in the planned balance what comes back on a due date, or has come (ADR 0057)', () => {
    const loans = id(105);
    const dated = { ...credit(300_000), categoryId: loans, dueDate: '2026-10-28' };
    const received = { ...credit(100_000, '2026-10-03'), categoryId: loans };
    const summary = summarizePeriod([...month, dated, received], budget, today, new Set([loans]));

    expect(summary.undatedCents).toBe(0);
    expect(summary.balance.plannedCents).toBe(1_000_000 - 320_990);
  });

  it('leaves money borrowed, to pay back with no due date, out of the planned view (ADR 0057 note)', () => {
    const loans = id(105);
    const borrowed = { ...credit(500_000, '2026-10-03'), categoryId: loans };
    const owed = debit(500_000, null, null, loans);
    const summary = summarizePeriod([...month, borrowed, owed], budget, today, new Set([loans]));

    // Still in the debits, and still owed; not this month's to pay.
    expect(summary.debits.totalCents).toBe(820_990);
    expect(summary.undatedPayableCents).toBe(500_000);
    expect(summary.balance.plannedCents).toBe(1_100_000 - 320_990);
    // The money borrowed is no goal, and the debt does not eat what is left to save.
    expect(summary.available.plannedCents).toBe(600_000 - 250_990);
  });

  it('keeps a debt with a due date in the planned view, and a payment in the settled one', () => {
    const loans = id(105);
    const due = debit(100_000, '2026-10-28', null, loans);
    const paid = debit(50_000, null, '2026-10-04', loans);
    const summary = summarizePeriod([...month, due, paid], budget, today, new Set([loans]));

    expect(summary.undatedPayableCents).toBe(0);
    expect(summary.balance.plannedCents).toBe(600_000 - 470_990);
    expect(summary.available.settledCents).toBe(500_000 - 35_000 - 50_000);
  });

  it('leaves in the planned balance a pending credit with no due date in any other category', () => {
    expect(summarizePeriod(month, budget, today).undatedCents).toBe(0);
  });

  it('splits the debits into expenses and applications, by category', () => {
    const summary = summarizePeriod(month, budget, today);

    expect(summary.debits.totalCents).toBe(320_990);
    expect(summary.expenses).toEqual({
      totalCents: 250_990,
      settledCents: 35_000,
      pendingCents: 215_990,
      overdueCents: 15_990,
      overdueCount: 1,
    });
    expect(summary.applied).toEqual({ plannedCents: 70_000, settledCents: 50_000 });
  });

  it('gives the balance after expenses and applications, in both views', () => {
    // Planned: 600.000 − 320.990. Settled: 500.000 − (35.000 + 50.000).
    expect(summarizePeriod(month, budget, today).balance).toEqual({
      plannedCents: 279_010,
      settledCents: 415_000,
    });
  });

  it('gives the leftover of the month: credits − expenses, never minus applications', () => {
    expect(summarizePeriod(month, budget, today).available).toEqual({
      plannedCents: 349_010,
      settledCents: 465_000,
    });
  });

  it('sets every goal on the net income, the expenses one included (ADR 0064)', () => {
    const { destinations } = summarizePeriod(month, budget, today);

    expect(destinations).toEqual([
      // 60% of 500.000; applied = expenses paid, pending = expenses to pay.
      expect.objectContaining({
        name: 'Despesas',
        targetCents: 300_000,
        appliedCents: 35_000,
        pendingCents: 215_990,
      }),
      // 20% of 500.000, whatever is left in the month.
      expect.objectContaining({
        name: 'Investimentos',
        targetCents: 100_000,
        appliedCents: 50_000,
        pendingCents: 0,
      }),
      expect.objectContaining({
        name: 'Reserva de emergência',
        targetCents: 60_000,
        appliedCents: 0,
        pendingCents: 20_000,
      }),
      expect.objectContaining({
        name: 'Viagens',
        targetCents: 40_000,
        appliedCents: 0,
        pendingCents: 0,
      }),
    ]);
  });

  it('leaves nothing without a destination when the shares add up to 100%', () => {
    expect(summarizePeriod(month, budget, today).unallocated).toEqual({
      basisPoints: 0,
      targetCents: 0,
    });
  });

  it('says what the shares leave without a destination, adding up to the net income', () => {
    const shares = budget.shares.map((share) =>
      share.name === 'Viagens' ? { ...share, basisPoints: 300 } : share,
    );
    const summary = summarizePeriod(month, { ...budget, shares }, today);

    // 500.000 − (300.000 + 100.000 + 60.000 + 15.000).
    expect(summary.unallocated).toEqual({ basisPoints: 500, targetCents: 25_000 });
  });

  it('splits the net income so the limit and the goals add up to the cent', () => {
    // R$ 3.333,33 at 60%, 20%, 12% and 8%: rounded one by one, 3.333,34.
    const { destinations } = summarizePeriod([], { ...budget, netIncomeCents: 333_333 }, today);

    const goals = destinations.map((destination) => destination.targetCents);
    expect(goals).toEqual([200_000, 66_666, 40_000, 26_667]);
    expect(goals.reduce((sum, goal) => sum + goal, 0)).toBe(333_333);
  });

  it('applying more never lowers the saving goals', () => {
    const before = summarizePeriod(month, budget, today).destinations[1]!.targetCents;
    const more = [...month, debit(100_000, null, '2026-10-12', investimentosCategory)];

    expect(summarizePeriod(more, budget, today).destinations[1]!.targetCents).toBe(before);
  });

  it('compares the expenses, not the applications, with the expenses goal', () => {
    expect(summarizePeriod(month, budget, today).expensesLeftCents).toBe(49_010);
    expect(summarizePeriod([...month, debit(100_000, null)], budget, today).expensesLeftCents).toBe(
      -50_990,
    );
  });

  it('keeps the goals when expenses pass the credits: the leftover only says so', () => {
    const summary = summarizePeriod([...month, debit(400_000, null)], budget, today);

    expect(summary.available.plannedCents).toBe(-50_990);
    expect(summary.destinations.slice(1).map((d) => d.targetCents)).toEqual([
      100_000, 60_000, 40_000,
    ]);
  });

  it('an empty month without a budget is all zeros, not an error', () => {
    const none: Budget = { ...budget, netIncomeCents: 0, source: 'NONE', shares: [] };
    const summary = summarizePeriod([], none, today);

    expect(summary.balance).toEqual({ plannedCents: 0, settledCents: 0 });
    expect(summary.available).toEqual({ plannedCents: 0, settledCents: 0 });
    expect(summary.destinations).toEqual([]);
    expect(summary.expensesLeftCents).toBe(0);
  });

  it('says how much of the pending amounts is still an estimate (ADR 0038)', () => {
    const energy = { ...debit(18_990, '2026-10-20'), amountEstimated: true };
    const settledEstimate = { ...debit(20_000, null, '2026-10-02'), amountEstimated: true };

    expect(summarizePeriod(month, budget, today).estimatedCents).toBe(0);
    // A settled one is no longer pending, whatever its flag says.
    expect(summarizePeriod([...month, energy, settledEstimate], budget, today).estimatedCents).toBe(
      18_990,
    );
  });
});
