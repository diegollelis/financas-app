import { formatCents, type Summary } from '@financas/shared';
import { cn } from '@/lib/utils';

/**
 * Where the month's credits go: debits paid, debits still to pay and what is left (the planned
 * balance). It replaces the spreadsheet's pie ("débitos pagos × saldo final"): one stacked bar
 * reads better, and also shows what is still to pay. When debits are more than credits, the
 * bar is the debits alone and a note says by how much.
 */
export function CreditsBar({ summary }: { summary: Summary }) {
  const { credits, debits, balance } = summary;
  const segments = [
    { label: 'Débitos pagos', cents: debits.settledCents, color: 'bg-chart-1' },
    { label: 'Débitos a pagar', cents: debits.pendingCents, color: 'bg-chart-2' },
    { label: 'Saldo previsto', cents: Math.max(balance.plannedCents, 0), color: 'bg-chart-3' },
  ];
  const whole = segments.reduce((sum, segment) => sum + segment.cents, 0);
  if (whole === 0) {
    return <p className="text-muted-foreground">Nenhum lançamento nesta competência.</p>;
  }
  const visible = segments.filter((segment) => segment.cents > 0);
  const percent = (cents: number) => (cents / whole) * 100;

  return (
    <figure className="grid gap-3">
      {/* The legend below carries the numbers; the bar is a picture of them. */}
      <div
        role="img"
        aria-label={`Créditos de ${formatCents(credits.totalCents)}: ${visible
          .map((segment) => `${segment.label.toLowerCase()} ${formatCents(segment.cents)}`)
          .join(', ')}.`}
        className="flex h-6 gap-0.5"
      >
        {visible.map((segment, index) => (
          <div
            key={segment.label}
            title={`${segment.label}: ${formatCents(segment.cents)}`}
            className={cn(segment.color, index === visible.length - 1 && 'rounded-r')}
            style={{ width: `${percent(segment.cents)}%` }}
          />
        ))}
      </div>
      <figcaption>
        <ul className="grid gap-1 sm:grid-cols-3">
          {segments.map((segment) => (
            <li key={segment.label} className="flex items-center gap-2">
              <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', segment.color)} />
              <span className="text-muted-foreground">{segment.label}</span>
              <span className="ml-auto tabular-nums sm:ml-0">{formatCents(segment.cents)}</span>
            </li>
          ))}
        </ul>
        {balance.plannedCents < 0 && (
          <p className="text-destructive mt-2">
            Os débitos passam dos créditos em {formatCents(-balance.plannedCents)}.
          </p>
        )}
      </figcaption>
    </figure>
  );
}
