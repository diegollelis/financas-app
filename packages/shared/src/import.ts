import { z } from 'zod';
import { transactionTypeSchema } from './category.ts';
import { installmentCountSchema, installmentsCreated } from './installment.ts';
import { createMerchantAliasInputSchema, merchantNameSchema } from './merchant.ts';
import { amountCentsSchema, isoDateSchema, periodSchema } from './money-and-dates.ts';
import { paymentMethodSchema } from './payment-method.ts';
import { personNameSchema } from './person.ts';
import { dueDaySchema, dueMonthOffsetSchema } from './recurrence.ts';
import {
  plainTransactionInputSchema,
  transactionDescriptionSchema,
  transactionNotesSchema,
  transactionSchema,
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
 * A bank's identifier of a movement, with the bank, "NUBANK:<id>" (ADR 0061): never two
 * transactions of a workspace with the same one, so a statement imported again finds what came.
 */
export const externalIdSchema = z
  .string()
  .max(100)
  .regex(/^[A-Z]+:[\w-]{1,64}$/, 'Identificador de movimento inválido.');

/**
 * One imported transaction: the plain fields, plus the merchant (ADR 0053) and the person (a
 * receber de / a pagar para, ADR 0042) by name. A name the workspace does not have becomes a
 * merchant or a person in the import; an archived one comes back.
 */
export const importTransactionInputSchema = plainTransactionInputSchema.extend({
  merchantName: merchantNameSchema.optional(),
  personName: personNameSchema.optional(),
  /** The movement of an account statement it comes from (ADR 0061). */
  externalId: externalIdSchema.optional(),
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

/**
 * A movement of a statement that is already in the app (ADR 0061). Of an account statement: the
 * transaction takes its identifier and, while pending, is settled on its day. Of a card
 * statement (ADR 0061 note), which has no identifiers and settles nothing: it takes the bill's
 * due date and the day of the purchase. `amountCents` gives the amount the bank moved, when it
 * differs ("Valor diferente").
 */
export const importMatchInputSchema = z.object({
  transactionId: z.uuid(),
  externalId: externalIdSchema.optional(),
  settledAt: isoDateSchema.optional(),
  dueDate: isoDateSchema.optional(),
  occurredOn: isoDateSchema.optional(),
  amountCents: amountCentsSchema.optional(),
});

export type ImportMatchInput = z.infer<typeof importMatchInputSchema>;

/**
 * A movement that is part of a loan still pending (ADR 0061 note): received or paid on its day,
 * as "Recebimento parcial" / "Pagamento parcial" does (ADR 0057). The part is created, settled,
 * in the month of its day; the pending one keeps the rest, or goes once nothing is left. Undoing
 * the import gives it back.
 */
export const importPartInputSchema = z.object({
  transactionId: z.uuid(),
  externalId: externalIdSchema,
  amountCents: amountCentsSchema,
  settledAt: isoDateSchema,
});

export type ImportPartInput = z.infer<typeof importPartInputSchema>;

/** What an import brought (ADR 0060): the app's spreadsheet, or a bank's statement. */
export const importKindSchema = z.enum(['TEMPLATE', 'CARD_STATEMENT', 'ACCOUNT_STATEMENT']);

export type ImportKind = z.infer<typeof importKindSchema>;

/** The bank of a statement (ADR 0060). */
export const statementBankSchema = z.enum(['NUBANK']);

export type StatementBank = z.infer<typeof statementBankSchema>;

export const createImportInputSchema = z
  .object({
    /**
     * What it brings and from which bank (ADR 0060). Without them, it is read as before: a card
     * statement of Nubank when it has a due date, the template otherwise.
     */
    kind: importKindSchema.optional(),
    bank: statementBankSchema.nullable().optional(),
    transactions: z
      .array(importTransactionInputSchema)
      .max(
        MAX_IMPORT_TRANSACTIONS,
        `Importe no máximo ${MAX_IMPORT_TRANSACTIONS} lançamentos de uma vez.`,
      ),
    plans: z.array(importInstallmentPlanInputSchema).max(MAX_IMPORT_TRANSACTIONS).optional(),
    aliases: z.array(importMerchantAliasInputSchema).max(MAX_IMPORT_TRANSACTIONS).optional(),
    /** Movements already in the app, settled or linked instead of created (ADR 0061). */
    matches: z.array(importMatchInputSchema).max(MAX_IMPORT_TRANSACTIONS).optional(),
    /** Movements that are parts of a loan still pending (ADR 0061 note). */
    parts: z.array(importPartInputSchema).max(MAX_IMPORT_TRANSACTIONS).optional(),
    /** "Origem" (ADR 0055 note). */
    label: importLabelSchema.nullable().optional(),
    /** The due date of the card statement imported, when it is one. */
    statementDueDate: isoDateSchema.nullable().optional(),
  })
  .refine((input) => !input.kind || (input.kind === 'TEMPLATE') === !input.bank, {
    message: 'Um extrato diz o banco; a planilha modelo não tem banco.',
    path: ['bank'],
  })
  .refine(
    (input) =>
      input.transactions.length +
        (input.plans?.length ?? 0) +
        (input.matches?.length ?? 0) +
        (input.parts?.length ?? 0) >
      0,
    { message: 'Escolha ao menos um lançamento para importar.', path: ['transactions'] },
  )
  // A movement comes once, and a transaction takes one movement.
  .refine(
    (input) => {
      const ids = [
        ...input.transactions.flatMap((transaction) => transaction.externalId ?? []),
        ...(input.matches ?? []).flatMap((match) => match.externalId ?? []),
        ...(input.parts ?? []).map((part) => part.externalId),
      ];
      const matched = (input.matches ?? []).map((match) => match.transactionId);
      // A loan may get several parts, but is never also a match.
      const parted = new Set((input.parts ?? []).map((part) => part.transactionId));
      return (
        new Set(ids).size === ids.length &&
        new Set(matched).size === matched.length &&
        matched.every((id) => !parted.has(id))
      );
    },
    { message: 'Um movimento do extrato aparece duas vezes.', path: ['matches'] },
  )
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
  /**
   * Transactions already in the app it settled or linked (ADR 0061). Undoing it leaves them as
   * they are, only without the movement's identifier.
   */
  reconciledCount: z.number().int().default(0),
  /**
   * Parts of loans it received or paid (ADR 0061 note), among `transactionCount`. Undoing it
   * gives the loans back what it took.
   */
  partCount: z.number().int().default(0),
  /** "Origem", as typed; null for an import made before it, or without one. */
  label: z.string().nullable().default(null),
  /** The due date of the card statement, when it was one. */
  statementDueDate: isoDateSchema.nullable().default(null),
  /** What it brought and from which bank (ADR 0060); null bank for the template. */
  kind: importKindSchema.default('TEMPLATE'),
  bank: statementBankSchema.nullable().default(null),
  firstPeriod: periodSchema,
  lastPeriod: periodSchema,
  createdAt: z.iso.datetime(),
  /** Who imported; null once that account no longer exists. */
  createdBy: z.object({ name: z.string() }).nullable(),
  /**
   * What was built on its transactions since, which undoing it touches (ADR 0060 note): months
   * of a recurrence (not generated again), split ones (their shares stay unlinked), ones made an
   * installment plan (the other installments stay), and the last month of the plans it created.
   */
  dependents: z
    .object({
      recurrenceMonths: z.number().int(),
      splitTransactions: z.number().int(),
      installmentAdoptions: z.number().int(),
      plansUntil: periodSchema.nullable(),
    })
    .default({
      recurrenceMonths: 0,
      splitTransactions: 0,
      installmentAdoptions: 0,
      plansUntil: null,
    }),
});

export type Import = z.infer<typeof importSchema>;

/** Newest first. */
export const importListResponseSchema = z.array(importSchema);

/**
 * `POST /workspaces/:workspaceId/imports/candidates` (ADR 0061): what an account statement from
 * `from` to `to` may be in the app, for the review to compare before anything is written.
 */
export const importCandidatesInputSchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
    externalIds: z.array(externalIdSchema).max(MAX_IMPORT_TRANSACTIONS),
  })
  .refine((input) => input.from <= input.to, {
    message: 'O começo do extrato vem depois do fim.',
    path: ['to'],
  });

export type ImportCandidatesInput = z.infer<typeof importCandidatesInputSchema>;

export const importCandidatesResponseSchema = z.object({
  /** The movements of the file already in the app, and which transaction has each one. */
  known: z.array(z.object({ externalId: externalIdSchema, transactionId: z.uuid() })),
  /**
   * The transactions a movement may be, without a movement yet: the pending ones from a year
   * before the statement to the month after it (recurrence months created first), and the ones
   * settled within a week of it.
   */
  transactions: z.array(transactionSchema),
});

export type ImportCandidatesResponse = z.infer<typeof importCandidatesResponseSchema>;
