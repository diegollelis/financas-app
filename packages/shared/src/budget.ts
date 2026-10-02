import { z } from 'zod';
import { amountCentsSchema, MAX_AMOUNT_CENTS, periodSchema } from './money-and-dates.ts';

/** 100% in basis points (ADR 0010): 60% = 6000. */
export const FULL_BASIS_POINTS = 10_000;

/**
 * Where the month's income should go, as in the spreadsheet: expenses, investments, emergency
 * reserve and travel. Four fixed destinations for now (docs/dominio/modelo.md).
 */
export const budgetShareKeys = [
  'expensesBp',
  'investmentsBp',
  'emergencyReserveBp',
  'travelBp',
] as const;

export const budgetShareKeySchema = z.enum(budgetShareKeys);

export type BudgetShareKey = z.infer<typeof budgetShareKeySchema>;

/** The spreadsheet's percentages, used until the workspace saves its own (ADR 0030). */
export const DEFAULT_BUDGET_SHARES: Record<BudgetShareKey, number> = {
  expensesBp: 6_000,
  investmentsBp: 2_000,
  emergencyReserveBp: 1_500,
  travelBp: 500,
};

/**
 * The part of an income that a percentage represents, rounded to the cent: R$ 5.000,00 at 12,5%
 * is R$ 625,00. Cents × basis points stays far below 2^53, so the product is exact.
 */
export function shareOfIncome(incomeCents: number, basisPoints: number): number {
  return Math.round((incomeCents * basisPoints) / FULL_BASIS_POINTS);
}

const basisPointsSchema = z
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

/** `PUT /workspaces/:workspaceId/budget/:period`: the whole configuration of one competência. */
export const budgetInputSchema = z
  .object({
    netIncomeCents: incomeCentsSchema,
    grossIncomeCents: amountCentsSchema.nullable(),
    expensesBp: basisPointsSchema,
    investmentsBp: basisPointsSchema,
    emergencyReserveBp: basisPointsSchema,
    travelBp: basisPointsSchema,
  })
  .refine(
    (budget) => budgetShareKeys.reduce((sum, key) => sum + budget[key], 0) <= FULL_BASIS_POINTS,
    { message: 'A soma dos percentuais não pode passar de 100%.', path: ['expensesBp'] },
  );

export type BudgetInput = z.infer<typeof budgetInputSchema>;

/**
 * Where the configuration shown came from (ADR 0030): saved for this competência, inherited
 * from the latest earlier one that was saved, or the defaults when none was ever saved.
 */
export const budgetSourceSchema = z.enum(['SAVED', 'INHERITED', 'DEFAULT']);

export type BudgetSource = z.infer<typeof budgetSourceSchema>;

export const budgetSchema = z.object({
  period: periodSchema,
  netIncomeCents: z.number().int(),
  grossIncomeCents: z.number().int().nullable(),
  expensesBp: z.number().int(),
  investmentsBp: z.number().int(),
  emergencyReserveBp: z.number().int(),
  travelBp: z.number().int(),
  source: budgetSourceSchema,
  /** The competência it was inherited from, when `source` is INHERITED. */
  inheritedFrom: periodSchema.nullable(),
});

export type Budget = z.infer<typeof budgetSchema>;
