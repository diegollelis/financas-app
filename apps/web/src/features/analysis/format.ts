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

const plain = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * 523000 cents → "5.230,00": an amount in a column whose title says "(R$)", so the currency is
 * not repeated in every cell (the monthly table on the phone).
 */
export function formatCentsPlain(cents: number): string {
  return plain.format(cents / 100);
}

/** 523000 cents → "R$ 5,2 mil": axis labels, where full amounts would not fit. */
export function formatCentsCompact(cents: number): string {
  return compact.format(cents / 100);
}
