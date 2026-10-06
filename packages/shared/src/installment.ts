import { z } from 'zod';
import { transactionTypeSchema } from './category.ts';
import { amountCentsSchema, MAX_AMOUNT_CENTS, periodSchema } from './money-and-dates.ts';
import { dueDaySchema } from './recurrence.ts';
import { transactionDescriptionSchema, transactionNotesSchema } from './transaction.ts';

// Parcelamentos (ADR 0038): a purchase or debt split into monthly installments, all created at
// once, one per competência from the first on. The cents a split leaves go to the last one.

export const MIN_INSTALLMENTS = 2;
export const MAX_INSTALLMENTS = 72;

export const installmentCountSchema = z
  .number('Informe o número de parcelas.')
  .int('Use um número inteiro de parcelas.')
  .min(MIN_INSTALLMENTS, `Use de ${MIN_INSTALLMENTS} a ${MAX_INSTALLMENTS} parcelas.`)
  .max(MAX_INSTALLMENTS, `Use de ${MIN_INSTALLMENTS} a ${MAX_INSTALLMENTS} parcelas.`);

/** Whether `amountCents` is the whole purchase or each installment (as the card bill shows it). */
export const installmentAmountIsSchema = z.enum(['TOTAL', 'INSTALLMENT']);

export const createInstallmentPlanInputSchema = z
  .object({
    type: transactionTypeSchema,
    description: transactionDescriptionSchema,
    notes: transactionNotesSchema.optional(),
    categoryId: z.uuid('Escolha uma categoria.'),
    installments: installmentCountSchema,
    amountCents: amountCentsSchema,
    amountIs: installmentAmountIsSchema,
    /** The competência of the first installment. */
    firstPeriod: periodSchema,
    dueDay: dueDaySchema.nullable().optional(),
  })
  .refine(
    (input) =>
      input.amountIs === 'TOTAL' || input.amountCents * input.installments <= MAX_AMOUNT_CENTS,
    { message: 'Valor total alto demais.', path: ['amountCents'] },
  )
  .refine((input) => input.amountIs === 'INSTALLMENT' || input.amountCents >= input.installments, {
    message: 'O total precisa dar ao menos um centavo por parcela.',
    path: ['amountCents'],
  });

export type CreateInstallmentPlanInput = z.infer<typeof createInstallmentPlanInputSchema>;

export const installmentPlanSchema = z.object({
  id: z.uuid(),
  type: transactionTypeSchema,
  description: z.string(),
  notes: z.string().nullable(),
  categoryId: z.uuid(),
  totalCents: z.number().int(),
  installments: z.number().int(),
  firstPeriod: periodSchema,
  dueDay: z.number().int().nullable(),
  /** When it was ended; null while it runs. */
  endedAt: z.iso.datetime().nullable(),
  /** How many installments were already settled. */
  settledCount: z.number().int(),
});

export type InstallmentPlan = z.infer<typeof installmentPlanSchema>;

/** Running ones first, then by description. */
export const installmentPlanListResponseSchema = z.array(installmentPlanSchema);

/**
 * Each installment's amount, in order: equal parts of the total, and the cents the division
 * leaves go to the last one, so they always add up to the total. `splitInstallments(100_000, 3)`
 * → [33_333, 33_333, 33_334].
 */
export function splitInstallments(totalCents: number, installments: number): number[] {
  const part = Math.floor(totalCents / installments);
  return Array.from({ length: installments }, (_, index) =>
    index === installments - 1 ? totalCents - part * (installments - 1) : part,
  );
}

/** The total of a plan, from the amount typed and what it means. */
export function installmentPlanTotal(input: CreateInstallmentPlanInput): number {
  return input.amountIs === 'TOTAL' ? input.amountCents : input.amountCents * input.installments;
}
