import { dueMonthOffsetOf } from '@financas/shared';

/** "dia 10", or "dia 10 do mês seguinte" when it is due in the next month (ADR 0038 note). */
export function dueDayLabel(dueDay: number, dueMonthOffset: number): string {
  return dueMonthOffset === 1 ? `dia ${dueDay} do mês seguinte` : `dia ${dueDay}`;
}

/**
 * What a recurrence or a plan keeps of the date typed for its first month: the day, and how many
 * months after the competência it falls (`'2026-10'`, `'2026-11-10'` → day 10, offset 1).
 */
export function dueOf(period: string, dueDate: string | null) {
  if (!dueDate) return { dueDay: null, dueMonthOffset: 0 };
  return { dueDay: Number(dueDate.slice(8)), dueMonthOffset: dueMonthOffsetOf(period, dueDate) };
}
