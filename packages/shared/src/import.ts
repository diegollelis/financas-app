import { z } from 'zod';
import { periodSchema } from './money-and-dates.ts';
import { plainTransactionInputSchema } from './transaction.ts';

// Importação da planilha (ADR 0040): the browser reads the .xlsx and sends only the transactions
// the person confirmed; the file never reaches the API. One import is one row in `imports`, and
// undoing it deletes every transaction it brought.

/** A spreadsheet holds a few years of months; more than this in one go is a mistake. */
export const MAX_IMPORT_TRANSACTIONS = 2000;

export const createImportInputSchema = z.object({
  transactions: z
    .array(plainTransactionInputSchema)
    .min(1, 'Escolha ao menos um lançamento para importar.')
    .max(
      MAX_IMPORT_TRANSACTIONS,
      `Importe no máximo ${MAX_IMPORT_TRANSACTIONS} lançamentos de uma vez.`,
    ),
});

export type CreateImportInput = z.infer<typeof createImportInputSchema>;

export const importSchema = z.object({
  id: z.uuid(),
  transactionCount: z.number().int(),
  firstPeriod: periodSchema,
  lastPeriod: periodSchema,
  createdAt: z.iso.datetime(),
  /** Who imported; null once that account no longer exists. */
  createdBy: z.object({ name: z.string() }).nullable(),
});

export type Import = z.infer<typeof importSchema>;

/** Newest first. */
export const importListResponseSchema = z.array(importSchema);
