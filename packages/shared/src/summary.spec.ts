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

// Despesas: 60% of the net income. Saving: 50% + 30% + 20% of what is left after expenses.
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
      basisPoints: 5_000,
    },
    {
      destinationId: id(3),
      name: 'Reserva de emergência',
      kind: 'SAVINGS',
      categoryId: reservaCategory,
      basisPoints: 3_000,
    },
    {
      destinationId: id(4),
      name: 'Viagens',
      kind: 'SAVINGS',
      categoryId: viagensCategory,
      basisPoints: 2_000,
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

  it('gives what is available to set aside: credits − expenses, never minus applications', () => {
    expect(summarizePeriod(month, budget, today).available).toEqual({
      plannedCents: 349_010,
      settledCents: 465_000,
    });
  });

  it('sets the expenses goal on the net income and the saving goals on what is available', () => {
    const { destinations } = summarizePeriod(month, budget, today);

    expect(destinations).toEqual([
      // 60% of 500.000; applied = expenses paid, pending = expenses to pay.
      expect.objectContaining({
        name: 'Despesas',
        targetCents: 300_000,
        appliedCents: 35_000,
        pendingCents: 215_990,
      }),
      // 50% of 349.010.
      expect.objectContaining({
        name: 'Investimentos',
        targetCents: 174_505,
        appliedCents: 50_000,
        pendingCents: 0,
      }),
      expect.objectContaining({
        name: 'Reserva de emergência',
        targetCents: 104_703,
        appliedCents: 0,
        pendingCents: 20_000,
      }),
      expect.objectContaining({
        name: 'Viagens',
        targetCents: 69_802,
        appliedCents: 0,
        pendingCents: 0,
      }),
    ]);
  });

  it('leaves nothing without a destination when the saving shares add up to 100%', () => {
    expect(summarizePeriod(month, budget, today).unallocated).toEqual({
      basisPoints: 0,
      targetCents: 0,
    });
  });

  it('says what the saving shares leave without a destination, adding up to what is available', () => {
    const shares = budget.shares.map((share) =>
      share.name === 'Viagens' ? { ...share, basisPoints: 1_000 } : share,
    );
    const summary = summarizePeriod(month, { ...budget, shares }, today);

    // 349.010 − (174.505 + 104.703 + 34.901): the goals and the rest are what is available.
    expect(summary.unallocated).toEqual({ basisPoints: 1_000, targetCents: 34_901 });
  });

  it('splits what is available so the saving goals add up to the cent', () => {
    // 2.214,85 left: 50%, 30% and 20% rounded one by one would add up to 2.214,86.
    const tight = [credit(540_000), debit(318_515, null)];
    const { destinations } = summarizePeriod(tight, budget, today);

    const goals = destinations.slice(1).map((destination) => destination.targetCents);
    expect(goals).toEqual([110_743, 66_445, 44_297]);
    expect(goals.reduce((sum, goal) => sum + goal, 0)).toBe(221_485);
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

  it('sets the saving goals to zero when expenses pass the credits', () => {
    const summary = summarizePeriod([...month, debit(400_000, null)], budget, today);

    expect(summary.available.plannedCents).toBe(-50_990);
    expect(summary.destinations.slice(1).every((d) => d.targetCents === 0)).toBe(true);
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
