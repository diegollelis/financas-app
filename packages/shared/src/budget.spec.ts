import { describe, expect, it } from 'vitest';
import { budgetInputSchema, DEFAULT_BUDGET_SHARES } from './budget.ts';

// Fictitious data (ADR 0019).
const valid = { netIncomeCents: 500_000, grossIncomeCents: 650_000, ...DEFAULT_BUDGET_SHARES };

describe('budgetInputSchema', () => {
  it('accepts the spreadsheet defaults, which add up to exactly 100%', () => {
    expect(budgetInputSchema.parse(valid)).toEqual(valid);
  });

  it('accepts less than 100% (the rest is left unassigned) and an unknown gross income', () => {
    expect(
      budgetInputSchema.safeParse({ ...valid, travelBp: 0, grossIncomeCents: null }).success,
    ).toBe(true);
  });

  it('refuses percentages adding up to more than 100%', () => {
    const result = budgetInputSchema.safeParse({ ...valid, travelBp: 501 });
    expect(result.error?.issues[0]?.message).toBe(
      'A soma dos percentuais não pode passar de 100%.',
    );
  });

  it('refuses a percentage with more than two decimal places (not whole basis points)', () => {
    const result = budgetInputSchema.safeParse({ ...valid, travelBp: 12.5 });
    expect(result.error?.issues[0]?.message).toBe(
      'Use no máximo duas casas decimais no percentual.',
    );
  });

  it('accepts a zero net income, but not a negative one', () => {
    expect(budgetInputSchema.safeParse({ ...valid, netIncomeCents: 0 }).success).toBe(true);
    expect(budgetInputSchema.safeParse({ ...valid, netIncomeCents: -1 }).success).toBe(false);
  });
});
