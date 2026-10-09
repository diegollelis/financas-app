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
  /**
   * Transactions in the last CATEGORY_USAGE_MONTHS competências, this one included: orders the
   * "Mais usadas" group of the category picker. 0 where it is not counted (create, update).
   */
  recentUses: z.number().int().nonnegative().default(0),
  /**
   * Set when it is a saving destination's category (ADR 0047): it is renamed, archived and
   * deleted with the destination, and a transaction in it is an application.
   */
  destinationId: z.uuid().nullable().optional(),
});

export type Category = z.infer<typeof categorySchema>;

/** How far back `recentUses` counts, in competências. */
export const CATEGORY_USAGE_MONTHS = 6;

/** `GET /workspaces/:workspaceId/categories`: all of them, archived too, by type and name. */
export const categoryListResponseSchema = z.array(categorySchema);

/** More than any workspace has: the defaults are about 40. */
export const MAX_CATEGORIES_TO_COPY = 500;

/**
 * `POST /workspaces/:workspaceId/categories/copy` (ADR 0048): categories of another workspace the
 * person is a member of, chosen by id, created here with the same name and type.
 */
export const copyCategoriesInputSchema = z.object({
  sourceWorkspaceId: z.uuid(),
  categoryIds: z
    .array(z.uuid())
    .min(1, 'Escolha ao menos uma categoria.')
    .max(MAX_CATEGORIES_TO_COPY, `Escolha no máximo ${MAX_CATEGORIES_TO_COPY} categorias.`),
});

export type CopyCategoriesInput = z.infer<typeof copyCategoriesInputSchema>;

/**
 * How many were created, and how many were not: already here (same type and name, ignoring case
 * and accents, archived too), archived there, a saving destination's, or not found there.
 */
export const copyCategoriesResultSchema = z.object({
  copied: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});

export type CopyCategoriesResult = z.infer<typeof copyCategoriesResultSchema>;
