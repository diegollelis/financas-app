import { z } from 'zod';
import { transactionTypeSchema } from './category.ts';
import { amountCentsSchema, periodSchema } from './money-and-dates.ts';
import { transactionDescriptionSchema, transactionNotesSchema } from './transaction.ts';

// Recorrências (ADR 0038): a transaction that repeats every month. Opening a competência creates
// its pending transaction there, with the estimated amount; changes reach only the pending ones
// from this month on, and settled ones and past months stay as history.

/** Day of the month it is due. A day the month does not have means its last day (31 → Feb 28). */
export const dueDaySchema = z
  .number('Informe o dia do vencimento.')
  .int('Use um dia inteiro.')
  .min(1, 'Use um dia entre 1 e 31.')
  .max(31, 'Use um dia entre 1 e 31.');

export const createRecurrenceInputSchema = z.object({
  type: transactionTypeSchema,
  description: transactionDescriptionSchema,
  notes: transactionNotesSchema.optional(),
  categoryId: z.uuid('Escolha uma categoria.'),
  amountCents: amountCentsSchema,
  dueDay: dueDaySchema.nullable().optional(),
  /**
   * The amount changes every month (energy, water): each month starts from the average of the
   * last 3 settled, and stays an estimate until the real one is given. Otherwise it is fixed.
   */
  variableAmount: z.boolean().optional(),
  /** The first competência; its transaction is created right away. */
  startPeriod: periodSchema,
});

export type CreateRecurrenceInput = z.infer<typeof createRecurrenceInputSchema>;

/** The type and the start do not change: end it and create another instead. */
export const updateRecurrenceInputSchema = createRecurrenceInputSchema
  .omit({ type: true, startPeriod: true })
  .partial()
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: 'Nada para alterar.',
  });

export type UpdateRecurrenceInput = z.infer<typeof updateRecurrenceInputSchema>;

export const recurrenceSchema = z.object({
  id: z.uuid(),
  type: transactionTypeSchema,
  description: z.string(),
  notes: z.string().nullable(),
  categoryId: z.uuid(),
  amountCents: z.number().int(),
  variableAmount: z.boolean(),
  dueDay: z.number().int().nullable(),
  startPeriod: periodSchema,
  /** The last competência it generated; null while active. */
  endPeriod: periodSchema.nullable(),
});

export type Recurrence = z.infer<typeof recurrenceSchema>;

/** Active ones first, then by description. */
export const recurrenceListResponseSchema = z.array(recurrenceSchema);

/** How many settled months the estimate of a variable recurrence looks back on. */
export const ESTIMATE_MONTHS = 3;

/**
 * The amount of a new month of a variable recurrence (ADR 0038): the average of its last
 * settled amounts (newest first, at most ESTIMATE_MONTHS of them), rounded to the cent; with no
 * history yet, the amount typed. An average weighs an unusual month less than repeating the last.
 */
export function estimateAmount(settledNewestFirst: number[], fallbackCents: number): number {
  const recent = settledNewestFirst.slice(0, ESTIMATE_MONTHS);
  if (recent.length === 0) return fallbackCents;
  return Math.round(recent.reduce((sum, cents) => sum + cents, 0) / recent.length);
}

/**
 * The due date in a competência: `dueDateIn('2026-02', 31)` → '2026-02-28'. Integer math on the
 * calendar, no time zone involved.
 */
export function dueDateIn(period: string, dueDay: number): string {
  const [year, month] = period.split('-').map(Number);
  // Day 0 of the next month is the last day of this one (UTC, so no time zone can shift it).
  const lastDay = new Date(Date.UTC(year ?? 0, month ?? 1, 0)).getUTCDate();
  return `${period}-${String(Math.min(dueDay, lastDay)).padStart(2, '0')}`;
}
