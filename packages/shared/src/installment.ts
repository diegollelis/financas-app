import { z } from 'zod';
import { transactionTypeSchema } from './category.ts';
import { amountCentsSchema, MAX_AMOUNT_CENTS, periodSchema } from './money-and-dates.ts';
import { MAX_SPLIT_PEOPLE } from './person.ts';
import { paymentMethodSchema } from './payment-method.ts';
import { dueDaySchema, dueMonthOffsetSchema } from './recurrence.ts';
import {
  splitShareInputSchema,
  transactionDescriptionSchema,
  transactionNotesSchema,
} from './transaction.ts';

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
    /** Each installment due in its own month (0, the default) or in the next one (1). */
    dueMonthOffset: dueMonthOffsetSchema.optional(),
    /** "A receber de" / "a pagar para" (ADR 0052): copied to every installment. */
    personId: z.uuid().nullable().optional(),
    /** Where it was bought or who pays it (ADR 0053): copied to every installment. */
    merchantId: z.uuid().nullable().optional(),
    /** How it is paid or received (ADR 0054): copied to every installment. */
    paymentMethod: paymentMethodSchema.nullable().optional(),
    /**
     * Splits it with other people (ADR 0052): each share in the same meaning as `amountCents`
     * (of the total, or of each installment). Every installment gets one pending share per
     * person, on the opposite side, created with it.
     */
    split: z
      .array(splitShareInputSchema)
      .min(1, 'Informe com quem dividir.')
      .max(MAX_SPLIT_PEOPLE, `Divida com no máximo ${MAX_SPLIT_PEOPLE} pessoas.`)
      .optional(),
  })
  .refine(
    (input) =>
      input.amountIs === 'TOTAL' || input.amountCents * input.installments <= MAX_AMOUNT_CENTS,
    { message: 'Valor total alto demais.', path: ['amountCents'] },
  )
  .refine((input) => input.amountIs === 'INSTALLMENT' || input.amountCents >= input.installments, {
    message: 'O total precisa dar ao menos um centavo por parcela.',
    path: ['amountCents'],
  })
  .superRefine((input, context) => {
    if (!input.split) return;
    const issue = (message: string) =>
      context.addIssue({ code: 'custom', message, path: ['split'] });
    if (input.personId) issue('Um lançamento dividido não fica ligado a uma só pessoa.');
    const others = input.split.reduce((sum, share) => sum + share.amountCents, 0);
    if (others > input.amountCents) issue('As partes dos outros passam do valor do lançamento.');
    if (
      input.amountIs === 'TOTAL' &&
      input.split.some((share) => share.amountCents < input.installments)
    ) {
      issue('Cada parte precisa dar ao menos um centavo por parcela.');
    }
    const people = input.split.map((share) => share.personId ?? share.newPersonName?.toLowerCase());
    if (new Set(people).size !== people.length) issue('A mesma pessoa aparece duas vezes.');
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
  dueMonthOffset: z.number().int().default(0),
  personId: z.uuid().nullable().default(null),
  merchantId: z.uuid().nullable().default(null),
  paymentMethod: paymentMethodSchema.nullable().default(null),
  /** When it was ended; null while it runs. */
  endedAt: z.iso.datetime().nullable(),
  /** How many installments were already settled. */
  settledCount: z.number().int(),
  /**
   * What is still to pay: the installments not settled yet, their sum and the competência of the
   * last one (null when none is left). Counted from the transactions, so an installment deleted
   * on its own is not counted.
   */
  pendingCount: z.number().int().default(0),
  pendingCents: z.number().int().default(0),
  lastPendingPeriod: periodSchema.nullable().default(null),
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
