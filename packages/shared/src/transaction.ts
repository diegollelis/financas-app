import { z } from 'zod';
import { transactionTypeSchema } from './category.ts';
import { amountCentsSchema, isoDateSchema, periodSchema } from './money-and-dates.ts';
import { paymentMethodSchema } from './payment-method.ts';
import { MAX_SPLIT_PEOPLE, personNameSchema } from './person.ts';

/** Matches the `transactions.description` column (varchar 200). */
export const TRANSACTION_DESCRIPTION_MAX_LENGTH = 200;

/** Matches the `transactions.notes` column (varchar 1000). */
export const TRANSACTION_NOTES_MAX_LENGTH = 1000;

export const transactionDescriptionSchema = z
  .string()
  .trim()
  .min(1, 'Descreva o lançamento.')
  .max(
    TRANSACTION_DESCRIPTION_MAX_LENGTH,
    `Use no máximo ${TRANSACTION_DESCRIPTION_MAX_LENGTH} caracteres.`,
  );

/** Optional free text. A blank one is stored as null. */
export const transactionNotesSchema = z
  .string()
  .trim()
  .max(TRANSACTION_NOTES_MAX_LENGTH, `Use no máximo ${TRANSACTION_NOTES_MAX_LENGTH} caracteres.`)
  .nullable()
  .transform((notes) => notes || null);

/**
 * A credit or a debit of one competência (ADR 0010). The category must be of the same type and
 * of the same workspace (ADR 0029). `settledAt` null = still pending. `personId`: a receber de
 * (credit) or a pagar para (debit) that person of the workspace (ADR 0042).
 */
export const transactionFieldsSchema = z.object({
  type: transactionTypeSchema,
  description: transactionDescriptionSchema,
  notes: transactionNotesSchema.optional(),
  categoryId: z.uuid('Escolha uma categoria.'),
  amountCents: amountCentsSchema,
  period: periodSchema,
  dueDate: isoDateSchema.nullable().optional(),
  settledAt: isoDateSchema.nullable().optional(),
  /** The day it happened, the purchase's (ADR 0055); it never changes the period. */
  occurredOn: isoDateSchema.nullable().optional(),
  personId: z.uuid().nullable().optional(),
  /** Where it was bought or who paid it (ADR 0053). */
  merchantId: z.uuid().nullable().optional(),
  /** How it was paid or received (ADR 0054). */
  paymentMethod: paymentMethodSchema.nullable().optional(),
  /** The card of a Crédito or Débito one (ADR 0062), with that function. */
  cardId: z.uuid().nullable().optional(),
});

/**
 * One transaction with no person, no merchant and no split: what a spreadsheet import brings
 * (ADR 0040). Without refinements, so forms can `.pick()` from it (Zod refuses that on refined
 * objects).
 */
export const plainTransactionInputSchema = transactionFieldsSchema.omit({
  personId: true,
  merchantId: true,
});

export type PlainTransactionInput = z.infer<typeof plainTransactionInputSchema>;

/** One person's share of a split: someone already listed, or a new name (ADR 0042). */
export const splitShareInputSchema = z
  .object({
    personId: z.uuid().optional(),
    newPersonName: personNameSchema.optional(),
    amountCents: amountCentsSchema,
  })
  .refine((share) => (share.personId === undefined) !== (share.newPersonName === undefined), {
    message: 'Escolha a pessoa de cada parte.',
  });

export type SplitShareInput = z.infer<typeof splitShareInputSchema>;

/**
 * Splits it with other people: besides it, one pending share per person on the opposite side. A
 * debit you paid gives credits "a receber" in Reembolso (ADR 0042); a credit you received gives
 * debits "a pagar" in Repasse (ADR 0052).
 */
const splitSchema = z
  .array(splitShareInputSchema)
  .min(1, 'Informe com quem dividir.')
  .max(MAX_SPLIT_PEOPLE, `Divida com no máximo ${MAX_SPLIT_PEOPLE} pessoas.`);

/** The same person twice in a split. */
const repeatsPerson = (split: SplitShareInput[]) => {
  const people = split.map((share) => share.personId ?? share.newPersonName?.toLowerCase());
  return new Set(people).size !== people.length;
};

export const createTransactionInputSchema = transactionFieldsSchema
  .extend({ split: splitSchema.optional() })
  .superRefine((input, context) => {
    if (!input.split) return;
    const issue = (message: string) =>
      context.addIssue({ code: 'custom', message, path: ['split'] });
    if (input.personId) issue('Um lançamento dividido não fica ligado a uma só pessoa.');
    const others = input.split.reduce((sum, share) => sum + share.amountCents, 0);
    if (others > input.amountCents) issue('As partes dos outros passam do valor do lançamento.');
    if (repeatsPerson(input.split)) issue('A mesma pessoa aparece duas vezes.');
  });

export type CreateTransactionInput = z.infer<typeof createTransactionInputSchema>;

/**
 * Any subset of the fields. Settling in one click is `{ settledAt: '<today>' }`; undoing it is
 * `{ settledAt: null }`. `split` divides a transaction launched once that is not split yet
 * (ADR 0052 note): the API checks the rest against what it is.
 */
export const updateTransactionInputSchema = transactionFieldsSchema
  .partial()
  .extend({ split: splitSchema.optional() })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: 'Nada para alterar.',
  })
  .superRefine((input, context) => {
    if (!input.split) return;
    const issue = (message: string) =>
      context.addIssue({ code: 'custom', message, path: ['split'] });
    if (input.personId) issue('Um lançamento dividido não fica ligado a uma só pessoa.');
    if (repeatsPerson(input.split)) issue('A mesma pessoa aparece duas vezes.');
  });

export type UpdateTransactionInput = z.infer<typeof updateTransactionInputSchema>;

export const transactionSchema = z.object({
  id: z.uuid(),
  type: transactionTypeSchema,
  description: z.string(),
  notes: z.string().nullable(),
  categoryId: z.uuid(),
  amountCents: z.number().int(),
  period: periodSchema,
  dueDate: isoDateSchema.nullable(),
  settledAt: isoDateSchema.nullable(),
  /** The day it happened (ADR 0055); null when not given. */
  occurredOn: isoDateSchema.nullable().default(null),
  /** The recurrence that generated it (ADR 0038); null for one launched by hand. */
  recurrenceId: z.uuid().nullable().default(null),
  /** That recurrence's interval in months, 1 or 12 (ADR 0038 note); null like recurrenceId. */
  recurrenceIntervalMonths: z.number().int().nullable().default(null),
  /** Generated by a variable recurrence and not yet confirmed (ADR 0038). */
  amountEstimated: z.boolean().default(false),
  /** An installment of a plan: "3/10" (ADR 0038); null otherwise. */
  installment: z
    .object({ planId: z.uuid(), number: z.number().int(), count: z.number().int() })
    .nullable()
    .default(null),
  /** A receber de / a pagar para this person (ADR 0042); null when not linked. */
  personId: z.uuid().nullable().default(null),
  /** Where it was bought or who paid it (ADR 0053); null when not given. */
  merchantId: z.uuid().nullable().default(null),
  /** How it was paid or received (ADR 0054); null when not given. */
  paymentMethod: paymentMethodSchema.nullable().default(null),
  /** The card it was paid or received with (ADR 0062); null when not given. */
  cardId: z.uuid().nullable().default(null),
  /** The debit this share was split from (ADR 0042); null otherwise. */
  splitOfId: z.uuid().nullable().default(null),
});

export type Transaction = z.infer<typeof transactionSchema>;

/** `GET /workspaces/:workspaceId/transactions?period=YYYY-MM`. */
export const transactionListQuerySchema = z.object({ period: periodSchema });

export type TransactionListQuery = z.infer<typeof transactionListQuerySchema>;

/** Credits first, then debits; each by due date (none last), then by order of creation. */
export const transactionListResponseSchema = z.array(transactionSchema);

/**
 * `POST /workspaces/:workspaceId/transactions/:transactionId/settle-part` (ADR 0057): part of a
 * pending transaction received or paid on that day. The part is launched, settled, in the
 * competência of the day; the pending one keeps the rest, or goes once nothing is left.
 */
export const settlePartInputSchema = z.object({
  amountCents: amountCentsSchema,
  settledAt: isoDateSchema,
});

export type SettlePartInput = z.infer<typeof settlePartInputSchema>;

export const settlePartResponseSchema = z.object({
  settled: transactionSchema,
  /** The pending one with what is left; null when the part was all of it. */
  remaining: transactionSchema.nullable(),
});

export type SettlePartResponse = z.infer<typeof settlePartResponseSchema>;

/**
 * Whether part of it may be received or paid (ADR 0057): pending, launched once and not split
 * (`hasShares`), not a share, a month of a recurrence or an installment.
 */
export function partiallySettleable(
  transaction: Pick<Transaction, 'settledAt' | 'splitOfId' | 'recurrenceId' | 'installment'>,
  hasShares: boolean,
): boolean {
  return (
    !transaction.settledAt &&
    !transaction.splitOfId &&
    !transaction.recurrenceId &&
    !transaction.installment &&
    !hasShares
  );
}

/**
 * A pending credit with no due date in a category marked "Nem renda nem gasto" (ADR 0057): money
 * lent coming back some day, nobody knows when. The planned balance leaves it out.
 */
export function undatedReceivable(
  transaction: Pick<Transaction, 'type' | 'dueDate' | 'settledAt' | 'categoryId'>,
  neutralCategoryIds: ReadonlySet<string>,
): boolean {
  return (
    transaction.type === 'CREDIT' &&
    !transaction.dueDate &&
    !transaction.settledAt &&
    neutralCategoryIds.has(transaction.categoryId)
  );
}

/**
 * The same on the other side (ADR 0057 note): a pending debit with no due date in a category
 * marked "Nem renda nem gasto", money borrowed to pay back some day. The planned balance and what
 * is left to save leave it out; each payment counts in the month it is made.
 */
export function undatedPayable(
  transaction: Pick<Transaction, 'type' | 'dueDate' | 'settledAt' | 'categoryId'>,
  neutralCategoryIds: ReadonlySet<string>,
): boolean {
  return (
    transaction.type === 'DEBIT' &&
    !transaction.dueDate &&
    !transaction.settledAt &&
    neutralCategoryIds.has(transaction.categoryId)
  );
}

/**
 * Never stored, always derived (ADR 0029): SETTLED once there is a settlement date; OVERDUE when
 * still pending after the due date; PENDING otherwise. `today` is `YYYY-MM-DD` in São Paulo
 * (`todayIso()`); ISO dates compare correctly as text.
 */
export const transactionStatusSchema = z.enum(['PENDING', 'OVERDUE', 'SETTLED']);

export type TransactionStatus = z.infer<typeof transactionStatusSchema>;

export function transactionStatus(
  transaction: Pick<Transaction, 'dueDate' | 'settledAt'>,
  today: string,
): TransactionStatus {
  if (transaction.settledAt) return 'SETTLED';
  if (transaction.dueDate && transaction.dueDate < today) return 'OVERDUE';
  return 'PENDING';
}
