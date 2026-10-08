import { parsePercent, parseReais, splitEvenly } from '@financas/shared';

/** Whole percentage, in basis points (ADR 0010). */
const FULL = 10_000;

/** How the other people's shares are typed: in reais or as a percentage of the total. */
export type ShareMode = 'REAIS' | 'PERCENT';

/** One row of "Dividir com alguém": who, and their share as typed. */
export interface ShareRow {
  name: string;
  value: string;
}

/** 15000 → "150,00"; 3333 basis points → "33,33": a value as the person would type it. */
const typed = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * The cents of one share, or null while it is not a valid one: reais typed the Brazilian way,
 * or a percentage (more than 0, up to 100) of `totalCents`, rounded to the cent.
 */
export function shareCents(totalCents: number | null, value: string, mode: ShareMode) {
  if (mode === 'REAIS') {
    const cents = parseReais(value);
    return cents !== null && cents > 0 ? cents : null;
  }
  const basisPoints = parsePercent(value);
  if (totalCents === null || basisPoints === null || basisPoints <= 0 || basisPoints > FULL) {
    return null;
  }
  return Math.round((totalCents * basisPoints) / FULL);
}

/** What stays yours: the total minus the others' shares; null while any of them is invalid. */
export function myShareCents(totalCents: number | null, shares: (number | null)[]) {
  if (totalCents === null || shares.some((share) => share === null)) return null;
  return totalCents - shares.reduce<number>((sum, share) => sum + (share ?? 0), 0);
}

/**
 * Equal shares for `count` other people, you included in the division (ADR 0042): what each of
 * them types, the leftover cents (or basis points) staying in yours.
 */
export function evenShareValues(totalCents: number, count: number, mode: ShareMode): string[] {
  const parts = splitEvenly(mode === 'REAIS' ? totalCents : FULL, count + 1).slice(1);
  return parts.map((part) => typed.format(part / 100));
}
