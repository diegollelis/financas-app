import { z } from 'zod';
import type { TransactionType } from './category.ts';

// Meio de pagamento (ADR 0054): how a transaction was paid or received, from a fixed list. Not an
// account nor a card with a balance and a bill: that, if it comes, has an ADR of its own.

export const paymentMethodSchema = z.enum(
  ['PIX', 'DEBIT_CARD', 'CREDIT_CARD', 'MEAL_VOUCHER', 'CASH', 'BOLETO', 'TRANSFER', 'AUTO_DEBIT'],
  'Escolha um meio da lista.',
);

export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

/** The interface's word for each one (ADR 0051), in the order the form offers them. */
export const paymentMethodLabels = {
  PIX: 'Pix',
  DEBIT_CARD: 'Débito',
  CREDIT_CARD: 'Crédito',
  /** A meal or food voucher, from the employer (VA, VR), even one usable at a single store. */
  MEAL_VOUCHER: 'Vale-alimentação/refeição',
  CASH: 'Dinheiro',
  BOLETO: 'Boleto',
  TRANSFER: 'Transferência',
  AUTO_DEBIT: 'Débito automático',
} as const satisfies Record<PaymentMethod, string>;

/** The field's name: an outflow is paid, an inflow received. */
export const paymentMethodFieldLabels = {
  CREDIT: 'Meio de recebimento',
  DEBIT: 'Meio de pagamento',
} as const satisfies Record<TransactionType, string>;
