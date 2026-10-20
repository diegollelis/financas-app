import { dueMonthOffsetOf } from '@financas/shared';

const monthNames = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' });

/** "dia 10", or "dia 10 do mês seguinte" when it is due in the next month (ADR 0038 note). */
export function dueDayLabel(dueDay: number, dueMonthOffset: number): string {
  return dueMonthOffset === 1 ? `dia ${dueDay} do mês seguinte` : `dia ${dueDay}`;
}

/** "março": the month of a competência, without the year. */
export function monthNameOf(period: string): string {
  const [year, month] = period.split('-').map(Number);
  // Day 1 in UTC, read in UTC: no time zone can move it to the month before.
  return monthNames.format(new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, 1)));
}

/** "Todo mês", or "Todo ano em março" for a yearly one, in the month of its start. */
export function frequencyLabel(intervalMonths: number, startPeriod: string): string {
  return intervalMonths === 12 ? `Todo ano em ${monthNameOf(startPeriod)}` : 'Todo mês';
}

/** What "Fixo" and "Variável" mean, for a monthly or a yearly recurrence (ADR 0038). */
export function amountKindHint(variable: boolean, yearly: boolean): string {
  if (yearly) {
    return variable
      ? 'Para valores que mudam de um ano para o outro, como IPVA e IPTU. Cada ano começa com a média dos 3 últimos pagos; ao marcar como pago, você informa o valor real.'
      : 'O mesmo valor todo ano, como uma anuidade.';
  }
  return variable
    ? 'Para contas que mudam todo mês, como energia e água. Cada mês começa com a média dos 3 últimos pagos; ao marcar como pago, você informa o valor da fatura.'
    : 'O mesmo valor todo mês, como internet e aluguel.';
}

/**
 * What a recurrence or a plan keeps of the date typed for its first month: the day, and how many
 * months after the competência it falls (`'2026-10'`, `'2026-11-10'` → day 10, offset 1).
 */
export function dueOf(period: string, dueDate: string | null) {
  if (!dueDate) return { dueDay: null, dueMonthOffset: 0 };
  return { dueDay: Number(dueDate.slice(8)), dueMonthOffset: dueMonthOffsetOf(period, dueDate) };
}
