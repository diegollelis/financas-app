import { formatCents, type Summary } from '@financas/shared';
import { cn } from '@/lib/utils';

/**
 * Where the month's credits go: debits paid, debits still to pay, what is left (the planned
 * balance) and what is to receive with no due date, out of that balance (ADR 0057). It replaces the spreadsheet's pie ("débitos pagos × saldo final"): one stacked bar
 * reads better, and also shows what is still to pay. When debits are more than credits, the
 * bar is the debits alone and a note says by how much. The amounts are in the balance card around
 * it, so the legend names the parts only (ADR 0045 note); the bar's label keeps the numbers.
 */
export function CreditsBar({ summary }: { summary: Summary }) {
  const { credits, debits, balance } = summary;
  // A negative balance has no part of the credits: it leaves the bar and the legend, so the
  // legend never shows "Saldo previsto R$ 0,00" under a negative one (ADR 0051 note).
  const segments = [
    { label: 'Saídas pagas', cents: debits.settledCents, color: 'bg-chart-1' },
    // A debt with no due date is not this month's to pay (ADR 0057 note): out of the bar, said
    // under the planned balance.
    {
      label: 'Saídas a pagar',
      cents: debits.pendingCents - summary.undatedPayableCents,
      color: 'bg-chart-2',
    },
    ...(balance.plannedCents > 0
      ? [{ label: 'Saldo previsto', cents: balance.plannedCents, color: 'bg-chart-3' }]
      : []),
    // Credits too, but out of the planned balance (ADR 0057): their own part, so it adds up.
    ...(summary.undatedCents > 0
      ? [{ label: 'A receber sem vencimento', cents: summary.undatedCents, color: 'bg-chart-4' }]
      : []),
  ];
  const whole = segments.reduce((sum, segment) => sum + segment.cents, 0);
  if (whole === 0) {
    return <p className="text-muted-foreground">Nenhum lançamento neste mês.</p>;
  }
  const visible = segments.filter((segment) => segment.cents > 0);
  const percent = (cents: number) => (cents / whole) * 100;

  return (
    <figure className="grid gap-2">
      <div
        role="img"
        aria-label={`Entradas de ${formatCents(credits.totalCents)}: ${visible
          .map((segment) => `${segment.label.toLowerCase()} ${formatCents(segment.cents)}`)
          .join(', ')}.`}
        className="flex h-2.5 gap-0.5 overflow-hidden rounded-full"
      >
        {visible.map((segment) => (
          <div
            key={segment.label}
            title={`${segment.label}: ${formatCents(segment.cents)}`}
            className={segment.color}
            style={{ width: `${percent(segment.cents)}%` }}
          />
        ))}
      </div>
      <figcaption>
        <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {segments.map((segment) => (
            <li key={segment.label} className="flex items-center gap-1.5">
              <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', segment.color)} />
              {segment.label}
            </li>
          ))}
        </ul>
        {balance.plannedCents < 0 && (
          <p className="text-destructive mt-2 tabular-nums">
            As saídas passam das entradas
            {summary.undatedCents + summary.undatedPayableCents > 0 &&
              ', sem o que não tem vencimento,'}{' '}
            em {formatCents(-balance.plannedCents)}.
          </p>
        )}
      </figcaption>
    </figure>
  );
}
