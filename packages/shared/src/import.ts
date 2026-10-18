import { z } from 'zod';
import { transactionTypeSchema } from './category.ts';
import { installmentCountSchema, installmentsCreated } from './installment.ts';
import { createMerchantAliasInputSchema, merchantNameSchema } from './merchant.ts';
import { amountCentsSchema, isoDateSchema, periodSchema } from './money-and-dates.ts';
import { paymentMethodSchema } from './payment-method.ts';
import { dueDaySchema, dueMonthOffsetSchema } from './recurrence.ts';
import {
  plainTransactionInputSchema,
  transactionDescriptionSchema,
  transactionNotesSchema,
} from './transaction.ts';

// Importação da planilha (ADR 0040): the browser reads the .xlsx and sends only the transactions
// the person confirmed; the file never reaches the API. One import is one row in `imports`, and
// undoing it deletes every transaction it brought. A card statement (ADR 0055) also brings
// installment plans and merchant aliases, in the same request.

/** A spreadsheet holds a few years of months; more than this in one go is a mistake. */
export const MAX_IMPORT_TRANSACTIONS = 2000;

/** Matches the `imports.label` column (varchar 100). */
export const IMPORT_LABEL_MAX_LENGTH = 100;

/** How the person names an import ("Fatura Nubank", ADR 0055 note); a blank one is none. */
export const importLabelSchema = z
  .string()
  .trim()
  .max(IMPORT_LABEL_MAX_LENGTH, `Use no máximo ${IMPORT_LABEL_MAX_LENGTH} caracteres.`)
  .transform((label) => label || null);

/**
 * One imported transaction: the plain fields, plus the merchant by name (ADR 0053). A name the
 * workspace does not have becomes a merchant in the import; an archived one comes back.
 */
export const importTransactionInputSchema = plainTransactionInputSchema.extend({
  merchantName: merchantNameSchema.optional(),
});

export type ImportTransactionInput = z.infer<typeof importTransactionInputSchema>;

/**
 * An installment purchase of a card statement (ADR 0055), as the bill shows it: "Parcela 3/10"
 * of R$ 50,00 becomes a plan of 10 created from the 3rd, each of `amountCents`, the first in
 * `firstPeriod`. Undoing the import deletes the plan with its installments.
 */
export const importInstallmentPlanInputSchema = z
  .object({
    type: transactionTypeSchema,
    description: transactionDescriptionSchema,
    notes: transactionNotesSchema.optional(),
    categoryId: z.uuid('Escolha uma categoria.'),
    installments: installmentCountSchema,
    firstNumber: z.number().int().min(1).optional(),
    /** Each installment's amount, as the statement line. */
    amountCents: amountCentsSchema,
    firstPeriod: periodSchema,
    occurredOn: isoDateSchema.nullable().optional(),
    dueDay: dueDaySchema.nullable().optional(),
    dueMonthOffset: dueMonthOffsetSchema.optional(),
    paymentMethod: paymentMethodSchema.nullable().optional(),
    merchantName: merchantNameSchema.optional(),
  })
  .refine((plan) => (plan.firstNumber ?? 1) <= plan.installments, {
    message: 'A parcela inicial passa do número de parcelas.',
    path: ['firstNumber'],
  });

export type ImportInstallmentPlanInput = z.infer<typeof importInstallmentPlanInputSchema>;

/** An alias learned in the review (ADR 0055): the text of a statement line, for a merchant. */
export const importMerchantAliasInputSchema = createMerchantAliasInputSchema.extend({
  merchantName: merchantNameSchema,
});

export type ImportMerchantAliasInput = z.infer<typeof importMerchantAliasInputSchema>;

export const createImportInputSchema = z
  .object({
    transactions: z
      .array(importTransactionInputSchema)
      .max(
        MAX_IMPORT_TRANSACTIONS,
        `Importe no máximo ${MAX_IMPORT_TRANSACTIONS} lançamentos de uma vez.`,
      ),
    plans: z.array(importInstallmentPlanInputSchema).max(MAX_IMPORT_TRANSACTIONS).optional(),
    aliases: z.array(importMerchantAliasInputSchema).max(MAX_IMPORT_TRANSACTIONS).optional(),
    /** "Origem" (ADR 0055 note). */
    label: importLabelSchema.nullable().optional(),
    /** The due date of the card statement imported, when it is one. */
    statementDueDate: isoDateSchema.nullable().optional(),
  })
  .refine((input) => input.transactions.length + (input.plans?.length ?? 0) > 0, {
    message: 'Escolha ao menos um lançamento para importar.',
    path: ['transactions'],
  })
  .refine(
    (input) =>
      input.transactions.length +
        (input.plans ?? []).reduce((sum, plan) => sum + installmentsCreated(plan), 0) <=
      MAX_IMPORT_TRANSACTIONS,
    {
      message: `Importe no máximo ${MAX_IMPORT_TRANSACTIONS} lançamentos de uma vez.`,
      path: ['transactions'],
    },
  );

export type CreateImportInput = z.infer<typeof createImportInputSchema>;

export const importSchema = z.object({
  id: z.uuid(),
  /** The transactions it created, installments included. */
  transactionCount: z.number().int(),
  /** The installment plans it created (ADR 0055). */
  planCount: z.number().int().default(0),
  /** "Origem", as typed; null for an import made before it, or without one. */
  label: z.string().nullable().default(null),
  /** The due date of the card statement, when it was one. */
  statementDueDate: isoDateSchema.nullable().default(null),
  firstPeriod: periodSchema,
  lastPeriod: periodSchema,
  createdAt: z.iso.datetime(),
  /** Who imported; null once that account no longer exists. */
  createdBy: z.object({ name: z.string() }).nullable(),
});

export type Import = z.infer<typeof importSchema>;

/** Newest first. */
export const importListResponseSchema = z.array(importSchema);
