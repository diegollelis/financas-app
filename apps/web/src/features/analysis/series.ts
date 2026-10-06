import type { AnalysisFilters, MonthlyPoint } from '@financas/shared';

/** Colors in the validated order of ADR 0032 (ADR 0037): credits, debits, balance. */
export const seriesStyles = {
  credits: { label: 'Créditos', fill: 'fill-chart-1', swatch: 'bg-chart-1' },
  debits: { label: 'Débitos', fill: 'fill-chart-2', swatch: 'bg-chart-2' },
  balance: { label: 'Saldo', fill: 'fill-chart-3', swatch: 'bg-chart-3' },
} as const;

export type SeriesKey = keyof typeof seriesStyles;

/** Which series the type filter leaves: the balance only makes sense with both. */
export function visibleSeries(type: AnalysisFilters['type']): SeriesKey[] {
  if (type === 'CREDIT') return ['credits'];
  if (type === 'DEBIT') return ['debits'];
  return ['credits', 'debits', 'balance'];
}

export const valueOf = (point: MonthlyPoint, key: SeriesKey) =>
  key === 'credits'
    ? point.creditsCents
    : key === 'debits'
      ? point.debitsCents
      : point.balanceCents;
