import { z } from 'zod';
import { transactionTypeSchema } from './category.ts';
import { amountCentsSchema, periodSchema } from './money-and-dates.ts';
import { MAX_SPLIT_PEOPLE, personNameSchema } from './person.ts';
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

/**
 * The fields of a recurrence, without the split: what an update and the web form `.omit()` or
 * `.pick()` from, since Zod refuses both on the refined create schema.
 */
export const recurrenceFieldsSchema = z.object({
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
  /** "A receber de" / "a pagar para" (ADR 0052): copied to every month it generates. */
  personId: z.uuid().nullable().optional(),
  /** Where it is bought or who pays it (ADR 0053): copied to every month it generates. */
  merchantId: z.uuid().nullable().optional(),
  /** The first competência; its transaction is created right away. */
  startPeriod: periodSchema,
});

/**
 * One person's share of a split recurrence (ADR 0052): someone already listed or a new name, and
 * a fixed amount or a percentage (basis points) of each month's amount.
 */
export const recurrenceShareInputSchema = z
  .object({
    personId: z.uuid().optional(),
    newPersonName: personNameSchema.optional(),
    amountCents: amountCentsSchema.optional(),
    basisPoints: z
      .number()
      .int('Use um percentual de até duas casas.')
      .min(1, 'De 0 a 100%.')
      .max(10_000, 'De 0 a 100%.')
      .optional(),
  })
  .refine((share) => (share.personId === undefined) !== (share.newPersonName === undefined), {
    message: 'Escolha a pessoa de cada parte.',
  })
  .refine((share) => (share.amountCents === undefined) !== (share.basisPoints === undefined), {
    message: 'Informe a parte em reais ou em percentual.',
  });

export type RecurrenceShareInput = z.infer<typeof recurrenceShareInputSchema>;

export const createRecurrenceInputSchema = recurrenceFieldsSchema
  .extend({
    /**
     * Splits it with other people (ADR 0052): every month it generates gets one pending share per
     * person, on the opposite side. A variable amount takes percentages only, which follow the
     * real amount of each month; a fixed one, all in reais or all in percentages.
     */
    split: z
      .array(recurrenceShareInputSchema)
      .min(1, 'Informe com quem dividir.')
      .max(MAX_SPLIT_PEOPLE, `Divida com no máximo ${MAX_SPLIT_PEOPLE} pessoas.`)
      .optional(),
  })
  .superRefine((input, context) => {
    if (!input.split) return;
    const issue = (message: string) =>
      context.addIssue({ code: 'custom', message, path: ['split'] });
    if (input.personId) issue('Um lançamento dividido não fica ligado a uma só pessoa.');
    const inReais = input.split.filter((share) => share.amountCents !== undefined);
    if (input.variableAmount && inReais.length > 0) {
      issue('Num valor que varia, divida em percentual.');
    } else if (inReais.length > 0 && inReais.length < input.split.length) {
      issue('Use só reais ou só percentual nas partes.');
    }
    const cents = inReais.reduce((sum, share) => sum + (share.amountCents ?? 0), 0);
    const points = input.split.reduce((sum, share) => sum + (share.basisPoints ?? 0), 0);
    if (cents > input.amountCents || points > 10_000) {
      issue('As partes dos outros passam do valor do lançamento.');
    }
    const people = input.split.map((share) => share.personId ?? share.newPersonName?.toLowerCase());
    if (new Set(people).size !== people.length) issue('A mesma pessoa aparece duas vezes.');
  });

export type CreateRecurrenceInput = z.infer<typeof createRecurrenceInputSchema>;

/** The type and the start do not change: end it and create another instead. */
export const updateRecurrenceInputSchema = recurrenceFieldsSchema
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
  personId: z.uuid().nullable().default(null),
  merchantId: z.uuid().nullable().default(null),
  startPeriod: periodSchema,
  /** The last competência it generated; null while active. */
  endPeriod: periodSchema.nullable(),
  /** Who shares it (ADR 0052): each person with a fixed amount or a percentage. */
  split: z
    .array(
      z.object({
        personId: z.uuid(),
        amountCents: z.number().int().nullable(),
        basisPoints: z.number().int().nullable(),
      }),
    )
    .default([]),
});

/**
 * The cents of one share of a month's amount (ADR 0052): a fixed amount as it is, a percentage
 * rounded to the cent. `shareOfAmount(24_000, { amountCents: null, basisPoints: 5_000 })` →
 * 12_000.
 */
export function shareOfAmount(
  amountCents: number,
  share: { amountCents: number | null; basisPoints: number | null },
): number {
  return share.amountCents ?? Math.round((amountCents * (share.basisPoints ?? 0)) / 10_000);
}

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
