import { z } from 'zod';
import { budgetDestinationKindSchema } from './budget-destination.ts';
import { MAX_AMOUNT_CENTS, periodSchema } from './money-and-dates.ts';

/** 100% in basis points (ADR 0010): 60% = 6000. */
export const FULL_BASIS_POINTS = 10_000;

/**
 * The part of an amount that a percentage represents, rounded to the cent: R$ 5.000,00 at 12,5%
 * is R$ 625,00. Cents × basis points stays far below 2^53, so the product is exact.
 */
export function shareOfIncome(incomeCents: number, basisPoints: number): number {
  return Math.round((incomeCents * basisPoints) / FULL_BASIS_POINTS);
}

export const basisPointsSchema = z
  .number('Informe o percentual.')
  .int('Use no máximo duas casas decimais no percentual.')
  .min(0, 'O percentual não pode ser negativo.')
  .max(FULL_BASIS_POINTS, 'O percentual não pode passar de 100%.');

/** Income may be zero (not known yet); amounts follow ADR 0010. */
const incomeCentsSchema = z
  .number('Informe o valor.')
  .int('O valor precisa estar em centavos inteiros.')
  .min(0, 'O valor não pode ser negativo.')
  .max(MAX_AMOUNT_CENTS, 'Valor alto demais.');

/** Up to this many destinations in one budget; far more than anyone needs. */
export const MAX_BUDGET_SHARES = 50;

export const budgetShareInputSchema = z.object({
  destinationId: z.uuid(),
  basisPoints: basisPointsSchema,
});

/**
 * `PUT /workspaces/:workspaceId/budget/:period`: the whole budget of one competência (ADR 0047):
 * the net income, base of the expenses goal, and the share of each destination. A destination
 * left out gets 0%. The API checks that every destination is the workspace's and that the saving
 * ones add up to at most 100% (the sum needs to know which are which).
 */
export const budgetInputSchema = z.object({
  netIncomeCents: incomeCentsSchema,
  shares: z
    .array(budgetShareInputSchema)
    .max(MAX_BUDGET_SHARES)
    .refine(
      (shares) => new Set(shares.map((share) => share.destinationId)).size === shares.length,
      { message: 'Cada destino aparece uma vez só.' },
    ),
});

export type BudgetInput = z.infer<typeof budgetInputSchema>;

/**
 * Where the budget shown came from (ADR 0030): saved for this competência, inherited from the
 * latest earlier one that was saved, or none at all yet (ADR 0047: no default percentages; the
 * dashboard asks to set one).
 */
export const budgetSourceSchema = z.enum(['SAVED', 'INHERITED', 'NONE']);

export type BudgetSource = z.infer<typeof budgetSourceSchema>;

/** One destination in the budget, with what the form and the dashboard need to show it. */
export const budgetShareSchema = z.object({
  destinationId: z.uuid(),
  name: z.string(),
  kind: budgetDestinationKindSchema,
  /** The debit category of its applications; null for Despesas. */
  categoryId: z.uuid().nullable(),
  basisPoints: z.number().int(),
});

export type BudgetShare = z.infer<typeof budgetShareSchema>;

export const budgetSchema = z.object({
  period: periodSchema,
  netIncomeCents: z.number().int(),
  source: budgetSourceSchema,
  /** The competência it was inherited from, when `source` is INHERITED. */
  inheritedFrom: periodSchema.nullable(),
  /**
   * Every active destination, in order (Despesas first), plus an archived one that still has a
   * share in this budget. A destination created after it was saved shows 0%.
   */
  shares: z.array(budgetShareSchema),
});

export type Budget = z.infer<typeof budgetSchema>;

/** The saving destinations' shares add up to at most 100% of what is left after expenses. */
export function savingSharesTotal(shares: Pick<BudgetShare, 'kind' | 'basisPoints'>[]): number {
  return shares
    .filter((share) => share.kind === 'SAVINGS')
    .reduce((sum, share) => sum + share.basisPoints, 0);
}
