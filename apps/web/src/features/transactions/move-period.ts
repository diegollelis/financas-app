import {
  dueDateFor,
  dueDateIn,
  dueMonthOffsetOf,
  formatPeriod,
  shiftPeriod,
  type Card,
  type Transaction,
} from '@financas/shared';
import { monthNameOf } from '@/features/recurrences/due';

/**
 * The due date suggested when a transaction moves to another competência (ADR 0029 note): it moves
 * as many months as the competência. In Crédito on a card with bill days, the day is the card's due
 * day, and one with no due date takes the bill of that month, as the card's days place it (ADR 0062).
 * Otherwise the same day; with no due date and no card, still none.
 * `movedDueDate({ period: '2026-10', dueDate: '2026-11-05' }, '2026-11', null)` → '2026-12-05'.
 */
export function movedDueDate(
  transaction: Pick<Transaction, 'period' | 'dueDate'>,
  to: string,
  card: Pick<Card, 'closingDay' | 'dueDay'> | null,
): string | null {
  const bill =
    card?.closingDay != null && card.dueDay != null
      ? { closingDay: card.closingDay, dueDay: card.dueDay }
      : null;
  if (!transaction.dueDate) {
    return bill && dueDateFor(to, bill.dueDay, bill.dueDay > bill.closingDay ? 0 : 1);
  }
  const months = dueMonthOffsetOf(transaction.period, `${to}-01`);
  const month = shiftPeriod(transaction.dueDate.slice(0, 7), months);
  return dueDateIn(month, bill?.dueDay ?? Number(transaction.dueDate.slice(8)));
}

/** "novembro", or "janeiro de 2027" when the year is not the one it leaves. */
export function targetMonthText(from: string, to: string): string {
  return from.slice(0, 4) === to.slice(0, 4) ? monthNameOf(to) : formatPeriod(to);
}
