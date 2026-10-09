import { z } from 'zod';

/** Matches the `budget_destinations.name` column (varchar 50), the same as a category's. */
export const BUDGET_DESTINATION_NAME_MAX_LENGTH = 50;

/**
 * EXPENSES: the one destination whose goal is a share of the net income, with no category of
 * its own (every debit outside the saving categories is an expense). SAVINGS: a share of what
 * is left after expenses, with a debit category of its own (ADR 0047).
 */
export const budgetDestinationKindSchema = z.enum(['EXPENSES', 'SAVINGS']);

export type BudgetDestinationKind = z.infer<typeof budgetDestinationKindSchema>;

export const budgetDestinationNameSchema = z
  .string()
  .trim()
  .min(1, 'Informe o nome do destino.')
  .max(
    BUDGET_DESTINATION_NAME_MAX_LENGTH,
    `Use no máximo ${BUDGET_DESTINATION_NAME_MAX_LENGTH} caracteres.`,
  );

/** A new saving destination; its debit category is created with it, with the same name. */
export const createBudgetDestinationInputSchema = z.object({
  name: budgetDestinationNameSchema,
});

export type CreateBudgetDestinationInput = z.infer<typeof createBudgetDestinationInputSchema>;

/** Renames and/or archives a saving destination, and its category along with it. */
export const updateBudgetDestinationInputSchema = z
  .object({
    name: budgetDestinationNameSchema.optional(),
    archived: z.boolean().optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: 'Nada para alterar.',
  });

export type UpdateBudgetDestinationInput = z.infer<typeof updateBudgetDestinationInputSchema>;

export const budgetDestinationSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: budgetDestinationKindSchema,
  /** The debit category whose transactions are this destination's applications; null for EXPENSES. */
  categoryId: z.uuid().nullable(),
  archived: z.boolean(),
  /** The order they are shown in. */
  position: z.number().int().nonnegative(),
});

export type BudgetDestination = z.infer<typeof budgetDestinationSchema>;

/** `GET /workspaces/:workspaceId/budget-destinations`: all of them, archived too, in order. */
export const budgetDestinationListResponseSchema = z.array(budgetDestinationSchema);

/**
 * Every workspace starts with these (ADR 0047), in this order; the migration that created the
 * table gave them to the workspaces that already existed.
 */
export const DEFAULT_BUDGET_DESTINATIONS: readonly {
  name: string;
  kind: BudgetDestinationKind;
}[] = [
  { name: 'Despesas', kind: 'EXPENSES' },
  { name: 'Investimentos', kind: 'SAVINGS' },
  { name: 'Reserva de emergência', kind: 'SAVINGS' },
  { name: 'Viagens', kind: 'SAVINGS' },
];
