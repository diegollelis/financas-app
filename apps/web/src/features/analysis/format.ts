const monthShort = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' });

/** "2026-10" → "out/26": a chart label that fits under a column. */
export function formatPeriodShort(period: string): string {
  const [year, month] = period.split('-').map(Number);
  const name = monthShort.format(new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, 1)));
  return `${name.replace('.', '')}/${String(year).slice(2)}`;
}

const compact = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** 523000 cents → "R$ 5,2 mil": axis labels, where full amounts would not fit. */
export function formatCentsCompact(cents: number): string {
  return compact.format(cents / 100);
}
