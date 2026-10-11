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

/** The action that settles a transaction, and the one that takes it back. */
export const settleActionLabels = {
  CREDIT: { settle: 'Marcar como recebido', unsettle: 'Desmarcar recebimento' },
  DEBIT: { settle: 'Marcar como pago', unsettle: 'Desmarcar pagamento' },
} as const satisfies Record<TransactionType, { settle: string; unsettle: string }>;

/** The statuses that are not settled; the settled one depends on the type (`settledLabels`). */
export const PENDING_LABEL = 'Pendente';
export const OVERDUE_LABEL = 'Vencido';
