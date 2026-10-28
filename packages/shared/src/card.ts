import { z } from 'zod';
import { statementBankSchema } from './import.ts';
import { isoDateSchema, shiftPeriod } from './money-and-dates.ts';
import type { PaymentMethod } from './payment-method.ts';
import { dueDateFor } from './recurrence.ts';
import { transactionSchema, type Transaction } from './transaction.ts';

// Cartão (ADR 0062): a card of the workspace, a detail of the Crédito and Débito payment
// methods. No limit and no balance; with the credit function it has the days of its bill.

/** Matches the `cards.name` column (varchar 100). */
export const CARD_NAME_MAX_LENGTH = 100;

export const cardNameSchema = z
  .string()
  .trim()
  .min(1, 'Informe o nome do cartão.')
  .max(CARD_NAME_MAX_LENGTH, `Use no máximo ${CARD_NAME_MAX_LENGTH} caracteres.`);

/** What the card does; a multiple card does both. */
export const cardFunctionSchema = z.enum(['CREDIT', 'DEBIT']);

export type CardFunction = z.infer<typeof cardFunctionSchema>;

/** The interface's word for each one, in the order the form offers them. */
export const cardFunctionLabels = {
  CREDIT: 'Crédito',
  DEBIT: 'Débito',
} as const satisfies Record<CardFunction, string>;

const cardFunctionsSchema = z
  .array(cardFunctionSchema)
  .min(1, 'Escolha ao menos uma função: Crédito ou Débito.')
  .refine((functions) => new Set(functions).size === functions.length, {
    message: 'Uma função aparece duas vezes.',
  });

/** A day of the month, 1 to 31; a month shorter than it uses its last day. */
const cardDaySchema = z
  .number('Informe o dia.')
  .int('Informe o dia.')
  .min(1, 'Use um dia de 1 a 31.')
  .max(31, 'Use um dia de 1 a 31.');

/** The credit function needs both days of the bill; without it, the card has none. */
const billDaysRule = (
  card: { functions?: CardFunction[]; closingDay?: number | null; dueDay?: number | null },
  context: z.RefinementCtx,
) => {
  if (!card.functions) return;
  const credit = card.functions.includes('CREDIT');
  for (const field of ['closingDay', 'dueDay'] as const) {
    const given = card[field] !== undefined && card[field] !== null;
    if (credit && !given) {
      context.addIssue({
        code: 'custom',
        path: [field],
        message:
          field === 'closingDay'
            ? 'Informe o dia do fechamento da fatura.'
            : 'Informe o dia do vencimento da fatura.',
      });
    }
    if (!credit && given) {
      context.addIssue({
        code: 'custom',
        path: [field],
        message: 'Só um cartão com a função Crédito tem fatura.',
      });
    }
  }
};

export const createCardInputSchema = z
  .object({
    name: cardNameSchema,
    /** The bank, from the list of statements (ADR 0060); null for one the app does not read. */
    bank: statementBankSchema.nullable().optional(),
    functions: cardFunctionsSchema,
    closingDay: cardDaySchema.nullable().optional(),
    dueDay: cardDaySchema.nullable().optional(),
  })
  .superRefine(billDaysRule);

export type CreateCardInput = z.infer<typeof createCardInputSchema>;

/**
 * Renames, changes the bank, the functions or the days, and archives (or reactivates) a card.
 * Taking the credit function away clears the days; the API checks the rest against the card.
 */
export const updateCardInputSchema = z
  .object({
    name: cardNameSchema.optional(),
    bank: statementBankSchema.nullable().optional(),
    functions: cardFunctionsSchema.optional(),
    closingDay: cardDaySchema.nullable().optional(),
    dueDay: cardDaySchema.nullable().optional(),
    archived: z.boolean().optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: 'Nada para alterar.',
  });

export type UpdateCardInput = z.infer<typeof updateCardInputSchema>;

export const cardSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  bank: statementBankSchema.nullable(),
  functions: z.array(cardFunctionSchema),
  closingDay: z.number().int().nullable(),
  dueDay: z.number().int().nullable(),
  archived: z.boolean(),
  /** Used by a transaction, a recurrence or an installment plan: it can only be archived. */
  inUse: z.boolean(),
});

export type Card = z.infer<typeof cardSchema>;

/** `GET /workspaces/:workspaceId/cards`: all of them, archived too, by name. */
export const cardListResponseSchema = z.array(cardSchema);

/**
 * `GET /workspaces/:workspaceId/cards/unlinked` (ADR 0062 note): the transactions with no card in
 * the methods of each function, which the first card offers to take: the Crédito ones still to
 * pay (the paid ones stay as they are) and every Débito one.
 */
export const unlinkedCardTransactionsSchema = z.object({
  credit: z.number().int(),
  debit: z.number().int(),
});

export type UnlinkedCardTransactions = z.infer<typeof unlinkedCardTransactionsSchema>;

/**
 * `POST /workspaces/:workspaceId/cards/:cardId/link`: gives the card to those transactions, and
 * to the running recurrences and installment plans of those methods with no card, for the
 * functions chosen (the card must have them).
 */
export const linkCardInputSchema = z.object({ functions: cardFunctionsSchema });

export type LinkCardInput = z.infer<typeof linkCardInputSchema>;

export const linkCardResponseSchema = z.object({
  /** The transactions that got the card. */
  linked: z.number().int(),
});

export type LinkCardResponse = z.infer<typeof linkCardResponseSchema>;

/**
 * The due date of the bill a purchase on `purchasedOn` falls in (ADR 0062): the bill closes on
 * the closing day (the month's last day when it is shorter), so a purchase after it goes to the
 * next one; the bill is due on its due day after closing, in the same month when that day comes
 * later, else in the next. Null for a card without the credit function.
 * `cardBillDueDate({ closingDay: 27, dueDay: 4 }, '2026-10-28')` → '2026-12-04'.
 */
export function cardBillDueDate(
  card: Pick<Card, 'closingDay' | 'dueDay'>,
  purchasedOn: string,
): string | null {
  const { closingDay, dueDay } = card;
  if (closingDay === null || dueDay === null) return null;
  const month = purchasedOn.slice(0, 7);
  const closesIn = purchasedOn <= dueDateFor(month, closingDay, 0) ? month : shiftPeriod(month, 1);
  return dueDateFor(closesIn, dueDay, dueDay > closingDay ? 0 : 1);
}

/**
 * A card's bill still to pay (ADR 0062): the card plus a due date, its pending transactions in
 * Crédito (purchases, and refunds that take from the total, of any month), oldest first.
 */
export const cardBillSchema = z.object({
  cardId: z.uuid(),
  dueDate: isoDateSchema,
  /** Purchases less refunds, in cents. */
  totalCents: z.number().int(),
  transactions: z.array(transactionSchema),
});

export type CardBill = z.infer<typeof cardBillSchema>;

/** `GET /workspaces/:workspaceId/cards/bills`: every pending bill, by card, oldest first. */
export const cardBillListResponseSchema = z.array(cardBillSchema);

/** "Pagar fatura": settles every pending transaction of that bill on that day, never ahead. */
export const payCardBillInputSchema = z.object({
  dueDate: isoDateSchema,
  settledAt: isoDateSchema,
});

export type PayCardBillInput = z.infer<typeof payCardBillInputSchema>;

export const payCardBillResponseSchema = z.object({
  /** What this payment settled: what "Desfazer" takes back. */
  transactionIds: z.array(z.uuid()),
  totalCents: z.number().int(),
});

export type PayCardBillResponse = z.infer<typeof payCardBillResponseSchema>;

/**
 * "Desfazer" of a payment: back to pending, only the transactions it settled that are still
 * settled on that day.
 */
export const undoCardBillInputSchema = z.object({
  transactionIds: z.array(z.uuid()).min(1).max(2000),
  settledAt: isoDateSchema,
});

export type UndoCardBillInput = z.infer<typeof undoCardBillInputSchema>;

/** A bill's total: purchases less refunds (credits in Crédito). */
export function cardBillTotal(transactions: readonly Pick<Transaction, 'type' | 'amountCents'>[]) {
  return transactions.reduce(
    (sum, transaction) =>
      sum + (transaction.type === 'DEBIT' ? transaction.amountCents : -transaction.amountCents),
    0,
  );
}

/** The card function a payment method uses; null for a method that is not a card's. */
export function cardFunctionOf(
  paymentMethod: PaymentMethod | null | undefined,
): CardFunction | null {
  if (paymentMethod === 'CREDIT_CARD') return 'CREDIT';
  if (paymentMethod === 'DEBIT_CARD') return 'DEBIT';
  return null;
}
