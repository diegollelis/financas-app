import { z } from 'zod';

/** Matches the `categories.name` column (varchar 50). */
export const CATEGORY_NAME_MAX_LENGTH = 50;

/** Money in (CREDIT) or out (DEBIT). Categories and, later, transactions have one (ADR 0010). */
export const transactionTypeSchema = z.enum(['CREDIT', 'DEBIT']);

export type TransactionType = z.infer<typeof transactionTypeSchema>;

const categoryNameSchema = z
  .string()
  .trim()
  .min(1, 'Dê um nome à categoria.')
  .max(CATEGORY_NAME_MAX_LENGTH, `Use no máximo ${CATEGORY_NAME_MAX_LENGTH} caracteres.`);

export const createCategoryInputSchema = z.object({
  name: categoryNameSchema,
  type: transactionTypeSchema,
});

export type CreateCategoryInput = z.infer<typeof createCategoryInputSchema>;

/**
 * Renames and/or archives a category. The type never changes: a transaction's category must
 * have the transaction's type. An archived category stays on old transactions but is no longer
 * offered for new ones.
 */
export const updateCategoryInputSchema = z
  .object({
    name: categoryNameSchema.optional(),
    archived: z.boolean().optional(),
  })
  .refine((input) => input.name !== undefined || input.archived !== undefined, {
    message: 'Nada para alterar.',
  });

export type UpdateCategoryInput = z.infer<typeof updateCategoryInputSchema>;

export const categorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  type: transactionTypeSchema,
  archived: z.boolean(),
});

export type Category = z.infer<typeof categorySchema>;

/** `GET /workspaces/:workspaceId/categories`: all of them, archived too, by type and name. */
export const categoryListResponseSchema = z.array(categorySchema);
