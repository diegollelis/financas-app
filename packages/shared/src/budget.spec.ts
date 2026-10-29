import { describe, expect, it } from 'vitest';
import { budgetInputSchema, budgetSharesTotal, shareOfIncome, splitByWeights } from './budget.ts';

describe('splitByWeights', () => {
  it('splits in proportion, adding up to the amount to the cent', () => {
    expect(splitByWeights(100_000, [100_000, 60_000, 40_000])).toEqual([50_000, 30_000, 20_000]);
    // 333,33 by 5:3:2: 166,665 + 99,999 + 66,666; the two cents left go to the largest remainders.
    expect(splitByWeights(33_333, [5, 3, 2])).toEqual([16_666, 10_000, 6_667]);
  });

  it('gives zero to every part when the weights are all zero', () => {
    expect(splitByWeights(10_000, [0, 0])).toEqual([0, 0]);
  });
});

// Fictitious data (ADR 0019).
const despesas = '01920000-0000-7000-8000-0000000000d1';
const investimentos = '01920000-0000-7000-8000-0000000000d2';
const valid = {
  netIncomeCents: 500_000,
  shares: [
    { destinationId: despesas, basisPoints: 6_000 },
    { destinationId: investimentos, basisPoints: 2_000 },
  ],
};

describe('shareOfIncome', () => {
  it('applies the percentage to the amount, rounded to the cent', () => {
    expect(shareOfIncome(500_000, 6_000)).toBe(300_000);
    expect(shareOfIncome(500_000, 1_250)).toBe(62_500);
    expect(shareOfIncome(333, 3_333)).toBe(111);
    expect(shareOfIncome(0, 6_000)).toBe(0);
  });
});

describe('budgetInputSchema', () => {
  it('accepts the net income and one share per destination', () => {
    expect(budgetInputSchema.parse(valid)).toEqual(valid);
  });

  it('accepts no shares at all: every destination at 0%', () => {
    expect(budgetInputSchema.safeParse({ netIncomeCents: 0, shares: [] }).success).toBe(true);
  });

  it('refuses the same destination twice', () => {
    const result = budgetInputSchema.safeParse({
      ...valid,
      shares: [...valid.shares, { destinationId: despesas, basisPoints: 100 }],
    });
    expect(result.error?.issues[0]?.message).toBe('Cada destino aparece uma vez só.');
  });

  it('refuses a percentage with more than two decimal places (not whole basis points)', () => {
    const result = budgetInputSchema.safeParse({
      ...valid,
      shares: [{ destinationId: despesas, basisPoints: 12.5 }],
    });
    expect(result.error?.issues[0]?.message).toBe(
      'Use no máximo duas casas decimais no percentual.',
    );
  });

  it('refuses a share over 100%', () => {
    const result = budgetInputSchema.safeParse({
      ...valid,
      shares: [{ destinationId: despesas, basisPoints: 10_001 }],
    });
    expect(result.error?.issues[0]?.message).toBe('O percentual não pode passar de 100%.');
  });

  it('accepts a zero net income, but not a negative one', () => {
    expect(budgetInputSchema.safeParse({ ...valid, netIncomeCents: 0 }).success).toBe(true);
    expect(budgetInputSchema.safeParse({ ...valid, netIncomeCents: -1 }).success).toBe(false);
  });
});

describe('budgetSharesTotal', () => {
  it('adds up every share, the limit included: all of them are of the net income (ADR 0064)', () => {
    expect(
      budgetSharesTotal([{ basisPoints: 6_000 }, { basisPoints: 2_000 }, { basisPoints: 1_200 }]),
    ).toBe(9_200);
  });
});
