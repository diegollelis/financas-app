import { z } from 'zod';
import { amountCentsSchema, isoDateSchema, periodSchema } from './money-and-dates.ts';
import { transactionTypeSchema } from './category.ts';

/**
 * One closing of a competência (ADR 0063): who closed it and when and, once reopened, who
 * reopened it, when and why. Names are null once that account is gone.
 */
export const periodClosingSchema = z.object({
  id: z.uuid(),
  period: periodSchema,
  closedAt: z.iso.datetime(),
  closedBy: z.string().nullable(),
  reopenedAt: z.iso.datetime().nullable(),
  reopenedBy: z.string().nullable(),
  reopenReason: z.string().nullable(),
});
export type PeriodClosing = z.infer<typeof periodClosingSchema>;

/** A pending transaction that keeps the competência from being closed. */
export const periodPendingSchema = z.object({
  id: z.uuid(),
  type: transactionTypeSchema,
  description: z.string(),
  amountCents: amountCentsSchema,
  dueDate: isoDateSchema.nullable(),
});
export type PeriodPending = z.infer<typeof periodPendingSchema>;

/**
 * The closing state of a competência: the closing in force (null while open), every closing
 * of it, latest first, and, while open, what is still pending. A pending loan with no due date
 * in a "Nem renda nem gasto" category is not listed: it never keeps a month from closing.
 */
export const periodClosingStateSchema = z.object({
  period: periodSchema,
  closing: periodClosingSchema.nullable(),
  history: z.array(periodClosingSchema),
  pending: z.array(periodPendingSchema),
});
export type PeriodClosingState = z.infer<typeof periodClosingStateSchema>;

export const REOPEN_REASON_MAX = 500;

export const reopenPeriodInputSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, 'Diga por que o mês vai ser reaberto.')
    .max(REOPEN_REASON_MAX, `Use até ${REOPEN_REASON_MAX} caracteres.`),
});
export type ReopenPeriodInput = z.infer<typeof reopenPeriodInputSchema>;
