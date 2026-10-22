import { formatCents, formatIsoDate, type Transaction } from '@financas/shared';

/** Shared by Lançamentos and a person's transactions (ADR 0036 notes), so both read the same. */

/**
 * "+ R$ 45,00" for money in, "− R$ 69,90" (a real minus sign) for money out: the sign always,
 * the color only on top of it (ADR 0036 note).
 */
export function signedCents(type: Transaction['type'], cents: number) {
  return `${type === 'CREDIT' ? '+' : '−'} ${formatCents(cents)}`;
}

/** "28/09": a day of the competência's year needs no year; another one keeps it. */
export function dayInPeriod(iso: string, period: string) {
  const date = formatIsoDate(iso);
  return iso.slice(0, 4) === period.slice(0, 4) ? date.slice(0, 5) : date;
}
