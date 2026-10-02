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

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** 123456 → "R$ 1.234,56". */
export function formatCents(cents: number): string {
  return brl.format(cents / 100);
}

/**
 * Reads an amount typed the Brazilian way into cents, with integer math only: "1.234,56",
 * "1234,5", "R$ 15" and "15.90" all work. Returns null when it is not an amount.
 */
export function parseReais(text: string): number | null {
  const cleaned = text.replace(/R\$/i, '').replace(/\s/g, '');
  // With a comma, it is the decimal separator and dots group thousands ("1.234,56"). Without
  // one, a dot followed by one or two digits at the end is decimal ("15.90"); others group.
  const match = cleaned.includes(',')
    ? /^(\d{1,3}(?:\.\d{3})+|\d+),(\d{1,2})?$/.exec(cleaned)
    : (/^(\d+)\.(\d{1,2})$/.exec(cleaned) ?? /^(\d{1,3}(?:\.\d{3})+|\d+)()$/.exec(cleaned));
  if (!match) return null;
  const reais = Number((match[1] ?? '').replaceAll('.', ''));
  const cents = Number((match[2] ?? '').padEnd(2, '0'));
  return reais * 100 + cents;
}

/** A form field with an amount in reais, validated and turned into cents. */
export const reaisInputSchema = z
  .string()
  .transform((text, ctx) => {
    if (text.trim() === '') {
      ctx.addIssue({ code: 'custom', message: 'Informe o valor.' });
      return z.NEVER;
    }
    const cents = parseReais(text);
    if (cents === null) {
      ctx.addIssue({ code: 'custom', message: 'Use um valor como 1.234,56.' });
      return z.NEVER;
    }
    return cents;
  })
  .pipe(amountCentsSchema);

const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 2 });

/** Percentages are integer basis points (ADR 0010): 1250 → "12,5%". */
export function formatBasisPoints(basisPoints: number): string {
  return percent.format(basisPoints / 10_000);
}

/**
 * Reads a percentage typed the Brazilian way into basis points, with integer math only: "60",
 * "12,5", "12.55" and "5%" all work. Returns null when it is not a percentage with up to two
 * decimal places (it may still be above 100%: the schema says so, in pt-BR).
 */
export function parsePercent(text: string): number | null {
  const match = /^(\d+)(?:[.,](\d{1,2}))?%?$/.exec(text.replace(/\s/g, ''));
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

/** The app's time zone (ADR 0010): "today" is the user's today, not the server's. */
export const APP_TIME_ZONE = 'America/Sao_Paulo';

/** Today in São Paulo, `YYYY-MM-DD` (the en-CA format happens to be ISO). */
export function todayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIME_ZONE }).format(now);
}

/** The current competência in São Paulo, `YYYY-MM`. */
export function currentPeriod(now: Date = new Date()): string {
  return todayIso(now).slice(0, 7);
}

/** "2026-10-05" → "05/10/2026", by splitting the text: no Date, so no time zone shift. */
export function formatIsoDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

/**
 * The competência `months` away: shiftPeriod('2026-01', -1) → '2025-12'. Integer math on the
 * month count, no Date, so no time zone can move it.
 */
export function shiftPeriod(period: string, months: number): string {
  const [year, month] = period.split('-').map(Number);
  const index = (year ?? 0) * 12 + (month ?? 1) - 1 + months;
  const shiftedMonth = (index % 12) + 1;
  return `${Math.floor(index / 12)}-${String(shiftedMonth).padStart(2, '0')}`;
}

const monthNames = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' });

/** "2026-10" → "outubro de 2026". */
export function formatPeriod(period: string): string {
  const [year, month] = period.split('-').map(Number);
  const month1st = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, 1));
  return `${monthNames.format(month1st)} de ${year}`;
}
