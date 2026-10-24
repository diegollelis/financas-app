import type { TransactionType } from './category.ts';

// The interface's words for the transaction types and statuses (ADR 0051), in one place so every
// screen, toast and e-mail says the same thing. The code keeps CREDIT/DEBIT and SETTLED; these
// are only how a person reads them (docs/dominio/glossario.md).

/** "Entrada" / "Saída", in the form each place needs. */
export const transactionTypeLabels = {
  CREDIT: { singular: 'Entrada', plural: 'Entradas', lower: 'entrada', lowerPlural: 'entradas' },
  DEBIT: { singular: 'Saída', plural: 'Saídas', lower: 'saída', lowerPlural: 'saídas' },
} as const satisfies Record<TransactionType, Record<string, string>>;

/** A settled transaction: an outflow is paid, an inflow received. */
export const settledLabels = {
  CREDIT: 'Recebido',
  DEBIT: 'Pago',
} as const satisfies Record<TransactionType, string>;

/** The form field of the day it was settled (ADR 0029 note): blank while pending. */
export const settledOnLabels = {
  CREDIT: 'Recebido em',
  DEBIT: 'Pago em',
} as const satisfies Record<TransactionType, string>;

/** The day it happened (ADR 0055): an outflow's is the purchase's, an inflow's just its day. */
export const occurredOnLabels = {
  CREDIT: 'Data',
  DEBIT: 'Data da compra',
} as const satisfies Record<TransactionType, string>;

/** The same on a row, before the day: "Compra em 28/09", "Em 03/10". */
export const occurredOnRowLabels = {
  CREDIT: 'Em',
  DEBIT: 'Compra em',
} as const satisfies Record<TransactionType, string>;

/**
 * The action that settles a transaction, its short label on the row's button (beside the status
 * badge, it reads as what to do; the full one is in the menu), and the one that takes it back.
 */
export const settleActionLabels = {
  CREDIT: { settle: 'Marcar como recebido', short: 'Receber', unsettle: 'Desmarcar recebimento' },
  DEBIT: { settle: 'Marcar como pago', short: 'Pagar', unsettle: 'Desmarcar pagamento' },
} as const satisfies Record<TransactionType, { settle: string; short: string; unsettle: string }>;

/**
 * Part of a pending transaction received or paid (ADR 0057): the action ("pagamento parcial", the
 * market's and the banks' term), its confirm button, its amount field and the word of its toast ("R$ 1.500,00 recebido de …").
 */
export const settlePartLabels = {
  CREDIT: {
    action: 'Recebimento parcial',
    submit: 'Registrar recebimento',
    amount: 'Valor recebido',
    done: 'recebido',
  },
  DEBIT: {
    action: 'Pagamento parcial',
    submit: 'Registrar pagamento',
    amount: 'Valor pago',
    done: 'pago',
  },
} as const satisfies Record<
  TransactionType,
  { action: string; submit: string; amount: string; done: string }
>;

/** The statuses that are not settled; the settled one depends on the type (`settledLabels`). */
export const PENDING_LABEL = 'Pendente';
export const OVERDUE_LABEL = 'Vencido';
