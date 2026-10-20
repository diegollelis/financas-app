import { z } from 'zod';

/** Matches the `merchants.name` column (varchar 100). */
export const MERCHANT_NAME_MAX_LENGTH = 100;

export const merchantNameSchema = z
  .string()
  .trim()
  .min(1, 'Informe o nome do estabelecimento.')
  .max(MERCHANT_NAME_MAX_LENGTH, `Use no máximo ${MERCHANT_NAME_MAX_LENGTH} caracteres.`);

/**
 * Where a transaction was bought or who paid it (ADR 0053): "Mercado A", "Netflix", "Empresa X".
 * One list per workspace, for debits and credits alike, with no category of its own.
 */
export const createMerchantInputSchema = z.object({ name: merchantNameSchema });

export type CreateMerchantInput = z.infer<typeof createMerchantInputSchema>;

/** Renames and/or archives (or reactivates) a merchant. */
export const updateMerchantInputSchema = z
  .object({
    name: merchantNameSchema.optional(),
    archived: z.boolean().optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: 'Nada para alterar.',
  });

export type UpdateMerchantInput = z.infer<typeof updateMerchantInputSchema>;

/** Matches the `merchant_aliases.alias` column (varchar 100). */
export const MERCHANT_ALIAS_MAX_LENGTH = 100;

/**
 * Another text the merchant appears as, in a card statement (ADR 0055): "Ifd*Pizzaria Exemplo".
 * It may be cut to the part that does not change ("Loja.Exemplo" for "Loja.Exemplo* H2m9u1").
 */
export const createMerchantAliasInputSchema = z.object({
  alias: z
    .string()
    .trim()
    .min(1, 'Informe o apelido.')
    .max(MERCHANT_ALIAS_MAX_LENGTH, `Use no máximo ${MERCHANT_ALIAS_MAX_LENGTH} caracteres.`),
});

export type CreateMerchantAliasInput = z.infer<typeof createMerchantAliasInputSchema>;

export const merchantAliasSchema = z.object({ id: z.uuid(), alias: z.string() });

export type MerchantAlias = z.infer<typeof merchantAliasSchema>;

export const merchantSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  archived: z.boolean(),
  /** Used by a transaction, a recurrence or an installment plan: it can only be archived. */
  inUse: z.boolean(),
  /** How it appears in card statements (ADR 0055), by alias. */
  aliases: z.array(merchantAliasSchema).default([]),
});

export type Merchant = z.infer<typeof merchantSchema>;

/** `GET /workspaces/:workspaceId/merchants`: all of them, archived too, by name. */
export const merchantListResponseSchema = z.array(merchantSchema);
