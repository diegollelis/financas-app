import { z } from 'zod';

// Money and dates (ADR 0010): integer cents, never floats; the accounting month as `YYYY-MM`;
// calendar dates as `YYYY-MM-DD`, with no time and no time zone.

/** R$ 10 milhões: far above any personal transaction, and well inside a Postgres INTEGER. */
export const MAX_AMOUNT_CENTS = 1_000_000_000;

/** An amount in cents. Always positive: whether it adds or subtracts comes from the type. */
export const amountCentsSchema = z
  .number('Informe o valor.')
  .int('O valor precisa estar em centavos inteiros.')
  .min(1, 'O valor precisa ser maior que zero.')
  .max(MAX_AMOUNT_CENTS, 'Valor alto demais.');

/** Competência: the month a transaction belongs to, e.g. `2026-10`. */
export const periodSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use uma competência no formato AAAA-MM.');

export type Period = z.infer<typeof periodSchema>;

/** A calendar date, `YYYY-MM-DD` (e.g. a due date). */
export const isoDateSchema = z.iso.date('Informe uma data válida.');
