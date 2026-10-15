import { z } from 'zod';
import { transactionTypeSchema, type TransactionType } from './category.ts';
import { normalizeName } from './import-template.ts';
import { paymentMethodSchema, type PaymentMethod } from './payment-method.ts';

// Sugestão de categoria (ADR 0053): the workspace's own history says which category usually
// goes with a merchant or a description. The API sends these hints once; the form looks them up
// as the person types, and fills an empty category with the suggestion. The payment method is
// suggested the same way (ADR 0054).

/** How far back the history goes: a year covers every bill that repeats. */
export const CATEGORY_HINT_MONTHS = 12;

/** At most this many descriptions, the most used first: enough for the usual ones. */
export const MAX_DESCRIPTION_HINTS = 500;

export const categoryHintsSchema = z.object({
  /** The category most used with each merchant, per type. */
  merchants: z.array(
    z.object({ merchantId: z.uuid(), type: transactionTypeSchema, categoryId: z.uuid() }),
  ),
  /** The category most used with each description (as `normalizeName` gives it), per type. */
  descriptions: z.array(
    z.object({ description: z.string(), type: transactionTypeSchema, categoryId: z.uuid() }),
  ),
  /** The payment method most used with each merchant and each description, per type (ADR 0054). */
  paymentMethods: z
    .object({
      merchants: z.array(
        z.object({
          merchantId: z.uuid(),
          type: transactionTypeSchema,
          paymentMethod: paymentMethodSchema,
        }),
      ),
      descriptions: z.array(
        z.object({
          description: z.string(),
          type: transactionTypeSchema,
          paymentMethod: paymentMethodSchema,
        }),
      ),
    })
    .default({ merchants: [], descriptions: [] }),
});

export type CategoryHints = z.infer<typeof categoryHintsSchema>;

/**
 * The category to suggest: the merchant's, else the description's ("Conta de luz" → Energia),
 * of the same type; null when the history says nothing. The description is compared ignoring
 * case, accents and extra spaces.
 */
export function suggestCategory(
  hints: CategoryHints,
  {
    type,
    description,
    merchantId,
  }: { type: TransactionType; description: string; merchantId: string | null },
): string | null {
  if (merchantId) {
    const byMerchant = hints.merchants.find(
      (hint) => hint.merchantId === merchantId && hint.type === type,
    );
    if (byMerchant) return byMerchant.categoryId;
  }
  const wanted = normalizeName(description);
  if (!wanted) return null;
  return (
    hints.descriptions.find((hint) => hint.description === wanted && hint.type === type)
      ?.categoryId ?? null
  );
}

/**
 * The payment method to suggest (ADR 0054), the same way as the category: the merchant's, else
 * the description's, of the same type; null when the history says nothing.
 */
export function suggestPaymentMethod(
  hints: CategoryHints,
  {
    type,
    description,
    merchantId,
  }: { type: TransactionType; description: string; merchantId: string | null },
): PaymentMethod | null {
  const { merchants, descriptions } = hints.paymentMethods;
  if (merchantId) {
    const byMerchant = merchants.find(
      (hint) => hint.merchantId === merchantId && hint.type === type,
    );
    if (byMerchant) return byMerchant.paymentMethod;
  }
  const wanted = normalizeName(description);
  if (!wanted) return null;
  return (
    descriptions.find((hint) => hint.description === wanted && hint.type === type)?.paymentMethod ??
    null
  );
}
